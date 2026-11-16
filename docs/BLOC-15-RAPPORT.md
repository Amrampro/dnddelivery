# Bloc 15 — Statistiques, rapports, exports et audit

Date : 30 octobre 2026. Travail réalisé dans le projet existant, sans production, reconstruction des applications ou passage au Bloc 16.

## Fonctionnalités livrées

Tableaux de bord réels selon les permissions : administration SaaS, entreprise, agence, stock, boutique multi-transporteurs et livreur personnel. Vue d’ensemble, commandes, livraisons, agences, livreurs, stocks, finances opérationnelles, abonnements et audit. Les valeurs viennent de MySQL, les graphiques de ces mêmes réponses ; aucun KPI fictif.

Filtres de période côté serveur : aujourd’hui, hier, sept/trente jours, semaine, mois, mois précédent et dates personnalisées. Fuseau métier configurable, bornes UTC inclusives/exclusives, changements d’heure testés. Agence, boutique, transporteur, livreur, statut/type et filtres d’audit selon la vue et le contexte autorisés. Comparaison des commandes avec la période précédente. Pagination et refus des périmètres trop grands.

Commandes par date/type/statut/boutique/transporteur/agence ; missions, tentatives, taux de réussite, première réussite enregistrée, durée depuis l’enlèvement, incidents, retours et acheminements. Comparaisons logistiques sans double compter les affectations ; responsabilités financières présentées à part. Soldes physiques/réservés/disponibles, seuils/ruptures, transit, mouvements et écarts d’inventaire issus des tables du moteur existant. Fonds attendus, déclarés, remises confirmées, soldes et régularisations issus du ledger Bloc 12, exacts par devise et séparés des abonnements SaaS.

Les rapports journaliers/hebdomadaires/mensuels/personnalisés sont générés à la demande avec ces mêmes périodes. CSV, XLSX et PDF produits au serveur, avec organisation/période/fuseau/filtres/date/données/définitions. Formules neutralisées dans les tableurs ; aucun export partiel présenté comme complet. Événement REPORT_EXPORTED après réussite.

Journal AuditLog en lecture seule, filtrable et paginé, avec auteur/action/entité/entreprise/agence/date. Métadonnées libres exclues par liste positive. L’administration globale reçoit les agrégats SaaS ; elle ne reçoit pas les commandes personnelles des entreprises ni leurs journaux détaillés.

## Interfaces et endpoints

Web : `webapp/src/reports/ReportsWorkspace.tsx`, intégré à l’accueil et à Rapports ; journal global ouvre directement la vue d’audit. Courbes et histogrammes Recharts, cartes et tableaux du Design System, filtres nommés, états vides/erreurs/chargement, téléchargements. Chaque vue peut être ouverte par `/portail/{role}/rapports?report=orders` (ou deliveries/agencies/drivers/stocks/collections/subscriptions/audit selon les droits).

Expo : `mobileapp/src/reports/ReportsScreen.tsx`, accueil, Rapports et onglet Activité existants. Cartes, barres quotidiennes simples, périodes, consolidation boutique, historique, pagination et accès aux missions/stocks existants. Sessions et rafraîchissement existants réutilisés. Aucun package natif ajouté, logos et identifiants com.goulbam.dnddelivery conservés.

API : GET `/api/reports/options|overview|orders|deliveries|agencies|drivers|stocks|collections|subscriptions|audit`, POST `/api/reports/exports`. Authentification, contexte, permissions, origine/CSRF et quotas conservés. Modules centraux : `api/src/modules/reports/{access,period,service,exports,routes,contracts,permissions}.ts`, contrat UI `shared/reports.ts` et intégration dans `shared/workspace.ts`.

## MySQL et corrections de recette

70 modèles, 28 migrations au total. Trois ajouts, sans altérer les 25 anciens SQL :

1. `20261030090000_reporting_indexes` : sept index de reporting et droits des rôles existants.
2. `20261030091000_reporting_permission_ids` : identifiants explicites pour les liens de permissions, après constat que les UUID Prisma ne sont pas des valeurs par défaut SQL.
3. `20261030092000_reporting_permission_timestamps` : dates techniques valides des nouvelles permissions ; la régression complète avait détecté un effet sur Partenaires et Catalogue. Les migrations appliquées sont conservées, la correction est additive.

Autres ajustements issus des tests : casts signés des deux opérandes pour les écarts MySQL négatifs ; événement réel PICKED_UP pour compter les prises en charge ; noms d’agence/boutique/livreur dans les tableaux ; options de filtres ne révélant pas l’annuaire des boutiques au livreur ; états vides connectés correctement libellés ; notes dédupliquées et onglet Activité raccordé. Aucun historique opérationnel n’a été modifié pour améliorer les indicateurs.

## Validation exécutée

| Suite | Résultat |
|---|---:|
| MySQL complète, Blocs 3–15 | 302 / 302 |
| API / Auth / HTTP / périodes / exports | 66 / 66 |
| Contrats et navigation partagés | 48 / 48 |
| Tests mobiles | 36 / 36 |
| **Total distinct** | **452 réussis, zéro échec** |

