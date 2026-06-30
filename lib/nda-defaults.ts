/**
 * Mutual NDA form state — modelled after the MHECO-BossLabs template.
 * Only fields that legitimately vary per counterparty are editable; the
 * 16-section legal body is fixed in NdaDocument.tsx.
 */

export type NdaFormData = {
  // BossLabs side
  bosslabsOfficeAddress: string;
  bosslabsSecRegNo: string;
  // Counterparty
  counterpartyCompanyName: string;
  counterpartyOfficeAddress: string;
  counterpartyRepName: string;
  counterpartyRepPosition: string;
  // Engagement recitals
  counterpartyBusinessDescription: string;
  purposeDescription: string;
  // Meta
  effectiveDate: string; // YYYY-MM-DD
  governingVenue: string;
};

export const DEFAULT_NDA_FORM: NdaFormData = {
  bosslabsOfficeAddress:
    '3rd Flr. J&M Ramos Bldg., Gen. Yengco St., Brgy. Poblacion IV-A, Imus, Cavite',
  bosslabsSecRegNo: '',
  counterpartyCompanyName: '',
  counterpartyOfficeAddress: '',
  counterpartyRepName: '',
  counterpartyRepPosition: '',
  counterpartyBusinessDescription:
    'a duly organized enterprise engaged in its respective field of business, operating across the Philippines',
  purposeDescription:
    'the Parties wish to explore and undertake a potential or actual business engagement under which BossLabs shall design, develop, and deliver software applications and the supporting digital backbone and infrastructure for the Counterparty and its group of companies',
  effectiveDate: new Date().toISOString().slice(0, 10),
  governingVenue: 'Makati City',
};
