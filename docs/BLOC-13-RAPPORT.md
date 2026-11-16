# Bloc 13 — Confirmation OTP, preuves de livraison et suivi destinataire

Livraison locale du 29 octobre 2026, dans les applications existantes. Aucun déploiement de production ni passage au Bloc 14.

## Résultat

Le destinataire dispose d’un suivi Web personnel sans compte. Référence et e-mail déclenchent une réponse générique et l’envoi éventuel d’un lien à l’adresse déjà enregistrée. Un lien aléatoire, expirant et révocable est échangé contre une session de lecture limitée à sa commande. La référence seule ne donne aucun accès. La chronologie utilise uniquement les événements réels, sans GPS inventé ni informations sur les employés.

La remise réussie passe par un seul service transactionnel : affectation et garde courantes, OTP validé ou exception indépendante, photos privées requises et contrôle financier. Le code est généré et vérifié au serveur, limité dans le temps et en nombre d’essais, lié à l’affectation, révoqué au changement de garde puis consommé à la remise. Les exceptions OTP exigent un autre approbateur et deux photos distinctes ; elles ne dispensent pas de l’encaissement ou de sa dérogation financière distincte.

Les images sont contrôlées et normalisées, sans EXIF, horodatées au serveur et conservées hors publication Web. Le serveur contrôle les droits à chaque lecture. Les photos d’une tentative échouée sont conservées mais retirées des preuves admissibles de la tentative suivante. La preuve finale, les liens photographiques et les métadonnées concernées sont protégés en MySQL.

Les e-mails réutilisent la boîte d’envoi persistante, avec modèles HTML/texte DND, lien personnel, reprises bornées et historique des tentatives. « Accepté par le fournisseur » décrit l’acceptation SMTP, sans affirmer une délivrance ou lecture. Les alertes internes revalident les accès au traitement. L’adaptateur push Expo est optionnel, lié à la famille de session ; l’ouverture conduit à l’espace autorisé par l’authentification courante.

## Parcours et fichiers

| Interface | Fonction livrée |
| --- | --- |
| Web public `/suivi` | Recherche protégée, lien personnel, chronologie, code au bon stade, rafraîchissement visible et gestion hors ligne |
| Formulaire d’accueil Web | Conduit au suivi réel, identité et logos conservés |
| Web entreprise/agence | File « Confirmations et preuves », détail de mission, photos, exceptions, renouvellement du suivi et notifications |
| Web boutique | Preuves attachées de ses propres commandes chez le transporteur sélectionné, sans notes/identités internes |
| Expo livreur | OTP, renouvellement, caméra ou sélection, aperçu, upload avec réessai, photos sélectionnées et récapitulatif financier avant remise |
| Expo responsable | File de confirmation, examen et décision sur exception dans son périmètre |
| Expo Profil et racine | Autorisation push explicite, enregistrement/révocation de l’appareil ; ouverture des notifications depuis tous les écrans et au démarrage |

Principaux fichiers : `api/src/modules/confirmation/{security,tracking,otp,hooks,service,storage,cleanup,communications,internal-notifications,routes,validation,permissions}.ts`, `api/src/jobs/{confirmation,proof-cleanup}.ts`, `shared/confirmation.ts`, `shared/deliveries.ts`, `webapp/src/tracking/TrackingPage.tsx`, `webapp/src/confirmation/ConfirmationPanel.tsx`, `mobileapp/src/confirmation/{ConfirmationScreen,PushSettings,PushNavigation}.tsx`.

Les permissions détaillées et tous les endpoints sont décrits dans [DELIVERY_CONFIRMATION.md](DELIVERY_CONFIRMATION.md), [PUBLIC_TRACKING.md](PUBLIC_TRACKING.md) et [DELIVERY_NOTIFICATIONS.md](DELIVERY_NOTIFICATIONS.md). Les deux autres guides sont [DELIVERY_OTP.md](DELIVERY_OTP.md) et [DELIVERY_PROOFS.md](DELIVERY_PROOFS.md).

## Base de données et préservation

Évolution de **64 à 70 modèles Prisma**, de **21 à 25 migrations**. Nouveaux modèles : `TrackingAccess`, `TrackingThrottle`, `OtpAttempt`, `OtpException`, `DeliveryEvidence`, `NotificationAttempt`. Réutilisation et extension de `DeliveryOtp`, `DeliveryProof`, `FileAsset`, `ProofPhoto`, `Notification`, `UserDevice`, sans nouvelle comptabilité parallèle.

| Migration ajoutée | Effet |
| --- | --- |
| `20261029090000_delivery_confirmation` | Suivi, quotas persistants, OTP lié à l’affectation, exceptions, preuves, tentatives techniques, permissions et garde-fous SQL |
| `20261029091000_push_session_binding` | Liaison des appareils push à la famille de session |
| `20261029092000_proof_asset_integrity` | Intégrité des auteurs/approbateurs et immutabilité des fichiers et liens de preuves |
| `20261029093000_evidence_attempt_retirement` | Retrait des preuves d’anciennes tentatives et conservation de l’historique |

