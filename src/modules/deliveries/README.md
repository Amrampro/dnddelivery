# deliveries

Module actif du Bloc 11 : lectures filtrées, moteur transactionnel et opérations logistiques. Routes sous /api/deliveries, /api/driver/missions et /api/driver/handovers. Les opérations relisent les autorisations et utilisent le moteur de mouvements du Bloc 9. Le repository préparé reste conservé.

Voir [gestion](../../../../docs/DELIVERY_MANAGEMENT.md), [états](../../../../docs/DELIVERY_STATUS_WORKFLOW.md), [garde](../../../../docs/PARCEL_CUSTODY.md) et [retours](../../../../docs/DELIVERY_RETURNS.md). Notifications par l’outbox existante et le job deliveries:notifications. Aucune livraison définitive sans preuve du Bloc 13.

## Complément Bloc 13

La remise réussie est désormais confiée à ConfirmationService.complete dans ../confirmation. Les opérations existantes de garde appellent le hook de révocation des OTP, exceptions et photos en attente lorsqu’une tentative ou affectation cesse d’être valide. Les progressions ordinaires ne permettent pas de contourner le contrôle de remise. Voir docs/DELIVERY_CONFIRMATION.md et docs/BLOC-13-RAPPORT.md à la racine du projet.
