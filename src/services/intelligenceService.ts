import { GoogleGenAI, Type } from "@google/genai";
import { IntelligenceEvent, IntelligenceEntity } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const RSS_FEEDS = [
  'https://feeds.feedburner.com/TheHackersNews',
  'https://www.cisa.gov/cybersecurity-advisories/all.xml',
  'https://www.gdacs.org/xml/rss.xml',
  'https://reliefweb.int/updates/rss.xml', 
  'https://cert.gov.ua/api/rss' 
];

const USGS_API = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson';
const OPENSKY_API = 'https://opensky-network.org/api/states/all?lamin=34&lomin=25&lamax=42&lomax=45'; 
const NOAA_API = 'https://services.swpc.noaa.gov/products/alerts.json'; 

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function hashString(str: string) {
  const msgBuffer = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

function parseRawXmlToJson(xmlString: string) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  const items = Array.from(xmlDoc.querySelectorAll("item"));
  return items.map(item => ({
    title: item.querySelector("title")?.textContent || "Başlık Yok",
    link: item.querySelector("link")?.textContent || "#",
    pubDate: item.querySelector("pubDate")?.textContent || new Date().toISOString(),
    description: item.querySelector("description")?.textContent || "",
    categories: Array.from(item.querySelectorAll("category")).map(c => c.textContent || "")
  }));
}

