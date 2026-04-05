import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TargetZone, QuakeEvent, EonetEvent, DisasterType } from '../types';
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
  onDisasterClick?: (lat: number, lng: number, type: DisasterType, magnitude?: number) => void;
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

export default function Map({ target, setTarget, quakes, eonet, iss, mapStyle, updateSource, logError, onDisasterClick }: MapProps) {
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

      setTarget({ lat, lng, name, weather: weather || undefined, infra: infra || undefined, alerts: alerts.length > 0 ? alerts : undefined });
    } catch (e: any) {
      setTarget({ lat, lng, name: `${lat.toFixed(2)}, ${lng.toFixed(2)}` });
    }
  };

  const handleQuakeClick = (quake: QuakeEvent) => {
    if (onDisasterClick) {
      onDisasterClick(quake.lat, quake.lng, 'seismic', quake.mag);
    }
  };

  const handleEonetClick = (event: EonetEvent) => {
    if (onDisasterClick) {
      const cat = event.category.toLowerCase();
      let type: DisasterType = 'wildfire';
      if (cat.includes('fire')) type = 'wildfire';
      else if (cat.includes('storm') || cat.includes('cyclone')) type = 'storm';
      else if (cat.includes('flood')) type = 'flood';
      else if (cat.includes('drought')) type = 'drought';
      
      onDisasterClick(event.lat, event.lng, type);
    }
  };

  const targetIcon = L.divIcon({
    className: '',
    html: `<svg width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="none" stroke="#00f0ff" stroke-width="3" opacity="0.8"/><circle cx="20" cy="20" r="6" fill="#00f0ff" opacity="0.9"/></svg>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });

  const issIcon = L.divIcon({
    className: '',
    html: `<svg width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12" fill="#a855f7" opacity="0.8"/><text x="14" y="18" text-anchor="middle" fill="white" font-size="10" font-weight="bold">ISS</text></svg>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });

  return (
    <MapContainer center={[39.9334, 32.8597]} zoom={6} style={{ width: '100%', height: '100vh' }} zoomControl={false}>
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        url={MAP_STYLES[mapStyle] || MAP_STYLES.dark}
      />
      <MapEvents onMapClick={handleMapClick} />

      {target && (
        <>
          <Marker position={[target.lat, target.lng]} icon={targetIcon} />
          <Circle
            center={[target.lat, target.lng]}
            radius={15000}
            pathOptions={{ color: '#00f0ff', fillColor: '#00f0ff', fillOpacity: 0.1, weight: 2 }}
          />
        </>
      )}

      {target?.infra?.buildingPoints.map((p, i) => (
        <Circle key={i} center={[p.lat, p.lng]} radius={50} pathOptions={{ color: '#00f0ff', fillColor: '#00f0ff', fillOpacity: 0.3, weight: 0 }} />
      ))}

      {target?.infra?.facilities.map((f, i) => {
        const color = f.type === 'hospital' ? '#ff3366' : f.type === 'school' ? '#3b82f6' : '#a855f7';
        return (
          <Circle key={i} center={[f.lat, f.lng]} radius={200} pathOptions={{ color, fillColor: color, fillOpacity: 0.5, weight: 2 }}>
            <Popup>
              <div className="text-xs">
                <div className="font-bold">{f.type.toUpperCase()}</div>
                <div>{f.name || 'İsimsiz Tesis'}</div>
              </div>
            </Popup>
          </Circle>
        );
      })}

      {quakes.map(q => (
        <Circle
          key={q.id}
          center={[q.lat, q.lng]}
          radius={Math.pow(2, q.mag) * 1000}
          eventHandlers={{
            click: () => handleQuakeClick(q)
          }}
          pathOptions={{
            color: q.mag >= 6 ? '#ff3366' : q.mag >= 4.5 ? '#ff8800' : '#ffcc00',
            fillColor: q.mag >= 6 ? '#ff3366' : q.mag >= 4.5 ? '#ff8800' : '#ffcc00',
            fillOpacity: 0.6,
            weight: 1
          }}
        >
          <Popup>
            <div className="text-xs">
              <div className="font-bold text-red-400">M{q.mag}</div>
              <div>{q.place}</div>
              <div className="text-gray-400">Derinlik: {q.depth}km</div>
            </div>
          </Popup>
        </Circle>
      ))}

      {eonet.map(e => {
        const color = e.category.toLowerCase().includes('fire') ? '#ff4400' : e.category.toLowerCase().includes('storm') ? '#0088ff' : e.category.toLowerCase().includes('ice') ? '#00ffff' : '#ffaa00';
        return (
          <Circle
            key={e.id}
            center={[e.lat, e.lng]}
            radius={20000}
            eventHandlers={{
              click: () => handleEonetClick(e)
            }}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.4, weight: 2 }}
          >
            <Popup>
              <div className="text-xs">
                <div className="font-bold" style={{ color }}>{e.category.toUpperCase()}</div>
                <div>{e.title}</div>
              </div>
            </Popup>
          </Circle>
        );
      })}

      {iss && <Circle center={[iss.lat, iss.lng]} radius={5000} pathOptions={{ color: '#a855f7', fillColor: '#a855f7', fillOpacity: 0.6 }}><Popup><div className="text-xs font-bold text-purple-400">ISS Konumu</div></Popup></Circle>}
    </MapContainer>
  );
}
