/**
 * Error hierarchy mirroring the Java backend's ApmsException -> GlobalExceptionHandler
 * contract: every error the API returns is {code, message, traceId}. Business-rule
 * violations (DomainException) are also logged as "[BUSINESS] <CODE>" so they can be
 * grepped the same way the old apms-error.log lines were.
 */

export class ApmsException extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly code: string,
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Business-rule violation: HTTP 422, logged as "[BUSINESS] <CODE>". */
export class DomainException extends ApmsException {
  constructor(code: string, message: string, context?: Record<string, unknown>) {
    super(422, code, message, context);
  }
}

export class ResourceNotFoundException extends ApmsException {
  constructor(entityType: string, id: string) {
    super(404, `${entityType.toUpperCase()}_NOT_FOUND`, `${entityType} introuvable : ${id}`, {
      entityType,
      id,
    });
  }
}

export class ValidationException extends ApmsException {
  constructor(message: string, context?: Record<string, unknown>) {
    super(400, "VALIDATION_ERROR", message, context);
  }
}

export class UnauthorizedException extends ApmsException {
  constructor(code: string, message: string) {
    super(401, code, message);
  }
}

export class ForbiddenException extends ApmsException {
  constructor(message = "Accès refusé.") {
    super(403, "FORBIDDEN", message);
  }
}

/** Blocks line replacement/deletion on a BL achat once any line has been drawn from by a vente. */
export class BlAchatHasVentesException extends DomainException {
  constructor(message = "Impossible de supprimer ce BL : au moins une vente y est rattachée.") {
    super("BL_ACHAT_HAS_VENTES", message);
  }
}

export function transactionDateFuture(): DomainException {
  return new DomainException(
    "TRANSACTION_DATE_FUTURE",
    "La date de la transaction ne peut pas être dans le futur.",
  );
}

export function transactionDateTooOld(): DomainException {
  return new DomainException(
    "TRANSACTION_DATE_TOO_OLD",
    "La date de la transaction ne peut pas être antérieure au 1er janvier de l'année en cours.",
  );
}

export function tauxTvaInvalide(value: unknown): DomainException {
  return new DomainException(
    "TAUX_TVA_INVALIDE",
    "Le taux de TVA doit être 7, 13 ou 19 %.",
    { value },
  );
}

export function produitReferenceDuplicate(reference: string): DomainException {
  return new DomainException(
    "PRODUIT_REFERENCE_DUPLICATE",
    `La référence produit "${reference}" existe déjà.`,
    { reference },
  );
}

export function familleHasProduits(familleId: string): DomainException {
  return new DomainException(
    "FAMILLE_HAS_PRODUITS",
    "Impossible de supprimer cette famille : des produits y sont rattachés.",
    { familleId },
  );
}

export function entityInactive(entityType: string, id: string): DomainException {
  return new DomainException(
    `${entityType.toUpperCase()}_INACTIVE`,
    `${entityType} inactif : ${id}`,
    { entityType, id },
  );
}

export function tokenRevoked(): UnauthorizedException {
  return new UnauthorizedException("AUTH_TOKEN_REVOKED", "Session révoquée, veuillez vous reconnecter.");
}

export function refreshTokenExpired(): UnauthorizedException {
  return new UnauthorizedException(
    "AUTH_REFRESH_TOKEN_EXPIRED",
    "Session expirée, veuillez vous reconnecter.",
  );
}

export function accountLocked(lockedUntilLabel: string): UnauthorizedException {
  return new UnauthorizedException(
    "AUTH_ACCOUNT_LOCKED",
    `Compte verrouillé jusqu'au ${lockedUntilLabel}.`,
  );
}

export function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException("AUTH_INVALID_CREDENTIALS", "Identifiants invalides.");
}
