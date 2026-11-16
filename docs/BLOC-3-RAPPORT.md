# Rapport Bloc 3 — Authentification

## Livré

Connexion e-mail/mot de passe Argon2id, JWT court, refresh aléatoire stocké sous forme de hash, rotation et révocation de famille en cas de réutilisation, déconnexion individuelle et globale, liste des appareils, profil modifiable par liste blanche, changement et réinitialisation du mot de passe. Les jetons de réinitialisation sont expirables, hashés et à usage unique. SMTP configurable avec TLS obligatoire en production. Aucun compte par défaut ni endpoint public de création de privilèges.

Les affiliations et permissions sont relues côté serveur. La sélection d’entreprise, agence ou collaboration boutique ne permet pas d’élargir les droits. Retraits d’affiliation, désactivation de compte et suspension d’entreprise prennent effet sur les nouvelles requêtes. Le Super Administrateur utilise un droit global indépendant des entreprises. Aucun compte destinataire n’est requis. Bootstrap initial explicite, manuel et transactionnel, sans mot de passe imposé.

Web : cookies HttpOnly, Secure en production, SameSite configurable, contrôle d’origine et CSRF. Expo SDK 57 : jetons natifs dans SecureStore, restauration et refresh centralisés. La prévisualisation Web Expo utilise uniquement la mémoire et ne simule pas une persistance native. Les clients possèdent les écrans connexion, oubli/réinitialisation, organisations, profil et sessions ; les espaces professionnels sont protégés et affichent le contexte réel retourné par le serveur. Les modules métier des prochains blocs restent absents.

## Contrat et migration

Sous `/api/auth` : POST login, refresh, logout, logout-all, forgot-password, reset-password, change-password, switch-organization ; GET me, organizations, sessions, csrf, workspace ; PATCH me ; DELETE sessions/:id. Le contrat complet figure dans [AUTHENTICATION.md](AUTHENTICATION.md).

Migration ajoutée : `api/prisma/migrations/20261020200000_auth_sessions/migration.sql`. Elle étend Session avec clientType, deviceName, csrfHash, activeContext, lastSeenAt et un index de révocation/expiration. Aucune ancienne migration modifiée, aucune migration appliquée ici. Les anciennes sessions Web sans CSRF nécessitent une nouvelle connexion. Les logos, assets et landing protégés sont inchangés : comparaison SHA-256, zéro différence.

Bibliothèques ajoutées : @node-rs/argon2, jose, cookie-parser, express-rate-limit, nodemailer, expo-secure-store et leurs types nécessaires. Prisma/MySQL restent les seuls moyens de persistance du runtime serveur. Les dépendances mobiles restent alignées sur Expo 57 ; aucun contournement par rétrogradation forcée.

Configuration ajoutée : AUTH_ACCESS_SECRET, AUTH_ACCESS_TTL_SECONDS, AUTH_REFRESH_TTL_DAYS, AUTH_RESET_TTL_MINUTES, AUTH_COOKIE_SAMESITE, WEB_APP_URL, TRUST_PROXY_HOPS ; SMTP_HOST, SMTP_PORT, SMTP_FROM, SMTP_USER, SMTP_PASSWORD, SMTP_SECURE ; BOOTSTRAP_CONFIRM, BOOTSTRAP_EMAIL, BOOTSTRAP_NAME, BOOTSTRAP_PASSWORD pour la commande manuelle uniquement. DATABASE_URL et CORS_ORIGINS restent nécessaires. Voir api/.env.example. Aucun secret existant remplacé.

## Vérifications réellement exécutées

