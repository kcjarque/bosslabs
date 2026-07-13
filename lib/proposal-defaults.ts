/**
 * BossLabs hypercustomized web build — Proposal Maker presets. Sibling of
 * lib/contract-defaults.ts: the proposal is the persuasive, plain-English
 * pitch that precedes the legal Web Development & Services Agreement.
 *
 * PROPOSAL_OPTIONS (A/B/C) reuse the exact same fee + hosting defaults as
 * the contract options — derived from CONTRACT_OPTIONS at module load so the
 * two stay in sync — but collapse each option's line items into the three
 * headline investment figures a proposal quotes: one-time build, monthly
 * retainer, and the optional full-code-handover exit fee.
 */

import { CONTRACT_OPTIONS } from '@/lib/contract-defaults';

const PHP = (pesos: number): number => Math.round(pesos * 100);

export type ProposalOption = {
  id: 'A' | 'B' | 'C';
  name: string;
  targetTimeline: string;
  description: string;
  /** One-time build fee in centavos (sum of the option's one-time items). */
  oneTimeTotalCentavos: number;
  /** Monthly retainer in centavos (sum of the option's monthly items). */
  monthlyRetainerCentavos: number;
  /** Minimum retainer commitment in months. */
  minRetainerMonths: number;
  /** Optional full-code-handover exit fee in centavos. */
  exitFeeCentavos: number;
};

/** Standing full-handover Exit Fee — mirrors the contract default (₱100,000). */
const EXIT_FEE_DEFAULT = PHP(100_000);
/** Minimum retainer commitment — mirrors Agreement §8.2 (six months). */
const MIN_RETAINER_MONTHS_DEFAULT = 6;

export const PROPOSAL_OPTIONS: ProposalOption[] = CONTRACT_OPTIONS.map((o) => {
  const oneTime = o.lineItems.filter((li) => li.kind === 'oneTime').reduce((s, li) => s + li.amountCentavos, 0);
  const monthly = o.lineItems.filter((li) => li.kind === 'monthly').reduce((s, li) => s + li.amountCentavos, 0);
  return {
    id: o.id,
    name: o.name,
    targetTimeline: o.targetTimeline,
    description: o.description,
    oneTimeTotalCentavos: oneTime,
    monthlyRetainerCentavos: monthly,
    minRetainerMonths: MIN_RETAINER_MONTHS_DEFAULT,
    exitFeeCentavos: EXIT_FEE_DEFAULT,
  };
});

export const PROPOSAL_OPTION_DEFAULT: ProposalOption['id'] = 'A';

export function findProposalOption(id: ProposalOption['id']): ProposalOption {
  return PROPOSAL_OPTIONS.find((o) => o.id === id) ?? PROPOSAL_OPTIONS[0];
}

/** A scope module row shown in the Detailed Scope of Work table. */
export type ProposalModule = {
  id: string; // stable for React keys
  name: string;
  /** Key features — free text, comma- or sentence-separated. */
  features: string;
  /** Users / roles that touch this module. */
  roles: string;
};

