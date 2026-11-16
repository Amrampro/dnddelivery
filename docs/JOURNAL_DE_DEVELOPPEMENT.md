# Journal de développement — DND Delivery

Ce journal décrit le code réellement inspecté dans le dossier du projet. État reconstitué le **28 octobre 2026**. Aucun historique Git disponible dans le dossier : les dates anciennes citées par les rapports ne permettent pas de reconstruire des commits. Les résultats anciens restent attribués à leurs rapports; les tests de la présente intervention sont consignés séparément.

**Règle permanente :** chaque prochain bloc doit compléter ce journal avec fonctionnalités, migrations, tests réellement exécutés, limites et fichiers importants. Conserver les sections anciennes; ajouter une note datée lorsqu’un comportement évolue. Ne pas transformer un modèle préparé en fonctionnalité prétendument terminée.

## Bloc 1 — Fondations présentes

Trois applications indépendantes : api Express/TypeScript, webapp React/Vite et mobileapp Expo Router. Configuration validée, erreurs, CORS, Helmet, journaux, santé GET /api/health et /api/v1/health. Web : landing responsive et identité DND; mobile : accueil et premiers écrans natifs. Dossiers api/src/config, middlewares, routes; webapp/src/components, pages et layouts; mobileapp/app et src. Lockfiles et CI existent.

Le rapport [Bloc 1](BLOC-1-RAPPORT.md) est daté du 20 octobre 2026. Les écrans de connexion et portails préparatoires ont ensuite évolué aux Blocs 3/4; ils ne constituent plus à eux seuls l’état actuel. Pas de suivi logistique public réel, d’OTP externe, de publication store ou de déploiement vérifié.

## Bloc 2 — Schéma, isolation et SDK 57

api/prisma/schema.prisma et migrations initial/integrity décrivent initialement 47 modèles : comptes/permissions, sociétés/agences/boutiques, sessions, stocks, commandes/livraisons/preuves/encaissements, abonnements, notifications et audit. FK composées tenant, CHECK et triggers protègent les rôles, quantités, montants et historiques. Les fonctions internes authorizeTenant/authorizeGlobal, ordersRepository et reserveStock existent; elles ne sont pas un module complet de commandes/stock exposé en REST.

Prisma 7 et adaptateur MySQL, horodatages UTC. La correction Expo a aligné les dépendances SDK 57; matrice installée et consigne mobileapp/AGENTS.md conservées. Le [rapport Bloc 2](BLOC-2-RAPPORT.md) précise que ses migrations n’avaient alors pas été appliquées localement. La validation effective MySQL a été ajoutée au Bloc 5 et rejouée au Bloc 6. Ne pas réécrire rétroactivement cette limite historique.

## Bloc 3 — Authentification effective

api/src/modules/auth : Argon2id, jetons d’accès, refresh hashés/rotation/révocation, cookies Web et bearer mobile, protection CSRF et origine, restauration de session, récupération SMTP, profil et sessions. User, Session, AccountToken, AuthEvent, GlobalRoleGrant, CompanyMembership/AgencyMembership/ShopMembership portent les accès. Les permissions sont relues; un JWT ne fige pas une ancienne affiliation. Contextes GLOBAL/COMPANY/AGENCY/SHOP et changement d’organisation.

Routes /api/auth : login, refresh, csrf, me, workspace, switch-organization, profil/sessions, logout, récupération selon auth.routes.ts. Clients Web/Expo dans src/auth. Migration 20261020200000_auth_sessions. Bootstrap manuel sans compte/mot de passe par défaut. Guides [AUTHENTICATION](AUTHENTICATION.md), [SESSION_SECURITY](SESSION_SECURITY.md), [rapport Bloc 3](BLOC-3-RAPPORT.md). Les vrais secrets, SMTP externe et base de production ne sont pas provisionnés automatiquement.

## Bloc 4 — Design et espaces professionnels

shared/tokens.ts et workspace.ts : palette, tokens et navigation par permissions, six profils. webapp/src/design/ui.tsx et design.css; composants natifs dans mobileapp/src/design. PortalLayout et WorkspaceScreen vérifient GET /api/auth/workspace, affichent le contexte et permettent son changement. Tableaux, champs, confirmations, états vides/erreurs/chargement et bibliothèques de composants sont présents.

Les autres modules restent des vues d’attente tant que leurs endpoints métier n’existent pas. Les démonstrations de la bibliothèque UI n’enregistrent pas de données. Voir [DESIGN_SYSTEM](DESIGN_SYSTEM.md), [WEB_NAVIGATION](WEB_NAVIGATION.md), [MOBILE_NAVIGATION](MOBILE_NAVIGATION.md) et [rapport Bloc 4](BLOC-4-RAPPORT.md).

## Bloc 5 — Administration des entreprises

api/src/modules/admin et webapp/src/admin : dashboard MySQL, sociétés paginées/recherche, création/modification, référence immuable, statuts administratifs motivés, responsables/principal, invitations et audit. Association d’un utilisateur existant sans modifier son compte; invitations à jeton hashé temporaire, rotation, révocation, activation unique. Dernier administrateur protégé, mises à jour versionnées et transactions. Logos privés décodés/réencodés par Sharp, fichiers officiels conservés.

Routes /api/admin/companies, /admins, /invitations, /dashboard, /activity, /users/lookup; activation /api/invitations/inspect et /accept. CompanyInvitation porte le 48e modèle. Deux migrations 20261021090000_company_administration et 20261021100000_admin_query_indexes. FK du principal définie en SQL, à préserver lors des migrations Prisma futures. Guides [SUPER_ADMIN](SUPER_ADMIN.md), [COMPANY_MANAGEMENT](COMPANY_MANAGEMENT.md), [COMPANY_INVITATIONS](COMPANY_INVITATIONS.md).

Le [rapport Bloc 5](BLOC-5-RAPPORT.md), daté du 22 octobre, consigne 28 tests API, 24 MySQL et 8 navigation alors exécutés. Il ne garantit pas un déploiement ou la délivrabilité SMTP externe. Reprise des invitations manuelle après échec SMTP; anciens logos conservés pour récupération.

## Bloc 6 — 28 octobre 2026 : abonnements SaaS

### Acteurs et parcours

Le global doté de subscriptions.validate configure le tarif mensuel unique et vérifie humainement les règlements externes. L’administrateur COMPANY doté de subscriptions.read et subscriptions.declare consulte Mon abonnement et déclare un paiement déjà réalisé. Aucun autre utilisateur ne paie individuellement et aucune passerelle n’exécute de transaction.

Parcours : configurer le tarif → créer/associer l’entreprise selon le Bloc 5 → régler hors plateforme → déclarer montant/devise/moyen/référence/date/commentaire → état PENDING sans activation → vérification humaine globale → précontrôle serveur affichant le mois exact → validation atomique ou rejet motivé. L’auteur ne peut pas traiter sa propre déclaration. Un rejeu ou une double validation concurrente ne crée pas de seconde période.

### Règles et états

Le tarif courant au moment de la validation doit correspondre exactement au montant et à la devise déclarés. Chaque période conserve sa SubscriptionPrice et son montant DECIMAL. Les modifications de tarif ajoutent une version et ne réécrivent ni paiements ni périodes confirmés. Application immédiate ou future dans l’ordre chronologique; conflits explicites.

Un mois calendaire UTC, bornes [début,fin), jour ramené au dernier du mois cible : 31 janvier → 28/29 février, puis renouvellement depuis ce jour. Première activation/réactivation à l’instant de précontrôle serveur, valable cinq minutes; prolongation d’un abonnement valide depuis sa fin actuelle. Confirmation signée liée au paiement, tarif et échéance, à recharger après modification concurrente.

Company.status, Subscription.status et SubscriptionPayment.status sont indépendants. Valider ne lève jamais une suspension administrative. Sans abonnement valide, données et affiliations conservées, lectures filtrées et compte accessibles; nouvelles mutations refusées à chaque requête selon l’heure serveur. Le Web garde Mon abonnement/déclarations/changement d’entreprise; Expo ajoute un écran limité avec vérification et changement de contexte, sans dépendance native nouvelle.

### Expiration, colis et notifications

Job expire indépendant d’Express : statut EXPIRED, suspendedAt, événement, audit et notification idempotents. Le contrôle d’accès n’attend pas ce job. J-3 et jour J utilisent la date civile UTC; après expiration, validation ou rejet, avis durable aux administrateurs actifs. Notification réutilisée comme outbox avec déduplication, bail, SKIP LOCKED, cinq tentatives, reprise et annulation d’avis obsolètes. SMTP est envoyé hors transaction; les erreurs n’annulent pas le métier. Livraison au moins une fois, Message-ID stable, limites expliquées dans PLESK_SCHEDULED_JOBS.md.

Le garde assertSafeClosure autorise uniquement DELIVERY_CLOSE/DELIVERY_PROOF/COLLECTION_DECLARE pour un colis IN_PROGRESS pris en charge avant expiration, de la bonne société/agence, par son livreur ou administrateur. Aucune exception de création/affectation. **Les routes logistiques futures ne sont pas développées** : le garde est testé en MySQL et devra être intégré dans leurs transactions. Aucune fausse route de preuve ou d’encaissement n’est annoncée comme livrée.

### Code, tables et endpoints

Réutilisation SubscriptionPlan, SubscriptionPrice, Subscription, SubscriptionPayment, SubscriptionPeriod, SubscriptionEvent, Notification et AuditLog. Ajout lastActivatedAt sur Subscription; paidAt, rejectionReason, idempotencyKey et duplicateKey sur SubscriptionPayment. Aucune table supplémentaire, aucune suppression de données. Deux migrations additives 20261028090000_subscription_management et 20261028100000_single_active_offer. Les tarifs actifs ne peuvent plus contourner la contrainte singleton avec NULL.

Nouveaux fichiers principaux : api/src/modules/subscriptions/{rules,service,repository,routes,jobs,access}.ts, api/src/jobs/subscriptions.ts, api/tests/subscriptions.test.ts, api/tests/database/subscriptions.database.test.ts, api/tests/serve-subscriptions-preview.ts et webapp/src/subscriptions/Subscriptions.tsx. Les anciens helpers de lecture/notifications du Bloc 2 restent conservés; le runtime utilise le service et l’outbox du Bloc 6.

Intégrations : routes/index.ts, autorisations/repository, chargement/type des workspaces, réservation interne de stock, transport SMTP, seed/permission de référence et scripts package.json. Web : PortalLayout, dashboard global, types Auth; mobile : WorkspaceScreen et types seulement. Le test stock dispose maintenant d’un abonnement de fixture explicite; le lanceur MySQL inclut le Bloc 6 et exécute les fichiers séquentiellement pour isoler le job global de recette.

Pages : abonnement global, tarif, paiements/liste/détail et filtres, périodes, notifications; entreprise Mon abonnement, déclaration, détail/historiques et restriction. Les anciens composants du Design System sont réutilisés.

API globale /api/admin : subscriptions, subscriptions/overview, subscription-plan GET/PATCH, subscription-payments/liste/détail/preview/approve/reject, subscription-history et subscriptions/notifications. API entreprise /api/company/subscription, /payments GET/POST, /payments/:id et /history. Le contexte autorisé fournit l’entreprise; détails dans [SUBSCRIPTIONS.md](SUBSCRIPTIONS.md).

### Jobs, configuration et limites

Commandes compilées : npm run subscriptions:expire, subscriptions:reminders, subscriptions:notifications. Fréquences Plesk recommandées 5 minutes/1 heure/1 minute, installation future explicite. Aucune nouvelle variable obligatoire : DATABASE_URL, Auth et SMTP_* existantes; les paramètres de lot/bail/tentatives sont documentés. Aucun montant fixe commercial ni coordonnées de paiement inventés. Le tarif est configuré depuis l’administration.

Les justificatifs ne sont pas exposés faute de flux générique sécurisé existant. Les suspensions/résiliations propres à Subscription héritées du modèle sont respectées; le contrôle administratif manuel utilise Company. Pas de routes logistiques, pas de passerelle, pas de prorata/multi-formules. SMTP externe, tâches Plesk et production non configurés. Pas de build mobile natif signé ni recette sur téléphone physique dans ce bloc. Tests et bilan final : [BLOC-6-RAPPORT.md](BLOC-6-RAPPORT.md), à lire avec les guides spécifiques ci-dessous.

### Documents techniques

[Abonnements](SUBSCRIPTIONS.md) · [Paiements externes](SUBSCRIPTION_PAYMENTS.md) · [Expiration/continuité](SUBSCRIPTION_EXPIRATION.md) · [Tâches Plesk](PLESK_SCHEDULED_JOBS.md). Les futurs blocs devront réutiliser le contrôle de validité et le garde de clôture, sans ouvrir de création après expiration.

### Vérifications exécutées le 28 octobre 2026

