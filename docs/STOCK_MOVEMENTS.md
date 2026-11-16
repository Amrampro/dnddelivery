# Mouvements et réservations — Bloc 9

StockMovement est un journal immuable, protégé par les triggers MySQL hérités du Bloc 2 (UPDATE et DELETE interdits). Les changements de quantité génèrent un mouvement dans la même transaction que le solde et l'opération. Une erreur ne se corrige pas en éditant le passé : utiliser une restitution, réception ou correction d'inventaire autorisée, motivée et traçable.

## Lecture comptable

| Opération | Variation physique | Variation réservée |
| --- | --- | --- |
| Dépôt confirmé | +Q | 0 |
| Réserver | 0 | +Q |
| Libérer | 0 | −Q |
| Consommer une réservation pour sortie physique | −Q | −Q |
| Sortie manuelle/restitution au propriétaire | −Q | 0 |
| Départ de transfert | −Q | 0 |
| Réception de transfert | +Q | 0 |
| Retour d'un incident à l'agence d'origine | +Q | 0 |
| Correction d'inventaire validée | quantité comptée − physique théorique | 0 |

Types conservés : DEPOSIT, RESERVE, RELEASE, ISSUE, TRANSFER_OUT, TRANSFER_IN, RETURN, ADJUSTMENT. Une restitution manuelle à la boutique est une ISSUE avec StockWithdrawal.kind=RETURN; RETURN positif correspond au retour physique de transit à l'origine. Aucune fausse sortie de livraison n'est créée.

Chaque mouvement donne produit, boutique, entreprise, agence, quantité/sens, variations physiques et réservées, soldes avant/après, acteur, date, motif, référence métier et operationKey. Les références croisées pointent vers dépôt, sortie, réservation, transfert ou inventaire. Les soldes avant se déduisent des soldes après moins les variations, et sont rendus dans le DTO. L'opération et son audit restent consultables.

## Réservations préparatoires

POST /api/stock-reservations {reference,stockId,quantity,notes?} réserve le disponible sans diminuer le physique. La réservation porte ACTIVE/RELEASED/CONSUMED, une version, une référence unique par entreprise et des dates de libération/consommation. Le lien orderItemId est facultatif pour préparer le Bloc 10; aucun ordre fictif n'est créé.

GET /stock-reservations et /:id consulte le périmètre autorisé. POST /:id/release {version,reason?} retire seulement la réserve. POST /:id/consume {version,reason} effectue la transition explicite de sortie physique, avec motif obligatoire et permissions stocks.reserve ET stocks.withdraw. Une personne autorisée seulement à réserver ne peut pas consommer. Chaque transition n'a lieu qu'une fois; un rejeu est refusé ou retrouve une création identique, sans second débit.

La réservation active est vérifiée sous verrou; deux demandes concurrentes de 4 sur un disponible de 5 ne passent pas toutes les deux. Les sorties manuelles et départs de transfert appliquent le même invariant disponible. Une libération peut clore une réservation déjà engagée après fin de collaboration; entreprise/agence/utilisateur et abonnement doivent rester valides.

GET /api/stocks/movements est paginé et filtré par les dimensions autorisées. La boutique voit uniquement ses produits chez ses partenaires; une agence ne reçoit pas le journal d'une autre agence. Les audits ne contiennent ni jeton ni mot de passe.

Le primitif reserve-stock.ts du Bloc 2 est conservé pour ses tests historiques, sans route nouvelle. Le Bloc 10 doit employer le moteur complet StockService et ses gardes, puis lier création/consommation aux vraies transitions de commande/livraison dans leurs transactions. Il ne doit pas exposer l'ancien primitif sans intégrer les nouveaux contrôles de collaboration et d'agence.
