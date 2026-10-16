import { z } from 'zod';

// Backend money/quantity fields are NUMERIC(12,3) — accept up to 3 decimal places.
function decimal3(message: string) {
  return z
    .number({ error: message })
    .refine((v) => Number.isFinite(v) && Math.abs(Math.round(v * 1000) - v * 1000) < 1e-6, {
      message: 'Maximum 3 décimales',
    });
}

export const loginSchema = z.object({
  email: z.string().min(1, 'Email requis').email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});
export type LoginInput = z.infer<typeof loginSchema>;

const PASSWORD_STRONG = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#+\-_]).{8,100}$/;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
    newPassword: z
      .string()
      .regex(
        PASSWORD_STRONG,
        'Doit contenir au moins 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial (@$!%*?&#+-_)'
      ),
    confirmPassword: z.string().min(1, 'Confirmation requise'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Les mots de passe ne correspondent pas',
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const familleSchema = z.object({
  code: z.string().min(1, 'Code requis').regex(/^\S+$/, "Pas d'espace autorisé"),
  nom: z.string().min(1, 'Nom requis').max(100, 'Nom trop long'),
  description: z.string().max(500, 'Description trop longue').optional().or(z.literal('')),
});
export type FamilleInput = z.infer<typeof familleSchema>;

export const fournisseurSchema = z.object({
  code: z.string().min(1, 'Code requis').regex(/^\S+$/, "Pas d'espace autorisé"),
  nom: z.string().min(2, 'Nom requis').max(200, 'Nom trop long'),
  adresse: z.string().max(500, 'Adresse trop longue').optional().or(z.literal('')),
  telephone: z.string().max(30, 'Téléphone trop long').optional().or(z.literal('')),
  email: z.string().email('Email invalide').max(255).optional().or(z.literal('')),
  contactPrincipal: z.string().max(200, 'Trop long').optional().or(z.literal('')),
});
export type FournisseurInput = z.infer<typeof fournisseurSchema>;

export const magasinSchema = z.object({
  code: z.string().min(1, 'Code requis').regex(/^\S+$/, "Pas d'espace autorisé"),
  nom: z.string().min(2, 'Nom requis').max(200, 'Nom trop long'),
  adresse: z.string().max(500, 'Adresse trop longue').optional().or(z.literal('')),
  ville: z.string().max(100, 'Trop long').optional().or(z.literal('')),
  telephone: z.string().max(30, 'Téléphone trop long').optional().or(z.literal('')),
  responsable: z.string().max(200, 'Trop long').optional().or(z.literal('')),
});
export type MagasinInput = z.infer<typeof magasinSchema>;

export const produitSchema = z.object({
  reference: z.string().min(1, 'Référence requise').regex(/^\S+$/, "Pas d'espace autorisé"),
  designation: z.string().min(2, 'Désignation trop courte').max(200, 'Désignation trop longue'),
  familleId: z.string().min(1, 'Famille requise'),
});
export type ProduitInput = z.infer<typeof produitSchema>;

export const userCreateSchema = z.object({
  email: z.string().min(1, 'Email requis').email('Email invalide').max(255, 'Email trop long'),
  firstName: z.string().max(100, 'Prénom trop long').optional().or(z.literal('')),
  lastName: z.string().max(100, 'Nom trop long').optional().or(z.literal('')),
  role: z.enum(['ADMIN', 'SECRETAIRE']),
  password: z
    .string()
    .min(1, 'Mot de passe requis')
    .regex(
      PASSWORD_STRONG,
      'Mot de passe trop faible (≥8 car., 1 majuscule, 1 minuscule, 1 chiffre, 1 spécial @$!%*?&#+-_)'
    ),
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = z.object({
  firstName: z.string().max(100, 'Prénom trop long').optional().or(z.literal('')),
  lastName: z.string().max(100, 'Nom trop long').optional().or(z.literal('')),
  role: z.enum(['ADMIN', 'SECRETAIRE']),
  isActive: z.boolean(),
});
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

// ── Transactions ──

function notFutureNotBeforeJan1(message: string) {
  return z.string().min(1, 'Date requise').refine(
    (v) => {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return false;
      const now = new Date();
      const jan1 = new Date(now.getFullYear(), 0, 1);
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return d >= jan1 && d <= endOfToday;
    },
    { message }
  );
}

export const blAchatLigneSchema = z.object({
  produitId: z.string().min(1, 'Produit requis'),
  qteAchetee: decimal3('Quantité requise').refine((v) => v > 0, 'Quantité doit être positive'),
  prixAchatNetHt: decimal3('Prix requis').refine((v) => v >= 0, 'Prix doit être ≥ 0'),
  tauxTva: z.union([z.literal(7), z.literal(13), z.literal(19)], {
    error: 'Taux TVA invalide (7, 13 ou 19)',
  }),
});

export const blAchatSchema = z.object({
  transactionDate: notFutureNotBeforeJan1("Date invalide (ni future, ni avant le 1er janvier de l'année en cours)"),
  blNumero: z.string().min(1, 'N° BL requis').max(50, 'N° BL trop long'),
  magasinId: z.string().min(1, 'Magasin requis'),
  fournisseurId: z.string().min(1, 'Fournisseur requis'),
  lignes: z.array(blAchatLigneSchema).min(1, 'Au moins une ligne de produit est requise'),
});
export type BlAchatInput = z.infer<typeof blAchatSchema>;

export const venteLigneSchema = z.object({
  produitId: z.string().min(1, 'Produit requis'),
  qteVendue: decimal3('Quantité requise').refine((v) => v > 0, 'Quantité doit être positive'),
  prixVenteTtc: decimal3('Prix requis').refine((v) => v > 0, 'Prix doit être positif'),
});

export const venteSchema = z.object({
  venteDate: z.string().min(1, 'Date requise'),
  magasinId: z.string().min(1, 'Magasin requis'),
  lignes: z.array(venteLigneSchema).min(1, 'Au moins une ligne de produit est requise'),
});
export type VenteInput = z.infer<typeof venteSchema>;
