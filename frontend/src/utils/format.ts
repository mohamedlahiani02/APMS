const TUNIS_TZ = 'Africa/Tunis';
const NBSP = ' ';

const dinarFormatter = new Intl.NumberFormat('fr-TN', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
  useGrouping: true,
});

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TUNIS_TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TUNIS_TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatDinar(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return `0,000${NBSP}DT`;
  return `${dinarFormatter.format(value)}${NBSP}DT`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return dateFormatter.format(d);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return dateTimeFormatter.format(d);
}

export function todayISO(): string {
  const now = new Date();
  const tunis = new Date(now.toLocaleString('en-US', { timeZone: TUNIS_TZ }));
  const yyyy = tunis.getFullYear();
  const mm = String(tunis.getMonth() + 1).padStart(2, '0');
  const dd = String(tunis.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
