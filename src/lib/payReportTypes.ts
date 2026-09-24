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
  /** Funding stream from the participant's agreement: NDIS, AGED_CARE, ... */
  stream: string;
  /**
   * True when this rate came from the pay level rather than a rate agreed for
   * this worker. Harmless on its own - but on a worker who HAS agreed rates
   * for other streams it means a gap, and the level may be years old.
   */
  rateFromLevel?: boolean;
  holidayName: string | null;
  /** Hours PAID: time worked, plus any minimum engagement top-up below. */
  hours: number;
  /** Hours added to reach the 2 hour minimum engagement, if any. */
  topUpHours?: number;
  /** Hours paid past the rostered finish because the office authorised them. */
  extraHours?: number;
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
  /** Has agreed rates for some cells, but this run used the level for others. */
  rateGap?: boolean;
  lines: DayLine[];
};

export type Totals = {
  hours: number;
  km: number;
  wagePay: number;
  kmPay: number;
  total: number;
};
