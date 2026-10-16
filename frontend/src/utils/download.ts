import type { AxiosResponse } from 'axios';

function parseFilename(contentDisposition: string | undefined, fallback: string): string {
  if (!contentDisposition) return fallback;
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      // fall through
    }
  }
  const plainMatch = /filename="?([^";]+)"?/i.exec(contentDisposition);
  if (plainMatch) return plainMatch[1];
  return fallback;
}

export function downloadBlob(response: AxiosResponse<Blob>, fallbackName = 'export.xlsx'): void {
  if (typeof window === 'undefined') return;
  const headers = response.headers as Record<string, string | undefined>;
  const filename = parseFilename(headers['content-disposition'], fallbackName);
  const url = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
