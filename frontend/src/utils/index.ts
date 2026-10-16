import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export { formatDinar, formatDate, formatDateTime, todayISO } from './format';
export { downloadBlob } from './download';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
