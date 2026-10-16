export const PAGE_SIZE = 10;

// Deterministic fallback palette for famille badges — families are a free-form
// référentiel (no fixed enum in the contract), so colors are assigned by a stable
// hash of the famille name rather than a hardcoded lookup table.
const BADGE_PALETTE = [
  "bg-blue-100 text-blue-800",
  "bg-red-100 text-red-800",
  "bg-orange-100 text-orange-800",
  "bg-purple-100 text-purple-800",
  "bg-amber-100 text-amber-800",
  "bg-green-100 text-green-800",
  "bg-teal-100 text-teal-800",
  "bg-pink-100 text-pink-800",
  "bg-indigo-100 text-indigo-800",
];

export function familleBadgeColor(nom: string | null | undefined): string {
  if (!nom) return "bg-gray-100 text-gray-700";
  let hash = 0;
  for (let i = 0; i < nom.length; i++) {
    hash = (hash * 31 + nom.charCodeAt(i)) >>> 0;
  }
  return BADGE_PALETTE[hash % BADGE_PALETTE.length];
}

export const MONTHS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

export const TVA_RATES = [19, 13, 7] as const;
