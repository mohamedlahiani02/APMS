# Améliorations UI/UX du nouvel APMS

La version précédant ces changements est conservée sur GitHub, commit 3b52d6f. Les changements concernent exclusivement l’application TypeScript.

## Navigation et tableaux

- Les listes et tableaux de détail affichent 10 lignes initialement, avec choix 10/20/50, compte exact, première/dernière page et accès direct à une page.
- Les colonnes munies d’un bouton se trient sur tous les résultats correspondants, avant pagination. Les montants et quantités sont alignés à droite. Le corps du tableau défile dans une zone limitée avec en-tête fixe.
- Les achats et ventes regroupent visuellement les produits et ouvrent une consultation dédiée en lecture seule. Modifier et supprimer restent des actions distinctes.
- La navigation latérale se replie sur les petites fenêtres ; le bandeau et les formulaires s’adaptent à la largeur disponible.

## Filtres et indicateurs

| Page | Filtres ajoutés ou harmonisés |
| --- | --- |
| Tableau de bord | Mois/année et périmètre magasin, famille, fournisseur, partagé par les cartes, classements et détails |
| Transactions | Dates rapides aujourd’hui/7 jours/30 jours/mois, magasin, fournisseur des achats, consommation du BL, dépassement des ventes |
| Stock | Famille, magasin, recherche produit, quantité positive ou nulle |
| Utilisateurs | Rôle et statut actif/inactif |
| Audit | Dates, action, entité, auteur et recherche dans les résumés |
| Référentiels | Statut actif/inactif ; famille pour les produits |

Les montants distinguent achats/ventes TTC et valeur de stock HT. Le libellé « Écart ventes − achats TTC » décrit le calcul existant sans prétendre représenter un bénéfice net. Les cartes du tableau de bord comparent le même périmètre au mois précédent, avec variation absolue. Les périodes futures sont interdites. Les plages de dates inversées ou impossibles sont rejetées par l’API.

Le filtre de stock nul porte sur les couples produit/magasin présents dans les lots ; il ne crée pas de couples sans historique. Aucun seuil de stock faible n’est inventé.

## Export et saisie

L’export propose explicitement soit les résultats filtrés de l’onglet actif, sur toutes ses pages, soit tous les achats et ventes sans filtre dans deux feuilles. L’API partage les mêmes prédicats que les listes. Les feuilles Excel figent la première ligne et permettent le filtrage.

Les sélecteurs disposent de recherche, flèches, Entrée, Échap, effacement et états distincts pour chargement, erreur et absence de résultat. Les fenêtres gardent le focus et le rendent à leur déclencheur. Une fermeture par Échap, fond, croix ou Annuler demande de confirmer l’abandon après saisie ou ajout/suppression de ligne. Les formulaires de navigation des tableaux en lecture seule ne déclenchent pas cette protection.

## Vérification

Les tests backend vérifient notamment la correspondance liste/export, les filtres combinés, la comparaison des KPI et leurs détails. Les tests d’interface isolés couvrent pagination, tri numérique, dates rapides, menus au clavier, erreur/retry et protection des saisies.

L’accès au navigateur local a été refusé par le réglage de permission enregistré. Aucune inspection visuelle réelle n’est revendiquée. La recette visuelle reste à effectuer sur http://127.0.0.1:3100 : fenêtres étroites et larges, deux rôles, longs libellés, nombreux produits, menus en bas de fenêtre, modales et téléchargement Excel.
