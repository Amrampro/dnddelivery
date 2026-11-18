# Plan de tests

## Reproduction

Utiliser Node 22.23.4 et les lockfiles, puis `npm ci` dans chaque application. Sur ce poste Windows le lanceur peut être utilisé depuis la racine, par exemple `./scripts/npm-local.ps1 -App api -NpmArgs @('run','test')`.

| Surface | Vérifications |
| --- | --- |
| API | `npm run lint`, `npm run typecheck`, `npm run build`, `npm run db:validate`, `npm test`, `npm run test:dependency-security`, `npm run audit:security` |
| Web | `npm run lint`, `npm run build`, `npm test`, `npm run test:dependency-security`, `npm run audit:security` |
| Mobile | `npm run lint`, `npm run typecheck`, `npm run typecheck:tests`, `npm test`, `npm run check:dependencies`, `npm run doctor`, `npm run build` |
| MySQL 8.4 | `npm run test:db` dans `api` avec `NODE_ENV=test`, `TEST_DATABASE_URL` sur une base isolée `dnd_delivery*_test`, les clés de test générées automatiquement par le lanceur et, si nécessaire, clé RSA publique MySQL épinglée. |

La recette `api/tests/database/lifecycle.database.test.ts` relie invitations via SMTP local, abonnement déclaré et approuvé, agences, gestionnaire et livreur, boutique, collaboration, dépôt, commande sur stock, affectation, OTP, photo privée et suivi, encaissement, remise rejouée, export et rejet interentreprises. Une commande ponctuelle est prélevée directement en boutique et passe en distribution sans mouvement de stock ni encaissement. Les tests spécialisés complètent ce parcours avec plusieurs statuts, annulations et retours, les accès administrateurs et les tentatives sur les routes HTTP.

## Pannes et entrées hostiles

| Scénario | Contrôle |
| --- | --- |
| API ou réseau coupé | Tests clients sur le refus des mutations et la reprise. Rejouer sur appareil physique en Wi-Fi puis réseau mobile. |
| MySQL indisponible | Test de la sonde en échec et en délai dépassé. Couper MySQL dans un environnement de recette dédié et vérifier le retour 503, le démarrage et le rétablissement. |
| SMTP et push indisponibles | Tests des workers et files, erreurs SMTP, reprises bornées et absence de preuve d’envoi injustifiée. Relais externe et appareils à valider. |
| Upload interrompu et photo hostile | Vérifier que l’upload échoué laisse la livraison non confirmée. Tests de format, taille, répertoires publics et contrôle de preuves. Simuler une coupure pendant l’envoi sur appareil réel. |
| Double validation / double appui | Rejeu sur clés d’opération et conflits de version dans les suites MySQL. Refaire avec deux appareils et le même acteur autorisé. |
| Session ou abonnement expiré | Renouvellement, révocation, permissions recalculées et restrictions métier dans les suites auth et abonnements. |
| Stock insuffisant / colis introuvable | Concurrence des réservations, rejet du stock insuffisant, lectures hors périmètre, incidents et retours. |
| OTP incorrect / remise contestée | Rejets, limites de tentatives, expiration, écarts, contestation et rapprochement de montants. |

## Matrice sur écrans réels

| Plateforme | Vérifications à consigner |
| --- | --- |
| Chrome et Edge, ordinateur et petit écran | Connexion, changement de contexte, routes directes, formulaires longs, exports et erreurs réseau. |
| Firefox, ordinateur | Cookies, téléchargements, focus clavier, tableaux, recadrage des photos. |
| Safari, macOS et iPhone | Cookies HTTPS, historique, téléchargement, retour arrière et lien de suivi. |
| Android, smartphone et tablette | Connexion, rotation autorisée, caméra refusée, retour système, upload interrompu, push au premier plan et à froid. |
| iOS, iPhone et iPad | SecureStore et relance, zones sûres, permissions, partage, deep links et APNs. |

Rejouer au moins sur deux entreprises avec un utilisateur limité et une boutique multientreprise. Conserver date, build, OS, navigateur, rôle, résultat et défaut observé dans le dossier de recette, sans données personnelles.
