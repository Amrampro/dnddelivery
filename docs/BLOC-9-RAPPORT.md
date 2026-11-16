# Rapport Bloc 9 — Produits, stocks et transferts inter-agences

Réalisé le 28 octobre 2026 dans le dépôt existant, après lecture des modèles, modules et journal des Blocs 1 à 8. Identité, sessions, permissions, collaborations, abonnements et Design System réutilisés; aucune reconstruction des applications.

## Fonctionnalités livrées

Catalogue boutique partagé entre transporteurs, SKU facultatif unique par propriétaire, image privée, archivage et édition versionnée. Une édition partielle préserve les champs omis et ne réactive pas implicitement un produit archivé. Le transporteur consulte les produits autorisés sans modifier le catalogue.

Soldes exacts par entreprise/agence/boutique/produit, indicateurs réels et filtres paginés. Dépôts multiples en brouillon puis confirmation physique unique; annulation avant réception. Sorties motivées et restitutions, réservations sans réduction physique, libération et consommation explicitement autorisée. Transferts entre agences d'une même entreprise, départ, transit, réceptions partielles et incidents. Comptage d'inventaire, justification, approbation/rejet et corrections compensatoires. Seuils et alertes réels, sans notification répétée à chaque consultation.

Les quantités physiques incluent le réservé : disponible = physique − réservé. Le transit n'est ni disponible à l'origine ni en destination avant acceptation. Retours à l'origine et pertes validées sont distincts. Les totaux d'une synthèse utilisent un même snapshot MySQL. Toutes les mutations de soldes passent par des opérations identifiées et des mouvements immuables; aucune route ne modifie directement une quantité.

## Pages Web et écrans Expo

Entreprise, responsable d'agence et gestionnaire : stocks/indicateurs, stocks par agence/boutique/produit, dépôts, sorties, réservations, mouvements avant/après, transferts et réception partielle, incidents et décisions, inventaires et alertes. L'accueil stock est opérationnel. Les actions visibles suivent les permissions; l'approbation reste distincte du comptage.

Boutique : catalogue et gestion commerciale, marchandises chez ses différents transporteurs, dépôts, transferts, mouvements et alertes de ses seuls produits. Aucun accès à la quantité d'une autre boutique ni mutation de la garde physique. Le partage des agences est éditable par l'administrateur entreprise sur la collaboration.

Expo fournit les opérations essentielles : sélection des produits, dépôt multi-lignes/confirmation, sorties, réservations, préparation/départ/réception de transfert, incidents, comptages et décisions autorisées. Saisie entière validée et sélecteurs de références métier. L'image produit se téléverse depuis le Web; aucune dépendance native ou lecture de code-barres imposée.

## API et permissions

Catalogue : /api/products GET/POST, /:id GET/PATCH, /:id/image GET/PUT. Stocks : /api/stocks GET, /summary, /options, /:id, /movements, /alerts; PATCH /:id/threshold. Opérations : /api/stock-deposits, /stock-withdrawals, /stock-reservations, /stock-transfers et /inventories, avec actions de confirmation, annulation, libération, consommation, départ/réception, incidents/résolution, comptage/soumission/décision. PATCH /api/company/partners/:id/agencies rend explicite le partage d'agences. Les corps et états sont détaillés dans les cinq guides spécifiques.

stocks.read/deposit/withdraw/reserve/transfer/inventory/approve/threshold; shop.products.read/manage et shop.stocks.read. Gestionnaire de stock sans stocks.approve, responsable d'agence dans son seul contexte, administrateur entreprise global dans sa société. Consommer une réservation exige réserve ET sortie. Les restaurations physiques d'incident exigent l'agence cible; un approbateur à l'origine ne peut pas écrire la destination. Les nouveaux dépôts/transferts/réservations/inventaires exigent collaboration active et agences partagées. NULL/[] ne signifie jamais toutes les agences.

Les restitutions d'une garde existante, libérations et réceptions/résolutions de transit déjà engagé peuvent traiter une collaboration devenue inactive, avec les droits courants. Toute mutation reste bloquée si l'abonnement expire. Les lectures historiques et le catalogue propre de la boutique restent disponibles. Les gardes sont revérifiés dans les transactions.

## Données et migrations

Réutilisation Product, Stock, StockMovement, StockReservation, Transfer, TransferItem et TransferEvent. Six modèles ajoutés : StockDeposit, StockDepositItem, StockWithdrawal, TransferIncident, InventorySession, InventoryItem. Total : 56 modèles, 13 migrations.

- 20261028150000_stock_operations : champs catalogue, réservations autonomes/versionnées, compteurs de transfert et nouvelles opérations, contraintes/index/permissions.
- 20261028151000_transfer_return_quantities : retourne séparément les unités rendues à l'origine et contrôle la conservation des quantités.
- 20261028152000_stock_legacy_states : normalise uniquement les nouveaux champs dérivés d'anciens états et renforce les FK contextuelles dépôt/incident.

Appliquées uniquement sur la même base MySQL 8.4.13 dédiée aux tests. Aucune nouvelle base, remise à zéro, suppression ou modification des anciens soldes et mouvements. Les 13 empreintes des fichiers correspondent aux migrations enregistrées en MySQL; les dix migrations antérieures et les logos officiels sont préservés. Les FK scalaires SQL supplémentaires doivent être conservées lors des futures évolutions Prisma.

