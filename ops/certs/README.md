# Certificat racine public Supabase

Ce fichier contient uniquement le certificat public fourni par Supabase, sans clé privée. Il a été téléchargé depuis le bouton Download certificate des paramètres Database du projet APMS.

Source : https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

SHA-256 du fichier : 700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7

Expiration annoncée dans le certificat : Apr 26 10:56:53 2031 GMT

La configuration de déploiement utilise DATABASE_CA_FILE=ops/certs/supabase-root-ca.crt. Lors d’une rotation du certificat fournisseur, vérifier la nouvelle chaîne et mettre à jour ce fichier par Git ; ne pas désactiver la vérification TLS.