async function fetchWithBackoffAndFallback(targetUrl: string, isRss = false, maxRetries = 3, baseDelay = 1000, useProxyFirst = false) {
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`
  ];
  
  let primaryUrl = isRss ? `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(targetUrl)}` : targetUrl;
  if (useProxyFirst && !isRss) primaryUrl = proxies[0];

  let attempt = 0;
  let currentProxyIndex = useProxyFirst && !isRss ? 1 : 0;
  let currentUrl = primaryUrl;
  let isFallback = useProxyFirst && !isRss;

  while (attempt < maxRetries) {
    try {
      const response = await fetch(currentUrl, {
        headers: { 'Accept': 'application/json, text/xml, application/xml' }
      });
      
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        let waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : (baseDelay * Math.pow(2, attempt)) + (Math.random() * 500);
        await sleep(waitTime);
        attempt++;
        continue;
      }

      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

      if (isFallback && isRss) {
        const textData = await response.text();
        return parseRawXmlToJson(textData);
      } else {
        const jsonData = await response.json();
        if (isRss && jsonData.status !== 'ok') {
            // Fallback to direct XML parsing if rss2json fails
            const textData = await (await fetch(proxies[0])).text();
            return parseRawXmlToJson(textData);
        }
        return isRss ? jsonData.items : jsonData;
      }
    } catch (error) {
      if (currentProxyIndex < proxies.length) {
        currentUrl = proxies[currentProxyIndex];
        isFallback = true;
        currentProxyIndex++;
      }
      let waitTime = (baseDelay * Math.pow(2, attempt)) + (Math.random() * 500);
      await sleep(waitTime);
      attempt++;
    }
  }
  
  // Instead of throwing, return null to allow the scraper to continue
  console.warn(`Maksimum deneme aşıldı: ${targetUrl}`);
  return isRss ? [] : null;
}

function extractEntities(title: string, description: string, existingCategories: string[]): IntelligenceEntity[] {
  const text = (title || '') + " " + (description || '');
  let entities: IntelligenceEntity[] = [];
  
  const cveRegex = /(CVE-\d{4}-\d{4,7})/gi;
  let cveMatches;
  while ((cveMatches = cveRegex.exec(text)) !== null) {
    entities.push({ type: 'cve', label: cveMatches[1].toUpperCase() });
  }

  const aptRegex = /\b(APT\s?\d+|Lazarus|Fancy Bear|Cozy Bear|Turla|Sandworm|Kimsuky)\b/gi;
  let aptMatches;
  while ((aptMatches = aptRegex.exec(text)) !== null) {
    entities.push({ type: 'apt', label: aptMatches[1].toUpperCase() });
  }

  const locRegex = /\b(Russia|China|Ukraine|Israel|Iran|USA|NATO|Turkey|Syria|Europe|Middle East)\b/gi;
  let locMatches;
  while ((locMatches = locRegex.exec(text)) !== null) {
    entities.push({ type: 'location', label: locMatches[1] });
  }
  
  const disasterRegex = /\b(Earthquake|Flood|Cyclone|Tsunami|Volcano)\b/gi;
  let disMatches;
  while ((disMatches = disasterRegex.exec(text)) !== null) {
    entities.push({ type: 'category', label: disMatches[1] });
  }

  const uniqueEntities: IntelligenceEntity[] = [];
  const seen = new Set();
  entities.forEach(ent => {
    const key = ent.type + '_' + ent.label;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueEntities.push(ent);
    }
  });
  return uniqueEntities;
}

export async function analyzeAnomaliesWithAI(events: IntelligenceEvent[]): Promise<Array<{ id: string; reason: string }>> {
  if (events.length === 0) return [];

  const payloadData = events.map(e => ({ id: e.id, type: e.type, title: e.title, summary: e.summary, mag: e.mag }));

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: JSON.stringify(payloadData),
      config: {
        systemInstruction: "Sen istihbarat ve anomali tespit yapay zekasısın. Verilen JSON'daki uçuş, sismik (deprem), uydu/uzay hava durumu ve OSINT olaylarını incele. 5.5 ve üzeri depremleri, olağandışı veya askeri uçuşları, kritik güneş/uydu patlamalarını ve ciddi jeopolitik krizleri anomali olarak işaretle. Sadece anomali olanların id'sini ve Türkçe nedenini (reason) JSON dizisi olarak dön.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              reason: { type: Type.STRING }
            },
            required: ["id", "reason"]
          }
        }
      }
    });

    const text = response.text;
    return JSON.parse(text || "[]");
  } catch (e: any) {
    console.warn("Gemini AI analysis unavailable (Rate limit or error). Falling back to rule-based detection.", e);
    
    // Rule-based fallback if AI fails
    return events.filter(ev => {
      const title = ev.title.toLowerCase();
      const summary = ev.summary.toLowerCase();
      
      if (ev.type === 'earthquake' && (ev.mag || 0) >= 5.5) return true;
      if (ev.type === 'space_weather' && (title.includes('g4') || title.includes('g5') || title.includes('severe'))) return true;
      if (ev.type === 'regional_threat') return true;
      if (title.includes('critical') || title.includes('emergency') || title.includes('attack') || title.includes('anomaly')) return true;
      
      return false;
    }).map(ev => ({
      id: ev.id,
      reason: `[Kural Tabanlı Tespit] ${ev.type === 'earthquake' ? 'Yüksek şiddetli sismik aktivite.' : 'Kritik anahtar kelime veya olay tipi eşleşmesi.'}`
    }));
  }
}

export async function scrapeIntelligenceData(): Promise<IntelligenceEvent[]> {
  let collectedEvents: IntelligenceEvent[] = [];

  // 1. RSS Feeds
  for (const feedUrl of RSS_FEEDS) {
    try {
      const items = await fetchWithBackoffAndFallback(feedUrl, true, 3, 1000);
      for (const item of items) {
        const timestamp = new Date(item.pubDate).getTime() || Date.now();
        const id = await hashString("rss" + item.title + timestamp);
        
        let type: IntelligenceEvent['type'] = 'osint';
        if (feedUrl.includes('gdacs.org')) type = 'disaster';
        if (feedUrl.includes('cert.gov.ua')) type = 'regional_threat';
        
        const fullText = (item.title + " " + item.description).toLowerCase();
        if (feedUrl.includes('reliefweb.int') || fullText.includes('sentinel') || fullText.includes('satellite') || fullText.includes('copernicus')) {
            type = 'satellite_monitoring';
        }

        collectedEvents.push({
            id: id, type: type, timestamp: timestamp,
            title: item.title, summary: (item.description||'').replace(/(<([^>]+)>)/gi, "").substring(0, 300),
            link: item.link, entities: extractEntities(item.title, item.description, item.categories || []),
            isAnomaly: false
        });
      }
    } catch (e) {
      console.error(`Error fetching RSS feed ${feedUrl}:`, e);
    }
  }

  // 2. USGS Earthquakes
  try {
    const eqData = await fetchWithBackoffAndFallback(USGS_API, false, 3, 1000);
    if (eqData) {
      for(const feature of (eqData.features || [])) {
        const props = feature.properties;
        const id = await hashString("eq" + feature.id);
        const mag = parseFloat(props.mag);
        const locationLabel = props.place.split(' of ').pop() || 'Bilinmeyen Konum';
        
        const entities: IntelligenceEntity[] = [
            { type: 'location', label: locationLabel },
            { type: 'category', label: 'Sismik Aktivite' }
        ];

        collectedEvents.push({
            id: id, type: 'earthquake', timestamp: props.time, mag: mag,
            title: `Deprem: ${props.title}`, summary: `Şiddet: ${mag}, Derinlik: ${feature.geometry.coordinates[2]}km. Tsunami Uyarısı: ${props.tsunami ? 'Var':'Yok'}`,
            link: props.url, entities: entities, isAnomaly: false
        });
      }
    }
  } catch (e) {
    console.error("Error fetching USGS data:", e);
  }

  // 3. NOAA Space Weather
  try {
    const noaaData = await fetchWithBackoffAndFallback(NOAA_API, false, 3, 1000);
    if (noaaData) {
      for(const alert of noaaData.slice(0, 5)) {
        const id = await hashString("noaa" + alert.issue_datetime);
        collectedEvents.push({
            id: id, type: 'space_weather', timestamp: new Date(alert.issue_datetime).getTime(),
            title: `NOAA Uyarısı: Güneş/Uydu Aktivitesi`, summary: alert.message.substring(0, 300),
            link: 'https://www.swpc.noaa.gov/', entities: [{ type: 'category', label: 'Uzay Hava Durumu' }], isAnomaly: false
        });
      }
    }
  } catch (e) {
    console.error("Error fetching NOAA data:", e);
  }

  // 4. OpenSky Flight Data
  try {
    const flightData = await fetchWithBackoffAndFallback(OPENSKY_API, false, 2, 500, true);
    if (flightData) {
      const states = flightData.states || [];
      for(const state of states.slice(0, 10)) {
        const callsign = (state[1] || 'Unknown').trim();
        const country = state[2];
        const id = await hashString("fl" + callsign + state[3]);
        collectedEvents.push({
            id: id, type: 'flight', timestamp: (state[3] || Math.floor(Date.now()/1000)) * 1000,
            title: `Uçuş Tespiti: ${callsign}`, summary: `Kaynak Ülke: ${country}. İrtifa: ${state[7]}m. Hız: ${state[9]}m/s. Konum: [${state[6]}, ${state[5]}]`,
            link: `https://globe.adsbexchange.com/?icao=${state[0]}`, 
            entities: [{ type: 'location', label: country }, { type: 'category', label: 'Havacılık İzi' }],
            isAnomaly: false
        });
      }
    }
  } catch (e) {
    console.error("Error fetching flight data:", e);
  }

  return collectedEvents;
}
