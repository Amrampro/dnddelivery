# Bloc 12 — Encaissements et remises de fonds

Réalisé et vérifié le 29 octobre 2026 sur API, Web et Expo SDK 57. Les fonds sont déclarés et rapprochés ; aucun paiement, virement ou règlement boutique/transporteur n’est exécuté par DND Delivery. Aucun déploiement ni passage au Bloc 13.

## Fonctionnalités livrées

- Instructions d’encaissement par commande/mission, instantanés d’affectation historiques et montant attendu actuel corrigible avec autorisation distincte.
- Déclarations du livreur réellement affecté après prise en charge physique : complète, partielle, nulle motivée, excédentaire motivée et multiple. État financier indépendant de la livraison finale.
- Remises partielles ou regroupées, sources paginées, allocations réservées et prévention des doubles engagements concurrents.
- Réception distincte par responsable : conforme, avec montant réellement reçu différent, rejet ou demande d’une nouvelle déclaration. Interdiction d’auto-confirmation, de double décision et de changement des déclarations originales.
- Soldes exacts par devise/agence/livreur : brut, net client, reste client, remboursements, fonds reçus, engagement en attente, responsabilité et disponible.
- Écarts et litiges avec résolution motivée, corrections à deux personnes, remboursement externe depuis les fonds du livreur ou ceux déjà reçus par l’agence, correction de réception, attendu et dérogation documentée sur instantanés revalidés.
- Historique immuable, audit, avis intégrés et traitement différé SMTP avec revalidation des droits. Un changement de rôle n’expose pas les anciens avis de supervision.
- Consultation boutique limitée aux propres commandes, sans soldes/remises/réceptions internes. Régularisation des fonds existants après expiration d’abonnement ; protection contre l’abandon d’une dette par désaffiliation.

Les montants sont des chaînes exactes DECIMAL(19,4), calculées avec des entiers à quatre décimales. Aucun taux de conversion. Le solde livreur n’est réduit que par ses remboursements approuvés et les réceptions effectives de l’agence. Un remboursement par l’agence ne recrée pas de dette livreur.

## Pages Web et écrans Expo

Encaissements, Remises, Soldes des livreurs, Écarts, Régularisations et Historique financier ; suivi des propres commandes pour les boutiques. Avis financiers intégrés, filtres, pagination et actualisation périodique sur écran actif. Les fiches commande/livraison ont un résumé financier contextualisé.

Les onglets Expo donnent priorité aux encaissements et remises du livreur et du responsable. Déclaration, remise et réception sont réalisables sur Expo. Formulaires dédiés avec confirmation explicite, montants exacts, contexte figé pendant l’opération et reprise de la même clé après erreur réseau. La sélection de fonds conserve les sources cochées entre les pages, avec plafond de 100 lignes par remise.

Design System et logos existants réutilisés. Les tableaux des modules financiers ont des chiffres réels ; les anciens écrans d’accueil généraux encore préparatoires restent explicitement indiqués comme tels.

## API, fichiers et modèles

Toutes les routes financières sont sous `/api` et protégées par session, contexte, permissions, origine, CSRF selon le mode d’authentification, limitation des écritures et no-store. Mutations idempotentes, décisions versionnées, transactions sérialisables avec verrou entreprise. Aucun identifiant fourni par un filtre ne crée de droit.

GET `/financial-options`, `/financial-overview`, `/financial-obligations`, `/financial-history`, `/financial-notifications` ; GET `/collections` et `/:id` ; POST `/driver/collections` ; GET `/cash-remittances` et `/:id` ; POST `/driver/cash-remittances` ; POST `/cash-remittances/:id/decision` ; GET/POST `/financial-corrections` ; POST `/financial-corrections/:id/decision` ; GET/POST `/financial-discrepancies` ; GET `/financial-discrepancies/:id` ; POST `/financial-discrepancies/:id/resolve`.

Fichiers principaux :

- `api/src/modules/collections/{routes,core,service,read,ledger,money,access,validation,permissions,protection,notifications}.ts`.
- `api/src/jobs/collections.ts`, routes centrales, seed de permissions, intégration organisation et instantanés d’affectation dans les livraisons.
- `shared/{finance,finance-actions}.ts` et `shared/finance.test.mjs`.
- `webapp/src/finance/` et intégrations des fiches commande/livraison et de PortalLayout.
- `mobileapp/src/finance/`, WorkspaceScreen, fiches commande/livraison et navigation partagée ; `mobileapp/tsconfig.json` autorise les imports .ts du code partagé testé directement.
- `api/tests/database/collections.database.test.ts`, `api/tests/collections-http.test.ts`, `api/tests/serve-finance-preview.ts`.