30 tests API/Auth/HTTP/SMTP/calendrier et montants, 42 tests MySQL (anciens modules et SaaS), 8 tests de navigation : 80 réussis, aucun échec dans les passages finaux. Les 18 tests TAP du sous-ensemble SaaS ont été rejoués après le dernier ajustement du worker et passent. MySQL 8.4.13 réel et base séparée; aucune CI distante ni délivrabilité SMTP externe déclarée validée. Horloge contrôlée pour les échéances, fixtures conservées dans la base privée.

API : typecheck/lint/build réussis; Web : build/lint réussis; mobile : typecheck/lint réussis, matrice Expo locale cohérente (mode hors ligne signalé). Trois commandes compilées de jobs exécutées avec code 0 sur lots à l’heure réelle; l’envoi SMTP effectif/reprise est testé avec serveur local. Recette Web : précontrôle, accès limité/renouvellement, déclaration persistée et responsive à 390 pixels. Les nouvelles périodes, expirations et clôtures limitées sont vérifiées par tests MySQL. Les détails et limites sont dans le rapport Bloc 6.

## Bloc 7 — Gestion des agences, du personnel et des livreurs

Date : 28 octobre 2026. Modules des Blocs 3, 5 et 6 examinés et réutilisés : sessions/contextes, invitations et logos privés, gardes d'abonnement et audit. Aucun changement de base de production, logo officiel, identité native ou Design System.

### Fonctionnement livré

L'administrateur entreprise ouvre Agences, crée une agence avec référence, coordonnées et localisation, puis retrouve sa fiche persistée après rechargement. Il ouvre Personnel, invite une adresse au rôle employé/responsable/stock/livreur et sélectionne ses agences. Le destinataire nouveau choisit son mot de passe; un compte existant se connecte pour accepter, sans remplacement du mot de passe. L'invitation seule ne donne aucun droit. L'administrateur désigne ensuite un responsable actif déjà affecté à l'agence comme principal.

La fiche Personnel permet modification des affectations, rôle et état; le retrait motivé désactive uniquement les liens locaux, conserve le compte et ses autres entreprises, et retire les responsabilités principales incompatibles. Les administrateurs entreprise restent gérés dans le module global. La fiche Livreur permet matricule, transport, notes et état; sur Expo le livreur consulte son profil et ses agences et choisit sa propre disponibilité. La suspension rend indisponible et retire immédiatement les droits opérationnels.

### Pages, écrans et permissions

Web : profil entreprise, agences/liste/création/fiche, personnel/liste/invitation/fiche, livreurs/liste/fiche, invitations équipe, historique organisation, mes affectations et profil livreur. Expo : consultation des mêmes données selon les droits, listes paginées, fiches, profil personnel et disponibilité. Les mutations administratives de structure sont concentrées sur le Web.

company_admin dispose des permissions company.profile.*, agencies.*, employees.*, drivers.read/manage et organization.audit.read. Les responsables ont la lecture limitée à leur agence sélectionnée. Stock et employés conservent les seules lectures autorisées. Le livreur lit son profil et change sa seule disponibilité. company_member est une affiliation parent minimale, sans administration. Le Super Administrateur intervient explicitement par les routes globales. Expiration : lecture conservée, écritures d'organisation bloquées; aucun droit n'est déduit seulement d'un menu affiché.

### Endpoints et fichiers importants

Sous /api/company : GET/PATCH profile, GET/PUT profile/logo; GET/POST agencies, GET/PATCH agencies/:id, PATCH agencies/:id/status et /primary; GET employees, POST employees/invite, GET/PATCH employees/:id, DELETE employees/:id/affiliation; GET drivers, GET/PATCH drivers/:id, PATCH drivers/:id/assignments; GET staff-invitations, POST staff-invitations/:id/resend et /revoke; GET organization/self et organization/history. Sous /api/driver : GET profile/availability et PATCH availability. POST /api/invitations/accept-existing ajoute l'acceptation authentifiée au parcours public existant. Intervention globale sous /api/admin/companies/:companyId/organization.

Fichiers : api/src/modules/organization, api/src/modules/admin/{service,logos,routes}.ts, auth/workspaces.ts, repositories/authorization.repository.ts, shared/{organization,workspace}.ts, webapp/src/organization, mobileapp/src/organization, api/tests/database/organization.database.test.ts. Validation stricte, corps sans champs arbitraires, versions optimistes, transactions sérialisables, contrôle du destinataire et de l'autorité actuelle de l'émetteur, audit sans secret, limites d'envoi et protections HTTP existantes.

### Modèles et migrations

CompanyMembership : organizationRole, employmentStatus, version. Agency : countryCode, locationNotes, primaryManagerUserId, version. CompanyInvitation : kind, staffRole, agencyIds. Nouveau DriverProfile lié par entreprise/personne à l'affiliation, sans duplication du compte. 49 modèles et neuf migrations. Ajouts : 20261028120000_company_organization et 20261028130000_organization_query_indexes. Les contraintes composées du responsable principal sont conservées en SQL, à préserver lors des migrations futures. Les anciennes migrations restent intactes; aucune suppression physique ni remise à zéro.

### Tests, recette et limites

Passage MySQL final : 65 tests réussis, aucun échec sur MySQL 8.4.13 et la base dédiée existante. Les tests vérifient notamment l'isolation, les invitations nouvelles/existantes, droits du responsable, versions périmées, stock sans accès au personnel, désactivation bloquée par opération ouverte, disponibilité personnelle, suspension et retrait, abonnement, nettoyage lors du retrait d'administrateur et audit.

Recette Web/Expo Web : agence créée puis relue après rechargement; disponibilité du livreur modifiée depuis Expo et retrouvée dans la liste Web réelle; affichage à 390 pixels. Captures enregistrées dans docs/previews/bloc7-*.png. Vérification SHA-256 des fichiers protégés : aucune modification des logos officiels, anciennes migrations, pages publiques et dépendances mobiles. Ni appareil physique, publication, SMTP externe ni CI distante déclarés validés.

Documents : COMPANY_ORGANIZATION.md, AGENCY_MANAGEMENT.md, EMPLOYEE_MANAGEMENT.md, DRIVER_MANAGEMENT.md et BLOC-7-RAPPORT.md. Pour les futurs modules, enrichir agencyBlockers et utiliser assertDriverAssignable dans les transactions d'affectation. Pas de livraison, stock, commande, course, encaissement ou Bloc 8 implémenté. Les limites d'interface et les commandes sont détaillées dans le rapport.

Passage final confirmé : 30 tests API/HTTP/SMTP + 65 tests MySQL + 8 tests de navigation, soit 103 réussis et aucun échec. API : typecheck (outils de recette compris), lint, build et validation Prisma réussis; Web : build et lint réussis; Expo : typecheck/lint réussis, dépendances cohérentes avec la matrice locale hors ligne. Les tests HTTP/SMTP ont été exécutés avec accès aux serveurs locaux, car le mode restreint refuse ces connexions. Les serveurs temporaires sont arrêtés après recette; données et traces de test conservées.

## Bloc 8 — Boutiques partenaires et collaborations multi-entreprises

Date : 28 octobre 2026. Objectif : une identité boutique commune à plusieurs transporteurs indépendants, avec accords explicites et périmètres isolés. Les fonctionnalités réellement présentes des Blocs 1 à 7 et ce journal ont été examinés avant réalisation; identité, sessions, abonnements, notifications, modèles et composants existants sont réutilisés.

### Fonctionnement et parcours

La boutique demande son inscription depuis le lien de connexion, fournit ses coordonnées et accepte les conditions courtes affichées (version shop-registration-2026-10-28). Le lien envoyé vérifie l'adresse avant toute création de boutique/affiliation. Un compte existant s'authentifie comme destinataire sans remplacer son mot de passe; un nouveau compte choisit le sien. Le propriétaire invite ensuite ses utilisateurs et choisit propriétaire, gestionnaire ou employé. Aucun droit avant acceptation; dernier propriétaire actif protégé, comptes globaux et autres affiliations conservés.

L'entreprise invite une boutique existante par référence ou prépare une inscription par e-mail. La boutique peut demander un transporteur par référence exacte. Le couple reste PENDING jusqu'à décision de la partie opposée. ACTIVE peut être suspendu par l'entreprise ou terminé par l'une des parties, avec motif. REJECTED/ENDED/SUSPENDED ne reviennent jamais directement à ACTIVE : une nouvelle demande puis un nouvel accord sont exigés. Unicité entreprise/boutique, versions et transactions protègent les demandes et décisions concurrentes.

La boutique dispose d'un contexte autonome shop-home:<shopId> et de contextes de transporteur shop:<companyId>:<shopId> vérifiés en base. Elle passe d'un transporteur à l'autre sans reconnexion; un transporteur expiré n'empêche pas les autres collaborations actives ni le profil propre à la boutique. Les entreprises ne voient ni les autres transporteurs de la boutique ni ses utilisateurs internes. La correction d'audit évite aussi de rattacher un événement privé de personnel boutique au transporteur simplement sélectionné.

### Pages et écrans

Web entreprise : liste/recherche/filtres/pagination des partenaires, demandes reçues, invitations envoyées et création, fiche/profil commercial, historique, agences partagées, confirmations de décision/suspension/fin, avis. Web boutique : accueil, profil/logo, transporteurs, demandes et invitations, utilisateurs/invitations, historique, notifications et paramètres. Routes publiques : /inscription-boutique et /invitation-boutique; seule une entrée de connexion est ajoutée, sans modifier la landing.

Expo : accueil et profil commercial modifiable, transporteurs/détails, recherche/filtres/pagination, demandes reçues/envoyées, acceptation/refus, nouvelle demande, fin, sélecteur, statuts/historiques, notifications et paramètres. Les entreprises y consultent leurs partenaires. Gestion complexe des comptes/logos sur Web; pas de second système de sessions. Les emplacements logistiques futurs ne contiennent pas de faux stocks ou commandes.

### Endpoints et données

/api/partner-registration : POST /, /inspect, /accept, /accept-existing (authentifié). /api/partners : GET/PATCH profile, GET/PUT profile/logo; GET users, POST users/invite, PATCH/DELETE users/:userId; GET invitations, POST invitations/:id/resend ou /revoke; GET/POST collaborations, GET collaborations/:id, POST collaborations/:id/request|accept|reject|suspend|terminate; GET directory/companies, history, notifications et logo professionnel d'un partenaire autorisé.

/api/company : GET partners, partner-requests, partner-invitations; POST partner-invitations; POST partner-invitations/:id/resend|revoke; GET partners/:id; POST partners/:id/request|accept|reject|suspend|terminate; GET partner-directory, partner-history, partner-notifications et logo de boutique autorisée. Les corps stricts, versions, origines, CSRF et permissions sont contrôlés côté serveur; les identifiants client n'élargissent aucun contexte.

Shop et ShopMembership sont étendus (profil, accord, affiliation/version); CompanyShop reçoit origine, acteurs, dates, observations, agences autorisées et version, avec REJECTED en plus des états préparés. Nouveau ShopInvitation pour REGISTRATION/USER/PARTNER. Notification et AuditLog sont réutilisés; aucun modèle métier logistique supplémentaire. Migration additive 20261028140000_partner_collaborations : 50 modèles, dix migrations au total. FK d'invitations scalaires documentées en SQL à préserver. Migration appliquée uniquement sur la base de test existante MySQL 8.4.13; aucune réinitialisation, nouvelle base ou suppression de données.

### Permissions et fichiers

company_admin : partners.read/manage. shop_owner : profil, utilisateurs, collaborations, historique et avis. shop_manager : profil/collaborations et lectures, sans gestion des comptes. shop_employee : lecture du profil, collaborations et avis. authorizeShop rend les opérations propres à la boutique indépendantes du transporteur, tandis que les opérations liées à une entreprise gardent leurs contrôles tenant/subscription. La référence exacte de l'annuaire ne révèle que l'identité commerciale minimale avant demande.

Code principal : api/src/modules/partners, api/src/jobs/partners.ts, api/tests/database/partners.database.test.ts, shared/partners.ts, webapp/src/partners et mobileapp/src/partners. Intégrations dans auth/workspaces et autorisations, sélecteurs/provider de contexte, navigation partagée, routeur, seed et lanceur MySQL. Les réponses de rafraîchissement tardives ne peuvent plus écraser une sélection en cours dans les fournisseurs d'authentification.

Les invitations conservent un hash de jeton temporaire/unique. Un échec SMTP ne supprime pas l'opération; renvoi/rotation pour les invitations, nouvelle demande d'inscription après échec avec payload original préservé. Les avis de collaboration sont dédupliqués et envoyés hors transaction via worker PARTNER_ distinct, bail, contrôle actuel du destinataire, délais progressifs et tentatives bornées. Commande compilée npm run partners:notifications; future tâche Plesk à installer explicitement.

### Vérifications et limites

Suite finale : 86 tests MySQL, 32 tests API/Auth/HTTP/SMTP, 9 tests de navigation, soit 127 réussis et aucun échec. Le nouveau module compte 21 tests TAP (20 sous-tests et parent). Vérifications couvrant inscription vérifiée, compte existant, rôles/dernier propriétaire, invitations sans droit préalable, multi-entreprises, doublons/concurrence, accords/transitions, sélection autorisée et refus d'un tiers, expiration sans blocage d'un autre partenaire, conservation d'historiques, notifications/reprise et audit sans fuite interne.

