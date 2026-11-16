# Organisation interne — Bloc 7

Le 28 octobre 2026. Le module réutilise les comptes, sessions, contextes professionnels, invitations et abonnements existants. Aucun compte ni mot de passe par défaut. Une personne garde son compte global et peut appartenir à plusieurs entreprises.

## Droits et périmètres

| Profil | Accès |
| --- | --- |
| Administrateur entreprise | Profil autorisé, agences, invitations, personnel, livreurs, historique de son entreprise |
| Responsable agence | Lecture du profil, de son agence, de son personnel et de ses livreurs |
| Gestionnaire de stock | Lecture du profil, de son agence et de ses propres affectations |
| Livreur | Profil personnel, agences autorisées, affectations et disponibilité personnelle |
| Employé | Profil entreprise, agence autorisée et affectations personnelles |
| Super administrateur | Intervention explicite dans une entreprise via les routes globales |

Les permissions sont déclarées dans api/src/modules/organization/permissions.ts. Les gardes relisent les affiliations et l'état du livreur sans cache de droits. Toutes les requêtes portent le companyId vérifié; les lectures d'agence restent limitées au contexte sélectionné. Les écritures d'organisation exigent le contexte entreprise et les droits correspondants. Un abonnement expiré conserve la lecture, mais bloque les modifications; l'intervention administrative globale est distincte des opérations métier.

## Profil entreprise

Le Web permet de modifier nom commercial, coordonnées, adresse, ville, pays et description, avec version optimiste. Nom officiel, référence, statut, abonnement et responsable administratif restent réservés au module global. Le logo personnalisé utilise le stockage privé existant, limite 2 Mo, décodage puis réencodage WebP et contrôle de version. Les logos officiels DND restent intacts.

## API

Préfixe /api/company : GET/PATCH /profile, GET/PUT /profile/logo; GET /organization/self; GET /organization/history. Le logo envoyé exige X-Company-Version. Les autres routes sont détaillées dans les documents agences, personnel et livreurs. Le Super Administrateur dispose des mêmes routes d'organisation sous /api/admin/companies/:companyId/organization, avec contexte GLOBAL et platform.manage.

Les corps sont strictement validés; versions périmées : 409. Les changements sont transactionnels, audités et protégés par les mécanismes d'origine et CSRF existants. Limites par processus : 100 écritures/heure/utilisateur et 20 demandes d'envoi ou renvoi d'invitation/heure. Prévoir un stockage partagé des compteurs si plusieurs instances sont déployées.

## Données et fichiers

CompanyMembership conserve rôle d'organisation, état d'emploi et version; Agency conserve pays, indications, responsable principal et version; CompanyInvitation distingue ADMIN et STAFF. DriverProfile est rattaché à l'affiliation entreprise, sans duplication de User. Voir DATABASE_DESIGN.md et MIGRATIONS.md.

Code : api/src/modules/organization/{access,permissions,validation,repository,service,controller,routes}.ts; shared/organization.ts; webapp/src/organization/OrganizationWorkspace.tsx; mobileapp/src/organization/OrganizationScreen.tsx. Les composants réutilisent le Design System des blocs précédents.

Aucune suppression physique des personnes, agences ou affiliations. Aucun rattachement de boutique, commande, stock, course ou encaissement développé dans ce bloc.
