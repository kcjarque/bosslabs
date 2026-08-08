export type Brand = 'BOSS' | 'CONX' | 'LEO';
export type Tier = 'LEARNING' | 'WINNING' | 'WATCH' | 'LOSER';
export type Role = 'PROSPECTOR' | 'CLOSER' | 'HYBRID';
export type Mode = 'recommend' | 'one_click' | 'autopilot';

export type AdDay = {
  date: string;               // YYYY-MM-DD
  spendCentavos: number;
  impressions: number;
  reach: number;
  frequency: number | null;
  ctr: number | null;         // % (all clicks)
  linkCtr: number | null;     // %
  cpm: number | null;         // pesos
  linkClicks: number;
  purchases: number;
  revenueCentavos: number;
  video3s: number;   // 3-sec video views (thumbstop) — 0 on image ads
  thruplays: number; // watched ≥15s / to completion (hold) — 0 on image ads
  lpViews: number;   // landing_page_view — the click actually loaded the page
};

export type AdSeries = {
  brand: Brand;
  campaignId: string; campaignName: string;
  adsetId: string; adsetName: string;
  adId: string; adName: string;
  days: AdDay[];              // ascending by date; first row = first day with delivery
};

export type CampaignWindow = {
  totalSpend7Centavos: number;      // campaign spend, trailing 7 settled days
  blendedCpp7Centavos: number | null;
};

export type CouncilSettingsRow = { brand: Brand; mode: Mode; targetCppCentavos: number };

export type PriorsRow = {
  brand: Brand;
  dailyCppSigmaPct: number | null;
  medianWinnerLifespanDays: number | null;
  cppDriftPctPerWeek: number | null;
  weekdayMultipliers: Record<string, number> | null;
  sampleDays: number;
};

export type VerdictResult = {
  adId: string; adName: string; brand: Brand;
  date: string;               // grading date (the settled day)
  verdict: Tier; role: Role;
  daysInTier: number; changed: boolean; degraded: boolean;
  decidingMetrics: Record<string, number | null>;
  headline: string;           // ≤90 chars
  interpretation: string;
  tierFlipCondition: string;
};