API : types source/tests, lint/build/validation Prisma réussis. Web : build/lint réussis. Expo SDK 57 : types/lint, matrice locale des dépendances et export Web réussis; mode hors ligne du contrôle de dépendances explicité. Worker compilé exécuté avec code 0 sur lot sans avis éligible. Aucune délivrabilité SMTP externe déclarée validée.

Recette réelle Web/Expo Web : deux boutiques distinctes et deux transporteurs d'une même boutique; changements sans reconnexion; modification du profil depuis Expo puis lecture Web après rechargement. Les avertissements de texte React Native détectés pendant la recette ont été corrigés sans masquage. Captures dans docs/previews/bloc8-*.png. Empreintes des anciens logos, migrations et dépendances mobiles inchangées.

Limites : pas de téléphone physique ni build signé/CI distante; administration des comptes sur Web; conditions légales de production à valider; compteurs HTTP par processus; agences partagées définies lors de l'invitation. Les futurs stocks/commandes doivent réutiliser assertActiveCollaboration, les agences autorisées et les gardes tenant dans leurs transactions. Fin/suspension conserve et signale les opérations ou stocks ouverts; aucun mouvement fictif de restitution. Aucun Bloc 9, aucune commande/livraison/OTP/encaissement ou déploiement.

Documents : PARTNER_MANAGEMENT.md, PARTNER_COLLABORATIONS.md, PARTNER_PERMISSIONS.md et BLOC-8-RAPPORT.md (commandes et limites détaillées). L'historique des blocs précédents est conservé.

Contrôle visuel final : les cartes de transporteurs Expo sont relues après reconstruction de l'aperçu; aucun nouveau message d'erreur React Native. Capture mobile : previews/bloc8-transporteurs-expo.png. Capture entreprise : previews/bloc8-partenaires-entreprise-web.png; profil modifié depuis Expo puis relu après rechargement : previews/bloc8-profil-depuis-expo-web.png. Les serveurs temporaires de recette sont arrêtés après vérification; données et traces de test conservées.

## Bloc 9 — Produits, stocks et transferts inter-agences

Date : 28 octobre 2026. Objectif : gérer les marchandises des boutiques confiées aux agences, depuis leur catalogue jusqu'aux mouvements, transferts et inventaires, avec une quantité exacte et une responsabilité identifiable. Modèles préparés au Bloc 2, sessions/permissions des Blocs 3/7, abonnements du Bloc 6 et collaborations du Bloc 8 examinés et réutilisés. Les applications et le Design System restent en place.

### Fonctionnement livré et règles

La boutique crée ses produits une seule fois, SKU facultatif unique par boutique, informations commerciales/image/unité/activité et version. Le transporteur ne modifie pas ce catalogue. Le catalogue reste indépendant du transporteur sélectionné et de son abonnement; une édition partielle ne réactive pas un produit archivé et ne vide pas les champs omis. Les images sont privées et réencodées; les véritables logos sont conservés.

Un dépôt de 1 à 100 références distinctes est DRAFT, sans entrée physique. Le gestionnaire vérifie boutique, produits, agence, collaboration active et partage explicite, puis confirme la réception. La transaction crée chaque mouvement et les soldes, l'auteur/date et CONFIRMED ensemble. Une erreur sur une seule ligne annule tout; une seconde confirmation n'ajoute rien. CANCELLED avant réception conserve la préparation sans mouvement.

Le physique inclut le réservé : disponible = physique − réservé, avec 0≤réservé≤physique. Une sortie motivée retire seulement le disponible, avec référence, type de retrait/restitution et destinataire éventuel. Une réservation ACTIVE conserve le physique, augmente le réservé; sa libération retire la réserve et sa consommation diminue physique ET réservé dans une transition de sortie motivée. Consommer exige stocks.reserve et stocks.withdraw. Les réservations concurrentes ne peuvent dépasser le disponible; les références rejouées ne débitent pas deux fois.

Le transfert reste dans une seule entreprise, entre deux agences différentes autorisées pour la boutique. DRAFT n'affecte rien; départ IN_TRANSIT retire le physique d'origine. La réception ajoute uniquement la quantité acceptée à destination. Le restant de transit vaut prévu−reçu−retourné−perdu; les totaux entreprise ne comptent pas deux fois les articles. Les totaux physiques/transit d'une synthèse partagent un même snapshot MySQL, testé pendant des mouvements concurrents.

Les incidents OPEN conservent auteur/date/produit/quantité/description et isolent les quantités litigieuses des autres déclarations/réceptions ordinaires. Une approbation autorisée récupère à destination, retourne à l'origine ou valide une perte de transit avec motif. Aucune perte automatique ni faux mouvement physique nul. Le contexte d'agence doit correspondre à la cible d'une restauration physique. La clôture RECEIVED distingue reçus/retournés/perdus et exige zéro incident ouvert; les interfaces présentent le transfert comme clôturé.

L'inventaire fige physique/réservé/version sur au plus 500 soldes, accepte les comptages entiers, exige justification des écarts et soumission. Un approbateur peut approuver ou rejeter avec motif. Une version de stock modifiée depuis le relevé rend l'inventaire périmé; une correction ne descend pas sous les réservations et ne peut pas être rejouée. Les écarts validés deviennent ADJUSTMENT sans modifier les anciens mouvements. Le rejet n'affecte aucun solde.

Les seuils portent sur chaque solde entreprise/agence/boutique/produit. L'alerte est disponible≤seuil et la rupture disponible=0. Vues calculées sur MySQL, pas d'indicateur fictif ni d'e-mail automatique à chaque lecture. Le journal immuable expose références métier, variations, avant/après et acteur.

### Acteurs, permissions et périmètres

Administrateur entreprise : lecture globale et toutes les permissions de stock. Responsable d'agence : droits dans l'agence sélectionnée, dont approbation. Gestionnaire : dépôt, sortie, réservation, transfert, inventaire/comptage et seuil, sans stocks.approve. Boutique : shop.products.read/manage selon propriétaire/gestionnaire, lecture seule du catalogue pour l'employé et shop.stocks.read sur ses marchandises. Aucune modification physique par la boutique ni accès aux marchandises d'un autre propriétaire.

Les gardes sont relus dans les transactions : compte, affiliations, entreprise active, agence, propriétaire, collaboration, agences partagées et abonnement. NULL/[] dans allowedAgencyIds n'ouvre aucune agence; l'administrateur définit le partage sur la collaboration par version. Les marchandises d'une collaboration terminée restent consultables; restitutions, libérations et réceptions de transit déjà engagé sont possibles avec les permissions actuelles et un abonnement valide. Aucune mutation de stock après expiration.

### Pages et écrans

Web entreprise/agence/stock : catalogue consultable autorisé, stocks/indicateurs/filtres, dépôts, sorties, réservations, mouvements, transferts/réceptions/incidents, inventaires/décisions et alertes. L'accueil stock utilise les données réelles. Web boutique : catalogue/image, marchandises chez ses transporteurs, filtres entreprise/agence, dépôts, transferts et mouvements. La fiche de collaboration permet de partager les agences.

Expo : catalogue, listes/filtres/soldes, dépôts multiples et confirmation, sorties, réservations et transitions, transferts et réceptions partielles/incidents, inventaires et approbations autorisées, alertes. Les formulaires valident les entiers et emploient des sélecteurs de produits/agences/boutiques. Aucune caméra ou dépendance QR requise. Les modules futurs de commande/livraison restent explicitement hors périmètre.

### API, modèles et fichiers

/api/products GET/POST, /:id GET/PATCH, /:id/image GET/PUT. /api/stocks GET, /summary, /options, /:id, /movements, /alerts et PATCH /:id/threshold. /api/stock-deposits GET/POST, /:id GET, /:id/confirm|cancel POST. /api/stock-withdrawals GET/POST et /:id GET. /api/stock-reservations GET/POST, /:id GET, /:id/release|consume POST. /api/stock-transfers GET/POST, /:id GET, /:id/dispatch|cancel|receive POST, /:id/incidents POST et /:id/incidents/:incidentId/resolve POST. /api/inventories GET/POST, /:id GET, /:id/count|submit|approve|reject POST. PATCH /api/company/partners/:id/agencies complète le partage. Corps, versions, permissions et états détaillés dans les guides.

Product, Stock, StockMovement, StockReservation, Transfer, TransferItem et TransferEvent réutilisés. Six modèles nouveaux : StockDeposit, StockDepositItem, StockWithdrawal, TransferIncident, InventorySession, InventoryItem. 56 modèles et 13 migrations au total. Ajouts 20261028150000_stock_operations, 20261028151000_transfer_return_quantities, 20261028152000_stock_legacy_states. Les nouveaux champs dérivés normalisent les anciens états fermés, sans changer les soldes ou mouvements passés; les FK contextuelles lient précisément lignes de dépôt et incidents. Les FK SQL scalaires doivent être préservées lors des prochaines migrations.

Code : api/src/modules/products, api/src/modules/stocks (service/read/access/routes/validation/permissions), api/tests/database/{products,stocks}.database.test.ts, shared/stocks.ts, webapp/src/stocks et mobileapp/src/stocks. Intégrations limitées aux permissions/seed, routeur, navigation, partage des agences et helper d'image. Le routeur de stock filtre ses préfixes avant authentification pour préserver les autres routes publiques.

### Vérifications exécutées et limites

Suite complète : 119 tests MySQL réussis, 32 tests API/Auth/HTTP/SMTP, 9 tests de navigation; 160 tests distincts, aucun échec. Le catalogue est aussi rejoué après la correction des PATCH partiels : 8 tests passent, sans double comptage. Le nouveau moteur totalise 25 tests TAP (24 sous-tests et parent).

Les vérifications couvrent SKU/ownership/images/versions, brouillon et confirmation unique, annulation intégrale d'un dépôt dont une ligne échoue, quantités invalides, sur-sortie, réservations concurrentes, double libération/consommation et droit de sortie, transferts et réception partielle, conservation du transit, incidents isolés, cible d'agence autorisée, retour distinct de perte, inventaire périmé et correction sous réservations refusée, immutabilité SQL, isolation entreprise/agence/boutique, abonnement expiré et autre transporteur, totaux cohérents pendant départ et réception concurrents.

API : types source/tests/outils de recette, lint/build/validation Prisma réussis. Web : build/lint et navigation réussis. Expo SDK 57 : types/lint, cohérence de la matrice locale et export Web réussis; le contrôle des dépendances est exécuté hors ligne avec son avertissement explicite. Aucun changement de dépendance native ou d'identifiant. Pas de téléphone physique, build signé, CI distante ou déploiement déclaré validé.

Recette réelle : RECETTE-EXPO-DEPOT-9 créé depuis Expo, 12 T-shirts et 5 sacs. Brouillon : zéro stock sur le Web. Confirmation physique : 17 physiques, zéro réservée, 17 disponibles, zéro transit. Deux mouvements Web conservent référence, gestionnaire et soldes 0→12/0→5. Aucun message d'erreur Expo sur ce parcours. Captures dans docs/previews/bloc9-*.png. Les traces et comptes de test aléatoires restent privés dans .local-preserved/bloc9.

Les migrations ont été appliquées uniquement à la base MySQL 8.4.13 de test existante, sans nouvelle base ni réinitialisation. Empreintes : 13 migrations appliquées identiques aux fichiers; logos officiels, dix migrations antérieures et dépendances mobiles protégés inchangés. Les fichiers .env sont conservés.

Limites : inventaire de 500 lignes/session et opérations multi-produits de 100 lignes, unités entières sans conversion/valorisation, alertes dans l'application sans e-mail proactif de seuil, image produit sur Web. Les écritures sont sérialisées par entreprise et les compteurs HTTP par processus. Une recette Android/iOS sur appareil et une évaluation de débit restent à effectuer avant exploitation importante.

Le Bloc 10 devra lier les réservations aux vraies commandes/transitions logistiques et réutiliser le nouveau moteur, pas exposer le primitif historique du Bloc 2 sans les nouveaux gardes. Aucun ordre complet, dispatch livreur, livraison, encaissement, OTP, suivi public ou rapport logistique avancé développé. Aucun Bloc 10 ni déploiement.

Documents : PRODUCT_CATALOG.md, STOCK_MANAGEMENT.md, STOCK_MOVEMENTS.md, STOCK_TRANSFERS.md, INVENTORY_MANAGEMENT.md et BLOC-9-RAPPORT.md (commandes de vérification et limites). Historique précédent conservé.

Contrôle boutique final : stocks en lecture seule chez deux transporteurs (24 au total, soit 17 et 7). Le filtre du second conserve seulement ses 7 unités. Les agences homonymes sont distinguées par leur entreprise. Capture docs/previews/bloc9-boutique-multi-transporteurs.png. Les 25 tests du moteur ont été rejoués après les derniers filtres et passent, sans les recompter dans le total de 160 tests distincts. Les captures de réception Expo, stocks Web et mouvements sont également conservées.

