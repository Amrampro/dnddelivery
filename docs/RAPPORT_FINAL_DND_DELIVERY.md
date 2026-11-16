# Rapport final DND Delivery · Bloc 16

**Verdict de lancement · NON PRÊT POUR LA PRODUCTION**

L’audit et la recette locale couvrent le portail React/Vite, le client Expo SDK 57 et l’API Express/Prisma avec MySQL. L’autorisation et les flux sensibles passent par l’API. Le stockage des médias est privé. Le [bilan par bloc](AUDIT_GLOBAL.md) détaille l’état des blocs 1 à 15. Le Bloc 16 ajoute les contrôles de disponibilité, la recette, les procédures d’exploitation et deux workflows GitHub.

## Résultats

| Vérification | Résultat observé |
| --- | --- |
| API | 69 tests HTTP et unitaires réussis, lint, TypeScript, build et validation Prisma |
| Web | 48 tests partagés réussis, lint et build Vite |
| Mobile | 35 tests réussis, lint et vérifications TypeScript, dépendances compatibles Expo 57, Doctor 21/21 et exports Android, iOS et Web |
| MySQL 8.4.13 | 302 tests existants réussis, dont la campagne HTTP d’intrusion et les contrôles interentreprises. 42 tests de médias, partenaires et catalogue rejoués après le dernier durcissement. |
| Recette intégrée | Base isolée, SMTP local réel, deux entreprises, stock, mission, OTP, photo, remise exacte de 50,1234 XAF, export et suivi. Une deuxième commande est prise en charge à la boutique et mise en distribution sans réservation, sortie de stock ni encaissement. La recette HTTP vérifie les sondes, la connexion et deux routes métier. |
| Installation MySQL | 28 migrations sur base vierge avec le compte de maintenance. Rôles initialisés. Bootstrap créé une fois et relancé sans changement. |
| Sauvegarde locale | Copie SQL restaurée dans un autre schéma après correction ciblée des fins de déclencheurs. 56 déclencheurs présents, contrôle d’immutabilité et empreinte de la photo rétablis. |
| Précontrôle | Réussite avec configuration fictive valide et refus d’un dossier d’images produits public |
| Performance | Mesures locales reproductibles. p95 de 440 ms pour les commandes et de 671 ms pour le rapport d’encaissement sur dix lectures chacun. |
| Compatibilité | Les commandes Edge sans interface n’ont pas produit de DOM exploitable. ADB a démarré à la seconde tentative et aucun appareil n’était connecté. La matrice réelle navigateur/appareil reste ouverte. |
| CI | Syntaxe YAML vérifiée localement. Exécution sur GitHub et examen de l’artefact en attente. |

Les commandes et limites figurent dans le [plan de tests](TEST_PLAN.md) et le [rapport de performance](PERFORMANCE_REPORT.md).

## Corrections et fichiers principaux

- **Disponibilité** · La présence du processus et l’accès aux dépendances sont séparés avec `/api/health` et `/api/ready`. `api/src/controllers/health.controller.ts`, `api/src/routes/index.ts`, `api/src/server.ts`, `api/src/jobs/preflight.ts`, `api/.env.example`.
- **Fichiers privés** · Les preuves, logos et images produits vérifient leur chemin réel. Le nettoyage signale les erreurs d’accès. `api/src/modules/confirmation/`, `api/src/modules/admin/logos.ts`, `api/src/modules/products/routes.ts`, `api/src/modules/partners/routes.ts`.
- **Dépendances et Expo** · Mises à jour correctives dans Expo 57 et verrouillages dans les trois applications. Suppression du patch obsolète `deepmerge`, conservation du correctif du décodeur URI et validation des URLs de distribution. `package.json` et lockfiles, `mobileapp/app.config.js`, `mobileapp/eas.json`, `mobileapp/patches/`.
- **Recette et livraison** · `api/scripts/test-database.ts`, `api/tests/database/lifecycle.database.test.ts`, tests de disponibilité et de stockage, `scripts/normalize-mysql-trigger-dump.mjs`, `.github/workflows/ci.yml`, `.github/workflows/release-candidate.yml`. Les 28 migrations déjà présentes ont été validées. Aucun SQL de migration ajouté.

L’audit npm actuel est à zéro pour API et Web. Trois entrées Expo restent liées au même décodeur déjà patché et testé. L’historique Git est absent du dossier courant. Le [registre de sécurité](SECURITY_AUDIT.md) identifie les alertes, leur traitement et les contrôles à reprendre.

## Décision de lancement

La préparation locale permet de lancer une recette de préproduction. Trois preuves sont indispensables avant mise en service.

1. Installer le candidat sur la cible de préproduction et vérifier Node, MySQL, le compte DBA, HTTPS, CORS, cookies, SMTP et fichiers privés avec le [guide Plesk](DEPLOYMENT_PLESK.md).
2. Restaurer une sauvegarde chiffrée de la cible dans un environnement isolé avec ses médias et clés, puis valider les objectifs de reprise. La [procédure de sauvegarde](DATABASE_BACKUP_RESTORE.md) consigne l’exercice local.
3. Vérifier GitHub et les signatures requises, puis valider les applications sur les appareils et navigateurs convenus. Apposer une approbation à un candidat identifié. [CI et artefacts](CI_CD.md), [diffusion mobile](MOBILE_RELEASE.md), [liste de validation](PRODUCTION_CHECKLIST.md).

Les risques, responsabilités et étapes de reprise figurent dans [les problèmes ouverts](KNOWN_ISSUES.md) et [la réponse aux incidents](INCIDENT_RESPONSE.md). Les opérations de ce bloc ont été effectuées localement, sur des données de recette. Le [journal de développement](JOURNAL_DE_DEVELOPPEMENT.md) reprend les interventions.
