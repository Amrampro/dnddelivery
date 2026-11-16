# Commandes et réservations — Bloc 10

Le moteur du Bloc 9 reste unique : `StockService.movement`, les tables Stock/StockReservation/StockMovement, leurs contraintes et leurs protections d'historique sont réutilisés. Le primitif historique `reserve-stock.ts` reste interne et n'est pas exposé comme route.

## Soumission atomique

Dans une transaction MySQL Serializable avec reprises bornées des conflits :

1. Verrouiller l'entreprise et relire l'autorisation, l'abonnement, le partenaire et l'agence explicitement partagée.
2. Vérifier les produits actifs de la boutique et les quantités entières distinctes.
3. Créer la commande et ses articles historiques.
4. Pour FROM_STOCK soumis, créer les réservations liées à chaque OrderItem ; verrouiller le solde et appliquer un mouvement RESERVE.
5. Créer l'historique immuable, l'audit et l'avis d'enregistrement.
6. Valider l'ensemble ; toute erreur annule toutes les étapes.

Le physique inclut le réservé : disponible = physique − réservé. RESERVE augmente uniquement le réservé ; RELEASE le diminue. Aucune sortie physique ni consommation automatique à la création. ONE_OFF et les brouillons n'émettent aucun mouvement de stock.

Une clé de réservation dérivée de l'article, une clé de mouvement unique et les verrous du moteur empêchent les doubles réservations. Deux commandes demandant chacune quatre unités d'un solde de cinq ne peuvent pas réussir toutes les deux. La référence d'une commande et la clé de soumission sont générées/contrôlées côté serveur ; les clients ne choisissent aucun identifiant de stock arbitraire.

## Édition et annulation

Changer produits, quantités, type ou agence remplace les articles actuels en conservant les anciennes lignes. Les réservations précédentes sont libérées et les nouvelles créées dans la même transaction. Une cible sans disponible annule cette modification et restaure les anciennes réservations. Les métadonnées d'événement conservent valeurs et quantités avant/après. Une simple modification financière avec articles identiques n'émet aucun mouvement.

Une annulation PENDING, sans Delivery existante, libère les réservations ACTIVE puis enregistre CANCELLED et le motif dans la même transaction. L'ordre des écritures ne crée aucune fenêtre de stock disponible entre deux transactions. Les tentatives répétées ne doublent pas les mouvements.

Les routes manuelles du Bloc 9 refusent la libération ou la consommation d'une réservation ayant un orderItemId. Il faut agir sur la commande. Cela protège une commande qui resterait en attente alors que sa réservation aurait été supprimée séparément. Les réservations purement manuelles continuent de fonctionner.

Les opérations sont sérialisées par entreprise, comme le stock existant. Les lectures historiques restent accessibles avec les affiliations actuelles, mais toute nouvelle réservation, modification et annulation exige un abonnement valide. Une collaboration inactive permet seulement l'annulation préalable de l'ancienne commande dans un contexte autorisé.

## Limite avec le Bloc 11

Ce bloc ne transforme jamais une réservation de commande en sortie physique. Le Bloc 11 devra réaliser la prise en charge/logistique et sa consommation transactionnelle, puis ajouter les transitions permises à la machine existante. Il devra conserver l'interdiction des actions manuelles sur les réservations liées et enrichir l'historique. Ni affectation de livreur, livraison, OTP, preuve photographique ni encaissement réel n'est implémenté ici.