Clôture de recette : export Expo Web final réussi (12 routes), vérifications de types/lint/build terminées, serveurs temporaires arrêtés. Aucun déploiement. Données MySQL et traces de test conservées.

## Bloc 10 — Gestion des commandes et destinataires

Date : 28 octobre 2026. Objectif : enregistrer les demandes de livraison des boutiques et des opérateurs autorisés, avec coordonnées historiques et réservations exactes. Le journal, les modèles et les modules existants ont été examinés avant réalisation. Authentification, contextes, abonnements, collaborations, Design System et moteur de stock sont réutilisés, sans reconstruire les applications.

### Fonctionnement métier et parcours

Deux types : ONE_OFF décrit la collecte (adresse/contact/téléphone/instructions) et des articles libres ou du catalogue, sans réservation ; FROM_STOCK utilise des produits actifs distincts de la boutique dans une agence explicitement partagée. La création officielle réserve le stock dans la même transaction que commande, articles, audit, historique et avis. Le physique reste inchangé. Une ligne insuffisante annule l'ensemble ; les réservations concurrentes ne dépassent pas le disponible.

La boutique peut travailler depuis son contexte autonome et choisir un transporteur, ou conserver le transporteur de son contexte actif. L'opérateur choisit une boutique partenaire et son agence autorisée. Quatre étapes Web/Expo : prise en charge ; destinataire ; articles/colis/montant ; récapitulatif et brouillon ou validation. Référence publique serveur DND-année-UUID, contrainte unique MySQL et créateur authentifié conservés. Aucune consultation publique par simple référence.

Le brouillon isDraft=true est distinct de la demande soumise, sans nouvelle machine logistique. Il ne réserve rien et ne crée aucun avis d'enregistrement. Il est éditable, soumissible après revalidation et abandonnable selon permissions. Le mécanisme actuel sauvegarde un contenu complet valide, sans autosauvegarde partielle ni file hors ligne persistante.

Seuls PENDING et CANCELLED sont gérés par les actions préalables du bloc. Une édition versionnée conserve entreprise/boutique et, après soumission, les coordonnées du destinataire. Articles, quantités, agence/type, collecte, colis, instructions et montant sont modifiables tant que PENDING sans Delivery. Modifier articles/agence/type libère et recrée les réservations atomiquement ; un échec restaure l'ancien état. Les anciennes lignes sont conservées inactives. Une modification financière seule avec articles inchangés ne touche pas au stock.

L'annulation demande un motif et une confirmation, conserve auteur/date/ancien/nouveau statut et libère les réservations une seule fois. Les réservations liées ne peuvent plus être libérées ou consommées séparément dans les routes manuelles du Bloc 9. Aucune sortie physique, affectation ou livraison automatique. Une collaboration terminée peut être clôturée depuis le contexte boutique autonome avec droits actuels, agence active et abonnement valide. Après expiration, les écritures restent interdites et les lectures autorisées sont conservées.

### Destinataires et montants

Nom, e-mail, téléphone international, pays, ville et adresse sont obligatoires. Quartier, repère, instructions d'accès, date/heure souhaitée, observations et GPS sont facultatifs. Le destinataire n'a pas besoin de compte. Validation syntaxique internationale +7 à +15 chiffres et normalisation des séparateurs, sans préfixe camerounais imposé. E-mail/adresse/GPS sont contrôlés côté clients et API ; les dates souhaitées sont normalisées en UTC.

Répertoire explicitement enregistré, lié à la boutique et au transporteur, recherche paginée ; l'agence voit les fiches utilisées dans ses propres commandes. Aucun partage entre boutiques ni fusion automatique par e-mail/téléphone. Une fiche peut être modifiée par API avec version sans changer les snapshots des commandes soumises, protégés également par trigger SQL. Le Web/Expo propose la réutilisation et la saisie, sans écran séparé d'administration de répertoire.

Encaissement attendu en DECIMAL(19,4), transmis en chaîne décimale ; zéro sans encaissement, strictement positif sinon, devise de trois lettres. Aucun paiement déclenché, aucune déclaration d'argent reçu ni statut payé ajouté.

### Acteurs, écrans, API et fichiers

company_admin/agency_manager : orders.read/create/edit/cancel. agency_employee : read/create/edit. shop_owner/shop_manager : shop.orders.read/create/edit/cancel ; shop_employee : read/create/edit. Stock/livreur/global n'obtiennent pas de droit de commande supplémentaire. Les menus du contexte boutique autonome utilisent shop.orders.* ; l'autorisation d'une commande ne donne pas la gestion générale du stock. Compte, affiliation, entreprise, boutique, collaboration, agence partagée, produit et abonnement sont relus côté serveur.

Web : Commandes reçues/Mes commandes, compteurs réels, nouvelle commande, brouillons, filtres/référence/destinataire/dates/type/encaissement/boutique/agence/transporteur, pagination/tri, fiche, réservations, édition, annulation et historique. Expo : mêmes opérations essentielles, raccourcis Créer/Commandes pour boutique, sélecteurs, catalogue et répertoire paginés, récapitulatif, gestion d'erreur réseau conservant la saisie et remontée au début des étapes/messages. La clé client reste stable pendant une même saisie ; les doubles validations identiques retrouvent la même commande, un contenu différent sous la même clé est refusé.

Endpoints sous /api : GET/POST orders ; GET orders/options, orders/catalogue, orders/drafts ; GET/PATCH orders/:id ; POST orders/:id/submit et /cancel ; GET orders/:id/history et /items ; GET/POST recipients ; GET/PATCH recipients/:id. Corps Zod stricts, protections CSRF/origine/sessions et limitations HTTP existantes. Aucun endpoint public de suivi ni de changement logistique arbitraire.

Code : api/src/modules/orders (service/access/validation/routes/permissions/notifications et repository préparé conservé), api/src/jobs/orders.ts, api/tests/database/orders.database.test.ts, shared/orders.ts et orders.test.mjs, webapp/src/orders et mobileapp/src/orders. Intégrations dans routeur, seed, navigation, fournisseurs de données conditionnels et garde des réservations liées. L'outbox ORDER_SUBMITTED utilise Notification et le SMTP existants : bail, tentatives bornées, reprise différée et annulation avant envoi si commande annulée. Un échec SMTP ne supprime pas la commande ; le job orders:notifications ne promet pas un envoi exactement une fois.

### Modèles et migrations

56 modèles conservés ; Recipient, Order, OrderItem et OrderEvent étendus, StockReservation lié aux vrais articles. Trois migrations additives : 20261028160000_order_management, 20261028161000_order_permissions, 20261028162000_order_permission_metadata ; seize au total. Préserver la FK SQL scalaire Recipient.shopId vers Shop et les triggers d'historique/snapshot. Les treize migrations antérieures restent intactes.

L'application initiale en test a nécessité de rétablir le réglage MySQL permettant les triggers avec journal binaire, de terminer les instructions restantes puis de résoudre la migration comme appliquée. Les deux migrations complémentaires corrigent les droits et les dates techniques invalides produits par l'insertion initiale IGNORE. Toute la série est nécessaire ; le passage final vérifie seize checksums concordants et un état à jour. Même base MySQL 8.4.13 dédiée existante, aucune nouvelle base, suppression de données, remise à zéro ou migration de production.

### Tests, recette, limites et suites

Résultat final : 146 tests MySQL, dont 27 tests TAP du module commandes ; 32 tests API/Auth/HTTP/SMTP ; 14 tests partagés. Total distinct 192 réussis, aucun échec, sans recompter les rejouages ciblés. Couverture : deux types, multiples articles, rollback complet, concurrence 4+4 sur 5, clés de rejeu, brouillons/soumission, quantités/versions/changement d'agence, annulation/libération unique, historique immuable, réservations liées protégées, profils/snapshots sans fusion, contacts internationaux, montants exacts, références concurrentes, permissions/périmètres, collaboration inactive, expiration, catalogue isolé, édition financière sans mouvement et échec/reprise de notification. Les suites précédentes restent exécutées ; seule la fixture d'intégrité à montant positif indique désormais explicitement collectionRequired=true, ses assertions étant conservées.

API : typecheck source/tests/outils, lint, build, Prisma validate et migrations à jour. Web : build/lint et tests partagés. Expo SDK 57 : types/lint, contrôle local de dépendances hors ligne avec son avertissement explicite, puis exports Web/Android/iOS réussis (Hermes pour natif, douze routes Web). Le premier export natif a échoué sur un droit de fichier temporaire du compilateur ; son rejeu autorisé avec TEMP/TMP dans le dossier privé du projet réussit. Aucune dépendance native ni identité com.goulbam.dnddelivery changée ; pas de nouveau Doctor revendiqué sans changement natif.

Recette réelle : commande DND-2026-883F2E34E7EC4B03A9B40C4C53C99753 saisie depuis Expo Web. Coupure API volontaire : erreur visible et récapitulatif conservé ; reprise de la même saisie en brouillon. Le Web voit alors 17 physiques/0 réservée/17 disponibles. Soumission Expo de trois T-shirts : 17 physiques/3 réservées/14 disponibles et même commande visible par l'entreprise. Annulation motivée Expo : historique conservé, réservation libérée, Web de nouveau à 17/0/17. Captures docs/previews/bloc10-*.png. L'aperçu navigateur ne vaut pas une installation sur téléphone. Un avertissement Metro provient du redémarrage volontaire, aucune erreur applicative nouvelle sur le parcours.

Empreintes : 24 fichiers protégés inchangés, comprenant anciens SQL, logos et dépendances mobiles. Les .env sont conservés. Traces et comptes aléatoires restent privés dans .local-preserved ; les serveurs temporaires sont arrêtés après vérification. Aucune publication, CI distante, signature, appareil physique, envoi SMTP externe ni déploiement déclaré validé.

Limites : brouillon complet sans autosauvegarde partielle, 100 lignes, unité entière, pas de conversion financière, répertoire éditable par API, écritures sérialisées par entreprise et limites HTTP par processus. Le Bloc 11 devra ajouter la prise en charge et la consommation physique transactionnelle ; le Bloc 12, encaissements et remises réels ; le Bloc 13, suivi public sécurisé et notifications complètes. Aucun de ces blocs développé.

Documents : ORDER_MANAGEMENT.md, ORDER_WORKFLOWS.md, RECIPIENT_MANAGEMENT.md, ORDER_STOCK_INTEGRATION.md et BLOC-10-RAPPORT.md. Historique antérieur conservé.

## Bloc 11 — Dispatching, missions livreurs et suivi logistique

Réalisation du 28 octobre 2026 dans le projet existant. Journal, modèles et circuits des Blocs 9/10 examinés avant modification. Objectif : organiser les missions et suivre la garde réelle du colis depuis collecte jusqu’au retour ou à l’attente de preuve, avec API/Web/Expo connectés à MySQL. Rapport complet : [BLOC-11-RAPPORT.md](BLOC-11-RAPPORT.md).

### Missions, dispatching et garde

Une Delivery et un colis principal à référence unique par commande soumise PENDING ; les brouillons et doublons sont refusés. File des commandes sans mission, compteurs/filtres/recherche/pagination MySQL, candidats éligibles avec disponibilité déclarée et charge calculée séparées. Compte actif, entreprise/agence/affiliations actives, profil ACTIVE et AVAILABLE et abonnement valide sont requis. Plusieurs missions actives permises.

Affectation sans remise physique. Réaffectation avec motif : avant enlèvement, clôture/renouvellement d’affectation ; après enlèvement, proposition ParcelHandover et confirmation par le nouveau livreur après réception réelle. Refus ou annulation de proposition conserve l’ancien détenteur ; acceptation endommagée transfère la garde réelle et ouvre un incident bloquant. Auteur/date/motif et anciennes affectations conservés, une seule affectation/remise/étape active applicable.

Delivery distingue agencyId opérationnelle, phase et custodyType/custodyAgencyId/custodyUserId ; Order garde son agence d’origine. Enlèvement, départ, arrivée agence puis réception réelle, distribution finale et arrivée destinataire sont explicites. Déclarer une arrivée ne change pas automatiquement la garde. L’arrivée et l’initiation de confirmation restent AWAITING_PROOF/AWAITING_CONFIRMATION ; aucune livraison définitive DELIVERED sans la preuve prévue au Bloc 13.

### Stocks et acheminement

Préparation, création et affectation ne sortent rien. Au premier enlèvement depuis stock ou premier départ inter-agences, validation exacte des réservations et articles, puis StockService du Bloc 9 écrit ISSUE (-Q physique, -Q réservé) et marque CONSUMED dans la même transaction. Rejeu, réaffectation et enlèvement après transit ne reproduisent jamais la sortie. Une commande ponctuelle ne touche pas au stock.

