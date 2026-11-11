# Stock annuel et exports filtrés

## Stock annuel

L’écran Administration → Stock annuel est réservé aux administrateurs. Les années de données déjà présentes au déploiement conservent le mode historique LEGACY et leurs soldes. Le premier passage annuel pour l’instance actuelle est la clôture 2026, puis l’ouverture 2027. Les nouveaux achats et ventes exigent une année ouverte ; les dates futures restent interdites.

Après le 31 décembre, clôturer l’année. La clôture vérifie les soldes et refuse les déficits non résolus. Les achats, leurs lignes, les ventes et leurs lignes sont alors protégés contre la création, la modification et la suppression par des contrôles PostgreSQL, y compris via l’API.

Pour l’année suivante, choisir soit la reprise automatique des quantités de clôture, soit la saisie des quantités par produit et magasin. Dans les deux cas, le coût unitaire HT est repris de la clôture précédente et n’est pas modifiable. Le coût est la valeur de clôture divisée par la quantité, avec conservation du dernier coût connu quand le solde est nul. Un produit sans historique de coût ne peut pas recevoir une quantité d’ouverture ; il doit d’abord avoir un coût d’achat établi. Les quantités et coûts sont arrondis à trois décimales.

Les lots d’ouverture sont distincts des achats et sont consommés avant les achats de la même année. Une vente ne prélève plus de stock d’une année précédente après activation du mode annuel. L’ouverture n’est pas comptée comme un achat dans les KPI. Elle est valorisée HT et rattachée au fournisseur technique déjà réservé au stock historique, afin de ne pas l’attribuer artificiellement à un fournisseur réel.

Une réouverture est réservée à l’administrateur et auditée. Elle autorise les corrections de l’année passée, puis exige une nouvelle clôture. Toutes les ouvertures suivantes passent à revalider ; les écritures et les KPI correspondants sont bloqués. Revalider les ouvertures dans l’ordre chronologique. Les quantités manuelles peuvent être conservées, les coûts sont mis à jour et les ventes de l’année sont réaffectées sans changer leurs quantités ou montants. Si les arrondis ne peuvent pas être conservés, l’opération est annulée. Une année suivante clôturée doit être réouverte avant revalidation.

## Export des tableaux

Chaque tableau partagé possède un bouton Exporter Excel. Il exporte toutes les lignes correspondant aux filtres et au tri actifs, indépendamment de la pagination. Les recherches locales des tableaux de KPI/détail sont aussi appliquées. Les colonnes de boutons d’action sont omises ; la colonne Action du journal d’audit est conservée. Les nombres disposant d’une valeur numérique dans le tableau restent numériques dans Excel ; les libellés restent du texte, même s’ils commencent par =.

Les tableaux paginés côté serveur relisent les pages avec les mêmes paramètres de filtre et de tri. Si leur nombre de résultats change pendant l’export, celui-ci est annulé et peut être relancé. L’export est limité à 50 000 lignes ; il refuse explicitement un résultat plus grand au lieu de le tronquer. Les permissions d’accès aux pages source et les contrôles d’authentification restent appliqués. Le service Excel met en forme les lignes que l’utilisateur peut déjà consulter ; il ne relit aucune table arbitraire à partir du titre envoyé.

L’export détaillé des achats/ventes reste disponible séparément, avec sa portée explicitement choisie.

## Livraison

Nouvelles migrations : 3_annual_stock et 4_opening_supplier. Aucun script de test ou migration n’est exécuté automatiquement contre Supabase. Avant livraison : sauvegarde fraîche, test de restauration, puis prisma migrate deploy avec le rôle migrateur dédié et TLS vérifié ; installer la version Git validée, exécuter run setup et Restart App dans Plesk. La migration conserve les opérations et soldes existants et invalide seulement les caches analytiques.

Une fois une ouverture annuelle activée, ne pas revenir à une ancienne version qui ignore la source OPENING des ventes. Une restauration ou un retour arrière doit être préparé avec une version comprenant le modèle annuel. Le journal conserve les actions d’ouverture, clôture, réouverture et revalidation.
