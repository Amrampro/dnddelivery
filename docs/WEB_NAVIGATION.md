# Navigation Web — Bloc 4

## Layouts

PublicLayout conserve la landing et sa navigation publique. AccountLayout centralise le cadre avec logo officiel pour connexion, oubli/réinitialisation, organisations et profil. Ces formulaires conservent les appels réels du Bloc 3. PortalLayout est le cadre professionnel : sidebar repliable, header, sélecteurs d’entreprise et d’agence, menu de compte, fil d’Ariane, contenu et pied de page. En dessous de 960 px, la sidebar laisse place à un drawer accessible. Les tableaux défilent dans leur région, sans débordement de la page.

## Routes et autorisations

| Route | Condition |
| --- | --- |
| / | Publique |
| /connexion, /mot-de-passe-oublie, /reinitialisation | Parcours d’authentification existant |
| /organisations, /profil | Session authentifiée ; profil personnel accessible sans affiliation professionnelle |
| /portail/:role | Session, contexte actif et workspace.access vérifiés par l’API |
| /portail/:role/:module | Même vérification + permission du module ; module absent = accès refusé |
| /portail/:role/composants | Session et contexte professionnel vérifiés ; exemples UI sans opérations métier |

Les valeurs de :role sont les portails fournis par le serveur : super-admin, entreprise, agence, stock, boutique et livreur. Une URL d’un autre rôle est redirigée vers le portail réellement autorisé ; aucun rôle n’est attribué par l’URL.

`shared/workspace.ts` décrit les intitulés, icônes et permissions nécessaires. Il n’attribue aucun droit à un rôle. `navigation(context)` ne construit que les éléments dont les permissions effectives existent. `moduleAccess` applique le même catalogue lors d’une navigation directe. Les utilisateurs sans workspace.access n’ont aucun menu professionnel.

Le portail Web charge `GET /api/auth/workspace` sans paramètre de permission : certains pare-feu d'hébergement bloquent les valeurs comme `shop.profile.read` dans l'URL. L'API vérifie `workspace.access` et renvoie les affiliations et permissions actuelles. Le portail applique ensuite `moduleAccess` à cette réponse fraîche avant de rendre le module. Chaque endpoint métier conserve son propre contrôle serveur et ses filtres companyId/agencyId/shopId. Le paramètre optionnel `permission` de l'API reste disponible pour les autres clients et retourne 403 si la permission demandée est absente. Le schéma de données et les migrations sont inchangés.

## Permissions du catalogue

| Famille de modules | Permission |
| --- | --- |
| Accueil, compte personnel, changement d’environnement, notifications personnelles préparées | workspace.access |
| Entreprises, utilisateurs globaux, rapports globaux, journal et paramètres SaaS | platform.manage |
| Abonnements et paiements déclarés globaux | subscriptions.validate |
| Agences | agencies.read |
| Partenaires | partners.read |
| Employés et livreurs au niveau entreprise | users.read |
| Produits, stocks, entrées, sorties, transferts, inventaires, alertes stock | stocks.read |
| Commandes et historique commandes | orders.read |
| Affectations, livraisons, équipe d’agence, incidents, courses et historique livreur | deliveries.read |
| Encaissements et remises | collections.read |
| Rapports d’entreprise | reports.read |
| Abonnement entreprise | subscriptions.read |
| Paramètres entreprise | company.manage |
| Catalogue préparé boutique, stocks déposés et suivi boutique | orders.read dans le contexte SHOP existant |

Le catalogue boutique est une structure d’attente limitée à la collaboration choisie ; aucune donnée de stock ou de livraison n’est exposée au moyen de orders.read. Les permissions détaillées des futurs endpoints devront être définies avant leur activation. Les notifications préparées sont personnelles ; aucun flux d’événements d’entreprise n’est récupéré avec workspace.access.

## Sélecteurs