Migration déployée uniquement sur la base dédiée `dnd_delivery_bloc5_test`, conservée avec ses données. `prisma validate`, `migrate status` et le contrôle des 25 empreintes passent. Aucun reset, aucune suppression de données pour faire passer les tests, aucun changement des 21 anciennes migrations.

Le contrôle de 33 fichiers protégés détecte uniquement l’ajout attendu de `DELIVERY_SECRET` à `api/.env` ; l’intégralité de ses octets antérieurs est conservée. La clé aléatoire et les identifiants restent privés. Les logos, les autres environnements et les anciennes migrations sont inchangés. `.env.example` a reçu les nouvelles variables sans réencodage de son contenu historique. Les dépendances mobiles et leur verrou ont été modifiés intentionnellement selon la matrice SDK 57.

## Tests réellement exécutés

**343 tests distincts réussis, zéro échec dans les exécutions finales :**

| Exécution | Résultat |
| --- | --- |
| Régression MySQL complète des Blocs 3 à 13 | **263/263**, dont 47 résultats TAP du nouveau module (46 sous-tests et leur parent) |
| API, HTTP et sécurité | **38/38** |
| Règles partagées Web/Expo | **42/42** |
| Relance ciblée MySQL après les derniers ajustements de sécurité | **47/47**, déjà inclus dans les 263, non additionnés |
| API types sources et tests, lint, compilation | Réussis |
| Web compilation, lint | Réussis |
| Expo types, lint | Réussis |
| Matrice Expo en ligne | « Dependencies are up to date » |
| Expo Doctor | **21/21** |
| Export Android, iOS, Web | Réussi, bundles Hermes et 12 routes Web |

Les scénarios couvrent accès valide/inconnu et anti-énumération, sessions expirées/révoquées et autre commande, absence de données privées dans le suivi, code crypto et stockage sécurisé, essais erronés idempotents, expiration/verrouillage/renouvellement/consommation, mauvais livreur, fichiers valides/interdits/trop grands, EXIF/horodatage, confidentialité, preuve et clôture manquantes, doublons et concurrence, encaissement partiel et exceptions financières, exceptions OTP approuvées/refusées/auto-approbation refusée, échec sans OTP, reprise après changement de garde/tentative, abonnement expiré/suspendu, accès de livreur suspendu, intégrité SQL et nettoyage des seuls orphelins. Un relais SMTP local exerce l’acceptation, l’échec puis la reprise ; les événements en base sont dédupliqués. Les anciennes suites restent exécutées.

Une dernière relance API effectuée sans l’accès réseau local requis a donné 29 succès et 9 erreurs de connexion (`fetch failed` / `EACCES`). Le log est conservé séparément ; la relance avec cet accès a bien donné **38/38** dans `api-tests-final.log`. Aucun contrôle n’a été supprimé pour obtenir ce résultat.

### Recette interactive réellement effectuée

Navigateur de bureau, site Web et application Expo Web reliés à l’API et au même MySQL de test. Mission conservée du Bloc 12, référence se terminant par `56B6E30C` ; données et comptes exclusivement fictifs.

1. Le lien personnel ouvre le suivi réel ; le fragment secret disparaît de l’URL. La page permet au destinataire d’afficher son code au stade de distribution finale.
2. Le livreur choisit Douala et sa mission, saisit le code dans Expo Web : la validation réussit et la mission reste ouverte en attente de preuves.
3. Une image de colis explicitement marquée « COLIS DE RECETTE BLOC 13 » est choisie et prévisualisée. Une coupure contrôlée de l’API produit le message réseau et conserve la sélection. La session ayant expiré pendant une longue interruption de recette, une reconnexion et une nouvelle sélection ont été nécessaires ; l’envoi authentifié aboutit ensuite à une seule image `READY`. Le réessai idempotent côté serveur est aussi couvert par la suite MySQL. Aucun contournement de durée de session ou d’OTP n’a été ajouté.
4. Une validation OTP expirée est signalée. Le livreur renouvelle le code avec motif ; le destinataire le récupère dans son suivi et le livreur le valide à nouveau.
5. Avec OTP et photo valides, le serveur refuse la remise parce que **5 000 XAF restent à encaisser**, en conservant la saisie et les photos.
6. L’écran financier enregistre une déclaration fictive complémentaire de **5 000 XAF**. Aucun paiement n’est exécuté. La remise finale réussit ensuite avec une preuve OTP unique, une photo attachée, code consommé et garde `RECIPIENT`.
7. Lecture MySQL : attendu et net **25 000 XAF**, reste destinataire **0**, reçu agence **14 000 XAF**, responsabilité du livreur **11 000 XAF**. La remise logistique n’a pas soldé les fonds à remettre.
8. Le suivi public affiche « Livrée », la confirmation et la chronologie réelle, sans code actif. L’administrateur entreprise et la boutique propriétaire voient la photo finale privée et les états techniques des e-mails. Les autres périmètres sont vérifiés par les suites automatisées.

