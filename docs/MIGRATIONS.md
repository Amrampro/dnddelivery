# Installation, migrations et validation

## MariaDB 10.11 — adaptation du bloc 3

Le serveur Plesk cible utilise MariaDB 10.11.19. Définir `DATABASE_ENGINE=mariadb`
pour toutes les commandes Prisma et pour l'API (défaut : `mysql`). Le lanceur de
migration vérifie que ce choix correspond au moteur réellement connecté. Il
refuse MariaDB 10.4 et les branches non ciblées. Ne pas changer de moteur pour une
base existante sans procédure de migration des données et de l'historique.

L'historique MySQL dans `api/prisma/migrations` reste inchangé. Six variantes SQL
dans `api/prisma/mariadb-overrides` remplacent les contrôles REGEXP_LIKE des devises
par des contrôles stricts de trois caractères ASCII majuscules et DROP CHECK par
DROP CONSTRAINT. Les contraintes, index et triggers sont conservés. Un manifeste
d'empreintes bloque une variante dont la source MySQL a changé sans revue.

La configuration Prisma assemble temporairement l'historique MariaDB, avec les
mêmes noms de migrations, puis supprime ces fichiers temporaires à la sortie.
Les nouvelles migrations SQL portables sont reprises automatiquement. Une
nouvelle syntaxe incompatible nécessite une variante revue et des tests. Créer
les futures migrations sur la base de développement MySQL canonique ; `migrate
dev` est volontairement refusé en mode MariaDB, car il écrirait dans le dossier
temporaire. Ne jamais utiliser `migrate reset` ou `db push` en production.