Le header ne présente que les affiliations de `/auth/me`. Le sélecteur d’entreprise choisit un contexte autorisé, préférant le contexte COMPANY s’il existe. Le sélecteur d’agence ne présente que les contextes d’agence de cette entreprise. Un changement passe par POST switch-organization, puis charge le portail retourné et revalide workspace. Les contextes SHOP affichent TRANSPORTEUR ACTIF. Le même compte peut changer de collaboration sans réinscription.

Les erreurs ne donnent pas accès au contenu : elles proposent une nouvelle tentative ou la sélection d’une affiliation valide. Une modification du contexte ou des permissions du profil déclenche une nouvelle vérification. Connexion, restauration, déconnexion, cookies et CSRF restent gérés par le client central du Bloc 3.

## Bloc 7

Les modules réels d'organisation (profil, agences, personnel, livreurs, invitations, historique et affectations) utilisent shared/organization.ts et OrganizationWorkspace. La navigation est filtrée par permissions et contexte, avec lectures conservées après expiration. Voir COMPANY_ORGANIZATION.md et BLOC-7-RAPPORT.md.

## Bloc 8

Modules partenaires réels, contexte boutique autonome, sélection limitée aux collaborations autorisées, profil/utilisateurs/invitations et avis. Les permissions shop.* contrôlent les menus; le serveur revérifie chaque opération. Voir PARTNER_MANAGEMENT.md, PARTNER_COLLABORATIONS.md et BLOC-8-RAPPORT.md.

## Bloc 9

StockWorkspace fournit produits, stocks, dépôts, mouvements, sorties, réservations, transferts-stock, inventaires et alertes-stock. Les contextes entreprise/agence/stock utilisent les permissions stocks.*, la boutique shop.products.* et shop.stocks.read. L'accueil stock affiche la synthèse réelle; les lectures restent possibles après expiration, les mutations sont bloquées côté API. La fiche de collaboration permet de définir les agences autorisées. Voir BLOC-9-RAPPORT.md.

## Bloc 10 — Commandes

Commandes reçues / Mes commandes, Nouvelle commande et Brouillons ouvrent les données MySQL réelles. Formulaire à quatre étapes, recherche paginée des produits et destinataires, récapitulatif, version d'édition, détails/réservations/historique et annulation motivée. Les droits de boutique autonomes sont shop.orders.*. Les actions de livraison restent réservées au Bloc 11. Voir ORDER_WORKFLOWS.md.

## Bloc 11

Livraisons, Dispatching/Affectations, Acheminements inter-agences, Incidents et Retours affichent les données réelles du module DeliveryWorkspace. Suivi boutique intégré aux commandes et au module Suivi. Les menus appliquent les droits explicites, notamment deliveries.assign pour le dispatching et shop.deliveries.read pour le contexte boutique autonome. Les écrans administratifs sont chargés à la demande ; le bundle principal reste sous le seuil de 500 kB. Voir BLOC-11-RAPPORT.md.
# Complément Bloc 12 — navigation financière

Modules Encaissements, Remises de fonds, Soldes des livreurs, Écarts financiers, Régularisations financières et Historique financier accessibles selon les permissions. La boutique dispose de Suivi financier pour ses propres commandes. Chaque module propose les vues autorisées, filtres, pagination, avis internes et chiffres réels par devise. Les fiches commande et livraison affichent leur résumé financier. Les anciens indicateurs généraux préparatoires restent signalés comme tels ; les nouveaux tableaux financiers sont dans ces modules dédiés. Voir [guide](COLLECTION_MANAGEMENT.md).


## Complément Bloc 13 — suivi et confirmation

Le formulaire d’accueil conduit à /suivi, suivi personnel sans compte protégé par référence/e-mail puis lien secret et cookie limité. Les portails entreprise/agence proposent « Confirmations et preuves » avec le droit delivery.proofs.read et le filtre initial AWAITING_PROOF. La fiche mission héberge le panneau de preuve ; la boutique l’ouvre depuis son suivi, limité à ses commandes. Les états DELIVERED et la garde RECIPIENT sont libellés explicitement. Voir [parcours](DELIVERY_CONFIRMATION.md).