Captures conservées dans `.local-preserved/bloc13` : `ui-network-retry.png`, `ui-finance-block.png`, `ui-courier-proof.png`, `ui-public-delivered.png`, `ui-operator-proof.png`, `ui-shop-proof.png`. Les observations MySQL sans secret sont dans `ui-evidence.jsonl`. Les fichiers `ui-private.json`, `smtp-private.json` et la sauvegarde d’environnement contiennent des secrets de recette et ne doivent pas être publiés.

### Commandes de vérification

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
mobileapp npm run doctor
mobileapp expo export --platform all --max-workers 2
```

Dans cette session, après génération Prisma et migrations, les compilations API finales utilisent directement `tsc --noEmit`, `tsc -p tsconfig.tests.json` et `tsc`, afin d’éviter une régénération concurrente avec les tests MySQL. La base doit être dédiée, `NODE_ENV=test`, `TEST_DATABASE_URL` doit correspondre et le certificat RSA local être configuré selon le guide des tests existant. Les exports Hermes Windows utilisent TEMP/TMP sous `.local-preserved/bloc13/tmp`. Aucun secret ni URL de base privée n’est inclus ici.

Logs finaux sous `.local-preserved/bloc13` : `database-final.log`, `confirmation-tests.log`, `api-tests-final.log`, `api-types-final.log`, `api-tests-types.log`, `api-lint.log`, `api-build.log`, `shared-tests-final.log`, `web-build-final.log`, `web-lint-final.log`, `mobile-types-final.log`, `mobile-lint-final.log`, `mobile-dependencies.log`, `mobile-doctor.log`, `mobile-exports-final.log`, `prisma-validate.log`, `migrations-status.log`, `migrations-checksums.log`, `protected-final.json`.

## Corrections, limites et exploitation

L’installation des modules natifs requis a suivi les [documents SDK 57](https://docs.expo.dev/versions/v57.0.0/), la matrice locale et `expo install --check`. Une mise à jour de sécurité avait avancé Expo sans avancer Expo Router, provoquant une erreur réelle d’export Web statique (`Platform.OS`). La paire a été réalignée ensemble avec `expo install --fix` : **Expo 57.0.31, Router 57.0.29, React 19.2.3, React Native 0.86.3**, `expo-image-picker ~57.0.20`, `expo-notifications ~57.0.24`. Doctor et les trois exports passent sans désactiver un contrôle. Une restauration intermédiaire et les exports échoués ne sont pas comptés comme succès.

L’audit npm final conserve **11 alertes (5 faibles, 3 modérées, 3 élevées, aucune critique)** dans la chaîne Expo et ses dépendances transitives. Le JSON est conservé ; aucune mise à jour forcée vers un SDK différent n’a été appliquée pour masquer ces alertes. La compatibilité validée ne constitue pas un audit de sécurité sans réserve.

La recette a également corrigé l’en-tête d’origine du suivi public, le type MIME de l’envoi binaire mobile, la présentation des erreurs de fichiers, le cycle de vie des aperçus React, les libellés `DELIVERED/RECIPIENT` et la garde physique affichée après remise. Le clic push était initialement monté seulement dans Profil ; il est maintenant monté à la racine native et prend aussi en compte le démarrage à froid.

Les captures et interactions sont celles d’un navigateur de bureau. La demande de viewport 390 × 844 n’a pas modifié les dimensions observées (1280 × 720) dans ce navigateur ; **aucune recette sur écran de téléphone n’est donc revendiquée**. La caméra native, une installation iOS/Android signée, les permissions système sur appareil réel et le transport push Expo réel restent à vérifier avec l’identifiant EAS configuré. Les exports réussis ne remplacent pas ces essais matériels. Le circuit d’exception est exercé automatiquement sur MySQL ; sa décision n’a pas été rejouée manuellement dans un deuxième compte mobile pendant cette recette.

Les e-mails sont acceptés par le relais local de test ; aucun SMTP de production, délivrance en boîte externe, SMS ou accusé push externe n’a été validé. Un crash après acceptation SMTP peut occasionner un doublon de transport malgré l’unicité de la notification en base. Le stockage local requiert droits du compte de service, sauvegardes base/fichiers cohérentes et politique de conservation avant exploitation.

## Modifications des blocs antérieurs et journal

Blocs 10/11 : annulation de commande notifiée, modèles des travailleurs existants enrichis, hooks de révocation des validations et photos dans le journal logistique, messages d’étape orientant vers la confirmation réelle. Bloc 12 : ses calculs et mouvements sont réutilisés ; aucun transfert de fonds ajouté à la clôture. Blocs 3/4 : contrôles d’accès conservés, navigation complétée et client mobile autorisant le MIME binaire. La structure applicative, le Design System et les logos sont conservés.

La section exacte **« Bloc 13 — Confirmation OTP, preuves de livraison et suivi destinataire »** est ajoutée à `docs/JOURNAL_DE_DEVELOPPEMENT.md`, sans suppression des anciennes sections. Les guides ci-dessus documentent acteurs, règles, endpoints, stockage, limites et exploitation. Les services locaux de recette sont arrêtés à la fin. Aucune fonctionnalité du Bloc 14, paiement électronique, règlement boutique/entreprise, rapport avancé, optimisation de tournée ou GPS permanent n’est ajouté.