Les rejouages ciblés ne sont pas recomptés. La nouvelle suite MySQL de reporting contient 20 résultats TAP, y compris son test parent. Le dernier rejouage ciblé est également vert. Première régression : 14 échecs liés aux dates techniques des permissions ; correction, puis régression complète finale réussie. Les premiers échecs de mise au point ne sont pas présentés comme des succès.

Les vérifications finales de compilation, lint, TypeScript et Prisma et leurs journaux sont consignées dans le journal de développement. Matrice Expo alignée, Doctor 21/21 et exports Android/iOS/Web réussis, sans désactivation des contrôles de compatibilité. Les 35 fichiers protégés contrôlés sont inchangés : .env privés, migrations antérieures et ressources officielles.

Recette réelle Web : connexion d’un administrateur à une entreprise de test, tableau de bord affichant deux commandes et deux missions en cours, zéros/valeurs indisponibles cohérents, courbe et tableaux raccordés. Expo Web : autre compte livreur, choix de son agence, accueil de statistiques personnelles et sélection du rapport Livraisons, seulement ses deux missions. PDF téléchargé via la vraie API puis ouvert dans Edge : titre, organisation, période, fuseau, filtres, tableaux et notes lisibles sur une page. Sept requêtes HTTP supplémentaires ont vérifié login/contexte/rapport, trois exports et les trois traces d’audit correspondantes.

Tests financiers : 100,1000 attendus, 60,1000 déclarés, 40,0000 restant côté client ; remise confirmée de 20,1000, responsabilité livreur de 40,0000 ; paiement SaaS distinct de 15,1234. Tests d’isolement interentreprises/agences/boutiques/livreurs, secret placé dans metadata d’audit absent du DTO, injection de formule neutralisée et XLSX rouvert sans cellule Formula. Bornes 23/25 heures lors des changements d’heure testées, période vide avec taux null et inventaire négatif sans modification du stock.

Journaux privés sous `.local-preserved/bloc15/` : `database-all-final.log`, `reports-db-final.log`, `api-tests-final.log`, `shared-tests.log`, `mobile-tests.log`, `mobile-doctor.log`, `mobile-matrix.log`, compilations/exports finaux, `http-export-evidence.json` et `protected-verification.json`. Les comptes et fichiers de recette restent privés et hors applications publiques.

## Limites explicites

- Rapports à la demande ; pas de planification d’envoi ni de file de gros exports. Maximum 366 jours, 100 lignes par tableau exporté et 2 000 lignes/document ; ledger limité à 2 000 encaissements par cohorte.
- Stocks et responsabilités sont des photographies actuelles, pas une clôture historique reconstituée. Les dates et cohortes sont indiquées dans chaque rapport. Pas de délai promis enregistré, donc pas de faux KPI de retard contractuel.
- Le premier essai mesure l’absence d’échec enregistré ; une tentative non saisie ne peut pas être devinée. Les réussites personnelles sont attribuées au livreur actuel, pas rétroactivement à chaque ancien affecté.
- Options nommées limitées à 200 par liste. Les larges organisations nécessiteront une recherche/pagination de ces listes ; les requêtes statistiques elles-mêmes restent filtrables par identifiants validés.
- Recette visuelle sur Web et Expo Web de bureau. Pas de nouveau téléphone physique, binaire natif installé/signé, iPhone ou test de charge de production certifié pour ce bloc. Les exports Hermes Android/iOS ont été exécutés.
- L’alerte de dépendance Zod 3 de l’outillage Expo CLI décrite dans l’audit antérieur reste ouverte ; aucune matrice SDK n’a été contournée. Dépendances API : audit final zéro alerte, après correction de uuid utilisée par ExcelJS.

## Commandes de vérification

Depuis la racine, utiliser le Node corrigé installé pour le projet via le lanceur existant :

```powershell
.\scripts\npm-local.ps1 -App api -NpmArgs @('test')
.\scripts\npm-local.ps1 -App api -NpmArgs @('run','test:db')
.\scripts\npm-local.ps1 -App api -NpmArgs @('run','build')
.\scripts\npm-local.ps1 -App api -NpmArgs @('run','lint')
.\scripts\npm-local.ps1 -App webapp -NpmArgs @('run','build')
.\scripts\npm-local.ps1 -App webapp -NpmArgs @('run','lint')
.\scripts\npm-local.ps1 -App mobileapp -NpmArgs @('test')
.\scripts\npm-local.ps1 -App mobileapp -NpmArgs @('run','typecheck')
.\scripts\npm-local.ps1 -App mobileapp -NpmArgs @('run','check:dependencies')
.\scripts\npm-local.ps1 -App mobileapp -NpmArgs @('run','doctor')
.\scripts\npm-local.ps1 -App mobileapp -NpmArgs @('run','build')
```

`test:db` exige TEST_DATABASE_URL vers une base MySQL indépendante `dnd_delivery*_test` et, selon sa configuration, la clé publique MySQL locale. Ne pas utiliser une base de production. L’export Expo de recette a utilisé `--platform all --max-workers 2` avec TEMP/TMP dans le dossier privé du projet.

Guides : [REPORTING.md](REPORTING.md), [KPI_DEFINITIONS.md](KPI_DEFINITIONS.md), [REPORT_EXPORTS.md](REPORT_EXPORTS.md), [AUDIT_REPORTING.md](AUDIT_REPORTING.md). Journal complété sous le titre exact du Bloc 15.
