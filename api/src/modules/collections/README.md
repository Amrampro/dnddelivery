# collections

Module opérationnel du Bloc 12 : déclarations d’encaissement, remises partielles, réceptions distinctes, soldes exacts, écarts, corrections approuvées et notifications. Aucun paiement exécuté par la plateforme.

`routes.ts` applique authentification et protections HTTP. `access.ts` contrôle les périmètres ; `core.ts` fournit transactions et idempotence ; `ledger.ts` calcule les fonds ; `read.ts` produit les vues autorisées ; `service.ts` gère les corrections et litiges. `money.ts` utilise des entiers à quatre décimales. `protection.ts` empêche l’abandon de responsabilités financières par désaffiliation. `notifications.ts` traite les avis différés.

Documentation : [encaissements](../../../../docs/COLLECTION_MANAGEMENT.md), [remises](../../../../docs/CASH_REMITTANCES.md), [écarts](../../../../docs/FINANCIAL_DISCREPANCIES.md), [permissions](../../../../docs/FINANCIAL_PERMISSIONS.md). Le repository historique reste disponible ; les nouvelles opérations passent par le service contextualisé.
