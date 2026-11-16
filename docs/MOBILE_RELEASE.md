# Préparation de la diffusion mobile

DND Delivery utilise Expo SDK 57, le package Android et le bundle iOS `com.goulbam.dnddelivery` ainsi que le schéma `dnddelivery`. Les références des icônes, du splash et les déclarations natives caméra, galerie, notifications et SecureStore sont dans `app.json`. La récupération de compte s’appuie sur un lien Web HTTPS. Une future ouverture automatique de liens sensibles exige des associations Android App Links et iOS Universal Links vérifiées.

| Profil EAS | Environnement | Usage |
| --- | --- | --- |
| development | development | APK interne de développement |
| preview | preview | Distribution interne, contrat API de préproduction, appareils enregistrés pour iOS selon signature |
| production | production | Build destiné aux stores, code/numéro auto-incrémenté à partir du compteur EAS |

Définir `EXPO_PUBLIC_API_URL` et `EXPO_PUBLIC_WEB_APP_URL` dans l’environnement EAS approprié. Les profils preview et production valident HTTPS et le suffixe API `/api`. Vérifier le compteur distant contre la dernière version acceptée dans les stores avant de produire les premiers binaires. Utiliser les comptes et certificats de l’équipe et vérifier le projet EAS effectif, le compte Expo, les identifiants FCM/APNs et le matériel de signature. [SDK Expo 57](https://docs.expo.dev/versions/v57.0.0/) et [configuration EAS](https://docs.expo.dev/build/eas-json/).

Depuis `mobileapp`, validation locale avec `npm ci`, `npm run check:dependencies`, `npm run doctor`, `npm test` puis `npm run build`. Les builds distants de préversion, une fois autorisés et configurés, utilisent `eas build --profile preview --platform android` puis `eas build --profile preview --platform ios`. Pour les candidats signés, utiliser `--profile production` après validation des comptes. Les bundles Expo ne constituent pas des binaires signés. Examiner le [plan de tests](TEST_PLAN.md) sur appareils réels, la politique de confidentialité et les attestations de données des stores avant soumission.
