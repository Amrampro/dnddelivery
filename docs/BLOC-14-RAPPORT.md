# Bloc 14 — Finalisation de l'application mobile

## Périmètre

Stabilisation du projet Expo existant, sans recréation des modules des Blocs 1 à 13. Identité DND Delivery, logos, package Android et identifiant iOS `com.goulbam.dnddelivery` conservés. Aucun déploiement, paiement électronique, suivi GPS permanent, publication ou Bloc 15.

L’audit initial a couvert le journal, les routes Expo, composants, modules métier, permissions, sessions, API et dépendances. Inventaire conservé dans `.local-preserved/bloc14/AUDIT_INITIAL.md`. Les données fictives de recette utilisent uniquement la base locale dédiée aux tests, l’API réelle et un puits SMTP local.

## Corrections et finalisation

- Client REST centralisé : validation des jetons et contrats critiques, annulation, timeout couvrant aussi la lecture du corps, refresh concurrent partagé, réessai unique après 401, invalidation à la révocation et protection contre les réponses d’un ancien contexte. Aucune répétition automatique d’une écriture après panne réseau.
- Sessions natives dans SecureStore ; aperçu Web en mémoire. Chargement du nouvel environnement avant affichage, effacement des données refusées, blocage du changement de contexte pendant une écriture et conservation d’une session déjà établie lors d’une panne temporaire.
- Hook de lecture commun aux modules stock, organisation, partenaires, livraison et finances. Déduplication des lectures simultanées ; actualisation périodique uniquement sur les écrans opérationnels actifs.
- Accueils entreprise/agence connectés aux indicateurs API et outils prioritaires par rôle. Abonnement réellement consultable avec plan, dates et déclarations de paiement paginées ; accès à cette information maintenu lors d’une restriction.
- Sélecteurs longs recherchables et virtualisés, formulaires adaptés au clavier, date native Android/iOS, montant avec devise, OTP à six chiffres, case à cocher commune. Saisie d’inventaire/réception limitée à 20 lignes par page en conservant les valeurs des autres pages et la version initiale de l’opération.
- Notifications : préférence liée à l’appareil courant, rotation du token, désactivation à la déconnexion, prise en charge des autres appareils sans les désactiver, réception et destinations limitées aux missions/remises autorisées. Une notification ne déclenche aucune mutation métier.
- Suivi du destinataire : ouverture du site public configuré ; aucune promesse de suivi fictif si son adresse manque. Photographies privées, OTP et règles financières des Blocs 12–13 conservés.

Écrans principalement modifiés : `WorkspaceScreen`, `MobileHome`, formulaires de commandes, détail des opérations de stock, confirmations, finances et réglages push. Écrans ajoutés : abonnement et boîte des notifications. Routes existantes conservées ; le destinataire reste dans le navigateur.

Les composants restent dans le design existant : `Button`, `Input`, `Card`, `Badge`, `Sheet`, `Selector`, `ListRow`, états de chargement/erreur et pagination sont réutilisés. `Checkbox`, `CurrencyInput`, `OtpInput` et `DateField` consolident les saisies communes.

## Ajustements backend des blocs antérieurs

Extensions limitées de compatibilité des Blocs 11–13 : la boîte mobile inclut les avis de confirmation et revérifie l’accès courant à chaque mission ; les champs privés des notifications ne sont pas renvoyés. L’adaptateur Expo existant sert aussi les avis financiers autorisés, avec destination générique et entreprise vérifiée. Pas de second service métier, nouvelle migration ou règle métier assouplie. Tests additionnels pour avis d’exception, changement d’agence, désaffiliation, famille de session révoquée, appareil désenregistré et erreur fournisseur.

## Vérifications automatiques

| Suite | Résultat constaté |
| --- | --- |
| Intégration API/MySQL | 268 tests réussis |
| API hors base | 42 tests réussis |
| Métadonnées partagées | 42 tests réussis |
| Transport et contrats mobiles | 30 tests réussis |
| Formats des assets mobiles et préservation du logo | 3 tests réussis |
| Total distinct | **385 tests réussis**, sans additionner les réexécutions ciblées |
| TypeScript et ESLint API/mobile ; types des tests | Réussis |
| ESLint et compilation Web | Réussis |
| Compatibilité des dépendances Expo | À jour |
| Expo Doctor | **21/21** |
| Schéma Prisma / migrations | Valide ; 25 migrations à jour |
| Texte dans les composants natifs | 41 fichiers TSX inspectés, aucune chaîne brute sous un conteneur natif |

Un premier passage API sous charge de compilation a dépassé le délai du test du processus de bootstrap ; le passage complet après compilation réussit 42/42 sans modifier ce délai. Des commandes de recette ont aussi été corrigées (argument Gradle, répertoire du vérificateur statique, paramètres du serveur Web) ; elles ne sont pas comptées comme des succès avant leur réexécution.

