/**
 * AI Founder's Bootcamp / BossLabs hypercustomized web build — contract
 * line-item presets. Mirrors the NextDrive Web Development Agreement
 * Option A/B/C structure.
 *
 * Each option ships with its own deliverables + monthly retainer items.
 * The admin contract maker loads these as defaults when the user picks an
 * option, and lets them add/remove/edit individual line items afterwards.
 */

export type ContractLineKind = 'oneTime' | 'monthly';

export type ContractLineItem = {
  id: string; // stable for React keys
  label: string;
  amountCentavos: number;
  kind: ContractLineKind;
  /** Free-text payment note shown on the line (e.g. "50% on signing, 50% on delivery"). */
  note?: string;
};

export type ContractOption = {
  id: 'A' | 'B' | 'C';
  name: string;
  targetTimeline: string;
  description: string;
  lineItems: ContractLineItem[];
};

const PHP = (pesos: number): number => Math.round(pesos * 100);

export const CONTRACT_OPTIONS: ContractOption[] = [
  {
    id: 'A',
    name: 'Option A — Standard',
    targetTimeline: 'approximately 30 days',
    description: 'Standard build with platform-native security (Vercel + Supabase Pro).',
    lineItems: [
      {
        id: 'A-build',
        label: 'Hypercustomized Web Development',
        amountCentavos: PHP(150_000),
        kind: 'oneTime',
        note: '50% on signing, 50% on delivery and acceptance.',
      },
      {
        id: 'A-maint',
        label: 'Maintenance & Server Fees',
        amountCentavos: PHP(15_000),
        kind: 'monthly',
        note: 'Routine maintenance + hosting (Vercel + Supabase Pro). Billed monthly in advance.',
      },
    ],
  },
  {
    id: 'B',
    name: 'Option B — Security Hardened',
    targetTimeline: '1–2 months',
    description: 'Standard build + Cloudflare WAF + rate-limiting + DDoS mitigation + internal security audit.',
    lineItems: [
      {
        id: 'B-build',
        label: 'Hypercustomized Web Development',
        amountCentavos: PHP(150_000),
        kind: 'oneTime',
        note: '50% on signing, 50% on delivery and acceptance.',
      },
      {
        id: 'B-harden',
        label: 'Security Hardening (Cloudflare WAF, rate limiting, DDoS, internal audit)',
        amountCentavos: PHP(100_000),
        kind: 'oneTime',
        note: '50% on commencement, 50% on completion.',
      },
      {
        id: 'B-maint',
        label: 'Maintenance',
        amountCentavos: PHP(15_000),
        kind: 'monthly',
        note: 'Routine upkeep, bug fixes, minor enhancements + hosting.',
      },
      {
        id: 'B-cyber',
        label: 'Cybersecurity Monitoring',
        amountCentavos: PHP(25_000),
        kind: 'monthly',
        note: 'Ongoing security monitoring, vulnerability management, patches, incident response.',
      },
    ],
  },
  {
    id: 'C',
    name: 'Option C — Security Hardened + Third-Party VAPT',
    targetTimeline: '4–6 months',
    description:
      'Standard build + Security Hardening + independent Vulnerability Assessment & Penetration Test from a third-party security firm.',
    lineItems: [
      {
        id: 'C-build',
        label: 'Hypercustomized Web Development',
        amountCentavos: PHP(150_000),
        kind: 'oneTime',
        note: '50% on signing, 50% on delivery and acceptance.',
      },
      {
        id: 'C-harden',
        label: 'Security Hardening (Cloudflare WAF, rate limiting, DDoS, internal audit)',
        amountCentavos: PHP(100_000),
        kind: 'oneTime',
        note: '50% on commencement, 50% on completion.',
      },
      {
        id: 'C-vapt',
        label: 'Third-Party Vulnerability Assessment & Penetration Test (VAPT)',
        amountCentavos: PHP(200_000),
        kind: 'oneTime',
        note: '50% on engagement of the third-party firm, 50% on receipt of the VAPT report.',
      },
      {
        id: 'C-devops',
        label: 'DevOps',
        amountCentavos: PHP(25_000),
        kind: 'monthly',
        note: 'Infrastructure ops + hosting, deployment pipeline, performance monitoring, backups.',
      },
      {
        id: 'C-cyber',
        label: 'Cybersecurity',
        amountCentavos: PHP(30_000),
        kind: 'monthly',
        note: 'Continuous monitoring, vulnerability management, threat intel, incident response, periodic scanning.',
      },
    ],
  },
];

export const OPTION_DEFAULT: ContractOption['id'] = 'A';

export function findOption(id: ContractOption['id']): ContractOption {
  return CONTRACT_OPTIONS.find((o) => o.id === id) ?? CONTRACT_OPTIONS[0];
}

export function newCustomLineItem(): ContractLineItem {
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label: '',
    amountCentavos: 0,
    kind: 'oneTime',
    note: '',
  };
}

export type ContractFormData = {
  /** ISO date (yyyy-mm-dd) the contract takes effect. */
  effectiveDate: string;
  /** Client company legal name (e.g. "NextDrive Company"). */
  clientCompanyName: string;
  /** Client principal office address (one line, optional). */
  clientAddress: string;
  /** Position of the client's signatory (e.g. "Operations Manager"). */
  clientRepPosition: string;
  /** Name of the client's signatory. */
  clientRepName: string;
  /** Selected service option — drives default deliverables + target timeline. */
  optionId: ContractOption['id'];
  /** Editable copy of the option's line items. */
  lineItems: ContractLineItem[];
  /** Governing-law venue (city) for Section 12.7. */
  governingVenue: string;
};

export const DEFAULT_CONTRACT_FORM: ContractFormData = {
  effectiveDate: new Date().toISOString().slice(0, 10),
  clientCompanyName: '',
  clientAddress: '',
  clientRepPosition: 'Owner',
  clientRepName: '',
  optionId: OPTION_DEFAULT,
  lineItems: findOption(OPTION_DEFAULT).lineItems.map((li) => ({ ...li })),
  governingVenue: 'Imus, Cavite',
};