Fichiers principaux : api/src/modules/products, api/src/modules/stocks, api/tests/database/{products,stocks}.database.test.ts, shared/stocks.ts, webapp/src/stocks, mobileapp/src/stocks. Intégrations limitées aux routeurs, permissions/seed, navigation, partage d'agences et composants existants. Le helper d'image du Bloc 5 reçoit un dossier facultatif, sans changer les anciens appels de logo.

## Vérifications réellement exécutées

119 tests MySQL dans la suite finale complète, 32 tests API/Auth/HTTP/SMTP et 9 tests de navigation : 160 tests distincts réussis. Le catalogue a aussi été rejoué après l'ajustement des modifications partielles : ses 8 tests passent, sans les compter deux fois. Le nouveau moteur compte 25 tests TAP (24 sous-tests et parent).

Scénarios : droits du catalogue, SKU/versions/archivage/images, dépôts multiples et confirmation unique, transaction entièrement annulée si une ligne échoue, valeurs négatives/fractionnaires/démesurées, sur-sortie et sur-réservation, deux réservations concurrentes de 4 sur 5, libération/consommation, acteur autorisé à réserver mais pas à sortir, transferts et restitution/perte, double réception, articles sous incident isolés, cible d'agence autorisée, inventaires périmés et sous réservations, immutabilité SQL, périmètres entreprise/agence/boutique, abonnement expiré, autre transporteur indépendant et conservation des totaux pendant départ/réception concurrents.

API : typecheck source/tests/outils de recette, lint, build et validation Prisma réussis. Web : build/lint réussis; module stock chargé séparément (environ 45 Ko avant gzip). Expo SDK 57 : types/lint et matrice locale cohérente, export Expo Web réussi; le contrôle des dépendances est exécuté hors ligne et ne prétend pas vérifier un catalogue distant.

Recette réelle : dépôt RECETTE-EXPO-DEPOT-9 saisi depuis Expo (12 T-shirts et 5 sacs). Le brouillon laisse les soldes à zéro. Après confirmation, le Web relit 17 physiques, 0 réservées, 17 disponibles, 0 en transit. Le journal affiche les deux mouvements, le gestionnaire, la référence et les soldes 0→12 et 0→5. Aucun avertissement Expo sur ce parcours. Captures dans docs/previews/bloc9-*.png.

Les traces et comptes aléatoires de recette restent dans .local-preserved/bloc9 (privé/ignoré). Les fichiers .env sont conservés. Aucun compte par défaut de production ni statistique commerciale fictive.

## Commandes et exploitation

Dans api : npm run typecheck; npm run lint; npm run build; npm run db:validate; npm test. npm run test:db exige NODE_ENV=test et TEST_DATABASE_URL vers une base dnd_delivery*_test; DATABASE_RSA_PUBLIC_KEY_FILE peut pointer vers la clé publique épinglée du MySQL local. Ne pas exécuter les tests sur une base réelle.

Dans webapp : npm run build; npm run lint; npm test. Dans mobileapp : npm run typecheck; npm run lint; npm run check:dependencies; npx expo export --platform web. Les contrôles Expo n'ont pas modifié les dépendances natives. Avant la future production, sauvegarder et configurer la base cible, puis utiliser le parcours migrate deploy existant; aucun déploiement effectué ici.

## Limites et suite

Inventaire limité explicitement à 500 soldes par session; réduire le périmètre par boutique si possible. Dépôt/transfert limité à 100 références par opération. Les quantités sont des articles entiers; aucune conversion/valorisation financière ou quarantaine avancée. Les alertes sont consultées dans l'application, sans e-mail proactif de seuil dans ce bloc. Les compteurs HTTP sont par processus et les écritures sont sérialisées par entreprise; évaluer le débit avant une exploitation importante.

Aucun appareil physique, build signé ou CI distante déclaré validé. Les interfaces et le bundle Expo Web ont été vérifiés; une recette Android/iOS sur appareil reste à effectuer. Le vieux primitif reserve-stock.ts reste interne pour compatibilité des tests du Bloc 2; le Bloc 10 doit réutiliser le nouveau moteur et ses gardes, puis rattacher les réservations aux transitions réelles de commande. Aucun ordre, livraison, dispatch, encaissement, OTP ou suivi public développé. Aucun Bloc 10 commencé.

Guides : PRODUCT_CATALOG.md, STOCK_MANAGEMENT.md, STOCK_MOVEMENTS.md, STOCK_TRANSFERS.md, INVENTORY_MANAGEMENT.md. JOURNAL_DE_DEVELOPPEMENT.md est complété sans supprimer son historique.

Recette boutique complémentaire : 24 unités chez deux transporteurs, distinguées en 17 et 7; filtrer le second transporteur affiche seulement ses 7 unités. Les agences homonymes sont préfixées par leur transporteur dans la sélection globale. Capture : previews/bloc9-boutique-multi-transporteurs.png. Le moteur de stock a aussi été rejoué après les derniers filtres : 25 tests réussis, aucun double comptage dans les 160 tests distincts.

Captures : [Réception Expo](previews/bloc9-depot-expo.png), [Stocks entreprise](previews/bloc9-stock-web.png), [Mouvements](previews/bloc9-mouvements-web.png), [Boutique multi-transporteurs](previews/bloc9-boutique-multi-transporteurs.png). Export Expo Web final réussi (12 routes); serveurs temporaires arrêtés, données et traces de test conservées.
