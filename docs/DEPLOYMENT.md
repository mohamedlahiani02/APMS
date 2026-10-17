# Déploiement APMS sur Plesk

Cible : https://apms.sia-bendjemaa.com, sur l'abonnement Topnet existant. Le site principal partage l'adresse IP ; toutes les opérations ci-dessous concernent uniquement le sous-domaine APMS. La livraison encapsulée Docker est différée.

## État vérifié au 17 octobre 2026

Le projet Supabase APMS a été créé sur le plan Free en Europe (Ireland). La Data API et l'exposition automatique des tables sont désactivées ; l'authentification reste assurée par Fastify. Les connexions SSL sont obligatoires côté Supabase.

La copie de la base du nouveau projet TypeScript a été restaurée depuis le conteneur local apms-rewrite-postgres. L'ancien projet Java n'a pas été utilisé. Les sessions ont été exclues et le compte de prévisualisation local désactivé sur la copie, avec trace d'audit. Les effectifs des 19 tables correspondent à l'archive préparée. Les migrations 0_baseline, 1_database_logic et 2_snapshot_consistency sont conservées. Une restauration locale isolée et cinq contrôles de montants/soldes ont également réussi.

Les rôles apms_migrator (propriétaire des objets) et apms_app (exécution restreinte) sont distincts. L'application n'utilise pas postgres. Le rôle applicatif a été vérifié avec Prisma 5 et node-postgres, TLS validé par l'autorité officielle Supabase, et avec les routines analytiques existantes. Les archives, manifestes et secrets restent hors Git et hors OneDrive, sous %LOCALAPPDATA%/APMS, avec des permissions locales restreintes.

Sur Plesk, Node 24.21.0 et le mode production ont été sélectionnés. Lors du dernier contrôle, le dossier APMS ne contenait pas encore l'application et le panneau affichait encore Enable Node.js. L'activation, la connexion depuis Topnet, le certificat HTTPS et l'ouverture publique restent à vérifier. Une connexion réussie depuis notre poste ne prouve pas que Topnet autorise les connexions sortantes.

## Application unique pour Passenger

Le fichier racine app.js démarre Next.js et Fastify sur un seul serveur HTTP. Les chemins /api et /internal sont transmis à Fastify avant lecture du corps ; les autres chemins sont traités par Next.js. Passenger assure l'écoute et le routage du domaine. Aucun second processus ni réglage manuel d'un port public n'est nécessaire.

La construction unifiée désactive la sortie standalone et les réécritures API de Next.js. Le déploiement Docker local conserve sa configuration séparée. Le document root public est un répertoire distinct du code et des secrets.

## Installation par Git et npm dans Plesk

1. Dans le sous-domaine APMS, ouvrir Git et ajouter https://github.com/mohamedlahiani02/APMS.git. Choisir la branche codex/deployment-preparation pour cette préparation, ou main une fois la PR fusionnée. Sélectionner le déploiement manuel et la destination /staging.sia-bendjemaa.com. Vérifier ce chemin avant Deploy : ne jamais utiliser /httpdocs ni le dépôt du site principal.
2. Déployer les fichiers et vérifier que package.json, app.js, backend, frontend et ops sont directement dans ce dossier, sans niveau APMS supplémentaire.
3. Dans Node.js, choisir la version 24.21.0, Application mode production, Application root /staging.sia-bendjemaa.com, Document root /staging.sia-bendjemaa.com/public et Application startup file app.js. Activer Node.js si le panneau propose Enable Node.js. Si l'activation échoue, conserver le message exact pour diagnostic.
4. Configurer les variables ci-dessous via Custom environment variables → specify. Une ligne du fichier privé correspond à une paire nom/valeur ; ne pas inclure le signe égal dans le champ nom. NODE_ENV est déjà défini par le mode production. Ne pas mettre ces valeurs dans les commandes Git ou npm.
5. Dans le champ de commandes préfixé par npm, saisir run diagnose:host puis run setup. Si l'interface propose Run script avec un sélecteur, choisir diagnose:host puis setup. Dans un vrai terminal, les commandes complètes sont npm run diagnose:host et npm run setup.
6. Attendre le succès complet de setup, qui installe les deux projets depuis leurs fichiers lock, génère Prisma et construit API/interface. Les outils de développement nécessaires au build sont inclus même en mode production. setup n'applique aucune migration et ne modifie pas les données. Un npm install à la racine seul n'installe pas les deux sous-projets.
7. Redémarrer avec Restart application. Émettre et sélectionner un certificat valide pour apms.sia-bendjemaa.com, puis activer la redirection HTTPS du sous-domaine. Ne pas modifier le certificat ou les paramètres du site principal.