| Contrôle | Résultat |
| --- | --- |
| API build, typecheck, lint ; Prisma generate/validate | Réussite |
| Suite API finale | 28 tests réussis, 0 échec |
| Tests sécurité | Identifiants invalides, compte désactivé, expiration, refresh concurrent/réutilisé, révocations, reset unique/expiré, permissions et isolation multi-tenant, CSRF, origine, limitation des essais, bootstrap sans paramètres |
| SMTP local éphémère | Message reçu ; configuration incomplète refusée ; SMTP sans TLS refusé en production |
| API compilée /api/health | Réponse status: ok |
| Web build et lint | Réussite |
| Expo typecheck et lint | Réussite |
| Expo Doctor et contrôle des dépendances | 21/21 ; versions compatibles |
| Export Expo iOS, Android et Web | Réussite ; dix routes Web |
| Navigateur Web sur API de test isolée | Connexion, choix d’agence, portail autorisé, restauration après rechargement, profil, déconnexion et redirection privée vérifiés |
| Interface Expo dans le navigateur | Connexion, organisations, espace, profil et déconnexion vérifiés ; erreur JSX détectée à l’exécution puis corrigée |
| Audit npm API après corrections compatibles | 0 vulnérabilité signalée |
| Audit npm mobile après corrections compatibles | 29 restantes : 18 élevées, 11 modérées ; voir SESSION_SECURITY.md |

Les tests HTTP/SMTP utilisent des ports locaux temporaires. Une relance initialement confinée a échoué sur les connexions locales ; la même suite autorisée à utiliser le réseau local a passé ses 28 tests. De même, Hermes a nécessité une relance autorisant l’écriture de ses fichiers temporaires après un refus du bac à sable. Les doubles de stockage et comptes example.invalid sont confinés à api/tests et ne constituent pas une connexion réelle à MySQL. Les captures dans docs/previews/bloc3-* illustrent ces données de test uniquement.

## Limites et opérations non effectuées

Pas de DATABASE_URL ou TEST_DATABASE_URL pour une nouvelle base : `npm run test:db` a explicitement indiqué NOT RUN. Les tests MySQL d’authentification sont préparés, mais leurs transactions, verrous, contraintes et la migration restent à valider sur MySQL réel. Aucun SQL appliqué, aucun compte réel créé et aucun bootstrap réel exécuté. Le test du bootstrap sans paramètres vérifie son refus avant connexion.

Pas de SMTP externe configuré : aucun e-mail externe envoyé. La réinitialisation a été testée avec le service et le récepteur SMTP local. L’envoi après réponse n’est pas une outbox durable ; un arrêt du processus peut interrompre un message. Les limiteurs sont locaux au processus et nécessitent un stockage partagé avant une exploitation multi-instance.

Pas de simulateur natif ni téléphone connecté : les exports natifs réussissent mais SecureStore, reprise après arrêt, liens profonds et parcours complet sur iOS/Android restent à tester sur appareil. La restauration native n’est donc pas certifiée par le test navigateur.

Les avis npm mobiles concernent des dépendances transitives de la chaîne Expo/React Native, notamment braces, node-forge, decode-uri-component et uuid. Les corrections forcées proposées changent de versions majeures ou rétrogradent la plateforme ; elles n’ont pas été appliquées. Le projet n’est pas déclaré exempt de vulnérabilités. Aucun déploiement en production ni développement du Bloc 4.

## Reproduire les contrôles

Dans api : `npm ci`, `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run db:validate`. Avec une base MySQL de test dédiée et TEST_DATABASE_URL configurée : `npm run test:db` (applique les migrations dans cette base de test).

Dans webapp : `npm ci`, `npm run build`, `npm run lint`, `npm run dev`.

Dans mobileapp : `npm ci`, `npm run typecheck`, `npm run lint`, `npm run doctor`, `npm run check:dependencies`, `npm run build`, puis `npm start` pour vérifier sur appareil.

Pour une installation réelle, suivre dans l’ordre la configuration privée, les migrations, le seed et le bootstrap explicite de [AUTHENTICATION.md](AUTHENTICATION.md). Les règles de périmètre sont décrites dans [ROLES_PERMISSIONS.md](ROLES_PERMISSIONS.md), [TENANT_ACCESS.md](TENANT_ACCESS.md) et [SESSION_SECURITY.md](SESSION_SECURITY.md).
