# Architecture MySQL — Bloc 2

## État et périmètre

48 modèles Prisma au Bloc 5. La migration initiale décrivait 47 tables; CompanyInvitation est ajoutée au Bloc 5. Les cinq migrations ont été appliquées sur MySQL 8.4.13 dans une base de test distincte. Voir COMPANY_MANAGEMENT.md pour la FK composée du responsable principal maintenue en SQL.

MySQL 8/InnoDB, minimum 8.0.16 pour les CHECK, jeu utf8mb4. Prisma ORM 7.10.1 avec Prisma Migrate et adaptateur MySQL @prisma/adapter-mariadb. Le nom de cet adaptateur ne change pas le moteur cible : les migrations et les tests exigent MySQL 8. Une base commune, jamais une base par entreprise. Tout reste dans api.

## Inventaire des tables

| Domaine | Modèles |
| --- | --- |
| Identités | User, Role, Permission, RolePermission, GlobalRoleGrant |
| Affiliations | CompanyMembership, AgencyMembership, ShopMembership |
| Organisations | Company, Agency, Shop, CompanyShop |
| Sessions et sécurité | Session, AccountToken, AuthEvent, UserDevice |
| Catalogue et stocks | Product, Stock, StockReservation, StockMovement |
| Transferts | Transfer, TransferItem, TransferEvent |
| Destinataires et commandes | Recipient, Order, OrderItem, OrderEvent |
| Livraisons et preuves | Delivery, DeliveryAssignment, DeliveryEvent, DeliveryOtp, DeliveryProof, ProofPhoto |
| Fichiers | FileAsset |
| Traçabilité financière | Collection, CollectionEvent, Remittance, RemittanceItem, RemittanceEvent |
| Abonnements | SubscriptionPlan, SubscriptionPrice, Subscription, SubscriptionPayment, SubscriptionPeriod, SubscriptionEvent |
| Asynchronisme et audit | Notification, AuditLog |

## Décisions

Les identifiants internes sont des UUID dans des CHAR(36). Les références externes ont leur propre champ : Order.publicNumber est unique et indépendant de l’UUID. createPublicOrderNumber prépare une référence aléatoire de 144 bits ; aucune route publique de recherche n’est créée.

Chaque table métier d’entreprise a companyId, sa FK Company et une unicité (companyId, id). Les relations tenant vers tenant utilisent des clés composées, par exemple Stock(companyId, agencyId) vers Agency(companyId, id). Les catalogues Shop/Product sont globaux à une boutique ; CompanyShop lie cette boutique à plusieurs entreprises. Le couple shopId/productId empêche d’utiliser le produit d’une autre boutique. Les colonnes composées parfois répétées servent à vérifier l’intégrité, pas à dupliquer les entités.

Role.scope distingue GLOBAL, COMPANY, AGENCY et SHOP. Les affectations portent une copie de scope contrôlée par CHECK et liée à Role(id, scope). Une affiliation agence référence aussi CompanyMembership(companyId, userId). GlobalRoleGrant est séparé des affiliations tenant. Les rôles sont configurables ; aucune session authentifiée, aucun compte de démonstration ni mot de passe initial n’est créé.

Les statuts et archivedAt assurent l’archivage des organisations, produits, destinataires et commandes. Les FK RESTRICT évitent les suppressions en cascade. Audit, mouvements, événements, preuves et périodes d’abonnement sont immuables via triggers SQL. La politique de conservation/anonymisation légale devra définir les procédures administratives adaptées ; ces triggers ne remplacent pas une politique de rétention.

Les montants utilisent DECIMAL(19,4), les quantités des entiers. Ne jamais convertir les montants Prisma.Decimal en Number pour calculer : utiliser Decimal et sérialiser en chaîne. Les quantités disponibles, écarts d’encaissement et écarts de remise sont calculés à partir des valeurs sources, pas stockés en doublon. Les validateurs métier devront appliquer les décimales réellement autorisées par chaque devise.

Les dates sont en DateTime(3). Le client impose +00:00 à chaque connexion ; les requêtes atomiques utilisent UTC_TIMESTAMP(3). Les interfaces convertiront UTC vers le fuseau utilisateur. Le serveur MySQL et les autres clients d’administration doivent aussi rester en UTC et en mode SQL strict.

## Connexion

Le client est créé à la demande par src/database/client.ts. /api/health ne connecte pas MySQL et fonctionne si DATABASE_URL est absente. La valeur doit être une URL mysql:// nommant une nouvelle base ; aucune ancienne variable DB_* n’est convertie automatiquement. Les identifiants doivent être encodés dans l’URL. Le paramètre explicite ssl=true active TLS avec validation du certificat. Pour un certificat privé, préparer la configuration CA adaptée, sans désactiver la validation.

Les secrets API existants restent dans api/.env, qui n’a pas été modifié. Aucune chaîne de connexion privée n’a été lue puis recopiée dans le Web ou le mobile.

## Paramètres à décider avant les parcours métier