## Variables d'environnement

Le modèle public .env.production.example décrit les noms sans secret. Sur le poste de préparation, les valeurs effectives sont conservées dans %LOCALAPPDATA%/APMS/deployment/plesk.env, à copier dans le panneau Plesk.

| Nom | Valeur / règle |
| --- | --- |
| DATABASE_URL | URL du rôle apms_app via le Session pooler Supabase IPv4, port 5432 ; valeur privée préparée |
| JWT_SECRET | Secret neuf propre à cette instance ; valeur privée préparée |
| DATABASE_TLS_MODE | verify-full |
| DATABASE_CA_FILE | ops/certs/supabase-root-ca.crt |
| DATABASE_POOL_SIZE | 3 par pilote, soit jusqu'à 6 connexions par processus APMS |
| CORS_ORIGINS | https://apms.sia-bendjemaa.com |
| TRUST_PROXY | Laisser absent tant que la chaîne de proxies n'a pas été vérifiée ; ne pas utiliser true ou une confiance générale |

Ne pas définir de NEXT_PUBLIC_DATABASE_URL, ni de secret dans une variable NEXT_PUBLIC_. Ne pas désactiver la validation TLS pour contourner une erreur. Le certificat public versionné dans ops/certs est prévu pour ce projet Supabase ; le renouveler si le fournisseur change d'autorité. Les deux pilotes interprètent différemment les options SSL des URL : database-settings.ts impose explicitement leurs réglages de validation.

diagnose:host affiche les versions et teste l'ouverture TCP vers le pooler lorsqu'une DATABASE_URL est configurée ; il ne vérifie ni TLS ni les identifiants. Le endpoint /internal/ready doit ensuite répondre avec status UP et db UP pour confirmer la connexion réelle.

## Vérifications et retour arrière

La CI construit les deux modes frontend, vérifie les types, les tests unitaires sans base, les tests frontend et un démarrage HTTP unifié avec page de connexion, asset JavaScript, authentification API et refus CORS. Les suites d'intégration complètes restent limitées à la base locale sur le port 5433. Ne jamais exécuter ces suites, les fixtures ou un stress test destructif sur la base Supabase destinée au client.

Sur la version déployée, vérifier /internal/health, /internal/ready, la connexion avec un compte métier autorisé, les droits, les filtres d'audit, les consultations de stock/KPI et l'export. Vérifier aussi que le site principal répond toujours. Observer les adresses de proxies et configurer TRUST_PROXY avec les seules adresses/CIDR réellement nécessaires avant de valider les limites de connexion par client.

Consigner le SHA Git complet, la version applicative, la date UTC, les versions Node/PostgreSQL, les migrations et le résultat des contrôles. Convention de livraison : apms-<version>-<sha-court>. Conserver la révision précédente pour le retour applicatif ; une migration de base ne s'annule pas par un simple changement de branche. Les migrations ultérieures doivent être nouvelles, revues et appliquées avec le rôle migrateur, jamais migrate dev, db push ou reset sur la cible.

Le plan Free ne fournit pas une garantie de disponibilité ni les sauvegardes automatiques d'une offre payante. Les archives de préparation et leurs restaurations vérifiées ne remplacent pas une sauvegarde régulière de la base distante vivante. Avant l'utilisation définitive, mettre en place une sauvegarde chiffrée hors projet, sa rétention, l'accès du propriétaire et une restauration périodiquement vérifiée. Aucune offre payante n'a été activée.

Références : [Plesk Node.js](https://docs.plesk.com/en-US/obsidian/administrator-guide/website-management/nodejs-support.76652/), [écoute Passenger](https://www.phusionpassenger.com/docs/advanced_guides/in_depth/node/reverse_port_binding.html), [connexions Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres), [Prisma et Supabase](https://supabase.com/docs/guides/database/prisma), [sauvegardes Supabase](https://supabase.com/docs/guides/platform/backups).

## Installation PWA sur Plesk

Plesk peut répondre directement aux requêtes PNG depuis Document Root, avant Next.js. Les icônes du manifeste sont donc conservées à la fois sous frontend/public/icons et public/icons. La commande npm run setup les synchronise et npm run check:static-assets vérifie les copies. Après livraison, vérifier sur le domaine public que /manifest.webmanifest et les deux URL PNG du manifeste répondent en 200 avec des dimensions 192 × 192 et 512 × 512. Si une icône répond en 404, le navigateur ne pourra pas proposer l’installation, même si le manifeste et le service worker répondent en 200.
