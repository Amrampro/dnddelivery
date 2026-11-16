# Navigation mobile — état du Bloc 14

Une application Android/iOS unique adapte sa navigation aux rôles et permissions effectivement retournés par l’API. Les cinq profils opérationnels partagent les composants et services existants. Le Super Administrateur conserve une administration principalement Web ; aucune application séparée n’est créée.

## Routes Expo Router

| Route | Fonction |
| --- | --- |
| `/` | Accueil public avec identité officielle |
| `/suivi` | Ouvre le suivi Web personnel configuré, sans exposer de commande par simple référence |
| `/connexion` | Connexion réelle, session native SecureStore |
| `/mot-de-passe-oublie`, `/reinitialisation` | Récupération et renouvellement via le Bloc 3 |
| `/organisations` | Choix d’entreprise, agence ou boutique parmi les affiliations actuelles |
| `/profil` | Profil, mot de passe, sessions, réglage push de cet appareil |
| `/parametres` | Liens vers compte, sécurité et environnement |
| `/espace` | Accueil métier du contexte courant |
| `/espace/[module]` | Module autorisé par `/auth/workspace`, sans rôle choisi localement |

Guard exige une session valide. WorkspaceScreen exige ensuite le contexte et la permission. Le changement d’environnement masque les anciennes données et rejette les requêtes tardives. Les paramètres de mission ne peuvent contourner la vérification serveur et changent l’identité du panneau de module pour ouvrir la bonne mission.

## Onglets principaux actuels

| Profil | Onglets, toujours filtrés par les permissions API |
| --- | --- |
| Entreprise | Accueil, Encaissements, Remises, Livraisons, Profil |
| Agence | Accueil, Encaissements, Remises, Dispatching, Profil |
| Stock | Accueil, Stocks, Dépôts, Inventaires, Profil |
| Boutique | Accueil, Créer, Commandes, Stocks, Profil |
| Livreur | Accueil, Courses, Encaissements, Remises, Profil |

Le menu regroupe les autres outils autorisés : agences/personnel/livreurs, partenaires, mouvements/transferts/alertes, commandes/brouillons, incidents/retours/confirmations, historique, notifications et abonnement. Le changement de transporteur d’une boutique reste distinct de la gestion de son profil autonome. Les listes et formulaires sont remontés dans le contexte choisi ; aucune réponse de l’ancien transporteur n’est conservée en secours.

## Accueils et parcours

Entreprise/agence : synthèses réelles des commandes et missions via les endpoints existants, accès aux outils et abonnement réel. Stock : soldes et opérations existants. Boutique : collaborations et outils de commandes/stock. Livreur : missions, disponibilité, garde, OTP/photos et encaissements, avec priorité aux actions de terrain. Aucun compteur fictif ni rapport avancé du Bloc 15.

L’écran Notifications regroupe les avis logistiques/confirmation et financiers autorisés. Les avis de collaboration restent dans les partenaires. Une ouverture push vérifie l’authentification, le contexte et la ressource ; elle ne suit aucune URL arbitraire. Un mauvais environnement conduit au sélecteur des affiliations, puis l’objectif peut être réexaminé.

L’abonnement est consultable même pendant la restriction d’accès. Sa déclaration externe et sa validation restent dans le portail Web, sans paiement mobile. Les fonctions complexes d’administration déjà réservées au Web conservent une indication explicite ; aucun formulaire fictif ne les simule.

Voir [architecture](MOBILE_ARCHITECTURE.md), [sessions/API](MOBILE_API_INTEGRATION.md), [notifications](MOBILE_NOTIFICATIONS.md), [tests](MOBILE_TESTING.md) et [préparation](MOBILE_RELEASE_PREPARATION.md). La version préparatoire du Bloc 4 reste consultable dans son rapport et dans les références historiques du journal ; elle ne décrit plus les modules opérationnels actuels.