Collection, Remittance, RemittanceItem et leurs événements sont étendus ; FinancialCorrection, FinancialDiscrepancy et FinancialEvent sont ajoutés. 64 modèles, 21 migrations. Migrations additives appliquées uniquement à la base locale existante de test :

1. `20261029080000_operational_finance` : allocations partielles, instantanés, modèles, contraintes, immutabilité et droits.
2. `20261029081000_financial_refund_origin` : origine agence autorisée pour le remboursement externe documenté.

Les 19 migrations précédentes sont inchangées ; 21 empreintes de migrations appliquées correspondent aux fichiers. Validation Prisma réussie, schéma à jour. Les anciens enregistrements non rapprochables restent en lecture seule, signalés et exclus des nouveaux soldes. Aucune base recréée, aucun reset, aucune modification des logos, fichiers .env ou dépendances natives. Les 33 empreintes protégées sont inchangées.

## Tests réellement exécutés

| Ensemble | Résultat final |
| --- | --- |
| MySQL dédiée existante | 216 tests TAP réussis, zéro échec |
| Dont suite financière | 37 sous-scénarios et leur suite, soit 38 TAP inclus dans les 216 |
| API/Auth/HTTP/SMTP | 34 réussis, zéro échec |
| Code partagé et actions d’interface | 33 réussis, zéro échec |
| Total distinct | 283 réussis ; les relances ciblées ne sont pas additionnées |
| API | Typecheck source/tests/outils, lint, build, validation Prisma et état des migrations réussis |
| Web | Build et lint réussis |
| Expo SDK 57 | Typecheck, lint, matrice locale/install --check, exports Web/Android/iOS réussis |

Les 178 tests MySQL antérieurs restent couverts dans les 216. Les tests financiers utilisent de vrais services de commandes et livraisons, les contraintes SQL de MySQL et des acteurs distincts. Aucun mouvement de stock ni preuve finale n’est créé par une écriture financière. Contrôle structurel natif des deux nouveaux fichiers TSX : aucun texte brut sous View/Card.

Couverture des scénarios demandés :

| Scénarios du cahier des charges | Vérification exécutée |
| --- | --- |
| 1–7 : attendu, requis/non requis, complet/partiel/nul/excédentaire | MySQL, arithmétique exacte et actions partagées |
| 8–12 : fonds, remise partielle, plusieurs commandes, soldes | MySQL ; recette Expo partielle ci-dessous |
| 13–15 : responsable distinct, auto/double confirmation refusées | MySQL ; réception par autre compte Expo |
| 16–18 : détection, résolution, absence de double comptage | MySQL, historique et idempotence |
| 19–21 : concurrence, correction et conservation de l’original | MySQL, contraintes immuables, versions et deux approbations concurrentes |
| 22–23 : échec et réaffectation | MySQL, responsabilité historique ; transfert inter-agences réel sans déplacement des fonds |
| 24–27 : entreprise/agence/boutique/abonnement | MySQL, HTTP anonyme, filtres falsifiés, profil suspendu et droits révoqués |
| 28 : indépendance logistique | MySQL et recette réelle avec IN_PROGRESS/FINAL_DISTRIBUTION et zéro preuve |
| 29–33 : tableaux Web, déclaration/remise/réception Expo, réseau | Recette navigateur sur API/MySQL ci-dessous |
| 34–35 : notifications et audit | MySQL, échec/reprise d’adaptateur et vrai serveur SMTP local, Message-ID stable et droits revalidés |
| 36–38 : compilation, Expo et régression | Vérifications complètes indiquées ci-dessus |

Vérifications complémentaires : décimales 0,1 + 0,2 exactes, bornes de montant, devises séparées, confidentialité des corrections de réception côté boutique, remboursement par l’agence sans dette recréée et impossibilité de diminuer sa réception sous les remboursements réalisés. Une dérogation n’est approuvable qu’avec les instantanés toujours valides et cesse de s’appliquer si un paiement ultérieur les modifie.

## Recette réelle Web et Expo Web

API/MySQL locaux et serveur SMTP intercepté, comptes de test existants. Le harness de recette est limité à NODE_ENV=test, DND_ADMIN_TEST_PREVIEW=1, nom de base dédié et écoute locale. Il conserve comptes, commande, mission et fonds lors des redémarrages. Il n’est pas importé par le démarrage normal.

