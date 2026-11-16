# Reporting — Bloc 15

Implémentation du 30 octobre 2026 dans les applications existantes. Sources exclusivement opérationnelles MySQL. Aucun déploiement, aucune remise à zéro de base et aucun Bloc 16.

## Architecture et accès

`api/src/modules/reports/` contient autorisations, périodes, calculs, exports et routes. Une transaction REPEATABLE READ par rapport stabilise la lecture ; aucune table de statistiques ni cache partagé. `shared/reports.ts` décrit les vues disponibles pour les interfaces ; la politique serveur est relue sur les affiliations et permissions réelles. Le contrat serveur autonome est contrôlé par un test de concordance avec le contrat partagé.

| Contexte | Rapports autorisés |
|---|---|
| GLOBAL avec platform.manage | overview, subscriptions, audit global seulement |
| Entreprise / agence avec reports.read | commandes, livraisons, agences, livreurs |
| stocks.read | stocks du périmètre autorisé |
| financial.supervise.read | finances du périmètre autorisé |
| audit.read ou organization.audit.read | audit de l’entreprise/agence sélectionnée |
| Boutique | commandes, missions, stocks et déclarations uniquement avec les permissions shop correspondantes, toujours shopId fixé |
| Livreur | missions actuellement attribuées et responsabilité financière propre, dans son agence ; aucun rapport comparatif des collègues |

L’overview assemble seulement les rapports effectivement accessibles. Les droits reports.read/audit.read sont attribués aux rôles existants company_admin et agency_manager par migrations additives et seed idempotent. Les gestionnaires de stock et livreurs utilisent leurs permissions de lecture existantes ; aucun droit financier implicite pour le gestionnaire. La suspension d’un profil livreur conserve uniquement ses lectures financières de régularisation autorisées par le Bloc 12.

Une entreprise reste fixée par la session. Une agence reste fixée pour un contexte AGENCY. Une boutique peut consolider ses propres données chez ses transporteurs ou sélectionner une association existante. Aucun accès opérationnel implicite pour un Super Administrateur. Les filtres ne permettent jamais d’élargir ces périmètres.

## API

Préfixe `/api/reports`. Routes GET : `options`, `overview`, `orders`, `deliveries`, `agencies`, `drivers`, `stocks`, `collections`, `subscriptions`, `audit`. POST `exports` : voir [REPORT_EXPORTS.md](REPORT_EXPORTS.md).

`options` fournit des choix nommés entreprises/transporteurs/agences/boutiques/livreurs dans les droits courants, limités à 200 par liste. Aucun annuaire global de livreurs n’est exposé au Super Administrateur ou aux boutiques.

Paramètres GET :

| Champ | Valeurs / règle |
|---|---|
| preset | today, yesterday, 7d, 30d (défaut), week, month, previous-month, custom |
| from / to | AAAA-MM-JJ, obligatoires seulement avec custom, fin incluse |
| companyId / agencyId / shopId / courierId | UUID, uniquement dans le périmètre autorisé |
| status / type | statut logistique exact ; ONE_OFF ou FROM_STOCK |
| actorId / module / action | audit seulement ; module correspond à entityType existant |
| page / size | page 1–10 000, taille 1–100, défaut 20 |

Période de 1 à 366 jours. Fuseau métier `REPORT_TIMEZONE`, défaut Africa/Douala. Le client ne peut pas remplacer ce fuseau via une requête. Conversion des bornes calendaires en UTC avec Temporal ; intervalle début inclus / fin exclusive. Les journées peuvent durer 23 ou 25 heures lors d’un changement d’heure. `week` commence le lundi. La période entière est appliquée côté serveur.

Les filtres d’audit sont refusés ailleurs. Les filtres opérationnels sont refusés dans les agrégats SaaS. Stocks/finances autonomes refusent statut et type ; les volets financiers et stock complémentaires des comparatifs logistiques sont omis avec ces filtres. Le stock ne s’attribue pas à un livreur. Les champs inconnus sont refusés.

Réponse : `kind`, `title`, `organization`, `generatedAt`, `period` (dates locales, fuseau, bornes UTC), `filters` effectifs, `metrics`, `tables` paginés, `series`, `comparison` éventuelle et `notes`. Les valeurs financières sont des chaînes décimales exactes ; null signifie indisponible. Les tables et notes sont identiques pour Web, Expo et exports.

Erreurs : 400 filtres/période invalides ; 401 session absente ; 403 accès/contexte/origine/CSRF refusé ; 422 périmètre trop volumineux ; 429 quota. Réponses privées `Cache-Control: no-store`. Jusqu’à 60 requêtes par minute et utilisateur, exports limités séparément à six par minute.

## Parcours

Web : accueil de chaque rôle autorisé et module Rapports, intégrés à `PortalLayout`, sélection de vue et période, filtres nommés, cartes, courbe quotidienne, histogrammes de volumes, tableaux et pagination, téléchargements CSV/XLSX/PDF. Les liens vers commandes, stocks, encaissements et missions restent de vrais liens vers les modules existants. Le tableau de bord respecte le Design System et les couleurs officielles.

Expo SDK 57 : accueil et Rapports dans la navigation existante ; vues disponibles selon les permissions, périodes usuelles et personnalisées, consolidation boutique, cartes, barres quotidiennes simples, historique et tableaux paginés. Restauration/session et rafraîchissement au premier plan réutilisent `useApiData`. Aucun nouveau package natif ; exports de fichiers proposés sur Web, rapports simplifiés sur mobile.

## Performance et MySQL

Agrégations COUNT/SUM/AVG et regroupements en SQL, avec paramètres liés Prisma.sql. Pas de chargement de toutes les commandes pour les compteurs. Les bornes journalières produisent un CASE SQL paramétré (au plus 366 jours), sans dépendre des tables de fuseaux MySQL. Tables agrégées comptées/paginées côté serveur ; tri stable amélioré par clés de groupe lorsque nécessaire.

Le calcul financier complexe réutilise le ledger du Bloc 12 dans une cohorte plafonnée à 2 000 encaissements. Le serveur refuse les cohortes plus grandes avant leur chargement, au lieu de tronquer les sommes. Les obligations client sont calculées par page, avec un chargement groupé des déclarations associées, lui aussi plafonné. Pas de boucle de requêtes par commande. Les sous-rapports restent bornés ; transaction de 30 secondes maximum. Les tests locaux sont une mesure de non-régression, pas un benchmark de production.

Trois migrations nouvelles : `20261030090000_reporting_indexes` (sept index, droits) `20261030091000_reporting_permission_ids` (UUID explicites des attributions) et `20261030092000_reporting_permission_timestamps` (correction des dates techniques révélée par la régression). Les 25 migrations antérieures sont conservées. 70 modèles, aucune nouvelle table. Aucun historique métier modifié pour fabriquer des résultats.

Index ajoutés : Delivery par entreprise/agence/création, entreprise/agence/clôture, entreprise/livreur/clôture ; Collection entreprise/agence/création ; AuditLog entreprise/agence/création ; SubscriptionPayment statut/validation/entreprise ; Stock entreprise/agence/boutique.

Consulter [KPI_DEFINITIONS.md](KPI_DEFINITIONS.md), [AUDIT_REPORTING.md](AUDIT_REPORTING.md) et [BLOC-15-RAPPORT.md](BLOC-15-RAPPORT.md) pour définitions, limites et résultats réellement exécutés.
