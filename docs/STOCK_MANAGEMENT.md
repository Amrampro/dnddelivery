# Gestion des stocks et dépôts — Bloc 9

## Convention de quantité

Chaque Stock est unique par (companyId, agencyId, shopId, productId). La boutique reste propriétaire, l'entreprise assure la garde et l'agence situe les articles. Le physique inclut les unités réservées : disponible = physicalQuantity − reservedQuantity. Toujours 0 ≤ réservé ≤ physique. Les quantités d'entrée sont entières, de 1 à 2 147 483 647; un comptage ou seuil peut valoir zéro. Les opérations refusent un solde physique dépassant cette limite.

Le transit est hors du physique des agences. Ne pas additionner le réservé au physique, ni l'ajouter une seconde fois au disponible. Les totaux globaux de transit comptent chaque ligne de transfert une fois. Les totaux physiques/réservés/transit d'une réponse de synthèse utilisent une même photographie MySQL Repeatable Read afin d'éviter un décalage pendant un départ ou une réception.

## Dépôts et sorties

Créer un dépôt : référence métier, agence, boutique, de 1 à 100 lignes distinctes produit/quantité et observation. DRAFT n'augmente aucun stock. Confirmer la réception exige l'agence autorisée, les produits actifs, une collaboration active, cette agence explicitement partagée, l'entreprise active et son abonnement valide. La confirmation crée les soldes/mouvements et marque CONFIRMED avec auteur et heure serveur, dans une seule transaction. Une annulation avant réception marque CANCELLED, sans mouvement. Une seconde confirmation ou une version ancienne est refusée sans double entrée.

Une référence rejouée avec le même contenu retrouve la préparation existante; un autre contenu sous cette référence est refusé. Une erreur MySQL sur une ligne annule la totalité du dépôt et de ses mouvements : aucune réception partielle implicite.

La sortie manuelle demande référence, stock, quantité, type WITHDRAWAL ou RETURN (restitution au propriétaire), motif et destinataire facultatif. Elle ne peut dépasser le disponible ni libérer silencieusement des réservations. Une restitution explicite de marchandises déjà détenues peut clore une collaboration inactive ou un partage retiré, avec l'agence, les droits, l'entreprise et l'abonnement toujours valides. Les nouvelles opérations restent bloquées après expiration de l'abonnement, y compris les restitutions.

## Périmètres et permissions

| Profil | Accès de stock |
| --- | --- |
| Administrateur entreprise | Lecture globale et toutes les opérations dans l'entreprise |
| Responsable agence | Lecture et opérations dans l'agence sélectionnée, y compris approbations autorisées |
| Gestionnaire de stock | Lecture, dépôt, sortie, réservation, transfert, comptage et seuil; pas stocks.approve |
| Boutique | Catalogue autorisé et lecture de ses seuls stocks chez ses transporteurs; aucune mutation des quantités |

Permissions : stocks.read, stocks.deposit, stocks.withdraw, stocks.reserve, stocks.transfer, stocks.inventory, stocks.approve, stocks.threshold; lecture boutique shop.stocks.read. Les gardes sont relus dans les transactions, pas uniquement dans les menus. Le contexte d'agence ne s'élargit pas avec un identifiant client. La boutique peut filtrer ses transporteurs autorisés et retrouver aussi les historiques des collaborations closes.

NULL ou [] dans allowedAgencyIds ne partage aucune agence. L'administrateur entreprise définit les agences actives sur la fiche de collaboration : PATCH /api/company/partners/:id/agencies {version,agencyIds}. L'opération est auditée et réservée à partners.manage en contexte COMPANY, sur une collaboration PENDING ou ACTIVE. Une nouvelle réception/transfert/inventaire ne contourne pas ce partage.

## Consultation, alertes et API

GET /api/stocks et /stocks/:id : propriétaire, produit/SKU, entreprise/agence, physique/réservé/disponible, transit sortant de ce solde, seuil et version. GET /stocks/summary : totaux réels, stocks faibles, transferts en cours, écarts d'inventaires encore ouverts. Filtres : q, companyId (boutique), agencyId, shopId, productId, status=AVAILABLE|LOW|OUT_OF_STOCK, low=true, page/size≤50. Les listes sont paginées côté serveur et ordonnées avec un identifiant de départage.

GET /stocks/alerts renvoie les soldes où disponible≤seuil; zéro signale une rupture. Un produit jamais déposé ne devient pas une fausse rupture. PATCH /stocks/:id/threshold {version,alertThreshold} modifie le seuil du quartet, sans toucher aux quantités. Les alertes sont des vues calculées dans l'application : aucun e-mail automatique ni notification répétée n'est créé à chaque lecture.

GET /stocks/options fournit les identités minimales autorisées pour les sélecteurs. Les agences de destination sont seulement des choix de transfert dans la même entreprise, sans ouverture de leurs stocks. Les listes de référence ne sont pas tronquées arbitrairement; les listes métier restent paginées.

/api/stock-deposits : GET/POST /, GET /:id, POST /:id/confirm ou /cancel {version,reason?}. /api/stock-withdrawals : GET/POST / et GET /:id. Les autres routes sont décrites dans STOCK_MOVEMENTS.md, STOCK_TRANSFERS.md et INVENTORY_MANAGEMENT.md.

Web : stocks globaux/par agence/boutique, indicateurs réels, dépôts, sorties, réservations, mouvements, transferts, inventaires et alertes. Expo permet les opérations essentielles de l'agence, avec sélection et quantités adaptées au téléphone; la boutique consulte ses marchandises sans pouvoir modifier la garde physique.

## Persistance

Réutilisation Product, Stock, StockMovement, StockReservation, Transfer, TransferItem et TransferEvent. Ajouts : StockDeposit, StockDepositItem, StockWithdrawal, TransferIncident, InventorySession, InventoryItem. 56 modèles et 13 migrations au total. Trois migrations additives du Bloc 9, aucune réinitialisation ni modification des anciennes quantités/mouvements. Les FK composées ajoutées en SQL doivent être conservées lors des futures migrations Prisma.

Les écritures sont sérialisées par entreprise puis par lignes de stock, dans des transactions sérialisables avec reprise bornée des conflits. Aucun endpoint de modification directe des quantités n'est exposé. Les dates sont serveur UTC, affichées dans le fuseau du client. Voir BLOC-9-RAPPORT.md pour les commandes, limites et résultats exécutés.
