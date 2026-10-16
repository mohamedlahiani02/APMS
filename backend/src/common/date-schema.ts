import { z } from "zod";
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (YYYY-MM-DD).")
  .refine((value) => {
    const date = new Date(value + "T00:00:00.000Z");
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }, "Date invalide.");

/** Dates are calendar dates, or UTC-midnight dates after export parsing. */
export function dateRangeIsOrdered(value: {
  dateFrom?: string | Date;
  dateTo?: string | Date;
}): boolean {
  return (
    !value.dateFrom ||
    !value.dateTo ||
    new Date(value.dateFrom).getTime() <= new Date(value.dateTo).getTime()
  );
}
export const dateRangeError = {
  message: "La date de début doit précéder ou égaler la date de fin.",
  path: ["dateTo"],
};
