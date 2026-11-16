# Inventaires physiques — Bloc 9

L'inventaire porte sur une agence, éventuellement une boutique. Il fige, pour chaque Stock existant, le physique attendu, le réservé attendu et la version. Il ne crée pas d'articles absents d'un dépôt réel. Une session contient au maximum 500 lignes; au-delà, le serveur demande de préciser le périmètre au lieu de tronquer silencieusement.

## Parcours et états

DRAFT : le gestionnaire saisit les quantités physiquement comptées (entiers ≥0). L'écart est compté − attendu. Les comptages sont versionnés; chaque écart doit être justifié avant soumission. Tous les articles de la session doivent être comptés.

SUBMITTED : la session attend une décision. stocks.inventory autorise création/comptage/soumission; stocks.approve autorise approbation ou rejet. Les rôles de référence donnent cette dernière permission au responsable d'agence et à l'administrateur entreprise, pas au gestionnaire de stock.

APPROVED : pour chaque ligne, le serveur relit sous verrou la version et les quantités. Toute modification depuis la photographie initiale (y compris une réservation ou un changement versionné du solde) provoque INVENTORY_STALE. Toute correction sous la quantité réservée est refusée. Une erreur sur une ligne annule toutes les corrections. Chaque écart non nul devient ADJUSTMENT avec motif, référence d'inventaire et audit; les anciens mouvements sont conservés.

REJECTED : décision motivée sans changement du stock. Une session périmée doit être rejetée puis recréée; elle ne remet pas les mouvements intervenus entre-temps à zéro. Aucun rejeu d'approbation ni modification après soumission/décision.

## API et sécurité

/api/inventories : GET/POST /, GET /:id; POST /:id/count {version,items:[{itemId,countedQuantity,reason?}]}; POST /:id/submit, /approve, /reject {version,reason?}. Le motif est requis pour la décision et pour les écarts avant soumission.

Les lignes et agences sont dérivées de la base et du contexte autorisé. Une boutique ne modifie jamais le comptage ou les quantités physiques. Les approbations vérifient encore entreprise active, abonnement valide, agence autorisée et collaboration appropriée. Les sessions et différences ouvertes alimentent les indicateurs réels; les inventaires déjà décidés ne gonflent pas les écarts restant à traiter.

Web : liste paginée, préparation, comptage des lignes, justification, soumission, approbation/rejet et détail. Expo : mêmes opérations essentielles, avec saisie adaptée et actions masquées selon permissions; le serveur ne fait confiance à aucun bouton affiché.

Modèles InventorySession/InventoryItem, service StockService et lecture StockReads. Les FK et contrôles complémentaires sont dans les migrations du Bloc 9. Les procédures avancées d'inventaire tournant, de conversion d'unités, de quarantaine après réception et de valorisation financière ne sont pas développées.
