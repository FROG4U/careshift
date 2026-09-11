/**
 * Shapes shared by every view of a pay run: the report screen, the CSV
 * export, the PDF, and the frozen copy a worker sees once it is completed.
 *
 * Kept free of server-only imports so client components can use them.
 */

export type DayLine = {
  id: string;
  /** "Mon 20 Jul", in the shift's own timezone. */
  dateLabel: string;
  /** "9:00 am - 12:00 pm", in the shift's own timezone. */
  timeLabel: string;
  startIso: string;
  endIso: string;
  /** The timezone this shift was costed and labelled in. */
  tz: string;
  clientName: string;
  dayType: string;
  holidayName: string | null;
  hours: number;
  rate: number;
  km: number;
  kmPay: number;
  pay: number;
};

export type WorkerRow = {
  staffId: string;
  name: string;
  level: string;
  employment: string;
  shifts: number;
  hours: number;
  km: number;
  wagePay: number;
  kmPay: number;
  total: number;
  bands: Record<string, number>;
  unrated: boolean;
  lines: DayLine[];
};

export type Totals = {
  hours: number;
  km: number;
  wagePay: number;
  kmPay: number;
  total: number;
};
