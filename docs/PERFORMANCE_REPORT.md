# Performance du Bloc 16

MySQL 8.4.13 et API tournent sur la même machine Windows. La base vierge migrée contient une petite recette à deux entreprises. `api/tests/database/lifecycle.database.test.ts` exécute le parcours, chronomètre les opérations et teste des lectures via Express en boucle locale. Les lectures et écritures métier incluent le coût réel de MySQL. Une exécution concurrente avec d’autres vérifications peut faire varier les durées.

| Lecture HTTP | Échantillons | p95 et maximum |
| --- | ---: | ---: |
| `GET /api/health` | 10 | 24 ms |
| `GET /api/ready` | 10 | 27 ms |
| `GET /api/orders` | 10 | 440 ms |
| `GET /api/reports/collections?preset=today` | 10 | 671 ms |

Une lecture d’échauffement puis cinq groupes de deux lectures par route. Chaque réponse passe le contrôle HTTP 200 et le délai maximal de 5 s. À dix échantillons, le percentile 95 calculé par rang supérieur correspond au maximum.

| Opération observée | Mesure individuelle |
| --- | ---: |
| Connexion via HTTP | 843 ms |
| Création et réservation sur stock | 370 ms |
| Affectation | 686 ms |
| Enlèvement | 636 ms |
| Mise à jour du statut | 461 ms |
| Déclaration financière | 608 ms |
| Validation OTP | 440 ms |
| Préparation et stockage de la photo | 632 ms |
| Rapport, appel de service | 275 ms |

Reproduire avec `npm run test:db` ou lancer le fichier de recette seul avec `node --import tsx --test tests/database/lifecycle.database.test.ts` après migrations et seed, depuis `api`. Utiliser seulement un schéma test et reprendre la procédure du [plan de tests](TEST_PLAN.md).

Avant diffusion, rejouer sur un clone anonymisé de volume représentatif pendant 10 minutes, avec une montée progressive jusqu’à 10 lecteurs simultanés. Seuils initiaux à ratifier en préproduction. Viser p95 santé ≤ 250 ms, disponibilité ≤ 500 ms, listes ≤ 800 ms, rapports ≤ 1 500 ms, login et écritures métier ≤ 2 000 ms, upload ≤ 5 s pour un JPEG moyen. Garder zéro erreur inattendue et mesurer séparément les réponses 4xx attendues, les exports complets et les worker batches. Respecter les limites de débit des comptes de recette et éviter toute charge de production.

Examiner `EXPLAIN ANALYZE` sur les filtres et tris réellement lents, vérifier les index de l’entreprise et les périodes de rapport, puis contrôler les pages profondes. Les routes de rapport et d’export bornent le nombre de lignes. Les chiffres ci-dessus portent sur un petit fixture et constituent un point de comparaison local. Aucun changement d’index n’a été appliqué à partir de ce jeu.
