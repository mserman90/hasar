import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TargetZone, QuakeEvent, EonetEvent } from '../types';
import { fetchWeatherData, fetchInfraData, fetchWeatherAlerts } from '../services/apiService';

// Fix for default marker icons in Leaflet + React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

interface MapProps {
  target: TargetZone | null;
  setTarget: (target: TargetZone) => void;
  quakes: QuakeEvent[];
  eonet: EonetEvent[];
  iss: { lat: number; lng: number } | null;
  mapStyle: string;
  updateSource: (id: string, updates: any) => void;
  logError: (id: string, error: string) => void;
}

const MAP_STYLES: Record<string, string> = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  topo: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'
};

function MapEvents({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function Map({ target, setTarget, quakes, eonet, iss, mapStyle, updateSource, logError }: MapProps) {
  const handleMapClick = async (lat: number, lng: number) => {
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

      setTarget({ 
        lat, 
        lng, 
        name,
        weather: weather || undefined,
        infra: infra || undefined,
        alerts: alerts.length > 0 ? alerts : undefined
      });
    } catch (e: any) {
      setTarget({ lat, lng, name: `${lat.toFixed(2)}, ${lng.toFixed(2)}` });
    }
  };

  const targetIcon = L.divIcon({
    className: '',
    html: `<div style="position:relative;width:40px;height:40px;">
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:12px;height:12px;background:rgba(0,240,255,0.9);border-radius:50%;box-shadow:0 0 12px rgba(0,240,255,0.8);z-index:2;"></div>
      <div class="pulse-marker" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:12px;height:12px;border:2px solid rgba(0,240,255,0.6);border-radius:50%;z-index:1;"></div>
    </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });

  const issIcon = L.divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;background:rgba(168,85,247,0.15);border:1.5px solid rgba(168,85,247,0.6);border-radius:50%;display:flex;align-items:center;justify-content:center;">
      <i class="fas fa-satellite" style="color:#a855f7;font-size:10px;"></i>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });

  return (
    <MapContainer center={[39.0, 35.0]} zoom={6} className="w-full h-full" zoomControl={false}>
      <TileLayer url={MAP_STYLES[mapStyle] || MAP_STYLES.dark} />
      <MapEvents onMapClick={handleMapClick} />
      
      {target && (
        <>
          <Marker position={[target.lat, target.lng]} icon={targetIcon} />
          <Circle 
            center={[target.lat, target.lng]} 
            radius={50000} 
            pathOptions={{ color: '#00f0ff', fillColor: '#00f0ff', fillOpacity: 0.1, weight: 1, dashArray: '5,5' }} 
          />
        </>
      )}

      {target?.infra?.buildingPoints.map((p, i) => (
        <Circle 
          key={`building-${i}`} 
          center={[p.lat, p.lng]} 
          radius={50}
          pathOptions={{ 
            color: '#00f0ff',
            fillColor: '#00f0ff',
            fillOpacity: 0.15,
            weight: 0
          }}
        />
      ))}

      {target?.infra?.facilities.map((f, i) => {
        const color = f.type === 'hospital' ? '#ff3366' : f.type === 'school' ? '#3b82f6' : '#a855f7';
        return (
          <Circle 
            key={`facility-${i}`} 
            center={[f.lat, f.lng]} 
            radius={150}
            pathOptions={{ 
              color: color,
              fillColor: color,
              fillOpacity: 0.8,
              weight: 2
            }}
          >
            <Popup>
              <div className="font-bold" style={{ color }}>{f.type.toUpperCase()}</div>
              <div className="text-xs">{f.name || 'İsimsiz Tesis'}</div>
            </Popup>
          </Circle>
        );
      })}

      {quakes.map(q => (
        <Circle 
          key={q.id} 
          center={[q.lat, q.lng]} 
          radius={Math.max(4, q.mag * 3) * 1000}
          pathOptions={{ 
            color: q.mag >= 6 ? '#ff3366' : q.mag >= 4.5 ? '#ff8800' : '#ffcc00',
            fillColor: q.mag >= 6 ? '#ff3366' : q.mag >= 4.5 ? '#ff8800' : '#ffcc00',
            fillOpacity: 0.6,
            weight: 1
          }}
        >
          <Popup>
            <div className="font-bold text-red-400">M{q.mag}</div>
            <div>{q.place}</div>
            <div className="text-gray-500 text-xs">Derinlik: {q.depth}km</div>
          </Popup>
        </Circle>
      ))}

      {eonet.map(e => {
        const color = e.category.toLowerCase().includes('fire') ? '#ff4400' : 
                      e.category.toLowerCase().includes('storm') ? '#0088ff' : 
                      e.category.toLowerCase().includes('ice') ? '#00ffff' : '#ffaa00';
        return (
          <Circle 
            key={e.id} 
            center={[e.lat, e.lng]} 
            radius={25000}
            pathOptions={{ 
              color: color,
              fillColor: color,
              fillOpacity: 0.4,
              weight: 2,
              dashArray: '5, 10'
            }}
          >
            <Popup>
              <div className="font-bold text-amber-400">{e.category.toUpperCase()}</div>
              <div className="text-sm">{e.title}</div>
            </Popup>
          </Circle>
        );
      })}

      {iss && <Marker position={[iss.lat, iss.lng]} icon={issIcon} />}
    </MapContainer>
  );
}
