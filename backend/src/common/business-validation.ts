import {
  tauxTvaInvalide,
  transactionDateFuture,
  transactionDateTooOld,
} from "./errors.js";

const VALID_TVA_RATES = [7, 13, 19] as const;

/** Shared by bl-achats and ventes: date must not be in the future, and not before Jan 1 of the current year. */
export function validateTransactionDate(date: Date, now = new Date()): void {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = startOfDay(now);
  const given = startOfDay(date);
  if (given.getTime() > today.getTime()) {
    throw transactionDateFuture();
  }
  const jan1ThisYear = new Date(now.getFullYear(), 0, 1);
  if (given.getTime() < jan1ThisYear.getTime()) {
    throw transactionDateTooOld();
  }
}

export function validateTauxTva(value: number): asserts value is 7 | 13 | 19 {
  if (!VALID_TVA_RATES.includes(value as 7 | 13 | 19)) {
    throw tauxTvaInvalide(value);
  }
}