Tarif réel et devise d’abonnement ; format des références agence ; limites de transfert et réception partielle ; unités éventuellement fractionnaires ; règles de réconciliation des écarts ; conservation des preuves et des données personnelles ; politiques de retour/annulation ; précision des devises ; attribution des permissions exceptionnelles.

## Évolution du 28 octobre 2026 — Bloc 6

Toujours 48 modèles : réutilisation des modèles SaaS et Notification. Deux migrations additives portent le total à sept. Subscription.lastActivatedAt; SubscriptionPayment.paidAt, rejectionReason, idempotencyKey et duplicateKey. Prix et périodes confirmées conservés. Voir SUBSCRIPTIONS.md et JOURNAL_DE_DEVELOPPEMENT.md.

## Bloc 7 — 28 octobre 2026

49 modèles : nouveau DriverProfile; extensions de CompanyMembership, Agency et CompanyInvitation. Voir COMPANY_ORGANIZATION.md et DRIVER_MANAGEMENT.md. Ne pas dupliquer User ni supprimer une affiliation retirée. Le principal d'agence repose sur une FK composée SQL vers AgencyMembership, documentée dans AGENCY_MANAGEMENT.md.

## Bloc 8 — 28 octobre 2026

50 modèles : ajout ShopInvitation, extensions commerciales/accord/version de Shop, statut/version d'affiliation ShopMembership et métadonnées/transitions/agences de CompanyShop. Réutilisation Notification/AuditLog; couple entreprise/boutique unique conservé. Voir PARTNER_MANAGEMENT.md et PARTNER_COLLABORATIONS.md.

## Bloc 9 — 28 octobre 2026

56 modèles. Product conserve son identité boutique et reçoit SKU nullable, catégorie, image et version. StockReservation accepte un orderItemId futur facultatif, état/référence/version. TransferItem distingue reçu, retourné et perdu. Ajouts : StockDeposit/StockDepositItem, StockWithdrawal, TransferIncident, InventorySession/InventoryItem. Les soldes physiques/réservés restent dans Stock, les mouvements immuables dans StockMovement; pas de table de commande fictive. Les FK contextuelles scalaires SQL sont à conserver. Voir les cinq guides stock et BLOC-9-RAPPORT.md.

## Bloc 10 — 28 octobre 2026

56 modèles conservés. Recipient reçoit shopId/pays/détails/version ; Order reçoit brouillon/version/soumission/idempotence/coordonnées complémentaires/collecte/encaissement/annulation ; OrderItem conserve les versions historiques avec active et les descriptions/valeurs ; OrderEvent reçoit action/ancien statut/métadonnées. StockReservation est réutilisé avec son orderItemId. Préserver la FK SQL Recipient.shopId vers Shop ainsi que les triggers immuables ; le snapshot de commande n'est éditable qu'en brouillon. Voir ORDER_MANAGEMENT.md, RECIPIENT_MANAGEMENT.md et ORDER_STOCK_INTEGRATION.md.

## Extension Bloc 11 — logistique

61 modèles ; Delivery, DeliveryAssignment et DeliveryEvent étendus. Nouveaux ParcelLeg, ParcelHandover, DeliveryAttempt, DeliveryIncident, DeliveryReturn. Référence unique du colis principal, phase/garde explicites, affectation/trajet/remise actifs uniques, événements séquencés et clés de rejeu par entreprise. Les anciennes missions sans phase ne sont pas converties artificiellement. Les mouvements de stock utilisent toujours StockService et StockMovement du Bloc 9. Voir DELIVERY_MANAGEMENT.md et PARCEL_CUSTODY.md.
# Complément Bloc 12 — 29 octobre 2026

Le schéma contient désormais 64 modèles. Les modèles financiers existants Collection, Remittance, RemittanceItem et leurs événements sont étendus. FinancialCorrection, FinancialDiscrepancy et FinancialEvent ajoutent les décisions distinctes et la piste d’audit immuable. Montants DECIMAL(19,4), calculs en entiers, clés contextuelles entreprise/agence/livreur/devise, allocations partielles et clés d’idempotence. Les données anciennes sans rapprochement fiable restent en lecture seule et sont exclues des nouveaux soldes. Voir [modèle et formules](COLLECTION_MANAGEMENT.md).


## Complément Bloc 13 — suivi et preuves

70 modèles, 25 migrations : TrackingAccess, TrackingThrottle, OtpAttempt, OtpException, DeliveryEvidence et NotificationAttempt complètent DeliveryOtp/DeliveryProof, FileAsset/ProofPhoto, Notification et UserDevice. Liens de suivi/version, quotas persistants, unicité du code actif, affectations liées, preuves immuables, photos READY/ATTACHED/RETIRED et famille de session push. Migrations 20261029090000 à 20261029093000, sans modification des 21 anciennes migrations. Voir [rapport détaillé](BLOC-13-RAPPORT.md) et [confirmation](DELIVERY_CONFIRMATION.md).
