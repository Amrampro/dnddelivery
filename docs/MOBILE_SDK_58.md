# Mobile — migration Expo SDK 58

Migration du 16 novembre 2026. La configuration native reste dans `app.json` et les plugins Expo ; les identifiants, les visuels et les fonctionnalités métier sont conservés.

## Versions

La matrice officielle `expo/bundledNativeModules.json` et les contrôles Expo servent de référence : Expo `~58.0.25`, Expo Router `~58.0.31`, React Native `0.88.1`, React/React DOM `19.3.0`, types React `~19.3.0`, Gesture Handler `~3.3.0`, Reanimated `4.7.1` et Worklets `0.13.0`. Les autres modules Expo sont alignés sur cette matrice. Le numéro de version d'Expo Go n'est pas nécessairement identique au numéro du paquet `expo` ; le SDK pris en charge doit être 58.

Utiliser Node 22.23.4 ou une autre branche corrigée admise par `package.json`. Les dépendances exactes sont verrouillées dans `package-lock.json`.

## Adaptations

- `npm start` et `npm run start:clear` ouvrent Metro en LAN, avec Expo Go. `start:local` garde l'option localhost et `start:tunnel` fournit une solution de secours réseau.
- Les notifications push natives ne sont pas initialisées dans Expo Go. Une demande explicite explique qu'une installation dédiée est nécessaire. La boîte de notifications métier reste utilisable ; l'installation dédiée conserve le code d'enregistrement et de réception des push.
- La référence du composant ScrollView utilise son type d'instance React, compatible avec les types stricts de React Native.
- L'en-tête de navigation reste explicitement opaque.
- Le chargement du contexte utilise `/auth/workspace` sans permission dans la chaîne de requête, comme sur le Web. Les droits frais renvoyés par le serveur et les contrôles des endpoints restent appliqués.
- Les dépendances `decode-uri-component` et `query-string` ont disparu du nouvel arbre. Leur ancien patch mobile, `patch-package` et les deux tests propres à ce décodeur ont été retirés. Les tests de transport, sessions, contrats et assets sont conservés.

## Tester sur un téléphone

Depuis la racine du projet, sous PowerShell :

```powershell
cd mobileapp
npm.cmd ci
npm.cmd run start:clear
```

Ouvrir Expo Go compatible SDK 58 et scanner le QR code. Le téléphone et l'ordinateur doivent être sur un réseau local qui autorise leur communication. Si ce réseau bloque Metro, arrêter le serveur avec Ctrl+C puis essayer `npm.cmd run start:tunnel` (une installation du composant de tunnel peut être demandée).

Le lanceur `scripts/npm-local.ps1 -App mobileapp` peut également utiliser le runtime portable corrigé lorsqu'il est présent sur cette machine. L'API publique est configurée dans le `.env` mobile ; ne jamais y ajouter les secrets de l'API.

Vérifier sur appareil : démarrage, connexion, sélection de l'espace, profil boutique, agences de livraison, création d'une commande, formulaires/date, galerie/caméra, déconnexion et reconnexion. Les push distants se testent dans un binaire dédié, pas dans Expo Go.

## Validation

Résultats exécutés le 16 novembre 2026 avec Node 22.23.4 :

| Contrôle | Résultat |
| --- | --- |
| TypeScript application, après alignement des types React | Réussi |
| TypeScript des tests | Réussi |
| ESLint | Réussi |
| Tests mobiles | 33 réussis, 0 échec |
| `expo install --check`, en ligne | Dépendances à jour |
| Expo Doctor, en ligne | 20/20 contrôles réussis |
| Export Android et iOS | Bundles Hermes générés |
| Export Web | Bundles et 12 routes statiques générés |
| Démarrage Metro pour Expo Go | Réussi sur le port de test 8091 ; manifeste HTTP reçu avec `sdkVersion: 58.0.0` |
| Audit npm lors de l'installation finale | 0 vulnérabilité signalée |
| `git diff --check` | Réussi |

Les exports ont été générés en mode hors ligne pour éviter les délais du proxy ; les vérifications finales de versions et Expo Doctor ont ensuite réussi en ligne. Le dernier changement après les exports concerne uniquement les déclarations TypeScript React ; le contrôle TypeScript a été relancé avec succès.

L'installation initiale par `npm ci` a rencontré des erreurs Windows `EPERM` lors de la création de dossiers imbriqués. La préparation de ces dossiers, puis `npm install` avec le verrouillage cohérent, ont permis d'installer les dépendances et d'exécuter les contrôles. Aucun `--force`, `--legacy-peer-deps` ou exclusion Expo n'a été utilisé. Le cache de travail et le runtime portable restent locaux et ignorés par Git.

Le serveur Metro temporaire est arrêté après vérification. Son journal a également signalé le recours à la version de secours de React Native DevTools, le téléchargement de l'outil ayant rencontré un accès refusé dans le cache isolé Windows, ainsi qu'une résolution d'assets du manifeste interrompue. Le manifeste reçu et les exports ne constituent donc pas une validation visuelle d'Expo Go.

Un export JavaScript Android/iOS/Web ne constitue ni une compilation native signée ni un test physique sur téléphone. La recette sur le téléphone de l'utilisateur et les push distants dans un binaire dédié restent à effectuer.

## Références

- [Documentation Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/)
- [Guide de migration officiel](https://expo.dev/blog/how-to-upgrade-to-sdk-58)
- [Migration Expo Router 57 vers 58](https://docs.expo.dev/router/migrate/sdk-57-to-58/)
- [Notifications SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/notifications/)