ParcelLeg trace source, destination prévue, transporteur, départ/réception/condition, réceptionnaire et lieu réel. DRAFT ne déplace rien ; abandon motivé seulement avant départ. IN_TRANSIT donne la garde au transporteur ; GOOD à réception ferme le trajet et donne la garde à l’agence, sans entrée de catalogue. DAMAGED bloque ; REFUSED conserve le transporteur et signale l’incident. Après incident, le retour réel du transport à l’origine peut être réceptionné avec motif et receivedAgencyId/returnedToOrigin explicites. Plusieurs étapes successives et livreurs de transport/final distincts sont supportés. Ce circuit n’est pas StockTransfer du Bloc 9.

### Tentatives, incidents et retours

Tentative échouée avec catégorie/raison, auteur/date et historique immuable ; aucun crédit de stock. DeliveryIncident suit descriptions, blocage, version, décision et responsable. Le responsable décide RETRY/REASSIGN/RETURN/NOTE avec motif ; les autres blocages doivent être traités avant reprise. Incident avant collecte : reprise depuis la garde boutique, sans sortie artificielle. Incidents et tentatives ne sont jamais supprimés.

DeliveryReturn : demande motivée, agence de retour, trajet/arrivée, réception physique, état, réceptionnaire et dates. Réception intacte sans réintégration par défaut ; DAMAGED en quarantaine hors disponible. Réintégration autorisée explicite via RETURN (+Q physique), limitée aux réservations CONSUMED, agence d’origine et quantités reçues ; double crédit interdit. Restitution boutique motivée uniquement si non déjà réintégré. Aucune réintégration directe des retours endommagés. Les agences qui détiennent ou attendent encore un colis/retour non résolu sont protégées contre la désactivation.

### Sécurité, expiration et notifications

Droits actuels relus côté serveur ; écritures restreintes à l’agence réellement concernée. company_admin/agency_manager supervisent et affectent ; agency_employee prépare/réceptionne/signale ; stock_manager prépare/réceptionne sans dispatching ni montants ; courier agit seulement sur ses missions de l’agence choisie et accepte sa propre remise ; les rôles boutique lisent shop.deliveries.read. Aucun dispatching implicite super_admin. DTO boutique réduit, notes internes masquées, montants avec droit explicite ; historique personnel après retrait réduit sans coordonnées du destinataire.

Après expiration, nouvelles affectations, préparation, enlèvement, reprise et nouveaux trajets bloqués. Clôture limitée du colis pris en charge avant échéance par livreur courant ou company_admin : progression, incident, retour/réception contrôlée, jamais nouvelle réintégration de stock sans abonnement valide. Compte/affiliations restent requis ; abonnement suspendu/annulé ne permet pas cette exception. Les anciennes missions sans phase conservent leur historique et restent sans actions de reconstruction.

Notification existante réutilisée avec source DELIVERY_. Outbox atomique et job deliveries:notifications, SMTP existant, bail/reprise différée/cinq essais maximum. Échec d’envoi sans perte de mission. Adaptateur push prévu ; infrastructure absente, avis PUSH en attente et visibles dans l’application, aucun push effectif revendiqué. Pas de garantie d’envoi exactement une fois.

### Interfaces et API

Web : Livraisons, Dispatching, Acheminements inter-agences, Incidents, Retours, fiches complètes/chronologie et suivi intégré aux commandes/boutique. Expo : accueil personnel, Mes missions, fiche, enlèvement/étapes/tentatives/incidents/retour, remises à accepter, historique et avis ; modules opérateur de dispatching et réception. Formulaires pleine page, sélecteurs existants et filtres repliables. Actualisation active toutes les 30 secondes et retour au premier plan, dernières données conservées après erreur. Saisie/version/clé stables en reprise ; pas de file hors ligne. Liens Maps sur action, aucun GPS permanent. Logos, Design System et dépendances natives conservés.

API sous /api : GET deliveries/options, queue, eligible-drivers, notifications, by-order/:orderId, liste/fiche/historique ; POST deliveries puis assign/reassign/prepare/receive/retry/cancel ; transfers et dispatch/cancel/receive ; incident et incidents/:id/resolve ; return et receive/reintegrate/shop ; handovers/:id/cancel. Alias driver/missions pour lectures et pickup/events/attempt/incident ; driver/handovers et confirm. Liste complète/corps dans DELIVERY_MANAGEMENT.md. Sessions/origine/CSRF/limites de débit/no-store conservés. Transactions sérialisées par entreprise, versions et clés de rejeu ; contenu différent sous la même clé refusé, événements/audit/mouvements/outbox atomiques.

### Modèles, migrations et changements antérieurs

61 modèles : Delivery, DeliveryAssignment, DeliveryEvent étendus ; ParcelLeg, ParcelHandover, DeliveryAttempt, DeliveryIncident, DeliveryReturn ajoutés. Séquences immuables, relations contextuelles et emplacements actifs uniques. Migrations additives 20261028170000_delivery_operations, 20261028171000_delivery_event_sequence et 20261028172000_parcel_receipt_location. Dix-neuf appliquées sur la même base MySQL 8.4.13 dédiée existante, checksums tous concordants. Seize anciennes migrations inchangées, aucune nouvelle base/reset ni production.

Fichiers principaux : api/src/modules/deliveries, api/src/jobs/deliveries.ts, api/tests/database/deliveries.database.test.ts et tests/serve-delivery-preview.ts ; shared/deliveries.ts, delivery-actions.ts et delivery-actions.test.mjs ; webapp/src/deliveries et mobileapp/src/deliveries. Note explicite sur l’existant : intégration du suivi dans les fiches de commande Bloc 10 ; réutilisation du moteur de stock Bloc 9 ; extension de la protection des agences Bloc 7 ; adaptation limitée de assertSafeClosure pour les phases physiques Bloc 11 en conservant la politique héritée ; navigation par droits explicites ; chargement différé du module administratif Web pour garder le bundle principal à 418,29 kB sans avertissement de taille. Les données, endpoints et restrictions antérieurs restent soumis aux suites de régression.

### Vérifications et recette

178 tests MySQL réussis, dont 32 TAP logistiques ; 32 API/Auth/HTTP/SMTP ; 22 tests partagés. Total distinct 232 réussis, zéro échec, sans recompter les rejouages ciblés. API typecheck source/tests/outils, lint, build, validation Prisma ; Web build/lint ; Expo SDK 57 typecheck/lint/matrice locale/install --check et exports Web/Android/iOS (12 routes Web) réussis. 27 empreintes de migrations/assets/dépendances protégés inchangées. Commandes et journaux privés documentés dans BLOC-11-RAPPORT.md.

Recette réelle Web/Expo Web sur API/MySQL locaux : création depuis la file, affectation et préparation (T-shirt physique12/réservé2), enlèvement Expo avec observation, coupure volontaire API et formulaire conservé, reprise avec une seule sortie (10/0), échec motivé sans crédit, demande de retour Web, départ/arrivée Expo, réception intacte Web sans crédit automatique (10/0), réintégration explicite (12/0), incident résolu et onze événements conservés. Sac de voyage inchangé à5. Historique personnel Expo masque le destinataire après fin d’affectation. Preuves ui-evidence.jsonl et captures conservées dans .local-preserved/bloc11. Parcours inter-agences/remise/proof-pending validés par MySQL, pas présentés comme une recette UI supplémentaire.

### Limites et suites

Un colis principal et un retour par mission ; pas d’optimisation de tournées ni rapports avancés. Annulation maintenue aux phases autorisées avant prise en charge ; l’extension à FAILED a été refusée par le contrôle automatique pour risque de libération de stock prématurée et reste absente. Les échecs passent par décision responsable/reprise/retour contrôlé. Les anciens tableaux généraux restent explicitement préparatoires ; les nouveaux modules logistiques ont leurs compteurs réels.

Expo hors ligne affiche son avertissement habituel de validation moins fiable ; aucune matrice supprimée ni dépendance modifiée. Première tentative d’export bloquée au démarrage Metro, relance réussie avec deux tâches et dossier temporaire local. Aucun nouveau Doctor revendiqué faute de changement natif ; bundles Hermes exportés, pas de signature/installation appareil. Recette Expo Web de bureau, pas de téléphone physique/viewport téléphone certifié ni CI distante. Pas de push ni SMTP de production validé. Données de test conservées, services de recette arrêtés après vérification.

Bloc 12 reste à réaliser pour déclarations/remises/rapprochements financiers ; montant attendu seulement. Bloc 13 reste à réaliser pour OTP/photo et preuve finale ; AWAITING_PROOF n’est pas DELIVERED. Aucun portail public complet, aucune production et aucun passage au Bloc 12 sans nouvelle instruction.

## Bloc 12 — Encaissements et remises de fonds

Date : 29 octobre 2026. Objectif : tracer les fonds externes de la mission jusqu’à leur réception distincte à l’agence, avec responsabilités, soldes, écarts et audit. La nouvelle instruction autorise ce bloc ; les constats historiques des blocs précédents restent conservés ci-dessus.

### Fonctionnalités et règles réellement livrées

Le livreur peut consulter l’attendu de sa mission prise en charge et déclarer le montant réellement reçu, en plusieurs fois, y compris nul ou excédentaire avec motif. Une déclaration ne vaut pas réception agence ni livraison finale. Les montants sont exacts à quatre décimales et séparés par devise.

Le livreur sélectionne ses encaissements disponibles et peut annoncer une remise partielle ou regroupée. Les allocations sont réservées sans réduire sa responsabilité. Un responsable distinct confirme les montants effectivement reçus, constate un écart, rejette ou demande une nouvelle déclaration. Les décisions et originaux sont conservés ; auto-confirmation, double décision et sur-engagement concurrent sont refusés.

Brut = déclaré original plus corrections approuvées ; net client = brut moins remboursements livreur/agence ; reste client = attendu moins net, borné à zéro. Responsabilité livreur = brut moins ses remboursements et les fonds reçus par l’agence ; disponible = responsabilité moins remises en attente. Fonds nets agence = reçus moins ses remboursements. Le remboursement par l’agence ne recrée pas de dette livreur.

Écarts automatiques ou signalés, résolution motivée et historique immuable. Corrections COLLECTION/RECEIPT/EXPECTED, remboursements externes REFUND/AGENCY_REFUND et dérogation EXCEPTION demandent une validation d’entreprise indépendante. EXCEPTION conserve les instantanés attendu/net et ne dispense pas du solde ; un changement de montant rend la décision inapplicable. Échec, retour, réaffectation et changement d’agence ne suppriment ni ne transfèrent les fonds historiques.

### Acteurs, interfaces et sécurité

Entreprise : supervision et décisions autorisées ; agence : son périmètre ; livreur : sa mission actuelle et sa responsabilité historique ; boutique : ses propres commandes avec informations internes masquées. Permissions financières explicites, droits relus en transaction, version/idempotence et contrôles HTTP existants. Régularisation des fonds existants possible après abonnement expiré ; aucune nouvelle opération commerciale autorisée. Profil livreur suspendu : droits limités au règlement historique. Désaffiliation bloquée en présence de responsabilité ou régularisation ouverte.

Web : Encaissements, Remises, Soldes, Écarts, Régularisations, Historique et Avis ; suivi boutique et résumés commande/livraison. Expo SDK 57 : mêmes opérations autorisées, onglets Encaissements/Remises prioritaires, déclarations, sélection paginée, réception distincte et conservation du formulaire après erreur réseau. Avis intégrés et job SMTP différé avec reprise et revalidation des destinataires ; aucun push effectif revendiqué sans adaptateur.

### API, modèles, fichiers et ajustements des blocs antérieurs

GET financial-options/overview/obligations/history/notifications, collections et cash-remittances avec détails ; POST driver/collections et driver/cash-remittances ; décision cash-remittances/:id/decision ; listes/créations financial-corrections et financial-discrepancies, décisions de correction et résolution d’écart, sous /api. Contrats détaillés dans les quatre guides financiers.

64 modèles Prisma et 21 migrations. Collection, Remittance, RemittanceItem et événements réutilisés ; FinancialCorrection, FinancialDiscrepancy et FinancialEvent ajoutés. Migrations 20261029080000_operational_finance et 20261029081000_financial_refund_origin appliquées à la base locale de test existante, sans reset. Les 19 SQL antérieurs restent inchangés. Anciennes lignes non rapprochables conservées en lecture seule et exclues des nouveaux soldes.

Fichiers : api/src/modules/collections, api/src/jobs/collections.ts, shared/finance.ts et finance-actions.ts, webapp/src/finance, mobileapp/src/finance et leurs tests. Blocs précédents ajustés : instantanés financiers des affectations ; garde-fous de désaffiliation et droits de règlement des profils suspendus ; résumés financiers des fiches commande/livraison ; navigation financière prioritaire. mobileapp/tsconfig.json autorise les imports .ts du code partagé testé directement. Aucun package natif, logo ou .env modifié.

### Tests exécutés et recette

216 tests MySQL réussis dont 38 TAP financiers, 34 API/Auth/HTTP/SMTP, 33 partagés : total distinct 283 réussis, zéro échec final. Régressions antérieures incluses. API typecheck source/tests/outils, lint/build/Prisma ; Web build/lint ; Expo typecheck/lint/install --check/matrice SDK 57 et exports Web/Android/iOS réussis. 21 empreintes de migrations appliquées concordantes, 33 fichiers protégés inchangés ; contrôle structurel natif sans texte brut sous View/Card.

