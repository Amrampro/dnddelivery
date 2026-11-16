# Rapport Bloc 7 — Organisation interne

Date : 28 octobre 2026. Travail dans le dépôt existant, dans la continuité des Blocs 3, 5 et 6.

## Fonctionnalités livrées

Profil autorisé et logo privé d'entreprise; agences avec recherche, pagination, édition, désactivation motivée et responsable principal; personnel invité sans mot de passe par défaut; acceptation des comptes nouveaux ou existants; rôles et affectations multiples; retrait/suspension sans suppression du compte; profils livreurs, états et disponibilité personnelle; historique audité. Les abonnements contrôlent les écritures et l'isolation entreprise/agence est appliquée côté serveur.

Pages Web : Mon entreprise, Agences et fiche/création, Personnel et fiche/invitation, Livreurs et fiche, Invitations équipe, Historique organisation, Mes affectations et Profil livreur. Les changements de structure utilisent le Web. Écrans Expo : profil entreprise, listes et détails d'agences/personnel/livreurs, affectations personnelles, profil livreur et disponibilité; consultation des invitations et de l'historique selon permissions. Les interfaces réutilisent les composants et tokens existants.

## API, données et migrations

La liste exhaustive des routes figure dans COMPANY_ORGANIZATION.md, AGENCY_MANAGEMENT.md, EMPLOYEE_MANAGEMENT.md et DRIVER_MANAGEMENT.md. Les routeurs sont api/src/modules/organization/routes.ts et api/src/modules/admin/routes.ts pour accept-existing. Les règles communes sont dans organization/access.ts et permissions.ts; DTO communs dans shared/organization.ts.

Deux migrations additives : 20261028120000_company_organization et 20261028130000_organization_query_indexes. Total : neuf migrations, 49 modèles. Réutilisation de CompanyMembership, Agency et CompanyInvitation; ajout de DriverProfile. Contraintes composées, unicité par entreprise, contrôles SQL et index des listes; libellés de rôles traduits uniquement lorsque le nom était encore le code technique. Aucun ancien fichier de migration n'est modifié.

Les neuf migrations ont été appliquées sur la même base MySQL 8.4.13 dédiée aux tests des blocs précédents. Aucune base supplémentaire ni remise à zéro. Aucun déploiement ou migration de production. Après sauvegarde et configuration de la base cible, utiliser le parcours migrate deploy existant; ne jamais lancer les tests sur une base réelle.

## Vérifications

- MySQL réel : 65 tests réussis, zéro échec. Incluent 23 tests TAP du module organisation (parent compris), sécurité interentreprises, périmètre agence, acceptation, concurrence/version, indisponibilité et suspension, abonnement expiré, nettoyage des responsabilités lors du retrait global, audit et préservation des autres affiliations.
- API : 30 tests; navigation commune : 8 tests. Total final confirmé : 103 réussis, aucun échec.
- API : génération Prisma, types incluant les outils de recette, lint, build et validation du schéma.
- Web : build et lint; chargement différé de l'organisation (environ 26 Ko avant gzip).
- Expo SDK 57 : types, lint et cohérence de la matrice locale des dépendances. La commande hors ligne signale elle-même que la validation distante n'est pas disponible. Aucun changement de dépendance native dans ce bloc.
- Recette avec données réellement persistées : création d'une agence depuis le Web et rechargement; disponibilité changée dans Expo Web et visible dans la liste Web des livreurs; affichage mobile à 390 pixels.
- Empreintes SHA-256 vérifiées : fichiers protégés, anciens logos, anciennes migrations et dépendances mobiles inchangés.

Captures : previews/bloc7-agence-creee.png, previews/bloc7-livreurs-web.png, previews/bloc7-expo-disponibilite.png.

## Commandes de vérification

Dans api : npm run typecheck; npm run lint; npm run build; npm run db:validate; npm test. Dans webapp : npm run build; npm run lint; npm test. Dans mobileapp : npm run typecheck; npm run lint; npm run check:dependencies.

Pour npm run test:db dans api, fournir TEST_DATABASE_URL vers une base dnd_delivery*_test, NODE_ENV=test et, si nécessaire pour le serveur local sans TLS, DATABASE_RSA_PUBLIC_KEY_FILE vers sa clé publique vérifiée. Les secrets ne sont pas documentés et les fichiers .env existants sont préservés. Les traces privées de recette restent dans .local-preserved/bloc7, hors livrables.

## Limites et suites

Aucun appareil physique, build signé, CI distante ou délivrabilité SMTP externe n'est déclaré validé. L'envoi réutilise le transport SMTP précédent, avec échec conservé et renvoi manuel; les tests utilisent un destinataire/transport contrôlé. Les compteurs HTTP sont par processus. Le rôle d'organisation est unique par entreprise; la sélection est plafonnée à 100 agences par demande. Le filtre d'agence de la liste du personnel présente les 50 premières; le sélecteur d'affectations est paginé et les fiches d'agence donnent accès au personnel local.

Les modules futurs doivent réutiliser assertDriverAssignable et enrichir agencyBlockers selon les nouvelles opérations ouvertes, dans leurs transactions métier. Aucun catalogue, mouvement de stock, commande, livraison, course, encaissement ou OTP n'est développé. Aucun Bloc 8 commencé.

Le journal permanent JOURNAL_DE_DEVELOPPEMENT.md est complété avec la section Bloc 7, ses parcours et ses vérifications.
