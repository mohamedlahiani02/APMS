import { extractApiErrorMessage } from "@/types/api";
export default function ApiErrorBanner({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="m-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {extractApiErrorMessage(
        error,
        "Impossible de charger ou enregistrer les données. Vérifiez la connexion et réessayez.",
      )}
    </p>
  );
}