Recette réelle Web/Expo Web : attendu 25 000 XAF, saisie partielle 20 000 sur Expo, coupure volontaire API avec montant/observation conservés, reprise et une seule déclaration ; remise annoncée 15 000 ; autre compte responsable constate 14 000 avec écart. Soldes MySQL et Web : reste client 5 000, responsabilité livreur 6 000, reçu agence 14 000, engagé 0. Une déclaration et une remise, mission toujours IN_PROGRESS/FINAL_DISTRIBUTION, zéro preuve. Deux écarts restent ouverts dans cette recette conservée. Captures et ui-evidence.jsonl sous .local-preserved/bloc12. Corrections/remboursements/résolutions et autres parcours validés par MySQL, sans les présenter comme des recettes UI supplémentaires.

### Problèmes rencontrés, limites et suites

Chargement Prisma en conflit avec sa génération concurrente : relance isolée finale réussie. Export Hermes initial refusé dans le temporaire Windows : relance réussie avec TEMP/TMP local au projet. Expo hors ligne avertit de sa validation moins fiable ; matrice conservée, aucune vérification supprimée. Aucune dépendance native changée et aucun nouveau Doctor revendiqué. Exports Hermes sans application signée/installée ; recette Expo Web de bureau, sans téléphone physique ni viewport téléphone certifié. SMTP local vérifié, production/push non validés. Données conservées et services de recette arrêtés à la fin.

Aucun transfert d’argent, règlement boutique/transporteur, rapport avancé du Bloc 15, OTP/photo obligatoire ou suivi public complet. Le Bloc 13 reste nécessaire pour la preuve finale ; aucun passage à ce bloc ni déploiement en production. Rapport et commandes réellement exécutées : [BLOC-12-RAPPORT.md](BLOC-12-RAPPORT.md). Guides : COLLECTION_MANAGEMENT.md, CASH_REMITTANCES.md, FINANCIAL_DISCREPANCIES.md et FINANCIAL_PERMISSIONS.md.


## Bloc 13 — Confirmation OTP, preuves de livraison et suivi destinataire

### Objectif et résultat — 29 octobre 2026

Compléter les commandes, la garde physique et les encaissements existants par une remise finale contrôlée, des preuves privées et un suivi personnel du destinataire. Implémentation dans les applications existantes ; aucun déploiement ni Bloc 14.

Le suivi Web `/suivi` accepte référence et e-mail avec réponse générique, envoie éventuellement un lien à l’adresse enregistrée et n’expose jamais une commande par sa référence seule. Liens aléatoires hachés/chiffrés, expiration 30 jours, session de lecture hachée 24 heures, cookie HttpOnly, quotas persistants, révocation/version et renouvellement audités. Chronologie réelle, aucune donnée de salarié, adresse, photo ou position GPS publique. Actualisation visible toutes les 30 secondes, erreurs réseau et retour en ligne traités.

Les OTP de six chiffres sont générés par crypto au serveur, comparés avec HMAC et conservés chiffrés seulement pour le message destinataire. Disponibles à la distribution finale sur affectation et garde valides, expiration 30 minutes, validation de remise 10 minutes maximum, cinq essais, verrouillage quinze minutes et renouvellements bornés. Ils sont révoqués au changement de garde/tentative ou au renouvellement du suivi, consommés à la remise et non divulgués aux interfaces internes. Les messages de création n’incluent pas d’OTP prématuré.

Les photographies sont prévisualisées puis envoyées séparément : JPEG/PNG/WebP, 5 Mo et 16 millions de pixels maximum, normalisation WebP jusqu’à 1 920 pixels sans EXIF. Date serveur, auteur, affectation et empreintes persistés. Adaptateur de stockage privé local derrière une interface remplaçable ; lectures authentifiées avec contrôle multi-tenant et audit. Les images passent de READY à ATTACHED ou RETIRED. Une ancienne tentative ne peut pas fournir les photos d’une nouvelle remise. Les fichiers, liens et preuves attachés sont protégés contre la modification. Un nettoyage en simulation par défaut ne traite que les fichiers anciens sans référence MySQL.

Une seule méthode de clôture réussie contrôle mission, livreur, garde, incidents/transmissions, OTP valide ou exception approuvée, photographies et encaissements. L’exception OTP est demandée avec motif, approuvée/refusée avec motif par un autre responsable, valable une heure au maximum et exige deux photos différentes. La dérogation financière du Bloc 12 reste séparée. Clôture atomique avec preuve, code/exception consommé, affectation terminée, statut DELIVERED et garde RECIPIENT, événement et audit. Aucun stock ou fonds déplacé à cette occasion. L’échec sans OTP reste possible avec justificatif facultatif et procédure du Bloc 11.

### Acteurs, pages, API et fichiers

Entreprise/agence : lecture des preuves, gestion OTP, décisions d’exception et renouvellement du suivi dans leur périmètre. Livreur : sa mission affectée et physiquement prise en charge, saisie OTP, photos, demande d’exception et clôture. Boutique : uniquement preuves finales attachées et états des notifications de ses commandes chez le transporteur sélectionné. Authentification, appartenances actives, abonnement et suspensions sont revérifiés au serveur ; le frontend n’est jamais l’autorité.

Web : formulaire d’accueil intégré au suivi, `/suivi`, panneau de preuve sur la mission, file « Confirmations et preuves », suivi boutique. Expo : écran de confirmation OTP/photos/récapitulatif financier, demandes et décisions d’exception, réglage push dans Profil et navigation protégée montée à la racine, y compris au démarrage. Les photos sont conservées à l’écran en cas d’erreur d’envoi et les commandes conservent leur clé pour le réessai.

Routes publiques `/api/tracking` : POST `lookup`, `verify`, `:reference/code`, GET `:reference`. Routes privées `/api/deliveries/:id` : GET `confirmation`, `proofs`, `communications` ; POST `otp/verify`, `otp/resend`, `proofs`, `complete`, `otp-exceptions`, `otp-exceptions/:exceptionId/decision`, `tracking/renew`. Fichiers privés GET `/api/delivery-evidence/:id/file|preview`. Appareils GET/POST `/api/delivery-devices`, POST `/api/delivery-devices/revoke`. Permissions et détails dans les cinq guides du Bloc 13.

Fichiers centraux : `api/src/modules/confirmation/`, `api/src/jobs/confirmation.ts`, `proof-cleanup.ts`, `shared/confirmation.ts`, `webapp/src/tracking/TrackingPage.tsx`, `webapp/src/confirmation/ConfirmationPanel.tsx`, `mobileapp/src/confirmation/ConfirmationScreen.tsx`, `PushSettings.tsx`, `PushNavigation.tsx`. Les e-mails reprennent Notification et les travailleurs commandes/livraisons, modèles texte/HTML DND, tentatives historisées, bail et reprise ; SMTP accepté n’est pas délivrance. Push optionnel Expo lié à la famille de session, accès relus au traitement ; sans configuration, aucun envoi faussement réussi.

### MySQL, préservation et évolutions antérieures

70 modèles au lieu de 64 ; 25 migrations au lieu de 21. Ajouts : TrackingAccess, TrackingThrottle, OtpAttempt, OtpException, DeliveryEvidence, NotificationAttempt. Extensions des tables DeliveryOtp, DeliveryProof, FileAsset/ProofPhoto, Notification et UserDevice. Migrations `20261029090000_delivery_confirmation`, `20261029091000_push_session_binding`, `20261029092000_proof_asset_integrity`, `20261029093000_evidence_attempt_retirement`. Appliquées sur la base dédiée existante uniquement, sans reset ni suppression. Les 25 empreintes appliquées correspondent ; les 21 anciennes migrations restent inchangées.

Sur 33 fichiers protégés, seul `api/.env` change par ajout de DELIVERY_SECRET aléatoire ; ses octets antérieurs sont conservés. Les autres environnements et logos sont inchangés. Variables d’exemple ajoutées sans réencoder le fichier historique. Le journal antérieur est intégralement conservé en préfixe.

Blocs 10/11 modifiés précisément : notification d’annulation, enrichissement des modèles des travailleurs existants, hooks de révocation OTP/photos dans les opérations de garde, orientation des actions vers la clôture réelle et libellés DELIVERED/RECIPIENT. Bloc 12 : résumé et contrôle financier réutilisés sans nouveau transfert de fonds. Blocs 3/4 : navigation par permissions complétée, MIME binaire du client mobile et présentation de la garde corrigés ; aucune reconstruction ou substitution du Design System.

### Vérifications réellement exécutées et recette

343 tests distincts réussis : 263 MySQL de régression complète (dont 47 résultats du module confirmation), 38 API/HTTP et 42 partagés. Relance ciblée confirmation 47/47 après les derniers ajustements de sécurité, sans la compter à nouveau. Types sources/tests API, lint API/Web/Expo, compilations API/Web, Prisma validate et état des migrations réussis. Expo Doctor 21/21, matrice SDK 57 validée en ligne, export Android/iOS Hermes et 12 routes Web réussis. Logs et commandes reproductibles dans `BLOC-13-RAPPORT.md`.

Recette réelle sur navigateur de bureau et Expo Web : lien personnel puis saisie OTP, maintien de la mission ouverte, sélection/aperçu et envoi d’une image fictive de colis, message et sélection conservée lors de la coupure API, expiration de session/validation traitée par reconnexion/renouvellement. Refus serveur de clôture avec OTP et photo tant que 5 000 XAF restent à encaisser. Déclaration fictive du complément via l’écran financier, puis remise réussie : une preuve OTP et une photo, code consommé, commande/livraison DELIVERED, garde RECIPIENT. Attendu/net 25 000 XAF, agence reçue 14 000 XAF et dette du livreur 11 000 XAF après clôture. Le suivi public et les portails entreprise/boutique montrent la preuve réelle. Captures et observations MySQL conservées dans `.local-preserved/bloc13` ; identifiants et messages SMTP dans des fichiers privés non publiables.

### Erreurs corrigées, limites et suite

Après installation image-picker/notifications avec les outils Expo, une paire Expo/Router partiellement avancée provoquait une erreur d’export Web statique. Réalignement officiel SDK 57 : Expo 57.0.31, Router 57.0.29, React 19.2.3, RN 0.86.3, image-picker ~57.0.20 et notifications ~57.0.24. Doctor, matrice et exports passent sans suppression de contrôle. Corrections aussi de l’origine HTTP du suivi, MIME binaire, erreurs fichiers, aperçus React et écoute push globale. L’audit npm conserve 11 alertes (5 faibles, 3 modérées, 3 élevées) ; aucun changement forcé de SDK pour les masquer.

Aucune installation native signée, caméra physique ou réception push Expo externe validée. Le viewport téléphone demandé n’a pas changé les dimensions observées du navigateur ; aucun test sur vrai écran mobile revendiqué. SMTP capturé localement, sans preuve de délivrance en boîte externe. Circuit d’exception vérifié sur MySQL, sans seconde recette mobile manuelle de décision. Le stockage local exige droits et sauvegardes cohérentes ; l’e-mail reste au moins une fois en cas de crash après acceptation SMTP. Les services de recette sont arrêtés après vérification ; les données de test sont conservées.

Documentation : PUBLIC_TRACKING.md, DELIVERY_OTP.md, DELIVERY_PROOFS.md, DELIVERY_CONFIRMATION.md, DELIVERY_NOTIFICATIONS.md et BLOC-13-RAPPORT.md. Les prochains blocs pourront consommer preuves et événements existants ; aucun rapport avancé, GPS permanent, paiement électronique ou règlement entre boutique et entreprise n’est ajouté ici. Bloc 14 attend une nouvelle instruction.

Dernier contrôle HTTP : une relance sans accès réseau local a produit 9 erreurs de connexion et 29 succès ; relance avec cet accès : 38/38 dans api-tests-final.log. Le log de la tentative refusée est conservé séparément, sans suppression de test.

## Bloc 14 — Finalisation de l'application mobile

Date : 29 octobre 2026. Objectif : stabiliser et harmoniser l’application existante Expo SDK 57 pour les cinq rôles, sans reconstruire le métier ni modifier les migrations. Audit préalable des blocs et du journal, puis vérification de la matrice Expo officielle et des dépendances installées.

Transport API renforcé : délais bornés, annulation, erreurs réseau explicites, renouvellement unique des jetons concurrents, prévention des réponses d’un ancien contexte et des résurrections de session après déconnexion, stockage natif SecureStore et session Web en mémoire. Les écritures non confirmées ne sont pas présentées comme réussies. Contrats critiques de profil et d’espace vérifiés. Les formulaires et données d’un contexte précédent ne traversent pas la sélection d’entreprise/agence/rôle.

