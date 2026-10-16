import { extractApiErrorMessage, isApiError } from '@/types/api';

/** Renders the backend's `message` for an axios/react-query mutation error, or nothing. */
export default function ApiErrorBanner({ error }: { error: unknown }) {
  if (!error) return null;
  const data = (error as { response?: { data?: unknown } }).response?.data;
  if (!isApiError(data)) return null;
  return (
    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
      {extractApiErrorMessage(error)}
    </p>
  );
}
