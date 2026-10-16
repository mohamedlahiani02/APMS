# Vérification de calculs et charge — 16 octobre 2026

Le banc scripts/qa-load.mjs crée une base PostgreSQL vide et jetable sur le serveur local de développement, y applique les migrations et génère uniquement des données synthétiques. Il lance une instance API locale sur un port éphémère puis supprime sa base. Il ne copie aucune donnée client et refuse un serveur PostgreSQL distant ou un autre port que 5433.

## Défauts reproduits avant correction

- Stock historique : lot initial de 10 unités à 3 DT HT, vente de 4 unités. Le stock courant était correctement à 6 unités, mais le reporting affichait 2 unités et 6 DT au lieu de 6 unités et 18 DT. Le solde déjà diminué était utilisé comme ouverture, puis la vente soustraite à nouveau.
- Cache analytique invalidé : 20 ouvertures simultanées du tableau de bord ont produit 9 erreurs HTTP 500 par conflit de clé sur les snapshots. Le même test avec cache déjà calculé n’échouait pas.

QA_LOAD_BASELINE.json conserve le résultat initial. QA_LOAD_REPORT.json contient la mesure après correction, sur la copie de travail identifiée par son commit de base et la nouvelle migration.

## Correction

La migration supplémentaire 2_snapshot_consistency ne modifie pas les migrations 0 et 1 déjà appliquées. Elle reconstruit l’ouverture historique à partir du solde disponible plus les prélèvements réellement couverts, puis soustrait les ventes jusqu’au mois demandé. Cela couvre aussi une vente postérieure au mois consulté et le dépassement de stock.

Les recalculs utilisent le même verrou transactionnel que les mouvements de stock, avec relecture de l’état après acquisition. Les modifications d’en-tête BL/vente et de famille produit invalident également le cache concerné. Les soldes BL, ventes et lots historiques ne sont pas modifiés par la migration ; seul le cache dérivé est invalidé.

## Contrôles indépendants

41 assertions passent : TVA 7/13/19 %, arrondis HALF_UP à trois décimales et quantités fractionnaires, FIFO multi-lots, vente/modification/annulation, dépassement et déficit, stock au coût des lots et stock au CMUP, historique, réaffectation fournisseur/famille, filtres audit cumulés, totaux annuels attendus et stock final annuel.

Dix ventes concurrentes ainsi que des ventes pendant vingt lectures analytiques conservent les quantités attendues sans erreur. La rafale de recalcul à vingt accès réussit intégralement.

## Charge locale

Données : 257 produits, 1007 achats, 1007 lignes d’achat, aucun historique client. Six parcours de lecture alternent : produits, stock, achats, ventes, audit et tableau de bord. Quatre paliers de huit secondes utilisent 1, 5, 10 puis 20 travailleurs concurrents, sans temps de réflexion.

Résultat : **10 350 requêtes de charge, toutes HTTP 200**. Au palier 20 : 453.7 requêtes/s, médiane 42 ms, p95 60 ms, p99 66 ms. Les temps incluent le client de charge et la consommation de la réponse. Les bases jetables ont été supprimées.

Ces chiffres mesurent une API locale sur un jeu synthétique limité. Ils ne certifient pas la capacité du futur serveur, les performances Internet, les sessions navigateur ou la limite maximale de saturation. La logique monétaire reste celle du contrat : transactions à trois décimales, agrégats affichés à deux décimales, écart TTC distinct d’un bénéfice net.

## Rejouer

Depuis backend : npm run build puis npm run qa:load. Les dépendances locales et l’accès au PostgreSQL de développement sont nécessaires. QA_STAGE_MS permet de choisir 1000 à 30000 ms par palier ; QA_REPORT permet un autre rapport JSON dans le dépôt. Les résultats de charge sont conservés séparément de la CI : ils ne doivent pas être comparés comme un benchmark matériel identique.

Une vérification supplémentaire en lecture seule sur la base locale restaurée n’a trouvé aucune anomalie pour les six égalités contrôlées : TTC unitaire achat, total achat, total vente, quantité non couverte et drapeau de dépassement, réconciliation des restes BL avec leurs ventes, et absence de solde historique négatif. Aucune ligne métier ni montant client n’est inclus dans ce rapport public.
