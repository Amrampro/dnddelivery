# Préparation Android et iOS — Bloc 14

> Mise à jour du 16 novembre 2026 : le mobile utilise désormais [Expo SDK 58](MOBILE_SDK_58.md). Le démarrage par défaut est en LAN pour Expo Go. Les anciennes dépendances `decode-uri-component` et `query-string` ne sont plus présentes ; le patch mobile correspondant et `patch-package` ont été retirés. Les résultats d'audit ci-dessous décrivent la campagne historique, pas la nouvelle installation.

Nom et identifiants conservés : **DND Delivery**, `com.goulbam.dnddelivery` pour Android et iOS, schéma `dnddelivery`. Icônes et splash réutilisent les fichiers officiels ; aucune nouvelle marque. Les versions et numéros de build de publication doivent être pilotés par l’équipe via la configuration EAS existante.

Depuis la campagne d’intrusion complémentaire, construire avec Node **22.23.4** ou une branche corrigée admise par `engines`. Les profils EAS restent préservés ; vérifier aussi le moteur effectif de l’image de construction distante. Le lanceur local `scripts/npm-local.ps1 -App mobileapp` emploie le runtime portable corrigé de cette machine. Voir [le rapport d’intrusion](PENTEST_LOCAL_2026-10-29.md).

Audit de sécurité du 29 octobre 2026 : les nouveaux e-mails de récupération utilisent le lien Web HTTPS en production, sans jeton transmis au schéma personnalisé. Un retour natif sécurisé nécessitera des Android App Links/iOS Universal Links réellement vérifiés. Le schéma existant reste inchangé. Les patches `decode-uri-component` et `deepmerge` sont obligatoires via `postinstall` ; installer aussi les dépendances de développement lors de la construction, et ne pas désactiver les scripts. Les tests mobile et Expo Doctor passent après `npm ci`. L’alerte Zod 3 de la CLI reste ouverte ; les commandes Expo démarrent sur localhost par défaut. Voir le [rapport transversal](SECURITY_AUDIT_2026-10-29.md) pour les versions, tests et limites.

## Environnement de développement

```text
cd mobileapp
npm ci
npm run typecheck
npm run lint
npm test
npm run check:dependencies
npm run doctor
npm run start:clear
npm run web
```

Node doit respecter `engines` de package.json. La matrice SDK 57 installée et `expo install --check` font autorité. Ne pas forcer un autre SDK pour corriger une alerte npm. [DateTimePicker SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/date-time-picker/) et [SystemUI SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/system-ui/) complètent la date système et le thème clair natif ; les plugins caméra, notifications et SecureStore restent requis.

Variables publiques de compilation : `EXPO_PUBLIC_API_URL` (API HTTPS réelle), `EXPO_PUBLIC_WEB_APP_URL` (site et suivi public réels), identifiant EAS effectif si push activé. Elles ne contiennent jamais de secret serveur. Changer une variable nécessite de reconstruire le bundle utilisé. Une adresse loopback de recette ne constitue pas une configuration de publication.

## Builds et appareils

```text
npx expo prebuild --platform android --no-install
npm run android
# Sur macOS avec Xcode :
npm run ios
# Vérification des bundles :
npx expo export --platform all --max-workers 2
```

Expo CNG génère les dossiers natifs à partir de `app.json`. Les sorties de recette `android/` et `ios/` sont ignorées, pas éditées pour contourner une permission ou une erreur. Le profil EAS `development` existant utilise une distribution interne et un APK ; il n’est pas présenté comme un dev client Expo supplémentaire. Le profil `preview` et la configuration `production` sont conservés. Un futur `eas build --profile preview --platform android|ios` requiert la connexion de l’équipe et ses véritables identifiants ; aucune compilation cloud ni publication ne doit être déclenchée automatiquement.

Le build Android local exige JDK et SDK/NDK compatibles. Le journal de la recette donne la commande exacte et son résultat, y compris tout échec. Un APK debug signé par la configuration de développement n’est pas une signature de production. Sous Windows, l’export iOS peut être vérifié ; compilation Xcode, signature Apple et tests iOS exigent macOS ou un build cloud autorisé.

Le plugin local `plugins/with-windows-cmake-paths.cjs` est enregistré dans `app.json`. Lors d’une génération Android sur Windows, il configure `CMAKE_OBJECT_PATH_MAX=256` afin que CMake puisse hacher le chemin de l’objet gesture-handler sous la limite Ninja de ce workspace. Il ne modifie aucune politique Windows et ne s’applique pas aux hôtes Linux/macOS. Une génération neuve a vérifié son application unique. Les sorties natives et les fichiers d’essai ne sont pas les sources CNG à diffuser.

L’image officielle historique `assets/icon.png` contient du JPEG. Les composants utilisent sa copie identique `assets/generated/brand-logo.jpg` ; les icônes et le splash conservent leurs PNG existants. Ne réintroduire aucune référence `.png` à ce JPEG : `npm test` vérifie les signatures et la préservation du logo.

L’APK autonome local du Bloc 14 est réservé à l’émulateur x86_64 et signé pour le développement. Son exception HTTP est limitée à la boucle locale du test et reste dans le projet généré archivé hors de `mobileapp/`. Une génération CNG neuve a confirmé que cette exception n’est pas reproduite dans les sources destinées à une future diffusion. Utiliser l’URL HTTPS réelle pour un binaire destiné aux utilisateurs.

## Avant diffusion

- Tester sur Android et iPhone physiques : clavier, safe areas, grande taille de police, retour système, orientation autorisée, caméra/galerie et permissions refusées puis réactivées.
- Vérifier sessions froides, refresh/révocation, changement de compte/contexte et absence de données d’un ancien environnement.
- Tester OTP expiré/erroné, envoi photo interrompu, doubles clics, encaissement/remise et version périmée sur réseau mobile réel. Aucune action n’est confirmée sans réponse serveur.
- Configurer et tester FCM/APNs/Expo, plusieurs appareils et désactivation ; vérifier présentation et ouverture à froid/arrière-plan/premier plan.
- Utiliser HTTPS, vérifier politique de confidentialité/conservation des photos, sauvegardes privées et relais SMTP réel. Les autorisations caméra et photos portent uniquement sur les besoins de remise ; aucun GPS permanent.
- Examiner les alertes npm restantes, les dépendances natives et les avertissements de compilation ; ne pas les masquer. Confirmer les numéros, certificats, permissions et exigences des stores avec l’équipe.

Les résultats réellement obtenus sont consignés dans [MOBILE_TESTING.md](MOBILE_TESTING.md) et le rapport Bloc 14. Aucune publication Google Play/App Store ni déploiement de production n’est effectuée dans ce bloc.
