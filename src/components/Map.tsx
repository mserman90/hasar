import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import React, { useEffect } from 'react';
import 'leaflet/dist/leaflet.css';
import { TargetZone, QuakeEvent, EonetEvent, DisasterType, SimulationParams } from '../types';
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
  visibleLayers: {
    quakes: boolean;
    eonet: boolean;
    iss: boolean;
    infra: boolean;
  };
  onRunSimulation: (type?: DisasterType, params?: Partial<SimulationParams>, target?: TargetZone) => void;
  onMapClick: (lat: number, lng: number, autoSimType?: DisasterType, autoSimIntensity?: number) => void;
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

export default function Map({ target, setTarget, quakes, eonet, iss, mapStyle, updateSource, logError, visibleLayers, onRunSimulation, onMapClick }: MapProps) {
  // Fly to target when it changes
  function MapController({ target }: { target: TargetZone | null }) {
    const map = useMap();
    useEffect(() => {
      if (target && Number.isFinite(target.lat) && Number.isFinite(target.lng)) {
        map.flyTo([target.lat, target.lng], 10, { duration: 1.5 });
      }
    }, [target, map]);
    return null;
  }

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
      <MapEvents onMapClick={onMapClick} />
      <MapController target={target} />
      
      {target && Number.isFinite(target.lat) && Number.isFinite(target.lng) && (
        <>
          <Marker position={[target.lat, target.lng]} icon={targetIcon} />
          <Circle 
            center={[target.lat, target.lng]} 
            radius={50000} 
            pathOptions={{ color: '#00f0ff', fillColor: '#00f0ff', fillOpacity: 0.1, weight: 1, dashArray: '5,5' }} 
          />
        </>
      )}

      {visibleLayers.infra && target?.infra?.buildingPoints?.map((p, i) => {
        if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null;
        return (
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
        );
      })}

      {visibleLayers.infra && target?.infra?.facilities?.map((f, i) => {
        if (!Number.isFinite(f.lat) || !Number.isFinite(f.lng)) return null;
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

      {visibleLayers.quakes && quakes?.map(q => {
        if (!Number.isFinite(q.lat) || !Number.isFinite(q.lng)) return null;
        return (
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
            eventHandlers={{
              click: (ev) => {
                L.DomEvent.stopPropagation(ev);
                onMapClick(q.lat, q.lng, 'seismic', Math.min(100, Math.round(q.mag * 12)));
              }
            }}
          >
            <Popup>
              <div className="font-bold text-red-400">M{q.mag}</div>
              <div>{q.place}</div>
              <div className="text-gray-500 text-xs">Derinlik: {q.depth}km</div>
              <div className="mt-1 text-[9px] text-cyan-400 italic">Simülasyonu başlatmak için tıklayın</div>
            </Popup>
          </Circle>
        );
      })}

      {visibleLayers.eonet && eonet?.map(e => {
        if (!Number.isFinite(e.lat) || !Number.isFinite(e.lng)) return null;
        const color = e.category.toLowerCase().includes('fire') ? '#ff4400' : 
                      e.category.toLowerCase().includes('storm') ? '#0088ff' : 
                      e.category.toLowerCase().includes('ice') ? '#00ffff' : '#ffaa00';
        
        const getDisasterType = (cat: string): DisasterType => {
          const c = cat.toLowerCase();
          if (c.includes('fire')) return 'wildfire';
          if (c.includes('storm')) return 'storm';
          if (c.includes('flood')) return 'flood';
          if (c.includes('drought')) return 'drought';
          return 'seismic';
        };

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
            eventHandlers={{
              click: (ev) => {
                L.DomEvent.stopPropagation(ev);
                onMapClick(e.lat, e.lng, getDisasterType(e.category), 75);
              }
            }}
          >
            <Popup>
              <div className="font-bold text-amber-400">{e.category.toUpperCase()}</div>
              <div className="text-sm">{e.title}</div>
              <div className="mt-1 text-[9px] text-cyan-400 italic">Simülasyonu başlatmak için tıklayın</div>
            </Popup>
          </Circle>
        );
      })}

      {visibleLayers.iss && iss && Number.isFinite(iss.lat) && Number.isFinite(iss.lng) && <Marker position={[iss.lat, iss.lng]} icon={issIcon} />}
    </MapContainer>
  );
}
