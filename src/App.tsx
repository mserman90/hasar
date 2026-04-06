import React, { useState, useEffect, useCallback } from 'react';
import { 
  Activity, 
  Database, 
  Globe, 
  Satellite, 
  Clock, 
  Crosshair, 
  Zap, 
  Users, 
  HeartCrack, 
  ShieldCheck, 
  Network, 
  Menu, 
  ChevronRight, 
  Play, 
  CloudUpload,
  AlertTriangle,
  Rss,
  Wind,
  Droplets,
  Flame,
  Skull,
  Plane,
  CloudRain,
  Sun
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Map from './components/Map';
import { 
  DisasterType, 
  SimulationParams, 
  SimulationResults, 
  TargetZone, 
  QuakeEvent, 
  EonetEvent,
  DataSourceStatus
} from './types';
import { AppNotification } from './types';
import { runProbabilisticEngine } from './lib/engine';
import { fetchWeatherData, fetchInfraData, fetchWeatherAlerts } from './services/apiService';
import { MapContainer } from 'react-leaflet'; // Not needed here but for context
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Bell, X } from 'lucide-react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DISASTER_INFO: Record<DisasterType, { label: string; icon: React.ReactNode }> = {
  seismic: { label: 'Sismik', icon: <Activity className="w-5 h-5" /> },
  flood: { label: 'Taşkın', icon: <Droplets className="w-5 h-5" /> },
  wildfire: { label: 'Yangın', icon: <Flame className="w-5 h-5" /> },
  conflict: { label: 'Çatışma', icon: <Skull className="w-5 h-5" /> },
  airpollution: { label: 'Hava Kir.', icon: <Wind className="w-5 h-5" /> },
  drought: { label: 'Kuraklık', icon: <Sun className="w-5 h-5" /> },
  storm: { label: 'Fırtına', icon: <CloudRain className="w-5 h-5" /> },
  aviation: { label: 'Havacılık', icon: <Plane className="w-5 h-5" /> }
};

