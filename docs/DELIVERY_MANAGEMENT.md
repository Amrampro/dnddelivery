# Gestion des livraisons — Bloc 11

Une commande soumise PENDING peut créer une mission Delivery avec un colis principal et une parcelReference serveur unique. La contrainte entreprise/commande empêche les doublons. Un brouillon, une commande annulée ou déjà organisée n’est pas dispatchable. Delivery, DeliveryAssignment et DeliveryEvent sont réutilisés ; les colis multiples restent une extension future.

## Écrans et synchronisation

Web : Livraisons, Dispatching, Acheminements inter-agences, Incidents de livraison et Retours de colis. La file montre les commandes sans mission ; compteurs, filtres, recherche et pagination viennent de MySQL. La fiche rassemble collecte, destinataire, articles, montant attendu si autorisé, garde, affectations, trajets, tentatives, incidents, retour et historique paginé.

Expo : accueil et Mes missions du livreur, historique personnel, avis, fiche et actions physiques. Les opérateurs autorisés disposent également du dispatching et des réceptions. Les filtres sont repliables. Une boutique consulte ses propres commandes depuis leur fiche ou Suivi. Les liens de navigation s’ouvrent sur action de l’utilisateur ; aucun GPS permanent.

Actualisation toutes les 30 secondes lorsque la page/application est active, et au retour au premier plan. La dernière synchronisation est affichée. Une erreur conserve les dernières données et les formulaires ouverts. Chaque formulaire garde sa version et sa clé d’opération pendant la reprise. Pas de file d’actions hors ligne persistante. Une version périmée nécessite une nouvelle lecture.

## Autorisations

| Rôle | Capacités |
|---|---|
| company_admin | supervision et opérations dans son entreprise ; agence sélectionnée restrictive pour les écritures |
| agency_manager | supervision et opérations de son agence |
| agency_employee | lecture opérationnelle, préparation, réception, incident |
| stock_manager | lecture opérationnelle, préparation, réception ; pas de dispatching ni montant attendu |
| courier | missions personnelles de l’agence sélectionnée, enlèvement, étapes, tentatives, incidents, acceptation de garde |
| shop_owner / shop_manager / shop_employee | suivi de leur boutique via shop.deliveries.read |
| super_admin | aucun dispatching implicite |

Droits explicites : api/src/modules/deliveries/permissions.ts. Le serveur relit compte, affiliations, rôle, profil livreur, entreprise et agence. Les écritures nouvelles revalident abonnement, collaboration et éligibilité applicables. Une agence voit ses colis courants, commandes d’origine, trajets engagés et retours attendus ; un trajet simplement préparé ne donne pas accès à la destination.

DTO boutique réduit : pas de notes internes, identifiants de livreurs, historique d’affectation ni détails des incidents. Le livreur voit ses missions actuelles ; après réaffectation, l’historique personnel contient seulement référence/étape/dates de ses affectations, sans coordonnées du destinataire. Les montants exigent un droit explicite.

## API sous /api

| Méthode et chemin | Objet |
|---|---|
| GET /deliveries ; /deliveries/:id ; /deliveries/:id/history | liste, fiche, événements |
| GET /deliveries/options ; /queue ; /eligible-drivers?agencyId= | agences, file, éligibilité et charge |
| GET /deliveries/by-order/:orderId ; /notifications | suivi intégré, avis personnels |
| POST /deliveries | créer : orderId, orderVersion, operationKey |
| POST /deliveries/:id/assign ; /reassign ; /prepare ; /retry ; /cancel ; /receive | dispatching et agence |
| POST /deliveries/:id/transfers | préparer un trajet |
| POST /deliveries/:id/transfers/:legId/dispatch ; /cancel ; /receive | départ, abandon, réception |
| POST /deliveries/:id/incident ; /incidents/:incidentId/resolve | incident et décision |
| POST /deliveries/:id/return ; /return/receive ; /return/reintegrate ; /return/shop | retour, contrôle, stock, restitution |
| POST /deliveries/:id/handovers/:handoverId/cancel | annuler une proposition de garde |
| GET /driver/missions ; /driver/missions/:id ; /driver/missions/:id/history | lectures personnelles |
| POST /driver/missions/:id/pickup ; /events ; /attempt ; /incident | opérations du livreur |
| GET /driver/handovers ; POST /driver/handovers/:id/confirm | accepter/refuser une remise |

Actions : version et operationKey ; versions propres du trajet/incident/remise lorsque requises. Schémas Zod stricts. Même acteur/action/données/clé : reprise sans nouvel effet ; contenu différent : conflit. La transaction sérialise l’entreprise et écrit mouvements, événement, audit et notifications ensemble. Session, origine, CSRF, absence de cache et limitation de débit sont conservés.

## MySQL et notifications

61 modèles. Delivery ajoute version/référence/phase/garde. DeliveryAssignment conserve dates et rôle FINAL/TRANSPORT, avec un seul emplacement actif. DeliveryEvent ajoute séquence/version, transitions, garde et rejeu unique par entreprise. Nouveaux modèles : ParcelLeg, ParcelHandover, DeliveryAttempt, DeliveryIncident et DeliveryReturn. Événements et tentatives immuables ; clés contextuelles et contraintes MySQL. Les anciennes Delivery sans phase restent lisibles, sans nouvelles actions inventant leur passé physique.

Migrations additives 17 à 19 : 20261028170000_delivery_operations, 20261028171000_delivery_event_sequence, 20261028172000_parcel_receipt_location. Aucune ancienne migration réécrite. La dernière distingue destination prévue et lieu réel de réception.

Notification réutilisée, source DELIVERY_. Job npm run deliveries:notifications via SMTP existant : bail, reprise différée, cinq tentatives maximum. Une panne SMTP laisse la mission intacte. Adaptateur push prévu ; sans infrastructure push, les avis restent en attente et consultables dans l’application. Aucun push effectif revendiqué. SMTP ne garantit ni réception ni envoi exactement une fois.

Bloc 12 : montant attendu uniquement, aucune déclaration/remise d’argent. Bloc 13 : confirmation en attente de preuve ; aucun OTP, photo obligatoire ou portail public complet simulé.
