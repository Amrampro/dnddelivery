# Rapport Bloc 5 — 22 octobre 2026

## Fonctionnalités réalisées

Gestion MySQL réelle du Super Administrateur : tableau de bord, entreprises, coordonnées, logos privés, statuts motivés, responsables et principal, invitations sécurisées, recherche/pagination et historique. Pages et endpoints recensés dans SUPER_ADMIN.md. Les abonnements et modules logistiques futurs restent en attente.

Création atomique avec compte existant ou invitation; aucun mot de passe envoyé par mail. Transactions, verrou entreprise et version empêchent les écrasements concurrents et le retrait du dernier administrateur. Les droits globaux et affiliations restent vérifiés côté API avec l’authentification existante.

## Fichiers et migrations

- Nouveau module `api/src/modules/admin/` : validation.ts, repository.ts, service.ts, controller.ts, routes.ts, runtime.ts, logos.ts. Intégration routes/index.ts, extension auth/smtp.ts et database/client.ts. Sharp ajouté avec verrou npm.
- Nouveau dossier `webapp/src/admin/` : AdminWorkspace, Dashboard, CompanyList, CompanyForm, CompanyDetail, Administrators, GlobalPages, InvitationPage, UserLookup, ConfirmAction, components, types, useResource, navigation et admin.css. Intégration App, PortalLayout et client Auth. Navigation supplémentaire Web seulement.
- Migrations `20261021090000_company_administration` et `20261021100000_admin_query_indexes`. Schéma Prisma actualisé, FK principale maintenue en SQL (voir COMPANY_MANAGEMENT.md). Anciennes migrations conservées.
- Tests : database/admin.database.test.ts, helpers/local-smtp.ts, serve-admin-preview.ts et exercise-admin-preview.ts. Test SMTP étendu. Ancienne fixture Shop corrigée pour utiliser les champs existants. CI MySQL adaptée à la clé publique du conteneur.
- Guides SUPER_ADMIN.md, COMPANY_MANAGEMENT.md, COMPANY_INVITATIONS.md; README, MIGRATIONS, DATABASE_DESIGN et exemples d’environnement actualisés.

## Tests exécutés

| Contrôle | Résultat |
| --- | --- |
| API, Auth et SMTP local | 28 réussis, 0 échec |
| MySQL : administration, Auth, intégrité et concurrence | 24 réussis, 0 échec |
| Navigation partagée et permissions | 8 réussis, 0 échec |
| API typecheck, lint et build | Réussis |
| Web build et lint | Réussis |

MySQL officiel 8.4.13, base distincte `dnd_delivery_bloc5_test`, cinq migrations appliquées. Couverture : CSRF/origine, permissions, refus interentreprises, rollback, doublons, version, suspension immédiate, responsables, retraits concurrents, expiration/révocation/rotation/rejeu, hash du jeton, Argon2, recherche/pagination/statistiques/audit et logos invalides/surdimensionnés/privés. Aucun résultat CI distant déclaré réussi.

Recette HTTP complémentaire réussie avec Express, MySQL et un vrai serveur SMTP local : création, réception, renvoi, ancien lien rejeté, activation, rejeu rejeté, révocation persistée. Aucun courrier externe envoyé et aucune délivrabilité prestataire validée.

Navigateur : connexion et contexte global réels, tableau de bord, recherche/pagination, fiche et formulaire préremplis, référence immuable, description modifiée conservée après rechargement, refus explicite du dernier administrateur et invitations. Le lien SMTP ouvre le formulaire d’activation et retire son secret de l’adresse. L’acceptation est testée via HTTP. Fiche vérifiée à 390 et 768 pixels sans débordement horizontal. Captures : `docs/previews/bloc5-company.png` et `bloc5-company-mobile.png`.

## Préservation et limites

Comparaison des empreintes protégées : aucune différence sur les sources mobiles, assets/logos, landing et anciennes migrations répertoriées. Expo SDK 57 non reconstruit dans ce bloc. Environnements privés conservés. Aucun dépôt Git présent, aucune PR, publication ou développement du Bloc 6.

La base de recette et ses secrets restent dans `.local-preserved/bloc5`, ignoré : ne jamais publier ce dossier. Les processus temporaires sont arrêtés après la recette; aucun service MySQL système préexistant modifié.

Les invitations FAILED ou PENDING après interruption demandent un renvoi manuel; pas de worker durable. Les anciens logos sont conservés pour récupération, avec purge opérateur à prévoir. Limites de débit en mémoire par processus. Une fixture SQL dont le logo se trouve dans le stockage temporaire propre au test peut afficher « Logo indisponible » dans la prévisualisation; les tests de transfert/lecture privés passent.

## Configuration et reproduction

Configurer une nouvelle DATABASE_URL, les secrets Auth et origines Web selon AUTHENTICATION.md; sauvegarder, appliquer les migrations revues, seed des rôles, puis bootstrap manuel sécurisé sans compte par défaut. Variables nouvelles : COMPANY_INVITATION_HOURS (48), COMPANY_LOGO_DIR (dossier privé persistant), DATABASE_RSA_PUBLIC_KEY_FILE (facultative). Configurer SMTP réel et WEB_APP_URL, sauvegardes MySQL + logos et compte SQL à droits minimaux.

Tests : NODE_ENV=test, TEST_DATABASE_URL vers MySQL 8 avec une base dédiée nommée dnd_delivery*_test, puis `npm run test:db` depuis api. Le lanceur refuse une cible non conforme et ne prend jamais DATABASE_URL comme repli. Les procédures de recette fonctionnelle figurent dans SUPER_ADMIN.md. Les migrations de production et la configuration SMTP réelle restent à effectuer avant mise en service.
