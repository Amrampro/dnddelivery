# Définitions des KPI

Les mêmes définitions sont livrées par l’API aux interfaces et aux exports. Une absence d’événement donne zéro ; une moyenne ou un taux sans dénominateur donne null, affiché « — ». Aucune donnée de démonstration n’est utilisée dans les tableaux de bord d’exploitation. Les recettes utilisent une base de test explicitement indépendante.

## Dates et cohortes

Toutes les dates MySQL sont UTC. La période de l’utilisateur est calendaire dans REPORT_TIMEZONE (Africa/Douala par défaut), fin locale incluse convertie en borne UTC exclusive. Aujourd’hui/hier/sept jours/trente jours/semaine/mois/mois précédent sont calculés au serveur. La comparaison des commandes utilise la période calendaire précédente de même nombre de jours, mêmes filtres.

Création d’une commande, affectation, enlèvement, clôture et création d’une déclaration restent des dates distinctes. Les tableaux mentionnent leur cohorte. Les états sont ceux lus à la génération ; les rapports ne reconstruisent pas un état historique complet à une ancienne date. Une archive n’efface pas une commande des statistiques.

## Commandes et livraison

| Indicateur | Formule / source |
|---|---|
| Commandes créées | COUNT Order créées dans la période, isDraft=false, archives comprises |
| Répartition des statuts/types | Même cohorte, GROUP BY status/type actuels |
| Boutique / transporteur / agence | Même cohorte, clés companyId/shopId/agencyId ; aucune consolidation des autres boutiques |
| Évolution | Comptage quotidien par bornes UTC issues de chaque date locale |
| Annulations | Statut actuel CANCELLED dans la cohorte de création ; ne prétend pas dater l’annulation |
| Réussies / échouées clôturées | Delivery.closedAt dans la période, statut DELIVERED / FAILED |
| Taux de réussite | 100 × DELIVERED / (DELIVERED + FAILED), seulement missions clôturées de la période |
| Premier essai enregistré | 100 × réussies sans DeliveryAttempt FAILED enregistré / réussies clôturées ; pas une preuve d’absence de tentative non saisie |
| Délai moyen | Moyenne (closedAt − pickedUpAt) en minutes, réussies clôturées de la période et dates cohérentes ; null si aucune |
| Missions en attente/affectées/en cours | Photographie actuelle PENDING/ASSIGNED/IN_PROGRESS du périmètre, indépendamment de la période |
| Tentatives / motifs | COUNT DeliveryAttempt créées dans la période, regroupées par result/reason ; restriction courierId pour le livreur |
| Incidents / retours / trajets | COUNT des événements créés dans la période, regroupés par type et état actuels |
| Performance des agences/livreurs | Cohorte de missions créées dans la période, COUNT par agence/livreur actuel ; succès/échec et durée enlèvement→clôture de cette cohorte |
| Affectations / prises en charge | DeliveryAssignment créées dans la période ; présence d’un DeliveryEvent PICKED_UP du même acteur entre création et fin de l’affectation |

Une mission compte une seule fois dans la performance logistique ; les affectations sont affichées séparément et ne sont pas des livraisons supplémentaires. Pas de classement automatique des livreurs. Les missions attribuées à d’autres personnes après réaffectation ne sont pas comptées comme réussites du premier livreur. L’historique personnel affiché est celui des missions actuellement attribuées ; les événements anciens restent conservés dans les modules d’origine.

Il n’existe pas d’échéance promise exploitable dans les modèles actuels : aucun indicateur de retard contractuel ni acceptation du livreur n’est inventé. La prise en charge effective repose sur PICKED_UP.

## Organisation et stocks

