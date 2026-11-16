> Document historique. Pour la version actuelle et les essais sur téléphone, voir [Expo SDK 58](MOBILE_SDK_58.md).

# Migration mobile vers Expo SDK 57

## Problèmes constatés

Le manifeste mélangeait Expo 44.0.6, React Native 0.72, Router 58, Splash Screen 55 et d’autres modules 57. L’installation locale Expo était effectivement 44 ; ce n’était pas un simple avertissement d’éditeur. Cette combinaison a été remplacée par la matrice du package officiel Expo 57.0.30 et vérifiée avec les outils Expo.

## État actuel — Bloc 14

| Bibliothèque | Version déclarée |
| --- | --- |
| Expo | ~57.0.31 |
| React / React DOM | 19.2.3 |
| React Native | 0.86.3 |
| Expo Router | ~57.0.29 |
| Reanimated / Worklets | 4.5.1 / 0.10.1 |
| Screens | ~4.26.0, une seule version native après déduplication |
| TypeScript | ~6.0.3 |
| Date/time picker | 9.1.0 |
| Expo System UI | ~57.0.4 |

Le [rapport Bloc 14](BLOC-14-RAPPORT.md) et les [tests mobiles actuels](MOBILE_TESTING.md) donnent les contrôles, parcours réels, alertes npm et limites natives les plus récents. Le récit ci-dessous conserve l’historique de la migration initiale.

Les autres modules Expo, Safe Area, icônes et React Native Web sont alignés sur bundledNativeModules.json. Le lockfile a été régénéré par npm ; aucune option force ou legacy-peer-deps, aucun contrôle Doctor masqué.

Expo Doctor avait signalé deux versions natives de Screens, 4.26.2 et 4.30.0, dont une installée sous Router. npm dedupe --prefer-dedupe a résolu le doublon avec la version compatible déjà déclarée. Le plugin expo-status-bar, qui n’a pas à être déclaré comme plugin de configuration, a été retiré de app.json. Les anciens réglages newArchEnabled et edgeToEdgeEnabled ont été retirés pour utiliser les comportements du SDK moderne. Les identifiants Android/iOS, la marque, les logos, les routes et le design du Bloc 1 sont conservés.

AGENTS.md indique maintenant la documentation SDK 57 pour éviter une future réintroduction de versions SDK 54. Les manifestes précédents et la matrice récupérée sont archivés dans .local-preserved/sdk57-audit, ignoré par Git. Les .env publics n’ont pas été modifiés.

## Contrôles exécutés lors de la migration initiale

- npm run lint : succès.
- npm run typecheck : succès.
- npm run check:dependencies : dépendances à jour selon Expo.
- npm run doctor : 21/21 contrôles réussis, aucun problème signalé.
- npm run build : export Android/iOS/Web réussi après la déduplication, six routes statiques.
- Démarrage Metro hors ligne : succès sur le port de vérification 8082.
- Aperçu Web de l’export en 390 × 844 : accueil, navigation vers le suivi, saisie/soumission et message préparatoire corrects ; accès à la connexion préparatoire correct ; aucune erreur ou alerte de console constatée dans ces parcours.

## Commandes

```powershell
cd mobileapp
npm ci
npm run check:dependencies
npm run doctor
npm run lint
npm run typecheck
npm run build
npm start
```

En cas d’ancien cache sur votre machine, arrêter Metro puis lancer `npx.cmd expo start --clear`. Ne pas conserver un ancien client natif compilé pour SDK 54 ou pour la tentative de migration incohérente : utiliser un environnement compatible SDK 57, ou reconstruire un client/binaire adapté à partir de cette configuration. Aucun build EAS signé n’a été lancé.

Les exports réussis ne sont pas des installations Android/iOS. L’exécution sur appareils physiques, le clavier natif, le splash et les builds signés restent à tester. Un navigateur valide le parcours de l’export Web, pas le moteur natif. La configuration réseau du téléphone reste décrite dans le README.

Référence : [documentation exacte SDK 57](https://docs.expo.dev/versions/v57.0.0/).