Interfaces harmonisées : navigation par permissions, accueil avec compteurs serveur, véritables abonnement et historique de paiement en lecture, notifications, champs montant/date/OTP, cases à cocher, clavier et zones sûres, sélecteurs recherchables et listes paginées. Actualisation limitée aux écrans opérationnels actifs ; valeurs de comptage conservées entre pages. Aucun paiement électronique ni nouvelle règle de stock ou de livraison.

Push : préférence explicite par utilisateur/appareil, enregistrement et rotation du jeton, révocation à la déconnexion, destination limitée aux missions ou remises autorisées après contrôle serveur. Adaptation minimale des notifications API des Blocs 11–13 ; réutilisation de l’outbox et du worker financier existants. Identifiants EAS et certificats réels requis ; aucune réception distante annoncée comme testée.

SDK : Expo 57.0.31, Router 57.0.29, React 19.2.3 et React Native 0.86.3. Date-time-picker 9.1.0 et system-ui ~57.0.4 alignés avec la matrice installée. Les builds natifs ont révélé des chemins C++ trop longs sous Windows et un ancien icon.png contenant du JPEG. Plugin CNG Windows avec CMAKE_OBJECT_PATH_MAX=256, vérifié sur génération neuve ; copie byte pour byte du logo officiel vers brand-logo.jpg et trois tests de signatures d’assets. Tous les originaux, fichiers .env, profils EAS, identifiants et 25 migrations préservés. Pas de modification de politique Windows ni de schéma MySQL (70 modèles).

Validation automatisée : 385 tests distincts réussis (268 base/MySQL, 42 API, 42 partagés, 33 mobile). Types source et tests, ESLint, compilation API/Web, validation Prisma, 25 migrations à jour, dépendances Expo et Doctor 21/21 : réussis. Exports finaux Android/iOS/Web réussis après les dernières corrections. Vérification de 41 fichiers TSX : aucune chaîne brute sous un conteneur natif. Un test API a dépassé son délai sous compilation lourde ; le passage complet après cette charge réussit sans modifier le délai. Audit npm : 12 alertes (6 faibles, 3 modérées, 3 élevées, 0 critique), conservées et documentées ; aucune rétrogradation SDK ou substitution forcée pour les masquer.

Recette réelle dans Expo Web avec API/MySQL : administrateur, responsable d’agence, gestionnaire de stock, boutique et livreur. Changement d’entreprise et d’agence, compteurs isolés, abonnement restreint, affectation éligible. Mission ponctuelle remise au destinataire avec OTP obtenu par son suivi sécurisé et photo fictive privée ; clôture DELIVERED, OTP CONSUMED, une photo. Encaissement de 5 000 XAF puis remise limitée à ce montant confirmée par un responsable distinct ; reste et dette de cette mission à zéro. Les 11 000 XAF historiques dus du Bloc 13 restent séparés.

Stock : dépôt de 5 unités confirmé, restitution de 1, transfert de 2 avec départ puis réception séparés, inventaire 2/2 soumis par le gestionnaire et approuvé par l’administrateur distinct. Boutique : transporteurs Centre et Autre transporteur avec stocks différents, commande ponctuelle annulée avant collecte avec motif, commande depuis stock réservant réellement une unité. Relecture finale : dépôt CONFIRMED, transfert RECEIVED, inventaire APPROVED ; ponctuelle CANCELLED, depuis stock READY ; Douala 14 T-shirts physiques/1 réservé et 5 sacs, Yaoundé 2 T-shirts/0 réservé. La mission depuis stock préparée pour la recette native reste non livrée.

Android : APK debug x86_64 compilé et installé ; deux démarrages ont rencontré un ANR avec pression mémoire/CPU et ANR de composants système. APK autonome avec code embarqué compilé ensuite (12 min 30, 534 tâches, 46 234 886 octets), installé et lancé sans Metro : accueil officiel et navigation vers connexion observés sur l’AVD API 35. La saisie native est restée non fiable (presse-papiers et caractères transformés par le clavier de l’environnement) ; connexion native, restauration SecureStore et caméra native non validées. Autorisation du simulateur reçue. Aucun résultat natif complet déduit du succès Web.

L’APK autonome est réservé à la recette locale : x86_64, signature de développement, URL de test locale. Son exception HTTP vise uniquement 127.0.0.1 et reste dans le projet natif archivé ; la nouvelle génération CNG ne la contient pas. Les sources android/ios générées sont sorties du dossier applicatif. Pas de publication, de certificat de production ou de build cloud. Pas d’iPhone ni de téléphone physique ; caméra physique, permissions, push FCM/APNs, ouverture à froid, grande police et lecteur d’écran restent à tester avant diffusion. Les alertes npm compatibles doivent être traitées avant cette diffusion.

Documentation livrée : MOBILE_ARCHITECTURE.md, MOBILE_NAVIGATION.md, MOBILE_API_INTEGRATION.md, MOBILE_NOTIFICATIONS.md, MOBILE_TESTING.md, MOBILE_RELEASE_PREPARATION.md ; mise à jour MOBILE_SDK_57.md, README et rapport BLOC-14-RAPPORT.md. Traces, empreintes, données fictives et captures privées conservées dans .local-preserved/bloc14. Compatibilité maintenue avec les règles, permissions, stock, finances et preuves des Blocs 11–13. Aucun Bloc 15 engagé.

Clôture de recette : services API, Web et MySQL locaux et émulateur de cette tâche arrêtés. Contrôle final : aucun processus de recette ni port d’écoute 4399, 5183, 33087, 8088 ou 8089 restant ; données conservées. Empreintes finales : aucune différence sur les fichiers protégés hors configurations mobile volontairement modifiées ; préfixe historique du journal intact et une seule section Bloc 14.

## Audit de sécurité transversal — 29 octobre 2026

Instruction utilisateur : rechercher les failles dans l’ensemble du projet, bloc par bloc et module par module, les corriger et fournir la liste des corrections. Périmètre local : Blocs 1 à 14, API/MySQL, Web, Expo SDK 57, règles partagées, fichiers, notifications et CI ; aucun système tiers ou environnement de production testé.

Inventaire : 123 fichiers source API, 64 Web, 44 source mobile, 11 routes mobile et 18 fichiers partagés (tests partagés compris), 222 déclarations de routes statiques. Revue ciblée des entrées et autorisations, transactions, idempotence, montants, fichiers privés, cryptographie et DTO ; recherche statique sans motif SQL brut non paramétré, exécution dynamique, puits HTML directs ou stockage navigateur de jetons dans ces sources. Aucun résultat négatif présenté comme garantie absolue.

Corrections SEC-01 à SEC-13 détaillées dans SECURITY_AUDIT_2026-10-29.md : body-parser 2.4.0 et refus des corps compressés ; Vite 8.3.5 ; brace-expansion 5.0.12 ; source-map-js 1.2.2 ; Zod Web 4.6.7 ; rétroportage du décodeur 0.5.1 vers l’interface CommonJS attendue par Router 57 ; protection des prototypes deepmerge ; inscription d’appareil push sérialisée avec contrôle de session ; suppression des secrets des journaux HTTP ; contrôle réel et insensible à la casse Windows des dossiers de preuves ; récupération via origine Web plutôt que schéma mobile interceptable ; identité/contexte Web préconditionnés et maintenus lors des réessais, caches retirés sur refus et écrans renouvelés par utilisateur ; TLS obligatoire pour MySQL distant en production.

Reproduction contrôlée MySQL du défaut d’appareil libéré : deux réinscriptions concurrentes acceptées avant correction, une après et DEVICE_IN_USE pour l’autre. Réinstallation mobile npm ci : les deux patches versionnés sont réappliqués, avec échec d’installation requis si un patch ne correspond plus. Pas de changement forcé de SDK ni de Zod 4 sous une API Zod 3. La CI exécute désormais la suite mobile et les types de tests, avec droits GitHub contents: read. Metro démarre sur localhost par défaut ; ouverture LAN désormais explicite.

Validation finale : 399 tests distincts réussis (269 MySQL, 49 API, 45 partagés, 36 mobile). Types, ESLint et compilations API/Web réussis ; types source/tests mobile et lint réussis ; Expo Doctor 21/21, matrice à jour et exports finaux Android/iOS/Web réussis. 133 fichiers de sortie Web/mobile comparés aux secrets serveur configurés : aucune correspondance. Schéma toujours à 70 modèles et 25 migrations ; empreintes des .env, EAS, logos originaux et migrations inchangées.

Un premier passage DB avait un test historique ambigu sur le destinataire d’un e-mail : le lien personnel destinataire contient volontairement un token depuis le Bloc 13, alors que le test interdisait ce mot pour un message générique livreur. La sélection est maintenant explicitement celle du livreur, assertion conservée ; la suite finale complète passe 269/269. Un scénario supplémentaire d’identité a d’abord omis l’affiliation du second compte fictif ; fixture corrigée puis vérifiée. Commande d’export PowerShell corrigée et workers bornés après pression mémoire. Traces intermédiaires conservées.

Limites : audit npm API/Web à zéro avis connus ; mobile brut conserve 12 alertes (6 faibles, 6 élevées), car il ne reconnaît pas les rétroportages. Zod 3.25.76 de la CLI Expo n’a pas de correctif compatible installé et reste une réserve ouverte, réduite par l’absence d’exposition de l’outillage et le démarrage local. Pas d’audit de production, pare-feu, secrets distants, sauvegardes ou multi-instance ; pas de nouveau test physique/iOS/push externe. Aucun paiement exécuté ni publication. Rapport détaillé relié au README et à la préparation mobile ; aucun Bloc 15 engagé.

Clôture de l’audit : base locale et services de recette arrêtés, contrôle des processus et ports sans résidu. Données conservées. Compilation API finale vérifiée avec les préconditions d’identité présentes dans le code compilé. Historique antérieur du journal préservé intégralement.

## Campagne d’intrusion locale — 29 octobre 2026

Demande : tester l’application par de nombreuses méthodes offensives et reproduire les faiblesses qui aboutissent. Périmètre local, base dédiée dnd_delivery*_test, six comptes fictifs MySQL et fixtures HTTP isolées. JWT temporaires en mémoire ; .env inchangés. Aucun compte réel compromis ni système tiers sollicité.

Méthodes : contrôles positifs, IDOR, extension de tenant, faux privilèges, JWT altérés avec sujets/sessions valides pour tester réellement les signatures, SQL/NoSQL, paramètres, propriétés interdites, traversées, faux fichiers/URL cloud, inscription, OTP/rejeux parallèles et révocation. Suite MySQL : 76 requêtes, garde fetch loopback, aucune tentative externe. Suite protocole/auth : 38 requêtes couvrant framing ambigu, CSRF/origines, confusion cookie/mobile, X-Forwarded-For, quota de connexion, refresh concurrent et e-mails JSON malveillants. Total ciblé 114, contrôles positifs compris ; relectures directes MySQL non comptées comme HTTP.

Reproductions réelles : photo JSON provoquant 500 avant validation ; inscription de boutique attendant SMTP uniquement pour une adresse nouvelle ; objet e-mail avec toString invalide provoquant 500 dans la clé du limiteur. Corrections : contrôle Buffer/taille avant empreinte, réponse publique indépendante du transport mail et générique avec délai minimal variable, reprise du PENDING abandonné depuis cinq minutes avec rotation du jeton et sans doublon, contrôle de type avant normalisation de la clé du limiteur. Retests : 400 sur entrées invalides et connexion valide ensuite ; réponses 202 identiques alors que le mail reste suspendu. Mails simulés, aucun envoi extérieur.

Pagination : valeurs extrêmes auparavant acceptées en 200 vide, sans fuite ni déni de service démontrés. Plafond de 100000 pages ajouté dans les sept surfaces non bornées, comme dans les modules déjà protégés. Ce durcissement ne constitue pas une preuve de prise de contrôle.

Runtime : Node global 22.13.0 antérieur aux versions de sécurité officielles d’octobre 2026. Node 22.23.4 portable téléchargé du site officiel, SHA-256 du ZIP vérifié au manifeste. Runtime local dans .local-preserved/runtime ; Node global Windows inchangé. Contraintes engines/locks, .nvmrc et CI relevées ; garde-fou API et accès base refusant les anciennes versions. scripts/npm-local.ps1 emploie le runtime local et restaure PATH. Ancien Node refusé avant écoute ; runtime 22.23.4 confirmé dans les tests. Aucun exploit mémoire/RCE Node lancé ; constat fondé sur les avis éditeur. La commande exploratoire npm exec qui avait résolu 26.13.0 en cache ne sert pas de preuve de la version épinglée.

Validation finale : 418 tests distincts réussis (282 MySQL, 55 API, 45 partagés, 36 mobile), suites rejouées avec le moteur corrigé. Types/lint et compilation API/Web réussis ; types source/tests et lint mobile réussis ; Expo Doctor 21/21 et exports Android/iOS/Web réussis avec Node 22.23.4. Nouvelle suite MySQL intégrée au lanceur CI. Les relances ne sont pas additionnées aux tests distincts. Rapport PENTEST_LOCAL_2026-10-29.md et README mis à jour ; traces dans .local-preserved/penetration-20261029.

