export type DisasterType = 
  | 'seismic' 
  | 'flood' 
  | 'wildfire' 
  | 'conflict' 
  | 'airpollution' 
  | 'drought' 
  | 'storm' 
  | 'aviation';

export interface SimulationParams {
  intensity: number;
  exposure: number;
  vulnerability: number;
  resilience: number;
  cascade: number;
}

export interface SimulationResults {
  normalizeRisk: number;
  mdr: number;
  pml: number;
  aal: number;
  infraCollapse: number;
  cascadeScenario: string;
}

export interface TargetZone {
  lat: number;
  lng: number;
  name: string;
  weather?: WeatherData;
  infra?: InfraData;
  alerts?: WeatherAlert[];
}

export interface WeatherAlert {
  event: string;
  headline: string;
  description: string;
  severity: 'minor' | 'moderate' | 'severe' | 'extreme';
  onset: string;
  expires: string;
}

export interface WeatherData {
  temp: number;
  windSpeed: number;
  precipitation: number;
  humidity: number;
  conditionCode: number;
}

export interface InfraData {
  buildingCount: number;
  hospitalCount: number;
  schoolCount: number;
  emergencyCount: number;
  densityScore: number;
  facilities: Array<{ lat: number; lng: number; type: string; name?: string }>;
  buildingPoints: Array<{ lat: number; lng: number }>;
}

export interface QuakeEvent {
  id: string;
  mag: number;
  place: string;
  time: number;
  lat: number;
  lng: number;
  depth: number;
}

export interface EonetEvent {
  id: string;
  title: string;
  category: string;
  lat: number;
  lng: number;
}

export interface AppNotification {
  id: string;
  type: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  timestamp: number;
}

export interface DataSourceStatus {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'error';
  lastFetch: number;
  refreshInterval: number;
  errorLog: string[];
}