export default function App() {
  const [target, setTarget] = useState<TargetZone | null>(null);
  const [disasterType, setDisasterType] = useState<DisasterType>('seismic');
  const [params, setParams] = useState<SimulationParams>({
    intensity: 50,
    exposure: 50,
    vulnerability: 50,
    resilience: 50,
    cascade: 50
  });
  const [results, setResults] = useState<SimulationResults | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'engine' | 'feeds' | 'network' | 'system'>('engine');
  const [mapStyle, setMapStyle] = useState('dark');
  const [quakes, setQuakes] = useState<QuakeEvent[]>([]);
  const [eonet, setEonet] = useState<EonetEvent[]>([]);
  const [iss, setIss] = useState<{ lat: number; lng: number } | null>(null);
  const [utcTime, setUtcTime] = useState(new Date().toISOString().substr(11, 8));
  const [isSimulating, setIsSimulating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [visibleLayers, setVisibleLayers] = useState({
    quakes: true,
    eonet: true,
    iss: true,
    infra: true
  });
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [seenEvents, setSeenEvents] = useState<Set<string>>(new Set());
  const [dataSources, setDataSources] = useState<Record<string, DataSourceStatus>>({
    usgs: { id: 'usgs', name: 'USGS Seismic', status: 'inactive', lastFetch: 0, refreshInterval: 30000, errorLog: [] },
    eonet: { id: 'eonet', name: 'NASA EONET', status: 'inactive', lastFetch: 0, refreshInterval: 30000, errorLog: [] },
    iss: { id: 'iss', name: 'ISS Tracker', status: 'inactive', lastFetch: 0, refreshInterval: 30000, errorLog: [] },
    meteo: { id: 'meteo', name: 'Open-Meteo', status: 'inactive', lastFetch: 0, refreshInterval: 0, errorLog: [] },
    overpass: { id: 'overpass', name: 'Overpass API', status: 'inactive', lastFetch: 0, refreshInterval: 0, errorLog: [] }
  });

  const updateSource = useCallback((id: string, updates: Partial<DataSourceStatus>) => {
    setDataSources(prev => ({
      ...prev,
      [id]: { ...prev[id], ...updates }
    }));
  }, []);

  const logError = useCallback((id: string, error: string) => {
    setDataSources(prev => ({
      ...prev,
      [id]: { 
        ...prev[id], 
        status: 'error',
        errorLog: [new Date().toLocaleTimeString() + ': ' + error, ...prev[id].errorLog].slice(0, 10)
      }
    }));
  }, []);

  // Notification Trigger
  const addNotification = useCallback((notif: Omit<AppNotification, 'id' | 'timestamp'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newNotif = { ...notif, id, timestamp: Date.now() };
    setNotifications(prev => [newNotif, ...prev].slice(0, 5));
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  }, []);

  // Monitor Events for Thresholds
  useEffect(() => {
    const newSeen = new Set(seenEvents);
    let hasNew = false;

    // 1. Quake Analysis
    quakes.forEach(q => {
      if (!seenEvents.has(q.id)) {
        newSeen.add(q.id);
        hasNew = true;
        if (q.mag >= 7.0) {
          addNotification({
            type: 'critical',
            title: 'KRİTİK SİSMİK OLAY',
            message: `M${q.mag.toFixed(1)} - ${q.place}`
          });
        } else if (q.mag >= 5.5) {
          addNotification({
            type: 'warning',
            title: 'Önemli Sismik Aktivite',
            message: `M${q.mag.toFixed(1)} - ${q.place}`
          });
        }
      }
    });

    // 2. EONET Analysis
    eonet.forEach(e => {
      if (!seenEvents.has(e.id)) {
        newSeen.add(e.id);
        hasNew = true;
        const cat = e.category.toLowerCase();
        if (cat.includes('fire') || cat.includes('storm')) {
          addNotification({
            type: 'warning',
            title: `Aktif ${e.category}`,
            message: e.title
          });
        }
      }
    });

    if (hasNew) setSeenEvents(newSeen);
  }, [quakes, eonet, seenEvents, addNotification]);

  // UTC Clock
  useEffect(() => {
    const timer = setInterval(() => {
      setUtcTime(new Date().toISOString().substr(11, 8));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Data Fetching
  const fetchData = useCallback(async (manualId?: string) => {
    if (manualId) setIsRefreshing(true);
    
    const fetchUSGS = async () => {
      try {
        updateSource('usgs', { status: 'active' });
        const qRes = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
        if (!qRes.ok) throw new Error(`HTTP ${qRes.status}`);
        const qData = await qRes.json();
        const mappedQuakes: QuakeEvent[] = qData.features.slice(0, 20).map((f: any) => ({
          id: f.id,
          mag: f.properties.mag,
          place: f.properties.place,
          time: f.properties.time,
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
          depth: f.geometry.coordinates[2]
        }));
        setQuakes(mappedQuakes);
        updateSource('usgs', { lastFetch: Date.now(), status: 'active' });
      } catch (e: any) {
        logError('usgs', e.message);
      }
    };

    const fetchEONET = async () => {
      try {
        updateSource('eonet', { status: 'active' });
        const eRes = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=15');
        if (!eRes.ok) throw new Error(`HTTP ${eRes.status}`);
        const eData = await eRes.json();
        const mappedEonet: EonetEvent[] = eData.events.map((e: any) => {
          const geo = e.geometry[e.geometry.length - 1];
          return {
            id: e.id,
            title: e.title,
            category: e.categories[0]?.title || 'Unknown',
            lat: geo.coordinates[1],
            lng: geo.coordinates[0]
          };
        });
        setEonet(mappedEonet);
        updateSource('eonet', { lastFetch: Date.now(), status: 'active' });
      } catch (e: any) {
        logError('eonet', e.message);
      }
    };

    const fetchISS = async () => {
      try {
        updateSource('iss', { status: 'active' });
        const issRes = await fetch('https://api.wheretheiss.at/v1/satellites/25544');
        if (!issRes.ok) throw new Error(`HTTP ${issRes.status}`);
        const issData = await issRes.json();
        setIss({ lat: issData.latitude, lng: issData.longitude });
        updateSource('iss', { lastFetch: Date.now(), status: 'active' });
      } catch (e: any) {
        logError('iss', e.message);
      }
    };

    if (manualId) {
      if (manualId === 'usgs') await fetchUSGS();
      if (manualId === 'eonet') await fetchEONET();
      if (manualId === 'iss') await fetchISS();
      setIsRefreshing(false);
    } else {
      await Promise.all([fetchUSGS(), fetchEONET(), fetchISS()]);
    }
  }, [updateSource, logError]);

  const handleRunSimulation = useCallback((overrideType?: DisasterType, overrideParams?: Partial<SimulationParams>, overrideTarget?: TargetZone) => {
    const currentTarget = overrideTarget || target;
    if (!currentTarget) return;
    
    setIsSimulating(true);
    const currentType = overrideType || disasterType;
    const currentParams = overrideParams ? { ...params, ...overrideParams } : params;

    setTimeout(() => {
      const res = runProbabilisticEngine(currentType, currentParams, currentTarget);
      setResults(res);
      setIsSimulating(false);
    }, 1000);
  }, [target, disasterType, params]);

  const handleSetTarget = useCallback(async (lat: number, lng: number, autoSimType?: DisasterType, autoSimIntensity?: number) => {
    try {
      // 1. Reverse Geocode
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&accept-language=tr`);
      const geoData = await geoRes.json();
      const name = geoData.address?.city || geoData.address?.town || geoData.address?.state || geoData.address?.country || `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
      
      // 2. Fetch Weather, Infra, and Alerts in parallel
      updateSource('meteo', { status: 'active' });
      updateSource('overpass', { status: 'active' });

      const [weather, infra, alerts] = await Promise.all([
        fetchWeatherData(lat, lng).catch(e => { logError('meteo', e.message); return null; }),
        fetchInfraData(lat, lng).catch(e => { logError('overpass', e.message); return null; }),
        fetchWeatherAlerts(lat, lng).catch(e => { logError('meteo', `Alerts: ${e.message}`); return []; })
      ]);

      if (weather) updateSource('meteo', { lastFetch: Date.now(), status: 'active' });
      if (infra) updateSource('overpass', { lastFetch: Date.now(), status: 'active' });

      const newTarget: TargetZone = { 
        lat, 
        lng, 
        name,
        weather: weather || undefined,
        infra: infra || undefined,
        alerts: alerts.length > 0 ? alerts : undefined
      };

      setTarget(newTarget);

      // 3. Auto-trigger simulation if requested
      if (autoSimType && autoSimIntensity !== undefined) {
        handleRunSimulation(autoSimType, { intensity: autoSimIntensity }, newTarget);
      }
    } catch (e: any) {
      setTarget({ lat, lng, name: `${lat.toFixed(2)}, ${lng.toFixed(2)}` });
    }
  }, [updateSource, logError, handleRunSimulation]);

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) {
      addNotification({
        type: 'warning',
        title: 'KONUM DESTEĞİ YOK',
        message: 'Tarayıcınız konum özelliğini desteklemiyor.'
      });
      return;
    }

    addNotification({
      type: 'info',
      title: 'KONUM ARANIYOR',
      message: 'Mevcut konumunuz algılanıyor...'
    });

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handleSetTarget(pos.coords.latitude, pos.coords.longitude);
        addNotification({
          type: 'info',
          title: 'KONUM BULUNDU',
          message: 'Mevcut konumunuz hedef bölge olarak ayarlandı.'
        });
      },
      (err) => {
        addNotification({
          type: 'warning',
          title: 'KONUM HATASI',
          message: 'Konumunuza erişilemedi. Lütfen izinleri kontrol edin.'
        });
      }
    );
  }, [handleSetTarget, addNotification]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    
    // Auto-locate on startup (optional/prompted by browser)
    const hasAsked = localStorage.getItem('ais_locate_asked');
    if (!hasAsked) {
      handleLocate();
      localStorage.setItem('ais_locate_asked', 'true');
    }

    return () => clearInterval(interval);
  }, [fetchData, handleLocate]);

  return (
    <div className="flex h-screen bg-[#060a14] font-mono text-[#c8d6e5] overflow-hidden">
      <div className="scanline-overlay" />

      {/* NOTIFICATIONS */}
      <div className="fixed top-14 right-4 z-[1000] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {notifications.map(n => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.95 }}
              className={cn(
                "pointer-events-auto w-72 glass rounded-lg p-3 border shadow-lg flex gap-3 items-start",
                n.type === 'critical' ? "border-red-500/50 bg-red-500/10" : 
                n.type === 'warning' ? "border-amber-500/50 bg-amber-500/10" : 
                "border-cyan-500/50 bg-cyan-500/10"
              )}
            >
              <div className={cn(
                "p-1.5 rounded-full",
                n.type === 'critical' ? "bg-red-500/20 text-red-400" : 
                n.type === 'warning' ? "bg-amber-500/20 text-amber-400" : 
                "bg-cyan-500/20 text-cyan-400"
              )}>
                <Bell className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className={cn(
                  "text-[10px] font-bold font-orbitron",
                  n.type === 'critical' ? "text-red-400" : 
                  n.type === 'warning' ? "text-amber-400" : 
                  "text-cyan-400"
                )}>{n.title}</div>
                <div className="text-[10px] text-gray-300 mt-0.5 leading-tight">{n.message}</div>
              </div>
              <button 
                onClick={() => setNotifications(prev => prev.filter(notif => notif.id !== n.id))}
                className="text-gray-500 hover:text-white transition"
              >
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* TOP HUD */}
      <header className="fixed top-0 left-0 right-0 z-[900] glass-strong border-b border-cyan-500/10 h-11 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="text-cyan-400 hover:text-cyan-300 transition"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_rgba(0,240,255,0.6)]" />
            <span className="font-orbitron text-xs font-bold tracking-wider text-cyan-400 glow-cyan">TURKSKY-DestinE</span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-[10px]">
          <div className="flex items-center gap-2 px-2 py-1 rounded bg-cyan-500/5 border border-cyan-500/10">
            <Activity className={cn(
              "w-3 h-3",
              (Object.values(dataSources) as DataSourceStatus[]).some(s => s.status === 'error') ? "text-red-500" : "text-green-500"
            )} />
            <span className="text-gray-400">System:</span>
            <span className={cn(
              "font-bold",
              (Object.values(dataSources) as DataSourceStatus[]).some(s => s.status === 'error') ? "text-red-400" : "text-green-400"
            )}>
              {(Object.values(dataSources) as DataSourceStatus[]).some(s => s.status === 'error') ? 'ISSUES' : 'OPTIMAL'}
            </span>
          </div>
          <div className="flex items-center gap-2 px-2 py-1 rounded bg-cyan-500/5 border border-cyan-500/10">
            <button 
              onClick={() => fetchData('iss')}
              disabled={isRefreshing}
              className="hover:text-purple-300 transition disabled:opacity-50 flex items-center gap-2"
              title="ISS Konumunu Yenile"
            >
              <Satellite className={cn("w-3 h-3 text-purple-400", isRefreshing && dataSources.iss.status === 'active' && "animate-spin")} />
              <span className="text-purple-300">ISS: {iss ? `${iss.lat.toFixed(1)}°, ${iss.lng.toFixed(1)}°` : '--'}</span>
            </button>
          </div>
          <div className="flex items-center gap-2 px-2 py-1 rounded bg-amber-500/5 border border-amber-500/10">
            <Clock className="w-3 h-3 text-amber-500" />
            <span className="text-amber-400 font-orbitron">{utcTime} UTC</span>
          </div>
          <select 
            value={mapStyle} 
            onChange={(e) => setMapStyle(e.target.value)}
            className="bg-cyan-500/5 border border-cyan-500/10 rounded px-2 py-1 text-[10px] outline-none cursor-pointer"
          >
            <option value="dark">🌑 Karanlık</option>
            <option value="satellite">🛰️ Uydu</option>
            <option value="topo">🏔️ Topo</option>
          </select>
        </div>
      </header>

      {/* SIDEBAR */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 380 : 0 }}
        className="fixed top-11 left-0 bottom-0 z-[800] glass-strong border-r border-cyan-500/10 overflow-hidden"
      >
        <div className="w-[380px] h-full flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-cyan-500/10 px-2 pt-2 gap-1">
            {(['engine', 'feeds', 'network', 'system'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "text-[10px] px-3 py-2 transition-all relative",
                  activeTab === tab ? "text-cyan-400" : "text-gray-500 hover:text-cyan-300"
                )}
              >
                {tab.toUpperCase()}
                {activeTab === tab && (
                  <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 shadow-[0_0_8px_#00f0ff]" />
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeTab === 'engine' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                {/* Target Zone */}
                <div className="glass rounded-lg p-3 border-glow">
                  <h3 className="font-orbitron text-[10px] font-bold text-cyan-400 tracking-wider mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Crosshair className="w-3 h-3" /> HEDEF BÖLGE
                    </div>
                    <button 
                      onClick={handleLocate}
                      className="text-[8px] bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 px-1.5 py-0.5 rounded flex items-center gap-1 transition-all"
                    >
                      <Globe className="w-2 h-2" /> KONUMUMU BUL
                    </button>
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="bg-black/30 rounded p-2">
                      <span className="text-gray-500">Bölge:</span>
                      <div className="text-cyan-300 font-bold mt-0.5 truncate">{target?.name || 'Belirlenmedi'}</div>
                    </div>
                    <div className="bg-black/30 rounded p-2">
                      <span className="text-gray-500">Koordinat:</span>
                      <div className="text-cyan-300 font-bold mt-0.5">
                        {target ? `${target.lat.toFixed(4)}, ${target.lng.toFixed(4)}` : '--.--, --.--'}
                      </div>
                    </div>
                  </div>

                  {/* Quick Locations */}
                  <div className="mt-3">
                    <div className="text-[9px] text-gray-500 mb-1.5 flex items-center gap-1">
                      <Globe className="w-2.5 h-2.5" /> HIZLI KONUM
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { name: 'İstanbul', lat: 41.0082, lng: 28.9784 },
                        { name: 'Ankara', lat: 39.9334, lng: 32.8597 },
                        { name: 'İzmir', lat: 38.4237, lng: 27.1428 },
                        { name: 'Antalya', lat: 36.8969, lng: 30.7133 },
                        { name: 'Gaziantep', lat: 37.0662, lng: 37.3833 },
                        { name: 'Hatay', lat: 36.4018, lng: 36.3498 }
                      ].map(city => (
                        <button
                          key={city.name}
                          onClick={() => handleSetTarget(city.lat, city.lng)}
                          className="text-[9px] px-2 py-1 rounded bg-cyan-500/5 hover:bg-cyan-500/20 border border-cyan-500/10 hover:border-cyan-500/30 transition-all text-gray-400 hover:text-cyan-300"
                        >
                          {city.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Real-world Data Context */}
                  {target && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {target.weather && (
                        <div className="bg-cyan-500/5 border border-cyan-500/10 rounded p-2 text-[9px]">
                          <div className="text-gray-500 mb-1 flex items-center gap-1"><CloudRain className="w-2.5 h-2.5" /> Hava Durumu</div>
                          <div className="flex justify-between">
                            <span>Sıcaklık:</span>
                            <span className="text-cyan-400">{target.weather.temp}°C</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Rüzgar:</span>
                            <span className="text-cyan-400">{target.weather.windSpeed} km/h</span>
                          </div>
                        </div>
                      )}
                      {target.infra && (
                        <div className="bg-purple-500/5 border border-purple-500/10 rounded p-2 text-[9px]">
                          <div className="text-gray-500 mb-1 flex items-center gap-1"><Database className="w-2.5 h-2.5" /> Altyapı</div>
                          <div className="flex justify-between">
                            <span>Bina Yoğ.:</span>
                            <span className="text-purple-400">%{target.infra.densityScore.toFixed(0)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Kritik Tes.:</span>
                            <span className="text-purple-400">{target.infra.hospitalCount + target.infra.schoolCount}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Weather Alerts */}
                  {target?.alerts && target.alerts.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {target.alerts.map((alert, idx) => (
                        <div 
                          key={idx} 
                          className={cn(
                            "p-2 rounded border text-[9px] flex gap-2 items-start",
                            alert.severity === 'extreme' || alert.severity === 'severe' 
                              ? "bg-red-500/10 border-red-500/30 text-red-400" 
                              : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                          )}
                        >
                          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                          <div>
                            <div className="font-bold uppercase tracking-tight">{alert.event}</div>
                            <div className="text-[8px] opacity-80 leading-tight mt-0.5">{alert.headline}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Disaster Type */}
                <div className="glass rounded-lg p-3 border-glow">
                  <h3 className="font-orbitron text-[10px] font-bold text-cyan-400 tracking-wider mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-3 h-3" /> AFET TİPİ
                  </h3>
                  <div className="grid grid-cols-4 gap-2">
                    {(Object.entries(DISASTER_INFO) as [DisasterType, any][]).map(([type, info]) => (
                      <button
                        key={type}
                        onClick={() => setDisasterType(type)}
                        className={cn(
                          "flex flex-col items-center gap-1 p-2 rounded transition-all text-[9px] border",
                          disasterType === type 
                            ? "bg-cyan-500/40 border-cyan-400 text-white shadow-[0_0_15px_rgba(0,240,255,0.3)] scale-105" 
                            : "bg-white/5 border-white/10 text-gray-500 hover:bg-white/10 hover:border-white/20"
                        )}
                      >
                        {info.icon}
                        <span>{info.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Parameters */}
                <div className="glass rounded-lg p-3 border-glow space-y-3">
                  <h3 className="font-orbitron text-[10px] font-bold text-cyan-400 tracking-wider mb-1">PARAMETRELER</h3>
                  {[
                    { id: 'intensity', label: 'Şiddet', icon: <Zap className="w-3 h-3 text-red-400" /> },
                    { id: 'exposure', label: 'Maruziyet', icon: <Users className="w-3 h-3 text-amber-400" /> },
                    { id: 'vulnerability', label: 'Kırılganlık', icon: <HeartCrack className="w-3 h-3 text-orange-400" /> },
                    { id: 'resilience', label: 'Direnç', icon: <ShieldCheck className="w-3 h-3 text-green-400" /> },
                    { id: 'cascade', label: 'Kaskad', icon: <Network className="w-3 h-3 text-purple-400" /> }
                  ].map((p) => (
                    <div key={p.id}>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] text-gray-400 flex items-center gap-1">{p.icon} {p.label}</label>
                        <span className="text-[10px] text-cyan-400 font-bold">{params[p.id as keyof SimulationParams]}</span>
                      </div>
                      <input 
                        type="range" 
                        min="1" max="100" 
                        value={params[p.id as keyof SimulationParams]}
                        onChange={(e) => setParams(prev => ({ ...prev, [p.id]: parseInt(e.target.value) }))}
                        className="w-full h-1 bg-cyan-500/10 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                      />
                    </div>
                  ))}
                </div>

                <button 
                  onClick={handleRunSimulation}
                  disabled={!target || isSimulating}
                  className="w-full py-3 rounded-lg font-orbitron text-[11px] font-bold tracking-widest bg-gradient-to-r from-cyan-600/80 to-blue-600/80 hover:from-cyan-500 hover:to-blue-500 text-white border border-cyan-400/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSimulating ? 'HESAPLANIYOR...' : 'SİMÜLASYON BAŞLAT'}
                </button>

                {/* Results */}
                <AnimatePresence>
                  {results && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="glass rounded-lg p-3 border-glow space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="font-orbitron text-[10px] font-bold text-cyan-400 tracking-wider">ANALİZ SONUÇLARI</h3>
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">%95 Güven</span>
                      </div>

                      <div>
                        <div className="flex justify-between text-[9px] mb-1">
                          <span className="text-gray-500">Risk Skoru</span>
                          <span className="text-cyan-400 font-bold">{results.normalizeRisk.toFixed(3)}</span>
                        </div>
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${results.normalizeRisk * 100}%` }}
                            className={cn(
                              "h-full transition-all",
                              results.normalizeRisk > 0.7 ? "bg-red-500" : results.normalizeRisk > 0.4 ? "bg-amber-500" : "bg-green-500"
                            )}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="bg-black/30 rounded p-2">
                          <span className="text-gray-500 text-[9px]">Hasar (MDR)</span>
                          <div className="text-red-400 font-bold text-sm">{(results.mdr * 100).toFixed(1)}%</div>
                        </div>
                        <div className="bg-black/30 rounded p-2">
                          <span className="text-gray-500 text-[9px]">Maks. Kayıp</span>
                          <div className="text-amber-400 font-bold text-sm">${results.pml.toFixed(1)}M</div>
                        </div>
                      </div>

                      <div className="bg-black/30 rounded p-2 border border-red-500/10">
                        <div className="text-[9px] text-red-400 font-bold mb-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> KASKAD SENARYO
                        </div>
                        <p className="text-[10px] text-gray-400 leading-relaxed">{results.cascadeScenario}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {activeTab === 'feeds' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                {/* Quakes Feed */}
                <div className="glass rounded-lg p-3 border-glow">
                  <h3 className="font-orbitron text-[10px] font-bold text-cyan-400 tracking-wider mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity className="w-3 h-3 text-red-400" /> CANLI SİSMİK (USGS)
                    </div>
                    <button 
                      onClick={() => fetchData('usgs')}
                      disabled={isRefreshing}
                      className="text-[8px] text-red-400 hover:text-red-300 transition disabled:opacity-50 flex items-center gap-1"
                    >
                      <Activity className={cn("w-2 h-2", isRefreshing && dataSources.usgs.status === 'active' && "animate-spin")} />
                      YENİLE
                    </button>
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {quakes.map(q => (
                      <div key={q.id} className="flex items-center gap-2 p-2 rounded bg-black/20 hover:bg-black/30 transition text-[10px]">
                        <span className={cn(
                          "font-bold px-1.5 py-0.5 rounded",
                          q.mag >= 6 ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"
                        )}>M{q.mag.toFixed(1)}</span>
                        <span className="truncate flex-1 text-gray-400">{q.place}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* EONET Feed */}
                <div className="glass rounded-lg p-3 border-glow">
                  <h3 className="font-orbitron text-[10px] font-bold text-cyan-400 tracking-wider mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Rss className="w-3 h-3 text-amber-400" /> NASA EONET OLAYLARI
                    </div>
                    <button 
                      onClick={() => fetchData('eonet')}
                      disabled={isRefreshing}
                      className="text-[8px] text-amber-400 hover:text-amber-300 transition disabled:opacity-50 flex items-center gap-1"
                    >
                      <Activity className={cn("w-2 h-2", isRefreshing && dataSources.eonet.status === 'active' && "animate-spin")} />
                      YENİLE
                    </button>
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {eonet.map(e => (
                      <div key={e.id} className="p-2 rounded bg-black/20 hover:bg-black/30 transition text-[10px]">
                        <div className="text-amber-400 font-bold text-[9px] mb-1">{e.category.toUpperCase()}</div>
                        <div className="text-gray-400 truncate">{e.title}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'network' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="glass rounded-lg p-3 border-glow">
                  <h3 className="font-orbitron text-[10px] font-bold text-cyan-400 tracking-wider mb-2 flex items-center gap-2">
                    <Globe className="w-3 h-3 text-purple-400" /> GLOBAL SİMÜLASYON AĞI
                  </h3>
                  <div className="text-[9px] text-gray-500 mb-2 italic">Gerçek zamanlı Firestore senkronizasyonu aktif...</div>
                  <div className="text-gray-600 text-center py-8 text-[10px]">Henüz global simülasyon verisi yok</div>
                </div>
              </motion.div>
            )}

            {activeTab === 'system' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="glass rounded-lg p-3 border-glow">
                  <h3 className="font-orbitron text-[10px] font-bold text-cyan-400 tracking-wider mb-3 flex items-center gap-2">
                    <Database className="w-3 h-3" /> VERİ KAYNAKLARI YÖNETİCİSİ
                  </h3>
                  <div className="space-y-3">
                    {(Object.values(dataSources) as DataSourceStatus[]).map(source => (
                      <div key={source.id} className="bg-black/30 rounded p-2 border border-white/5">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-bold text-gray-300">{source.name}</span>
                          <div className="flex items-center gap-2">
                            {source.refreshInterval > 0 && (
                              <button 
                                onClick={() => fetchData(source.id)}
                                disabled={isRefreshing}
                                className="text-cyan-500 hover:text-cyan-400 transition disabled:opacity-50"
                                title="Manuel Yenile"
                              >
                                <Activity className={cn("w-3 h-3", isRefreshing && "animate-spin")} />
                              </button>
                            )}
                            <span className={cn(
                              "text-[8px] px-1.5 py-0.5 rounded-full border",
                              source.status === 'active' ? "bg-green-500/10 text-green-400 border-green-500/20" :
                              source.status === 'error' ? "bg-red-500/10 text-red-400 border-red-500/20" :
                              "bg-gray-500/10 text-gray-400 border-gray-500/20"
                            )}>
                              {source.status.toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[8px] text-gray-500">
                          <div>Yenileme: {source.refreshInterval > 0 ? `${source.refreshInterval/1000}s` : 'Manuel'}</div>
                          <div className="text-right">Son: {source.lastFetch ? new Date(source.lastFetch).toLocaleTimeString() : 'Hiç'}</div>
                        </div>
                        {source.errorLog.length > 0 && (
                          <div className="mt-2 text-[8px] text-red-400/70 bg-red-500/5 p-1 rounded max-h-16 overflow-y-auto">
                            {source.errorLog.map((log, i) => <div key={i}>{log}</div>)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </motion.aside>

      {/* MAP CONTAINER */}
      <main 
        className="flex-1 relative transition-all duration-300"
        style={{ marginLeft: isSidebarOpen ? 380 : 0 }}
      >
        <Map 
          target={target} 
          setTarget={setTarget} 
          quakes={quakes} 
          eonet={eonet} 
          iss={iss}
          mapStyle={mapStyle}
          updateSource={updateSource}
          logError={logError}
          visibleLayers={visibleLayers}
          onRunSimulation={handleRunSimulation}
          onMapClick={handleSetTarget}
        />

        {/* Layer Control */}
        <div className="absolute top-20 right-6 z-[700] flex flex-col gap-2">
          <div className="glass rounded-lg p-2 border-glow flex flex-col gap-2">
            <button 
              onClick={() => setVisibleLayers(prev => ({ ...prev, quakes: !prev.quakes }))}
              className={cn(
                "p-2 rounded transition-all",
                visibleLayers.quakes ? "bg-red-500/20 text-red-400 border border-red-500/40" : "bg-white/5 text-gray-500 border border-white/10"
              )}
              title="Sismik Katman"
            >
              <Activity className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setVisibleLayers(prev => ({ ...prev, eonet: !prev.eonet }))}
              className={cn(
                "p-2 rounded transition-all",
                visibleLayers.eonet ? "bg-amber-500/20 text-amber-400 border border-amber-500/40" : "bg-white/5 text-gray-500 border border-white/10"
              )}
              title="EONET Katman"
            >
              <Rss className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setVisibleLayers(prev => ({ ...prev, iss: !prev.iss }))}
              className={cn(
                "p-2 rounded transition-all",
                visibleLayers.iss ? "bg-purple-500/20 text-purple-400 border border-purple-500/40" : "bg-white/5 text-gray-500 border border-white/10"
              )}
              title="ISS Katman"
            >
              <Satellite className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setVisibleLayers(prev => ({ ...prev, infra: !prev.infra }))}
              className={cn(
                "p-2 rounded transition-all",
                visibleLayers.infra ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40" : "bg-white/5 text-gray-500 border border-white/10"
              )}
              title="Altyapı Katman"
            >
              <Database className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Map Legend */}
        <div className="absolute bottom-6 right-6 z-[700] glass rounded-lg p-3 border-glow text-[9px] space-y-2 min-w-[160px]">
          <div className="font-orbitron text-cyan-400 font-bold border-b border-cyan-500/10 pb-1">KATMANLAR</div>
          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_4px_red]" /> Deprem (USGS)</div>
          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_4px_purple]" /> ISS Konumu</div>
          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_4px_cyan]" /> Hedef Bölge</div>
          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-cyan-400/30" /> Bina Yoğunluğu (OSM)</div>
          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#ff3366]" /> Hastane / Kritik Tesis</div>
        </div>
      </main>
    </div>
  );
}