1. Supervision Web : commande de recette attendue à 25 000 XAF, aucune déclaration ni réception.
2. Expo livreur Samuel, agence Douala : montant saisi 20 000 XAF et observation de paiement partiel.
3. API volontairement coupée avant enregistrement : erreur visible, montant et observation conservés. Redémarrage sur les mêmes données puis même bouton : une seule déclaration de 20 000, reste client 5 000, responsabilité livreur 20 000.
4. Expo : sélection de cette source et remise partielle annoncée de 15 000. MySQL confirme responsabilité 20 000, engagé 15 000, disponible 5 000 et reçu agence 0.
5. Autre compte Expo, responsable d’agence : ouverture du détail, décision DISPUTE avec 14 000 XAF réellement comptés et motif. Le déclarant et le responsable sont différents.
6. Détail Expo : 15 000 annoncés, 14 000 constatés, nom du responsable et chronologie conservés. Web filtré sur cette commande : attendu 25 000, déclaré client 20 000, reçu agence 14 000, responsabilité livreur 6 000, reste client 5 000, engagé 0. Deux écarts restent ouverts pour examen.
7. Relecture MySQL : une déclaration, une remise DISPUTED ; mission IN_PROGRESS, phase FINAL_DISTRIBUTION, zéro preuve. Aucun paiement ni livraison finale exécuté.

La recette conserve volontairement ce cas partiel pour permettre son inspection. Les autres parcours de correction/remboursement/résolution, complet et inter-agences sont validés par les tests MySQL ; ils ne sont pas présentés comme autant de recettes manuelles supplémentaires.

Preuves dans `.local-preserved/bloc12` : `ui-evidence.jsonl`, `expo-network-error.png`, `expo-remittance-pending.png`, `expo-receipt-disputed.png`, `web-financial-balances.png`. La dernière capture Web a été inspectée visuellement : montants et libellés lisibles, sans chevauchement dans le viewport de bureau utilisé.

## Commandes de vérification et journaux

Exécuter les commandes dans leur application respective. Les tests MySQL utilisent DATABASE_URL/TEST_DATABASE_URL de la base dédiée, sans recopier les identifiants dans le rapport. Ne pas régénérer simultanément le client Prisma pendant une suite qui le charge.

```text
api       npm run typecheck
api       npm run lint
api       npm run build
api       npm test
api       npm run test:db
api       npm run db:validate
api       npm run db:migrate:status
webapp    npm run build
webapp    npm run lint
webapp    npm test
mobileapp npm run typecheck
mobileapp npm run lint
mobileapp npm run check:dependencies
mobileapp expo export --platform all --max-workers 2 --output-dir ../.local-preserved/bloc12/mobile-final
```

Logs : `database-final.log`, `api-tests.log`, `shared-tests.log`, `api-types.log`, `api-lint.log`, `api-build.log`, `web-build.log`, `web-lint.log`, `mobile-types.log`, `mobile-lint.log`, `mobile-dependencies.log`, `mobile-exports.log`, `prisma-validate.log`, `migrations-status.log`, `migrations-checksums.log`, `protected-final.json` dans `.local-preserved/bloc12`. Les identifiants de recette restent dans un fichier privé et ne figurent pas dans ce rapport.

## Incidents corrigés, limites et suites

Une première régression complète a échoué au chargement du client Prisma à cause d’une régénération concurrente ; relance isolée finale : 216/216. L’accès à MySQL nécessite l’autorisation réseau locale de l’environnement d’exécution. Le premier export natif a échoué par refus d’écriture du compilateur Hermes dans le dossier temporaire Windows ; relance réussie avec TEMP/TMP sous le projet. Ces tentatives ne sont pas comptées comme réussies.

Expo install --check hors ligne affiche son avertissement de validation moins fiable, puis « Dependencies are up to date ». La matrice SDK 57 installée est conservée ; aucune vérification supprimée. Aucune dépendance native changée, donc aucun nouveau passage Expo Doctor n’est revendiqué. Android/iOS sont des bundles Hermes exportés, sans signature ni installation physique. La recette interactive est Expo Web dans un navigateur de bureau ; aucun téléphone réel ni viewport téléphone vérifié n’est revendiqué.

SMTP local vérifié ; aucun SMTP de production ni push externe validé. Les événements PUSH restent en attente sans adaptateur. Les fonds historiques non rapprochables exigent une analyse séparée et ne sont pas rétroactivement validés. Les soldes ne remplacent ni une comptabilité légale, ni les rapports avancés du Bloc 15.

Les données de test sont conservées et les services de recette sont arrêtés à la fin. Aucun paiement exécuté, passerelle, règlement boutique/entreprise, OTP, photographie obligatoire ou suivi public complet ajouté. Bloc 13 reste nécessaire pour la preuve finale ; aucun statut financier ne s’y substitue.

Le journal contient la nouvelle section exacte « Bloc 12 — Encaissements et remises de fonds », ajoutée sans suppression des sections antérieures. Les modifications aux blocs précédents sont limitées aux instantanés d’affectation, garde-fous de responsabilité financière, résumés sur fiches et navigation financière, et sont documentées dans cette section.
