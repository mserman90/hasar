import { WeatherData, InfraData, WeatherAlert } from '../types';

/**
 * Open-Meteo API: Real-time weather data
 */
export async function fetchWeatherData(lat: number, lng: number): Promise<WeatherData | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m&timezone=auto`;
  const proxies = [
    url,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`
  ];

  for (const targetUrl of proxies) {
    try {
      const res = await fetch(targetUrl);
      if (!res.ok) continue;
      const data = await res.json();
      return {
        temp: data.current.temperature_2m,
        windSpeed: data.current.wind_speed_10m,
        precipitation: data.current.precipitation,
        humidity: data.current.relative_humidity_2m,
        conditionCode: 0 // Simplified
      };
    } catch (e) {
      console.warn(`Open-Meteo fetch attempt failed for ${targetUrl}:`, e);
    }
  }
  return null;
}

/**
 * Open-Meteo Alerts API: Severe weather alerts
 */
export async function fetchWeatherAlerts(lat: number, lng: number): Promise<WeatherAlert[]> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m&alerts=true&timezone=auto`;
  const proxies = [
    url,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`
  ];

  for (const targetUrl of proxies) {
    try {
      const res = await fetch(targetUrl);
      if (!res.ok) continue;
      const data = await res.json();
      
      if (!data.alerts || !Array.isArray(data.alerts)) return [];
      
      return data.alerts.map((a: any) => ({
        event: a.event || 'Weather Alert',
        headline: a.headline || a.event,
        description: a.description || '',
        severity: a.severity?.toLowerCase() || 'moderate',
        onset: a.onset || '',
        expires: a.expires || ''
      }));
    } catch (e) {
      console.warn(`Open-Meteo Alerts fetch attempt failed for ${targetUrl}:`, e);
    }
  }
  return [];
}

/**
 * Overpass API (OSM): Infrastructure density and critical facilities
 */
export async function fetchInfraData(lat: number, lng: number): Promise<InfraData | null> {
  try {
    // Query for buildings and amenities within 5km radius
    const query = `
      [out:json][timeout:25];
      (
        node(around:5000,${lat},${lng})["amenity"~"hospital|clinic|school|university|fire_station|police|emergency"];
        way(around:5000,${lat},${lng})["building"];
      );
      out center;
    `;
    
    const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
    if (!res.ok) return null;
    const data = await res.json();
    
    const elements = data.elements || [];
    
    const facilities: Array<{ lat: number; lng: number; type: string; name?: string }> = [];
    const buildingPoints: Array<{ lat: number; lng: number }> = [];
    
    let buildingCount = 0;
    let hospitalCount = 0;
    let schoolCount = 0;
    let emergencyCount = 0;
    
    elements.forEach((el: any) => {
      const elLat = el.lat || el.center?.lat;
      const elLng = el.lon || el.center?.lon;
      
      if (!elLat || !elLng) return;
      
      if (el.tags?.building) {
        buildingCount++;
        // Sample building points for density visualization (limit to 200 for performance)
        if (buildingPoints.length < 200) {
          buildingPoints.push({ lat: elLat, lng: elLng });
        }
      } else if (el.tags?.amenity) {
        const type = el.tags.amenity;
        const name = el.tags.name;
        
        if (type.includes('hospital') || type.includes('clinic')) {
          hospitalCount++;
          facilities.push({ lat: elLat, lng: elLng, type: 'hospital', name });
        } else if (type.includes('school') || type.includes('university')) {
          schoolCount++;
          facilities.push({ lat: elLat, lng: elLng, type: 'school', name });
        } else {
          emergencyCount++;
          facilities.push({ lat: elLat, lng: elLng, type: 'emergency', name });
        }
      }
    });
    
    // Heuristic density score (0-100)
    const densityScore = Math.min(100, (buildingCount / 500) * 100);
    
    return {
      buildingCount,
      hospitalCount,
      schoolCount,
      emergencyCount,
      densityScore,
      facilities,
      buildingPoints
    };
  } catch (e) {
    console.error('Overpass API fetch error:', e);
    return null;
  }
}