Audit npm mobile : **12 alertes** (6 faibles, 3 modérées, 3 élevées, 0 critique). Le nombre inclut les dépendances impactées, pas douze défauts indépendants. L’alerte Zod remonte par la CLI Expo, qui demande `^3.25.76` ; la suggestion automatique rétrograde Expo en SDK 51 et ne respecte pas la cible SDK 57. Aucune suppression de contrôle, mise à jour forcée ni substitution de Zod 4 sous une API attendue en version 3. Les alertes de la chaîne Expo/Router et du date picker restent à traiter avec les correctifs officiellement compatibles avant diffusion.

## Compilation et configuration

Expo SDK **57.0.31**, Router **57.0.29**, React **19.2.3**, React Native **0.86.3** conservés. Ajouts alignés avec la matrice Expo installée : date-time-picker **9.1.0** et expo-system-ui **~57.0.4** ; `tsx` pour les tests.

Le build autonome a révélé deux erreurs que les exports seuls ne détectaient pas. Le code C++ de gesture-handler dépassait la limite de chemins Ninja sous Windows : la génération CNG Windows applique maintenant `CMAKE_OBJECT_PATH_MAX=256`, qui permet le nom d’objet haché observé sous la limite de 260 caractères. Le réglage à 128, trop court pour le préfixe de ce projet, n’avait pas résolu l’erreur ; aucune politique Windows n’a été modifiée. Le plugin local passe ESLint ; une génération CNG neuve a confirmé un seul argument CMake et l’absence de l’exception réseau réservée à la recette. Le mécanisme de raccourcissement est décrit dans la [documentation CMake](https://cmake.org/cmake/help/latest/variable/CMAKE_OBJECT_PATH_MAX.html).

Le fichier historique `assets/icon.png` contient des octets JPEG. Il est conservé intégralement, ainsi que tous les autres logos. Les deux références d’interface utilisent maintenant `assets/generated/brand-logo.jpg`, copie strictement identique, pour qu’AAPT reconnaisse son format. Aucun logo recréé, redimensionné ou modifié. Trois tests de régression contrôlent les signatures des images référencées, les assets de configuration et l’identité de cette copie.

Android : compilation locale `:app:assembleDebug` **réussie**, architecture x86_64, JDK Android Studio, SDK/NDK locaux, un worker Gradle. APK de développement de 81 039 650 octets, installé avec succès dans l’AVD API 35. Sorties CNG conservées hors des sources dans `.local-preserved/bloc14/android-project/`. L’APK debug nécessite Metro ; ce résultat ne valide ni une signature de production ni une diffusion en magasin. Avertissements de dépréciation des dépendances natives conservés dans les traces.

Commande réellement réussie depuis le dossier Android généré :

```powershell
.\gradlew.bat :app:assembleDebug -PreactNativeArchitectures=x86_64 -PreactNativeDevServerPort=8089 --no-daemon --max-workers=1 --no-parallel
```

Un second APK autonome, avec code embarqué, a ensuite été compilé avec `:app:assembleRelease` : **succès en 12 min 30 s**, 534 tâches. Le fichier de recette x86_64 fait 46 234 886 octets et reste signé par la clé de développement, sans certificat de production. Il utilise uniquement l’API locale de test ; une configuration native temporaire autorise HTTP vers `127.0.0.1` tout en refusant les autres domaines en clair. Cette exception est conservée avec le projet natif archivé et n’apparaît pas dans la génération CNG neuve issue des sources. Aucune modification du réseau ou du chiffrement du serveur. Artefact et empreinte dans `.local-preserved/bloc14/android-artifact.json`.

Exports finaux Android/iOS/Web : **réussis**, y compris le rendu statique des routes Web. La dernière exécution inclut les changements de pagination, de libellés et de référence du logo ; aucune vérification de compatibilité n’est désactivée.

## Recette interactive avec l’API réelle

L’aperçu Expo Web sert à vérifier les opérations ; ce n’est pas une preuve de comportement natif ni de taille d’écran de téléphone. L’administrateur a consulté l’abonnement restreint, les agences et deux entreprises distinctes : les compteurs de l’entreprise précédente disparaissent lors du changement. Le responsable a affecté la nouvelle mission au livreur éligible. Le livreur a consulté sa disponibilité, pris le colis en charge, commencé la distribution, déclaré son arrivée puis 5 000 XAF, vérifié l’OTP obtenu par le suivi sécurisé du destinataire, envoyé une photographie fictive et clôturé. Le site du destinataire affiche ensuite « Livrée ». La déclaration d’encaissement et la réception par l’agence restent distinguées. Une remise limitée à ce nouvel encaissement a été déclarée puis confirmée par le responsable distinct. Un enregistrement sans motif obligatoire a été refusé en conservant la saisie.

Relecture MySQL de cette mission : `DELIVERED`, garde `RECIPIENT`, commande `DELIVERED`, preuve `OTP` avec une photo, OTP `CONSUMED`, 5 000 XAF déclarés et confirmés, reste/dette/réservation financière à zéro. Les 11 000 XAF encore dus sur la recette historique du Bloc 13 n’ont pas été inclus dans la nouvelle remise. Traces privées et captures dans `.local-preserved/bloc14/`, sans jeton ou code dans le rapport.

Gestionnaire de stock : dépôt de cinq unités préparé puis réceptionné (total physique de Douala : 17 → 22), restitution d’une unité, transfert de deux unités vers Yaoundé avec départ et réception séparés. À destination, l’application distingue d’abord 0 unité physique et 2 en transit, puis confirme 2 reçues et 0 en transit. Inventaire créé à Yaoundé, comptage conforme 2/2, puis soumission ; le gestionnaire ne dispose pas de l’action de validation réservée au responsable. L’administrateur distinct l’a ensuite validé. La référence `RECETTE-MOBILE-BLOC14` identifie les opérations fictives persistées.

Boutique : connexions et déconnexions, transporteurs Centre et Autre transporteur (respectivement 21 et 7 unités physiques distinctes), retour au bon contexte, commande ponctuelle avec collecte et coordonnées fictives, commande depuis stock avec une réservation réelle d’une unité, consultation des détails/historiques, puis annulation autorisée de la ponctuelle avant collecte avec motif conservé. La réservation de la commande depuis stock reste distincte de la commande ponctuelle et du stock de l’autre transporteur.

## Limites et préparation à la diffusion

Deux premiers lancements Android debug ont rencontré un ANR au démarrage, avec des ANR de composants Android/Google et une forte pression mémoire/CPU dans les traces. Après arrêt des compilations et de Metro, l’APK autonome a démarré sur l’AVD API 35 : accueil, logo officiel et navigation vers l’écran de connexion observés sur l’écran natif. Capture `ui-native-landing.png`. Les tentatives de saisie ont ensuite montré un presse-papiers mal synchronisé et des caractères transformés par le clavier de l’environnement (dont séparateurs et arobase) ; elles ne permettent pas de revendiquer une connexion native réussie. Aucune modification des identifiants du compte pour contourner ce problème. Le parcours natif complet, la restauration SecureStore et la caméra native restent donc à valider ; les parcours métier ci-dessus sont ceux de l’aperçu Expo Web. L’autorisation du simulateur a bien été donnée par l’utilisateur ; aucun refus d’autorisation n’est invoqué.

La relecture finale de MySQL confirme le dépôt `CONFIRMED`, le transfert `RECEIVED`, l’inventaire `APPROVED`, la commande ponctuelle `CANCELLED` et la commande depuis stock `READY`. Cette dernière conserve sa réservation d’une unité à Douala (14 physiques, 1 réservée) ; Yaoundé conserve 2 unités physiques et 0 réservée. La seconde mission préparée pour les essais natifs n’est pas annoncée comme livrée. Les données et traces de recette sont conservées.

Pas d’appareil physique ni d’iPhone utilisé. Compilation Xcode/signature Apple non exécutées sous Windows. Réception push via FCM/APNs/Expo, ouverture à froid, plusieurs appareils réels, caméra physique, refus/réactivation des permissions, réseau mobile, grande police et lecteur d’écran restent à vérifier sur matériel. Le projet EAS, les certificats et les domaines de production ne sont pas inventés. Les profils EAS existants sont préservés ; aucun build cloud ni envoi externe de notification n’a été lancé.

## Démarrer et vérifier

Depuis `mobileapp/`, après configuration d’une URL d’API accessible à l’appareil :

```powershell
npm start
npm run android
# Sur macOS avec Xcode : npm run ios
npm run typecheck
npm run typecheck:tests
npm run lint
npm test
npm run check:dependencies
npm run doctor
npm run build
```

Les six guides `MOBILE_ARCHITECTURE.md`, `MOBILE_NAVIGATION.md`, `MOBILE_API_INTEGRATION.md`, `MOBILE_NOTIFICATIONS.md`, `MOBILE_TESTING.md` et `MOBILE_RELEASE_PREPARATION.md` décrivent l’état actuel et les essais restant avant diffusion. Les fichiers `.env`, logos originaux et migrations sont conservés ; le journal permanent contient la section « Bloc 14 — Finalisation de l'application mobile ».

Services de recette et émulateur arrêtés après vérification des processus et ports ; données fictives conservées. Empreintes finales : fichiers protégés inchangés hors configurations mobile volontairement modifiées, historique du journal conservé.