export function newModule(): ProposalModule {
  return {
    id: `mod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    features: '',
    roles: '',
  };
}

const DEFAULT_MODULES: ProposalModule[] = [
  {
    id: 'mod-dashboard',
    name: 'Dashboard & Reporting',
    features: 'Real-time KPIs, exportable reports, role-based views',
    roles: 'Owner, Manager',
  },
  {
    id: 'mod-records',
    name: 'Records Management',
    features: 'Create, search, edit, full audit trail',
    roles: 'Staff, Admin',
  },
  {
    id: 'mod-users',
    name: 'Users & Access Control',
    features: 'Custom roles, permissions, activity log',
    roles: 'Admin',
  },
];

/** Common third-party integrations offered to PH SMEs. Free text can be added
 *  on top of these in the Proposal Maker. */
export const INTEGRATION_BANK: string[] = [
  'Online payments (Xendit / PayMongo)',
  'GCash / Maya',
  'Meta (Facebook & Instagram) Pages + Messenger',
  'Google Workspace (Sheets, Drive, Calendar)',
  'SMS notifications (OneWaySMS)',
  'Email (transactional + broadcasts)',
  'Viber / Telegram alerts',
  'BIR-ready invoicing / OR export',
  'Shipping & logistics (Lalamove, J&T)',
  'Accounting export (XLSX / QuickBooks-ready)',
];

/** AI functionalities included under Phase 1 (part of the build). */
export const AI_PHASE1_BANK: string[] = [
  'AI assistant / chatbot trained on your business data',
  'Smart search across all your records',
  'Automated document & report generation',
  'AI-drafted customer replies and follow-ups',
  'Natural-language data queries ("show me last month’s…")',
  'Automated data extraction from uploads (receipts, forms)',
  'Anomaly & exception flagging',
];

/** AI upgrades available under Phase 2 (future, quoted separately). */
export const AI_PHASE2_BANK: string[] = [
  'Predictive analytics & demand forecasting',
  'Voice / call transcription and summarization',
  'Autonomous multi-step agent workflows',
  'Computer-vision quality checks',
  'Personalized recommendation engine',
  'Custom model fine-tuned on your proprietary data',
];

/** A shipped case study, described by industry + capability (no client names).
 *  The Proposal Maker lets the admin pick 3–5 for the About section's Ship Log. */
export type ShipLogEntry = {
  id: string;
  industry: string;
  descriptor: string;
};

export const SHIP_LOG_BANK: ShipLogEntry[] = [
  { id: 'fleet', industry: 'Car Rental / Fleet Ops', descriptor: 'Fleet inventory, bookings, maintenance and driver dispatch in one command center.' },
  { id: 'signage', industry: 'Signage & Fabrication', descriptor: 'Quote-to-cash with BOM-vs-actual costing and completion-gated billing.' },
  { id: 'glass', industry: 'Construction / Glass Supply', descriptor: 'Order-to-cash: quotations, sales orders, delivery receipts and invoices, atomically numbered.' },
  { id: 'moto', industry: 'Motorcycle Gear E-commerce', descriptor: 'Omnichannel storefront + POS with an append-only inventory ledger that never drifts.' },
  { id: 'mlm', industry: 'Direct-Selling / MLM', descriptor: 'Member back-office with genealogy, unilevel commissions and BIR-ready payouts.' },
  { id: 'rental', industry: 'Property / Rentals', descriptor: 'Obligations engine that computes dues, penalties and reminders on schedule.' },
  { id: 'resto', industry: 'Restaurant / Commissary', descriptor: 'POS → COGS → Z-report with shift-compliance photo proof and variance tracking.' },
  { id: 'wms', industry: 'Warehouse / Logistics', descriptor: 'Tablet + barcode warehouse management across multiple locations.' },
  { id: 'security', industry: 'Security Agency', descriptor: 'Dispatch console + guard PWA with offline-first patrol logging.' },
  { id: 'herbal', industry: 'Herbal / Wellness Retail', descriptor: 'Member PWA with loyalty points, tiers and referral attribution.' },
  { id: 'clinic', industry: 'Aesthetic Clinic', descriptor: 'Membership, points and referral engine with SMS + email lifecycle.' },
  { id: 'isp', industry: 'FTTH / ISP Billing', descriptor: 'Subscriber portal and billing with automated invoicing and payment reconciliation.' },
];

export function findShipLog(id: string): ShipLogEntry | undefined {
  return SHIP_LOG_BANK.find((s) => s.id === id);
}

export type ProposalTrainingMode = 'on-site' | 'online' | 'either';

export type ProposalFormData = {
  /** ISO date (yyyy-mm-dd) the proposal is dated. Mirrors contract effectiveDate. */
  proposalDate: string;
  /** How many days the quoted pricing holds. */
  validityDays: number;
  /** Human-facing reference PROP-YYMMDD-NN. Empty on an unsaved proposal —
   *  assigned server-side on create; the preview shows a provisional -01. */
  proposalNo: string;
  clientCompanyName: string;
  clientRepName: string;
  clientRepPosition: string;
  clientAddress: string;
  /** Name of the platform being proposed (drives the cover + title). */
  platformName: string;
  /** The client's vision, quoted verbatim in the Executive Summary. */
  clientVision: string;
  /** Selected service option — auto-fills the investment figures. */
  optionId: ProposalOption['id'];
  /** Scope modules rendered in the Detailed Scope of Work table. */
  modules: ProposalModule[];
  /** Selected + free-text integrations. */
  integrations: string[];
  /** AI functionalities included in Phase 1. */
  aiPhase1: string[];
  /** AI upgrades reserved for Phase 2 (quoted separately). */
  aiPhase2: string[];
  /** Selected Ship Log entry ids (3–5). */
  shipLog: string[];
  /** ISO date the build kicks off — every timeline date computes from this. */
  kickoffDate: string;
  onboardingDays: number;
  workflowDays: number;
  mvpDays: number;
  dataMigrationDays: number;
  implementationDays: number;
  /** Post-go-live warranty window in days. */
  warrantyDays: number;
  /** Number of live training sessions included. */
  trainingSessions: number;
  trainingMode: ProposalTrainingMode;
  /** One-time build fee in centavos (auto-filled from the option, editable). */
  oneTimeTotalCentavos: number;
  /** Monthly retainer in centavos (auto-filled from the option, editable). */
  monthlyRetainerCentavos: number;
  minRetainerMonths: number;
  exitFeeCentavos: number;
};

const defaultOption = findProposalOption(PROPOSAL_OPTION_DEFAULT);

export const DEFAULT_PROPOSAL_FORM: ProposalFormData = {
  proposalDate: new Date().toISOString().slice(0, 10),
  validityDays: 30,
  proposalNo: '',
  clientCompanyName: '',
  clientRepName: '',
  clientRepPosition: 'Owner',
  clientAddress: '',
  platformName: '',
  clientVision: '',
  optionId: PROPOSAL_OPTION_DEFAULT,
  modules: DEFAULT_MODULES.map((m) => ({ ...m })),
  integrations: [
    'Online payments (Xendit / PayMongo)',
    'Email (transactional + broadcasts)',
    'SMS notifications (OneWaySMS)',
  ],
  aiPhase1: AI_PHASE1_BANK.slice(0, 4),
  aiPhase2: AI_PHASE2_BANK.slice(0, 3),
  shipLog: ['fleet', 'signage', 'glass'],
  // Default to today so the timeline renders real dates immediately; the
  // admin re-dates it to the real kick-off before sending.
  kickoffDate: new Date().toISOString().slice(0, 10),
  onboardingDays: 2,
  workflowDays: 3,
  mvpDays: 4,
  dataMigrationDays: 7,
  implementationDays: 30,
  warrantyDays: 60,
  trainingSessions: 2,
  trainingMode: 'either',
  oneTimeTotalCentavos: defaultOption.oneTimeTotalCentavos,
  monthlyRetainerCentavos: defaultOption.monthlyRetainerCentavos,
  minRetainerMonths: defaultOption.minRetainerMonths,
  exitFeeCentavos: defaultOption.exitFeeCentavos,
};
