import { DisasterType, SimulationParams, SimulationResults, TargetZone } from '../types';

const DISASTER_WEIGHTS: Record<DisasterType, { i: number; e: number; v: number; r: number }> = {
  seismic: { i: 1.8, e: 1.0, v: 2.0, r: 2.0 },
  flood: { i: 1.2, e: 1.8, v: 1.2, r: 1.5 },
  wildfire: { i: 1.5, e: 1.2, v: 1.5, r: 1.8 },
  conflict: { i: 2.0, e: 1.5, v: 2.0, r: 1.0 },
  airpollution: { i: 1.0, e: 2.0, v: 1.0, r: 1.2 },
  drought: { i: 1.5, e: 1.5, v: 1.0, r: 2.0 },
  storm: { i: 1.8, e: 1.2, v: 1.5, r: 1.5 },
  aviation: { i: 1.2, e: 1.0, v: 1.8, r: 2.0 }
};

export function runProbabilisticEngine(
  type: DisasterType, 
  params: SimulationParams, 
  target?: TargetZone | null
): SimulationResults {
  let { intensity: I, exposure: E, vulnerability: V, resilience: R, cascade: C } = params;
  
  // Safety check for disaster type
  const w = DISASTER_WEIGHTS[type] || DISASTER_WEIGHTS.seismic;

  // REAL-WORLD CONTEXT ADJUSTMENTS
  if (target) {
    // 1. Weather Impact
    if (target.weather) {
      const { windSpeed, precipitation } = target.weather;
      if (type === 'storm') I = Math.min(100, I * (1 + windSpeed / 100));
      if (type === 'flood') I = Math.min(100, I * (1 + precipitation / 50));
      if (type === 'wildfire' && windSpeed > 30) I = Math.min(100, I * 1.2);
    }

    // 2. Infrastructure Impact
    if (target.infra) {
      const { densityScore, buildingCount } = target.infra;
      // High density increases exposure and vulnerability
      E = Math.min(100, E * (1 + densityScore / 200));
      if (buildingCount > 1000) V = Math.min(100, V * 1.15);
    }
  }

  // Normalize Risk - Adjusted by disaster-specific weights
  const rawRisk = (Math.pow(I / 100, 1.2) * w.i + Math.pow(E / 100, 1.1) * w.e + (V / 100) * w.v - (R / 100) * w.r) / 3.0;
  const normalizeRisk = Math.max(0.01, Math.min(rawRisk, 1.0));

  // MDR (Mean Damage Ratio)
  const mdr = Math.pow(I / 100, 1.5) * (V / 100);

  // PML (Probable Maximum Loss) in Million $
  const pml = (E * 500) * mdr * (1 + (C / 100) * 0.5) * (1 - (R / 100) * 0.3);

  // AAL (Average Annual Loss)
  const aal = pml * Math.max(0.01, 1 - (I / 100));

  // Infrastructure Collapse Probability
  const infraCollapse = Math.min(99, mdr * 100 * 1.2 * (1 + (w.v - 1.5) * 0.2));

  const cascadeScenario = getCascadeScenario(type, normalizeRisk, pml);

  return { normalizeRisk, mdr, pml, aal, infraCollapse, cascadeScenario };
}

function getCascadeScenario(type: DisasterType, risk: number, pml: number): string {
  const severity = risk > 0.7 ? 'KRİTİK' : risk > 0.4 ? 'YÜKSEK' : 'ORTA';
  
  const scenarios: Record<DisasterType, string> = {
    seismic: `[${severity}] Sismik olay sonrası kaskad: Ana şok ardından ${Math.round(risk * 15) + 3} adet artçı sarsıntı beklenmektedir. Doğalgaz hatları hasarı nedeniyle ikincil yangın riski %${Math.round(risk * 60)}. Su şebekesi kopması sonucu ${Math.round(pml * 0.3)}M$ ek altyapı kaybı öngörülmektedir.`,
    flood: `[${severity}] Taşkın kaskad: Ana sel sonrası toprak kayması riski %${Math.round(risk * 55)}. Tarımsal alan kaybı ${Math.round(pml * 0.4)}M$ değerinde. Kanalizasyon taşması sonucu epidemiyolojik risk ${risk > 0.6 ? 'YÜKSEK' : 'ORTA'}.`,
    wildfire: `[${severity}] Yangın kaskad: ${Math.round(pml * 0.2)} hektar orman alanı tehdit altında. Duman yayılımı hava kalitesini (AQI) ${Math.round(150 + risk * 200)} seviyesine çıkarabilir.`,
    conflict: `[${severity}] Çatışma kaskad: Sivil göç hareketi ${Math.round(pml * 200)} kişiyi etkileyebilir. Kritik altyapı (enerji, su) hasarı %${Math.round(risk * 80)}. İnsani yardım maliyeti ${Math.round(pml * 0.5)}M$.`,
    airpollution: `[${severity}] Hava kirliliği kaskad: PM2.5 seviyeleri WHO limitinin ${Math.round(2 + risk * 10)}x üstüne çıkabilir. Solunum hastalıklarında acil servis başvurusu %${Math.round(risk * 120)} artış.`,
    drought: `[${severity}] Kuraklık kaskad: Su rezervuarları %${Math.round(100 - risk * 80)} kapasiteye düşebilir. Tarımsal kayıp ${Math.round(pml * 0.7)}M$. Gıda fiyat enflasyonu %${Math.round(risk * 40)}.`,
    storm: `[${severity}] Fırtına kaskad: Rüzgar hızı ${Math.round(80 + risk * 120)}km/h. Enerji şebekesi ${Math.round(risk * 72)} saat devre dışı. Kıyı taşkını riski ${risk > 0.5 ? 'KRİTİK' : 'YÜKSEK'}.`,
    aviation: `[${severity}] Havacılık kaskad: Hava sahası kısıtlaması ${Math.round(risk * 36)} saat. Yönlendirilen uçuş: ~${Math.round(risk * 150)}. Alternatif havalimanı yükü %${Math.round(risk * 60)} artış.`
  };

  return scenarios[type] || `[${severity}] Genel kaskad senaryosu aktif. Toplam kayıp tahmini: ${pml.toFixed(1)}M$.`;
}