| Indicateur | Formule / source |
|---|---|
| Agences / boutiques actives | Agency ACTIVE non archivée / CompanyShop ACTIVE ; restriction d’agence via allowedAgencyIds |
| Affiliations actives | CompanyMembership ou AgencyMembership active dans le contexte ; ce nombre n’est pas présenté comme un décompte de contrats de travail |
| Livreurs actifs/disponibles | DriverProfile ACTIVE, disponibilité AVAILABLE ; appartenance active à l’agence sélectionnée |
| Produits suivis | Nombre distinct de productId ayant une position Stock |
| Physique / réservé | Somme des soldes Stock.physicalQuantity / reservedQuantity actuels |
| Disponible | Physique − réservé, même moteur Bloc 9 |
| Faible / rupture | Nombre de positions avec disponible ≤ alertThreshold / disponible = 0 |
| Transit | Transfer IN_TRANSIT : quantity − receivedQuantity − lostQuantity − returnedQuantity ; attribution à l’agence d’origine, sans double comptage à destination |
| Dépôts/sorties/réservations/transferts | StockMovement créés dans la période, groupés par type, somme physicalDelta/reservedDelta |
| Inventaires | Sessions créées dans la période, nombre de lignes comptées et somme countedQuantity − expectedPhysical ; état affiché, correction non présumée approuvée |

Soldes de stock = photographie actuelle, jamais stock historique reconstitué. Les mouvements restent réconciliables avec le moteur existant ; un inventaire ne change pas son solde par la seule consultation d’un rapport.

## Finances opérationnelles

Calcul exact à quatre décimales, bigint / Decimal côté serveur, chaînes dans le DTO. Devises séparées. Le ledger du Bloc 12 est réutilisé, pas réimplémenté.

- Brut : déclaration originale + différences des corrections COLLECTION approuvées.
- Remboursé : remboursements REFUND + AGENCY_REFUND approuvés.
- Net client : brut − remboursé.
- Reçu agence : allocations confirmées des remises CONFIRM/DISPUTE + corrections RECEIPT approuvées.
- Responsabilité livreur : brut − remboursements par le livreur − reçu agence. Le remboursement par l’agence ne recrée pas cette dette.
- Réservé : allocations actives des remises annoncées non confirmées.
- Disponible à remettre : responsabilité − réservé.
- Attendu : amountToCollect actuel des commandes exigeant un encaissement, créées dans la période.
- Reste client : max(attendu − net déclaré, 0), par commande ; un trop-perçu n’efface pas le reste d’une autre commande.
- Partiel : déclaration présente, 0 < net < attendu. Aucun encaissement : PENDING ; zéro déclaré : NONE_RECEIVED ; égalité : DECLARED_COMPLETE ; excédent : EXCESS ; remboursement intégral : REFUNDED.

Le tableau des soldes utilise la cohorte d’encaissements créés dans la période mais leurs corrections et remises actuelles, même postérieures. Le tableau attendu utilise la cohorte de commandes créées dans la période et leurs déclarations actuelles : **ne pas soustraire des totaux de cohortes différentes**. Les lignes anciennes sans operationKey ne sont pas rapprochables, sont signalées et comptées hors montants.

Les remises sont regroupées par devise/statut/décision, selon leur date de création ; leur montant confirmé est l’original, les corrections de réception apparaissant dans le ledger. Les écarts et régularisations restent distincts des fonds reçus. Une remise peut contenir plusieurs boutiques : le filtre boutique masque les agrégats de remise entière et les responsabilités des autres acteurs. La boutique reçoit uniquement brut/remboursé/net de ses commandes.

## SaaS

Entreprises enregistrées/actives/suspendues : Company, état actuel. Nouvelles périodes : SubscriptionPeriod créées dans la période. Expirées : EXPIRED ou ACTIVE avec expiresAt ≤ maintenant ; bientôt expirées : ACTIVE commencées, échéance dans les sept jours à venir. Paiements externes : SubscriptionPayment APPROVED, groupés par devise, filtrés par validatedAt. Évolution des inscriptions par date locale. Activité générale = nombre d’AuditLog de la période, sans lire leurs métadonnées.

**Les abonnements SaaS, l’attendu destinataire, les fonds déclarés et les fonds confirmés agence ne sont jamais additionnés en un chiffre commun.**
