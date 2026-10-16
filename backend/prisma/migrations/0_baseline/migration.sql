-- CreateTable
CREATE TABLE "analytics_snapshot_state" (
    "annee" INTEGER NOT NULL,
    "mois" INTEGER NOT NULL,
    "statut" VARCHAR(20) NOT NULL DEFAULT 'A_RECALCULER',
    "derniere_maj" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_snapshot_state_pkey" PRIMARY KEY ("annee","mois")
);

-- CreateTable
CREATE TABLE "analytics_stock_snapshot" (
    "annee" INTEGER NOT NULL,
    "mois" INTEGER NOT NULL,
    "produit_id" UUID NOT NULL,
    "magasin_id" UUID NOT NULL,
    "fournisseur_id" UUID NOT NULL,
    "famille_id" UUID NOT NULL,
    "qte_achetee" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "qte_vendue" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "total_achat_ttc" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "total_vente_ttc" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "cmup_mois" DECIMAL(12,3),
    "qte_stock" DECIMAL(12,3) NOT NULL,
    "cmup_cumule" DECIMAL(12,3),
    "valeur_stock" DECIMAL(14,3) NOT NULL,
    "nb_tx" INTEGER NOT NULL DEFAULT 0,
    "statut" VARCHAR(20) NOT NULL DEFAULT 'VALIDE',
    "derniere_maj" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qte_deficit" DECIMAL(12,3) NOT NULL DEFAULT 0,

    CONSTRAINT "analytics_stock_snapshot_pkey" PRIMARY KEY ("annee","mois","produit_id","magasin_id","fournisseur_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID,
    "action" VARCHAR(20) NOT NULL,
    "actor_id" UUID,
    "actor_email" VARCHAR(255),
    "actor_role" VARCHAR(20),
    "summary" TEXT,
    "changes" JSONB,
    "ip_address" INET,
    "trace_id" VARCHAR(100),
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bl_achat_lignes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bl_achat_id" UUID NOT NULL,
    "produit_id" UUID NOT NULL,
    "qte_achetee" DECIMAL(12,3) NOT NULL,
    "qte_restante" DECIMAL(12,3) NOT NULL,
    "prix_achat_net_ht" DECIMAL(12,3) NOT NULL,
    "taux_tva" INTEGER NOT NULL,
    "prix_achat_ttc" DECIMAL(12,3) NOT NULL,
    "prix_achat_total_ttc" DECIMAL(12,3) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_by" UUID,

    CONSTRAINT "bl_achat_lignes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bl_achats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "date_id" INTEGER NOT NULL,
    "transaction_date" DATE NOT NULL,
    "bl_numero" VARCHAR(50) NOT NULL,
    "magasin_id" UUID NOT NULL,
    "fournisseur_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_by" UUID,

    CONSTRAINT "bl_achats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar" (
    "date_id" INTEGER NOT NULL,
    "date_full" DATE NOT NULL,
    "annee" INTEGER NOT NULL,
    "semestre" INTEGER NOT NULL,
    "trimestre" INTEGER NOT NULL,
    "mois" INTEGER NOT NULL,
    "semaine" INTEGER NOT NULL,
    "jour_semaine" INTEGER NOT NULL,
    "nom_mois" VARCHAR(20) NOT NULL,
    "nom_jour" VARCHAR(20) NOT NULL,
    "est_weekend" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "calendar_pkey" PRIMARY KEY ("date_id")
);

-- CreateTable
CREATE TABLE "familles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(10) NOT NULL,
    "nom" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_by" UUID,

    CONSTRAINT "familles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flyway_schema_history" (
    "installed_rank" INTEGER NOT NULL,
    "version" VARCHAR(50),
    "description" VARCHAR(200) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "script" VARCHAR(1000) NOT NULL,
    "checksum" INTEGER,
    "installed_by" VARCHAR(100) NOT NULL,
    "installed_on" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "execution_time" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,

    CONSTRAINT "flyway_schema_history_pk" PRIMARY KEY ("installed_rank")
);

-- CreateTable
CREATE TABLE "fournisseurs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(20) NOT NULL,
    "nom" VARCHAR(200) NOT NULL,
    "adresse" TEXT,
    "telephone" VARCHAR(30),
    "email" VARCHAR(255),
    "contact_principal" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_by" UUID,

    CONSTRAINT "fournisseurs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "magasins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(20) NOT NULL,
    "nom" VARCHAR(200) NOT NULL,
    "adresse" TEXT,
    "ville" VARCHAR(100),
    "telephone" VARCHAR(30),
    "responsable" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_by" UUID,

    CONSTRAINT "magasins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference" VARCHAR(50) NOT NULL,
    "designation" VARCHAR(200) NOT NULL,
    "famille_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_by" UUID,

    CONSTRAINT "produits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "produit_id" UUID NOT NULL,
    "magasin_id" UUID NOT NULL,
    "quantite_disponible" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "cmup" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "date_derniere_maj" DATE NOT NULL DEFAULT CURRENT_DATE,

    CONSTRAINT "stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_legacy_lots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "produit_id" UUID NOT NULL,
    "magasin_id" UUID NOT NULL,
    "qte_disponible" DECIMAL(12,3) NOT NULL,
    "cout_unitaire" DECIMAL(12,3) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "stock_legacy_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions_legacy" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "date_id" INTEGER NOT NULL,
    "transaction_date" DATE NOT NULL,
    "bl_numero" VARCHAR(50) NOT NULL,
    "magasin_id" UUID NOT NULL,
    "fournisseur_id" UUID NOT NULL,
    "produit_id" UUID NOT NULL,
    "qte_achetee" DECIMAL(12,3) NOT NULL,
    "prix_achat_net_ht" DECIMAL(12,3) NOT NULL,
    "prix_achat_ttc" DECIMAL(12,3) NOT NULL,
    "prix_achat_total_ttc" DECIMAL(12,3) NOT NULL,
    "qte_vendue" DECIMAL(12,3),
    "prix_vente_ttc" DECIMAL(12,3),
    "prix_vente_total_ttc" DECIMAL(12,3),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "deleted_by" UUID,
    "taux_tva" INTEGER NOT NULL DEFAULT 19,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(255) NOT NULL,
    "ip_address" INET,
    "user_agent" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "first_name" VARCHAR(100),
    "last_name" VARCHAR(100),
    "role" VARCHAR(20) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "login_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_by" UUID,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vente_lignes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vente_id" UUID NOT NULL,
    "produit_id" UUID NOT NULL,
    "source_type" VARCHAR(20) NOT NULL,
    "bl_achat_ligne_id" UUID,
    "stock_legacy_lot_id" UUID,
    "qte_vendue" DECIMAL(12,3) NOT NULL,
    "prix_vente_ttc" DECIMAL(12,3) NOT NULL,
    "prix_vente_total_ttc" DECIMAL(12,3) NOT NULL,
    "depassement_stock" BOOLEAN NOT NULL DEFAULT false,
    "qte_non_couverte" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "vente_lignes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "date_id" INTEGER NOT NULL,
    "vente_date" DATE NOT NULL,
    "magasin_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "ventes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_snapshot_famille" ON "analytics_stock_snapshot"("annee", "mois", "famille_id");

-- CreateIndex
CREATE INDEX "idx_snapshot_fournisseur" ON "analytics_stock_snapshot"("annee", "mois", "fournisseur_id");

-- CreateIndex
CREATE INDEX "idx_snapshot_magasin" ON "analytics_stock_snapshot"("annee", "mois", "magasin_id");

-- CreateIndex
CREATE INDEX "idx_snapshot_produit" ON "analytics_stock_snapshot"("annee", "mois", "produit_id");

-- CreateIndex
CREATE INDEX "idx_audit_action" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "idx_audit_actor_id" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "idx_audit_entity" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "idx_audit_timestamp" ON "audit_logs"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "idx_audit_trace_id" ON "audit_logs"("trace_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_date_full_key" ON "calendar"("date_full");

-- CreateIndex
CREATE INDEX "idx_calendar_annee_mois" ON "calendar"("annee", "mois");

-- CreateIndex
CREATE INDEX "idx_calendar_date_full" ON "calendar"("date_full");

-- CreateIndex
CREATE INDEX "idx_familles_code" ON "familles"("code");

-- CreateIndex
CREATE INDEX "flyway_schema_history_s_idx" ON "flyway_schema_history"("success");

-- CreateIndex
CREATE INDEX "idx_fournisseurs_code" ON "fournisseurs"("code");

-- CreateIndex
CREATE INDEX "idx_magasins_ville" ON "magasins"("ville");

-- CreateIndex
CREATE INDEX "idx_produits_famille_id" ON "produits"("famille_id");

-- CreateIndex
CREATE INDEX "idx_stock_magasin_id" ON "stock"("magasin_id");

-- CreateIndex
CREATE INDEX "idx_stock_produit_id" ON "stock"("produit_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_stock_produit_magasin" ON "stock"("produit_id", "magasin_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_legacy_lot_produit_magasin" ON "stock_legacy_lots"("produit_id", "magasin_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_sessions_token" ON "user_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "idx_sessions_expires_at" ON "user_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "idx_sessions_user_id" ON "user_sessions"("user_id");

-- CreateIndex
CREATE INDEX "idx_users_email" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_is_active" ON "users"("is_active");

-- CreateIndex
CREATE INDEX "idx_users_role" ON "users"("role");

-- CreateIndex
CREATE INDEX "idx_vl_produit_id" ON "vente_lignes"("produit_id");

-- CreateIndex
CREATE INDEX "idx_vl_vente_id" ON "vente_lignes"("vente_id");

-- AddForeignKey
ALTER TABLE "analytics_stock_snapshot" ADD CONSTRAINT "analytics_stock_snapshot_famille_id_fkey" FOREIGN KEY ("famille_id") REFERENCES "familles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "analytics_stock_snapshot" ADD CONSTRAINT "analytics_stock_snapshot_fournisseur_id_fkey" FOREIGN KEY ("fournisseur_id") REFERENCES "fournisseurs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "analytics_stock_snapshot" ADD CONSTRAINT "analytics_stock_snapshot_magasin_id_fkey" FOREIGN KEY ("magasin_id") REFERENCES "magasins"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "analytics_stock_snapshot" ADD CONSTRAINT "analytics_stock_snapshot_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produits"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bl_achat_lignes" ADD CONSTRAINT "bl_achat_lignes_bl_achat_id_fkey" FOREIGN KEY ("bl_achat_id") REFERENCES "bl_achats"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bl_achat_lignes" ADD CONSTRAINT "bl_achat_lignes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bl_achat_lignes" ADD CONSTRAINT "bl_achat_lignes_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bl_achat_lignes" ADD CONSTRAINT "bl_achat_lignes_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produits"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bl_achat_lignes" ADD CONSTRAINT "bl_achat_lignes_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bl_achats" ADD CONSTRAINT "bl_achats_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bl_achats" ADD CONSTRAINT "bl_achats_date_id_fkey" FOREIGN KEY ("date_id") REFERENCES "calendar"("date_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bl_achats" ADD CONSTRAINT "bl_achats_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bl_achats" ADD CONSTRAINT "bl_achats_fournisseur_id_fkey" FOREIGN KEY ("fournisseur_id") REFERENCES "fournisseurs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bl_achats" ADD CONSTRAINT "bl_achats_magasin_id_fkey" FOREIGN KEY ("magasin_id") REFERENCES "magasins"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bl_achats" ADD CONSTRAINT "bl_achats_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "familles" ADD CONSTRAINT "familles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "familles" ADD CONSTRAINT "familles_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "familles" ADD CONSTRAINT "familles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fournisseurs" ADD CONSTRAINT "fournisseurs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fournisseurs" ADD CONSTRAINT "fournisseurs_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fournisseurs" ADD CONSTRAINT "fournisseurs_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "magasins" ADD CONSTRAINT "magasins_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "magasins" ADD CONSTRAINT "magasins_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "magasins" ADD CONSTRAINT "magasins_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "produits" ADD CONSTRAINT "produits_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "produits" ADD CONSTRAINT "produits_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "produits" ADD CONSTRAINT "produits_famille_id_fkey" FOREIGN KEY ("famille_id") REFERENCES "familles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "produits" ADD CONSTRAINT "produits_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock" ADD CONSTRAINT "stock_magasin_id_fkey" FOREIGN KEY ("magasin_id") REFERENCES "magasins"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock" ADD CONSTRAINT "stock_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produits"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_legacy_lots" ADD CONSTRAINT "stock_legacy_lots_magasin_id_fkey" FOREIGN KEY ("magasin_id") REFERENCES "magasins"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_legacy_lots" ADD CONSTRAINT "stock_legacy_lots_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produits"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transactions_legacy" ADD CONSTRAINT "transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transactions_legacy" ADD CONSTRAINT "transactions_date_id_fkey" FOREIGN KEY ("date_id") REFERENCES "calendar"("date_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transactions_legacy" ADD CONSTRAINT "transactions_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transactions_legacy" ADD CONSTRAINT "transactions_fournisseur_id_fkey" FOREIGN KEY ("fournisseur_id") REFERENCES "fournisseurs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transactions_legacy" ADD CONSTRAINT "transactions_magasin_id_fkey" FOREIGN KEY ("magasin_id") REFERENCES "magasins"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transactions_legacy" ADD CONSTRAINT "transactions_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produits"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transactions_legacy" ADD CONSTRAINT "transactions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vente_lignes" ADD CONSTRAINT "vente_lignes_bl_achat_ligne_id_fkey" FOREIGN KEY ("bl_achat_ligne_id") REFERENCES "bl_achat_lignes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vente_lignes" ADD CONSTRAINT "vente_lignes_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produits"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vente_lignes" ADD CONSTRAINT "vente_lignes_stock_legacy_lot_id_fkey" FOREIGN KEY ("stock_legacy_lot_id") REFERENCES "stock_legacy_lots"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vente_lignes" ADD CONSTRAINT "vente_lignes_vente_id_fkey" FOREIGN KEY ("vente_id") REFERENCES "ventes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ventes" ADD CONSTRAINT "ventes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ventes" ADD CONSTRAINT "ventes_date_id_fkey" FOREIGN KEY ("date_id") REFERENCES "calendar"("date_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ventes" ADD CONSTRAINT "ventes_magasin_id_fkey" FOREIGN KEY ("magasin_id") REFERENCES "magasins"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ventes" ADD CONSTRAINT "ventes_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