Le job GitHub `mariadb` utilise MariaDB 10.11.19, une base isolée et un utilisateur
limité à cette base. Il applique deux fois les migrations, vérifie leur statut,
lance la suite métier puis relance les migrations après les écritures métier.
Validation réussie le 14 novembre 2026 sur MariaDB 10.11.19 : les 28 migrations
ont été appliquées sur une base vide, les relances n'ont trouvé aucune migration
en attente, puis 302 tests métier et un test de cycle complet ont réussi.
Le lanceur initialise les données de référence avant les tests et réexécute
cette initialisation après eux. Aucun compte utilisateur n'est créé par le seed.
[Exécution GitHub Actions](https://github.com/Amrampro/dnddelivery/actions/runs/43613356230),
commit `94668d4a7b1020e7ea7902844efdc43c566b6158`.
La base de production Plesk n'a pas été migrée. Le workflow de déploiement et
l'intégration du projet complet restent un bloc distinct.

Pour reproduire ce contrôle avec Docker :

```powershell
cd api
docker compose -f compose.test.yml up -d --wait mariadb-test
$env:DATABASE_ENGINE='mariadb'
$env:NODE_ENV='test'
$env:TEST_DATABASE_URL='mysql://dnd_test:dnd_test_only@127.0.0.1:3308/dnd_delivery_mariadb_test'
$env:DATABASE_URL=$env:TEST_DATABASE_URL
# Fournir une DELIVERY_SECRET aléatoire dédiée aux tests avant test:db.
npm run db:generate
npm run db:migrate:deploy
npm run db:migrate:deploy
npm run db:migrate:status
npm run test:db
```

## Version et emplacement

Tout est sous api. Prisma ORM/Migrate 7.10.1, générateur prisma-client vers src/generated/prisma (ignoré par Git), configuration prisma.config.ts et adaptateur MySQL. Les scripts build/typecheck génèrent le client avant compilation. Aucun accès à la base n’est nécessaire pour validate, generate et la comparaison depuis un schéma vide.

```powershell
cd api
npm ci
npm run db:validate
npm run db:generate
npm run build
npm run lint
npm run typecheck
npm test
```

## Nouvelle base exclusivement

Ne pas réutiliser l’ancienne base ni recopier ses DB_HOST/DB_PASSWORD. Choisir de nouveaux identifiants et vérifier que dnd_delivery est un nom libre. api/scripts/create-database.sql contient :

```sql
CREATE DATABASE dnd_delivery CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

La commande échoue si la base existe : vérifier son propriétaire/contenu au lieu de la vider. Aucun DROP DATABASE, migrate reset ou db push n’est utilisé. Le .env privé existant n’a pas été modifié. Ajouter manuellement une DATABASE_URL mysql:// vers cette nouvelle base, avec identifiants encodés. Ne jamais placer cette URL dans le Web ou Expo.

## Migrations préparées

1. 20261020180000_initial : 47 tables, enum, index et FK générés par Prisma depuis le schéma vide.
2. 20261020181000_integrity : 57 CHECK et 29 triggers SQL pour invariants, instantanés, preuves et historique.

Ces fichiers sont explicitement autorisés par les gitignore malgré l’exclusion globale des anciens fichiers SQL. Le fichier de création de la nouvelle base l’est également. Les anciens exports SQL restent ignorés et intacts. Aucun dépôt .git n’était présent : leur versionnement effectif sera à contrôler lors du rattachement à GitHub.

La migration initiale a été générée sans connexion avec :

```powershell
node node_modules/prisma/build/index.js migrate diff --from-empty --to-schema prisma/schema.prisma --script --output prisma/migrations/20261020180000_initial/migration.sql
```

Elle n’a pas été appliquée localement. Les CHECK/triggers complémentaires doivent être conservés dans les futures migrations, car leur comportement n’est pas entièrement décrit par Prisma. Ne pas régénérer une migration déjà appliquée ou partagée.

Après configuration d’une nouvelle base de développement dédiée :

```powershell
npm run db:migrate:deploy
npm run db:migrate:status
npm run db:seed
```

Pour une future évolution du modèle, sur une base de développement avec shadow database autorisée : `npm run db:migrate:dev -- --name description`. Sous PowerShell, préférer npm.cmd si le relais npm.ps1 absorbe les arguments. Refuser toute proposition de reset d’une base contenant des données utiles ; analyser la divergence et préparer une migration revue.

## Tests MySQL isolés

Un service optionnel est décrit dans api/compose.test.yml. Il est exclusivement destiné aux tests ; ses mots de passe visibles sont des fixtures publiques, pas des secrets de déploiement.

```powershell
cd api
docker compose -f compose.test.yml up -d --wait
$env:TEST_DATABASE_URL='mysql://dnd_test:dnd_test_only@127.0.0.1:3307/dnd_delivery_test'
npm run test:db
```

La commande refuse NODE_ENV=production et toute base dont le nom ne correspond pas à dnd_delivery*_test. Elle vérifie MySQL 8.0.16+, applique migrate deploy sur la base de test puis lance les tests. Elle n’utilise jamais DATABASE_URL de production comme solution de repli. Sans TEST_DATABASE_URL, elle échoue explicitement avec « NOT RUN », sans migration.

Tests préparés : unicité par tenant, FK croisées, boutique multi-entreprises, affiliations, filtres de lecture, réservations concurrentes et idempotence, quantités, commande ponctuelle sans stock, instantané destinataire, preuve unique/OTP non réutilisable, états logistiques et financiers indépendants, interdiction de l’auto-confirmation et double allocation des encaissements. La majorité des fixtures sont annulées par rollback ; les fixtures du scénario de concurrence restent dans la base de test dédiée. Aucune ancienne donnée n’est supprimée.

Le workflow GitHub Actions inclut un job MySQL 8.4 isolé, mais aucun résultat CI distant n’a été consulté ou déclaré réussi pendant cette intervention. Une configuration locale MySQL/Docker n’était pas disponible ; ces tests d’intégration restent non exécutés localement.

## Plesk et production future

Racine de déploiement api, Node compatible, npm ci, db:generate, build, secrets d’environnement privés, puis migration revue avec db:migrate:deploy avant démarrage. L’application n’applique aucune migration au démarrage. Le compte migration a les droits DDL/REFERENCES/TRIGGER nécessaires ; l’application utilise un compte distinct à droits minimaux et ne doit pas pouvoir modifier/supprimer l’audit.

Prévoir une sauvegarde vérifiée et une fenêtre de migration. MySQL DDL n’est pas une transaction atomique couvrant toute la migration : en cas d’échec, analyser l’état réel avant une reprise ; ne pas masquer l’erreur ni lancer un reset. Aucun déploiement de production n’a été effectué.

Références : [Prisma 7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7), [connecteur MySQL](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/mysql), [CHECK MySQL](https://dev.mysql.com/blog-archive/mysql-8-0-16-introducing-check-constraint/).

## Validation Bloc 5

Les mentions de non-exécution ci-dessus décrivent la situation au Bloc 2. Au Bloc 5, les cinq migrations et 24 tests MySQL passent sur MySQL 8.4.13 officiel, lancé sans service système sur une base séparée. Aucun résultat CI distant ni migration de production.

Ajouts : 20261021090000_company_administration et 20261021100000_admin_query_indexes. Préserver la FK composée du principal définie uniquement en SQL (voir COMPANY_MANAGEMENT.md). DATABASE_RSA_PUBLIC_KEY_FILE permet une clé publique épinglée obtenue par canal fiable pour caching_sha2_password en recette sans TLS; le job CI lit celle du conteneur MySQL. Préférer TLS vérifié en production.

## Bloc 6 — 28 octobre 2026

20261028090000_subscription_management ajoute les champs/contraintes/index d’abonnement, la permission de déclaration company_admin et le trigger protégeant les paiements traités. 20261028100000_single_active_offer impose explicitement un emplacement non NULL pour une offre active, car une CHECK SQL accepte une expression UNKNOWN. Les sept migrations sont conservées. Les offres historiques actives incompatibles nécessitent une décision opérateur avant application; aucune régularisation arbitraire n’est effectuée par la migration. Voir SUBSCRIPTIONS.md.

## Bloc 7 — 28 octobre 2026

Neuf migrations au total. 20261028120000_company_organization ajoute les champs d'organisation, DriverProfile, contraintes et permissions; 20261028130000_organization_query_indexes ajoute les index de pagination et traduit uniquement les libellés de rôles restés identiques à leurs codes. Ces deux migrations additives sont appliquées sur la base MySQL de test existante. Les sept précédentes restent intactes. Préserver la FK composée SQL du responsable principal d'agence, non représentée comme relation Prisma (AGENCY_MANAGEMENT.md). Aucun déploiement en production.

## Bloc 8 — 28 octobre 2026

Dix migrations au total. Ajout 20261028140000_partner_collaborations : profil et accord boutique, affiliations versionnées, états/métadonnées de collaboration, ShopInvitation et permissions. Migration additive appliquée à la même base MySQL dédiée aux tests, sans remise à zéro. Préserver les FK SQL ShopInvitation vers Shop/Company/User même si les champs sont représentés scalaires dans Prisma. Aucune ancienne migration modifiée ni production migrée. Voir PARTNER_MANAGEMENT.md.

## Bloc 9 — 28 octobre 2026

Treize migrations au total. 20261028150000_stock_operations ajoute les opérations de stock, les champs catalogue et permissions; 20261028151000_transfer_return_quantities distingue explicitement les retours de transit des pertes; 20261028152000_stock_legacy_states normalise uniquement les nouveaux champs dérivés des états anciens et renforce les FK composées dépôt/incident. Les dix migrations précédentes restent intactes. Les soldes physiques et anciens mouvements ne sont pas réécrits. Les treize empreintes SHA-256 des fichiers correspondent aux migrations appliquées sur la même base MySQL 8.4.13 de test. Aucune remise à zéro, nouvelle base ou migration de production.

## Bloc 10 — 28 octobre 2026

Seize migrations au total : 20261028160000_order_management, 20261028161000_order_permissions et 20261028162000_order_permission_metadata. Extensions des commandes, destinataires/articles/historique, contraintes d'encaissement, indexes et permissions. Les deux compléments conservent les migrations déjà appliquées et régularisent uniquement les nouvelles permissions et leurs métadonnées invalides. Appliquer la série complète avant de servir l'application. Les triggers exigent les privilèges/réglages MySQL adéquats lorsque le journal binaire est actif. Le rapport Bloc 10 décrit la reprise de l'application interrompue en test, sans reset. Seize empreintes appliquées correspondent aux fichiers ; treize migrations antérieures inchangées. Même base MySQL de test, aucune nouvelle base ni migration de production.

## Bloc 11 — migrations 17 à 19

- 20261028170000_delivery_operations : extension des modèles existants, cinq tables logistiques, contraintes contextuelles, invariants, tentatives immuables et permissions explicites.
- 20261028171000_delivery_event_sequence : ordre strict des événements par mission/version.
- 20261028172000_parcel_receipt_location : destination prévue distincte de la réception réelle et retour à l’origine après incident.

Appliquées seulement sur la base dédiée existante dnd_delivery_bloc5_test. Dix-neuf migrations appliquées, checksums concordants ; les seize migrations antérieures sont inchangées. Ni remise à zéro ni nouvelle base. Le serveur MySQL de recette autorise la création des triggers avec journal binaire. Aucune migration de production exécutée.
# Complément Bloc 12 — migrations additives

20. `20261029080000_operational_finance` : instantanés attendus sur affectations ; déclarations et allocations multiples avec protection des lignes anciennes ; trois modèles financiers ; clés contextuelles, contraintes monétaires, non-auto-validation, immutabilité et permissions explicites.
21. `20261029081000_financial_refund_origin` : extension atomique de la contrainte de type de correction pour tracer un remboursement externe réalisé par l’agence après réception des fonds.

Les 19 migrations précédentes restent inchangées. Appliquer par `npm run db:migrate:deploy` avec sauvegarde et procédure d’exploitation habituelles ; aucun reset ni nouvelle base n’est nécessaire. Les deux migrations ont été vérifiées sur la base locale de test existante. Aucune migration de production n’a été exécutée. Voir [rapport Bloc 12](BLOC-12-RAPPORT.md).

