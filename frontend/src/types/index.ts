// Domain types mirroring docs/API_CONTRACT.md exactly. Analytics response shapes are
// NOT in the contract verbatim (the contract defers exact field names to the analytics
// agent, only constraining self-consistency); the names below are an assumption, kept
// self-explanatory and consistent across dashboard/bilan/drilldown per the contract's
// own allowance ("pick something consistent ... and note it as an assumption").

export type Role = 'ADMIN' | 'SECRETAIRE';

export interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface UserCreateRequest {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: Role;
  password: string;
}

export interface UserUpdateRequest {
  firstName?: string | null;
  lastName?: string | null;
  role?: Role;
  isActive?: boolean;
}

export interface ResetPasswordResponse {
  temporaryPassword: string;
}

// ── Lookup items — generic shape per contract: { id, code|reference, label }[] ──

export interface LookupItem {
  id: string;
  code: string;
  label: string;
}

export interface ProduitLookupItem {
  id: string;
  reference: string;
  label: string;
}

export interface BlAchatLookupItem {
  id: string;
  blNumero: string;
  label: string;
}

export interface StockLegacyLotLookupItem {
  id: string;
  produitId: string;
  produitLabel: string;
  magasinId: string;
  qteDisponible: number;
}

// ── Référentiels ──

export interface Famille {
  id: string;
  code: string;
  nom: string;
  description: string | null;
  isActive: boolean;
}

export interface Fournisseur {
  id: string;
  code: string;
  nom: string;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  contactPrincipal: string | null;
  isActive: boolean;
}

export interface Magasin {
  id: string;
  code: string;
  nom: string;
  adresse: string | null;
  ville: string | null;
  telephone: string | null;
  responsable: string | null;
  isActive: boolean;
}

export interface Produit {
  id: string;
  reference: string;
  designation: string;
  familleId: string;
  familleNom: string;
  isActive: boolean;
}

// ── BL achats ──

export type TauxTva = 7 | 13 | 19;

export interface BlAchatLigneInput {
  produitId: string;
  qteAchetee: number;
  prixAchatNetHt: number;
  tauxTva: TauxTva;
}

export interface CreateBlAchatRequest {
  transactionDate: string;
  blNumero: string;
  magasinId: string;
  fournisseurId: string;
  lignes: BlAchatLigneInput[];
}

export interface UpdateBlAchatRequest {
  transactionDate?: string;
  blNumero?: string;
  magasinId?: string;
  fournisseurId?: string;
  lignes?: BlAchatLigneInput[];
}

export interface BlAchatLigne {
  id: string;
  produitId: string;
  produitReference: string;
  produitDesignation: string;
  qteAchetee: number;
  qteRestante: number;
  prixAchatNetHt: number;
  tauxTva: number;
  prixAchatTtc: number;
  prixAchatTotalTtc: number;
}

export interface BlAchat {
  id: string;
  transactionDate: string;
  blNumero: string;
  magasinId: string;
  magasinNom: string;
  fournisseurId: string;
  fournisseurNom: string;
  lignes: BlAchatLigne[];
}

// ── Ventes ──

export interface VenteLigneInput {
  produitId: string;
  qteVendue: number;
  prixVenteTtc: number;
}

export interface CreateVenteRequest {
  venteDate: string;
  magasinId: string;
  lignes: VenteLigneInput[];
}

export interface VenteLigne {
  id: string;
  produitId: string;
  produitReference: string;
  produitDesignation: string;
  sourceType: 'BL_LIGNE' | 'STOCK_LEGACY';
  qteVendue: number;
  prixVenteTtc: number;
  prixVenteTotalTtc: number;
  depassementStock: boolean;
  qteNonCouverte: number;
}

export interface Vente {
  id: string;
  venteDate: string;
  magasinId: string;
  magasinNom: string;
  lignes: VenteLigne[];
  totalTtc: number;
  hasDepassement: boolean;
}

// ── Stock (ADMIN only) ──

export interface StockItem {
  produitId: string;
  produitReference: string;
  produitDesignation: string;
  magasinId: string;
  magasinNom: string;
  qteDisponible: number;
  valeur: number;
}

// ── Analytics (ADMIN only) — see module-level note on naming assumptions ──

export interface PeriodInfo {
  year: number;
  month: number;
  monthName: string;
  label: string;
}

export interface GlobalKpi {
  totalAchat: number;
  totalVente: number;
  marge: number;
  tauxMarge: number;
  totalValeur: number;
  nbTx: number;
}

export interface FournisseurKpi {
  fournisseurId: string;
  fournisseurNom: string;
  totalAchat: number;
  totalVente: number;
  totalValeur: number;
  marge: number;
  nbTx: number;
}

export interface FamilleKpi {
  familleId: string;
  familleNom: string;
  totalAchat: number;
  totalVente: number;
  totalValeur: number;
  marge: number;
  nbTx: number;
}

export interface MagasinKpi {
  magasinId: string;
  magasinNom: string;
  totalAchat: number;
  totalVente: number;
  totalValeur: number;
  marge: number;
  nbTx: number;
}

export interface TopFamilleItem {
  rang: number;
  familleId: string;
  familleNom: string;
  totalVente: number;
}

export interface TopFamilleStockeeItem {
  rang: number;
  familleId: string;
  familleNom: string;
  totalValeur: number;
}

export interface DashboardKpiResponse {
  period: PeriodInfo;
  global: GlobalKpi;
  parFournisseur: FournisseurKpi[];
  parFamille: FamilleKpi[];
  parMagasin: MagasinKpi[];
  topFamillesVendues: TopFamilleItem[];
  topFamillesStockees: TopFamilleStockeeItem[];
}

export interface AnnualReportResponse {
  year: number;
  upToMonth: number;
  cumulative: GlobalKpi;
  parFournisseur: FournisseurKpi[];
  parMagasin: MagasinKpi[];
  parFamille: FamilleKpi[];
}

export interface DrilldownStockItem {
  produitId: string;
  produitReference: string;
  produitDesignation: string;
  magasinId: string;
  magasinNom: string;
  qteStock: number;
  cmupCumule: number | null;
  valeurStock: number | null;
}

export interface DrilldownResponse {
  period: PeriodInfo;
  items: DrilldownStockItem[];
  totaux: {
    totalAchat: number;
    totalVente: number;
    totalValeur: number;
    marge: number;
  };
}

// ── Audit (ADMIN only) ──

export interface AuditEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorEmail: string;
  actorRole: Role;
  summary: string;
  changes: unknown;
  timestamp: string;
}