Limites : pas de garantie absolue, pentest de production, chaîne proxy distante, DDoS massif, appareils physiques/iOS ou réception push externe. Chaînes de script essayées en recherche, sans certification XSS de chaque écran. Réserves Zod 3 de l’outillage Expo et infrastructure conservées. Aucun Bloc 15 ni déploiement. Services de recette arrêtés, données fictives conservées.


## Bloc 15 — Statistiques, rapports, exports et audit

### Objectif et fonctionnalités — 30 octobre 2026

Reporting opérationnel réel dans les applications existantes : tableaux de bord SaaS/entreprise/agence/stock/boutique/livreur, commandes, livraisons, performances d’agences et de livreurs, stocks et inventaires, finances, abonnements et audit. Aucune donnée fictive présentée comme réelle, aucune reconstruction, production ou suite au Bloc 16.

Périodes aujourd’hui/hier/sept et trente jours/semaine/mois/mois précédent/personnalisée, filtres effectifs au serveur, fuseau REPORT_TIMEZONE (Africa/Douala par défaut) et bornes UTC issues de chaque date locale. Calendrier de 1 à 366 jours, changements d’heure de 23/25 heures testés. Agence/entreprise/boutique/livreur fixés ou bornés par les affiliations relues. Boutique consolidée ou transporteur associé, livreur sur ses propres opérations, stock sans droit financier implicite. Super Administrateur limité aux agrégats SaaS et au journal global sans entreprise ; aucune lecture générale des destinataires.

KPI : commandes hors brouillons par création et statut actuel, évolution quotidienne et comparaison précédente ; succès/clôtures, DELIVERED/(DELIVERED+FAILED), première réussite sans échec enregistré, durée moyenne closedAt-pickedUpAt, tentatives, incidents, retours et trajets. Cohorte de missions et affectations séparées pour éviter les doubles comptes. Quantités Stock physiques/réservées/disponibles, seuils/ruptures, transit selon quantity-received-lost-returned et mouvements/inventaires du moteur Bloc 9. Le ledger Bloc 12 fournit brut, net, reçu agence, responsabilité, réservations et reste client exacts par devise ; aucune addition avec les abonnements SaaS. Les photographies actuelles ne sont pas présentées comme des clôtures historiques. Définitions complètes dans KPI_DEFINITIONS.md.

### Interfaces, exports, API et permissions

Web : ReportsWorkspace dans accueil/Rapports et journal global, neuf vues par droits, filtres nommés, cartes, courbes/histogrammes Recharts, tableaux/pagination, états vides et erreurs, exports et liens métiers fonctionnels. Chaque vue est adressable par le paramètre report du module Rapports. Le téléchargement en cours est annulé lorsque l’écran est quitté, notamment au changement de contexte ou compte.

Expo SDK 57 : ReportsScreen dans accueil, Rapports et Activité existants, vues disponibles selon les droits, périodes, consolidation boutique, cartes/barres simples, historique paginé et accès aux missions/stocks. Sessions, sélecteurs et rafraîchissement natifs existants réutilisés. Aucun nouveau package natif, logo ou identifiant modifié.

CSV UTF-8 BOM/point-virgule, XLSX et PDF côté API, mêmes données et notes que les écrans, titre/période/filtres/organisation/génération. Cellules tableurs protégées contre les formules, montants textuels exacts, limite de 100 lignes par tableau et 2 000 par document ; refus explicite plutôt que troncature. Ledger plafonné à 2 000 encaissements, options nommées à 200. Rapport journalier/hebdomadaire/mensuel/personnalisé à la demande, pas de planification d’envoi. Chaque export réussi crée REPORT_EXPORTED.

GET /api/reports/options, overview, orders, deliveries, agencies, drivers, stocks, collections, subscriptions, audit ; POST /api/reports/exports. Permissions reports.read/audit.read attribuées aux rôles existants company_admin/agency_manager par migration et seed ; permissions de lecture existantes conservées pour stock, boutique et livreur. Authentification, identité/contexte, origine, CSRF, no-store, quotas et validation stricte. Audit en lecture seule avec liste positive : auteur, action, entité, périmètre et date ; metadata libre, mots de passe, tokens et OTP exclus.

### Prisma, fichiers et corrections

70 modèles et 28 migrations. Aucun nouveau modèle ni table de synthèse. Trois migrations additives : 20261030090000_reporting_indexes (sept index et droits), 20261030091000_reporting_permission_ids (UUID explicites des attributions), 20261030092000_reporting_permission_timestamps (dates techniques valides). Les 25 anciens SQL restent inchangés ; aucune base réinitialisée. Agrégations MySQL, requêtes paramétrées, transaction REPEATABLE READ, pagination et lecture financière groupée bornée.

La régression a détecté les valeurs techniques incomplètes du premier INSERT IGNORE de permissions : liens/dates corrigés par ajouts sans réécrire une migration appliquée, puis Partenaires et Catalogue rejoués avec succès. Écarts d’inventaire MySQL négatifs corrigés par casts signés des deux opérandes ; compte des prises en charge aligné sur l’événement réel PICKED_UP. Message d’état vide corrigé, noms des entités dans les rapports et notes dédupliquées. Options de boutique masquées pour le livreur personnel. Dépendance uuid d’ExcelJS corrigée par override compatible et test de réouverture XLSX ; audit final API zéro alerte. Aucun autre mécanisme métier antérieur remplacé.

Fichiers : api/src/modules/reports, api/tests/reports*.test.ts, api/tests/database/reports.database.test.ts, api/tests/serve-report-preview.ts, shared/reports.ts et reports.test.mjs, webapp/src/reports, mobileapp/src/reports, intégrations PortalLayout/WorkspaceScreen/workspace, seed et migrations. Documentation REPORTING.md, KPI_DEFINITIONS.md, REPORT_EXPORTS.md, AUDIT_REPORTING.md et BLOC-15-RAPPORT.md ; REPORT_TIMEZONE ajouté à .env.example, pas aux secrets .env.

### Tests et recette exécutés

302 résultats TAP MySQL réussis, 66 API/Auth/HTTP/périodes/exports, 48 partagés et 36 mobiles : 452 distincts réussis, zéro échec final. Les 20 TAP ciblés de reporting MySQL ont aussi été rejoués, sans les recompter. Première régression de 14 échecs liée aux dates de permissions conservée dans les traces, suivie d’une régression complète finale de 302/302. Base MySQL 8.4.13 locale indépendante dnd_delivery_bloc5_test, mêmes données préservées. Tests d’isolement entreprises/agences/boutiques/livreurs, droit d’export, formules tableur, audit sans secrets, périodes vides/DST, stocks/transit/inventaire et exactitude financière.

API : build Prisma+TypeScript, vérification TypeScript des sources/tests/outils et lint réussis. Web : build/lint réussis. Expo : TypeScript source/tests, lint, matrice install --check, Doctor 21/21 et exports Web/Android/iOS réussis ; dernier raccordement de l’onglet Activité réexporté. Trente-cinq fichiers protégés contrôlés sans divergence (.env privés, ressources et migrations anciennes). Prefixe historique de ce journal conservé.

Recette Web réelle sur API/MySQL : administrateur, deux commandes et deux missions en cours, cartes/courbe/tableaux et absence de données cohérente. Expo Web : compte livreur distinct, choix de son agence, statistiques personnelles et sélection Livraisons avec ses deux missions. Sept requêtes HTTP ont téléchargé trois vrais formats et confirmé trois événements REPORT_EXPORTED ; PDF ouvert dans Edge et contrôlé visuellement, XLSX rouvert par les tests sans formule exécutable. Cas financier vérifié : 100,1000 attendu, 60,1000 déclaré, 40,0000 restant client ; 20,1000 reçus agence, responsabilité livreur 40,0000. Paiement SaaS séparé de 15,1234.

Journaux privés sous .local-preserved/bloc15 ; rapport détaillé, limites et commandes dans BLOC-15-RAPPORT.md. Services de recette arrêtés après vérification, données et fichiers de test conservés.

### Limites et vérifications au Bloc 16

Pas de charge de production certifiée, de téléphone physique/iPhone ni de nouveau binaire natif signé/installé ; recette visuelle Web et Expo Web de bureau, bundles natifs exportés. Export complet à filtrer au-delà des limites ; pas de génération asynchrone volumineuse ni d’envoi planifié. L’historique personnel de missions porte sur l’affectation actuelle ; les affectations et anciens événements restent dans leurs modules d’origine. Pas de retard contractuel inventé sans échéance promise et pas d’état historique complet reconstruit. L’alerte Zod 3 de l’outillage Expo CLI documentée précédemment reste ouverte ; matrice SDK conservée.

Au Bloc 16, si demandé : évaluer la recherche paginée des listes d’options au-delà de 200, la charge sur volumes réels et les besoins éventuels de clôture historique/gros exports. Vérifier sur appareils physiques les écrans et parcours de reporting. Aucun démarrage du Bloc 16 ni déploiement autorisé par cette intervention.


## Bloc 16 — Audit global, sécurisation et préparation à la production

Audit des blocs 1 à 15 par inventaire des routes, protections et suites. Le bilan par module, les pannes, les mesures et les limites d’appareils figurent dans AUDIT_GLOBAL.md, TEST_PLAN.md et PERFORMANCE_REPORT.md. Le fichier local API utilise encore des paramètres hérités. La migration de cette configuration vers les noms actifs est décrite pour l’exploitation.

Corrections. Une sonde /api/ready vérifie MySQL et la configuration auth avec délai borné et statut générique. Le précontrôle de production valide HTTPS, origines, secrets distincts, paramètres SMTP, schéma et répertoires privés. Les preuves, logos et images produits vérifient leur chemin réel. Le nettoyage signale les erreurs d’accès. Les arbres npm ont été durcis et Expo mis à niveau avec les correctifs recommandés dans le SDK 57. Le patch du décodeur URI est requis. Les réserves d’audit restantes figurent dans SECURITY_AUDIT.md.

Recette. Les suites locales ont validé 69 tests API, 48 tests Web partagés, 35 tests mobile et 302 tests MySQL existants. Les 42 cas MySQL associés aux médias et partenaires ont été rejoués après durcissement. Le nouveau parcours stock utilise MySQL et un relais SMTP local réel, avec une preuve contrôlée par empreinte et une remise confirmée de 50,1234 XAF. Les rôles ont été initialisés et le bootstrap relancé sur le même compte sans changement. Les exports Expo Android, iOS et Web et les 21 vérifications Doctor ont réussi.

Exploitation. Les 28 migrations existantes ont été appliquées à une base vierge avec un compte de maintenance. Le compte applicatif de recette ne pouvait pas installer les déclencheurs avec le journal binaire activé. Aucun SQL de migration ajouté. L’import de sauvegarde a nécessité une copie normalisant les fins de 33 déclencheurs. Après restauration dans un schéma distinct, 56 déclencheurs, 28 migrations, une preuve et les totaux de recette ont été contrôlés. L’immutabilité d’AuditLog a été vérifiée. Les modifications CI, les archives à produire sur GitHub, les commandes Plesk, la reprise, le rollback et les profils Android/iOS figurent dans les procédures du Bloc 16.

Verdict. NON PRÊT POUR LA PRODUCTION. Les contrôles de l’hôte Plesk, l’historique Git, la CI distante, la sauvegarde de la cible, les essais sur appareils réels et les signatures restent à valider. Le mode Edge sans interface n’a pas produit le DOM attendu. ADB a démarré et aucun appareil n’était connecté. Aucun déploiement ni publication. Voir RAPPORT_FINAL_DND_DELIVERY.md, PRODUCTION_CHECKLIST.md et KNOWN_ISSUES.md.

### Vérification transversale après l’installation locale du super administrateur

L’API de développement répondait sur le port 3000 avec une ancienne configuration chargée. La sonde de disponibilité renvoyait 503. La relance du processus a rétabli le statut 200. Un appel de connexion avec les en-têtes Web et des identifiants fictifs a reçu le rejet 401 attendu. La base de développement contient un super administrateur actif. La connexion avec son mot de passe reste à valider par son titulaire.

Le lanceur Windows surveille désormais le fichier .env existant au démarrage. Le changement de configuration a été reproduit avec un fichier factice. Le démarrage indique les noms des paramètres d’authentification invalides sans afficher leurs valeurs. La sonde vérifie les colonnes de session nécessaires à la connexion. La commande de migration vérifie le moteur avant toute écriture. Elle accepte le MySQL 8.4 de recette et refuse le MariaDB 10.4 local. L’initialisation de l’administrateur valide ses paramètres avant de charger le client de base de données.

Suite MySQL complète avec 302 tests et une recette intégrée supplémentaire. Les 48 tests Web et 35 tests Expo réussissent. Doctor 21/21 et exports Android, iOS et Web terminés. Les audits npm API et Web sont à zéro. L’audit mobile conserve trois entrées associées au décodeur URI patché. Les sorties de recette sont conservées dans .local-preserved/recheck.
Suite API finale, 71 tests réussis, lint, vérification des types et compilation réussis.
