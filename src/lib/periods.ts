export const PERIODS = [
  { id: '30', label: '30 giorni', days: 30 },
  { id: '90', label: '90 giorni', days: 90 },
  { id: '365', label: '12 mesi', days: 365 },
  { id: 'all', label: 'Tutto', days: null },
] as const;
export type PeriodId = (typeof PERIODS)[number]['id'];
