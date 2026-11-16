# Notifications mobiles — Bloc 14

La boîte d’envoi existante `Notification` et les appareils `UserDevice` sont réutilisés. Le mobile ne déclenche ni e-mail, ni SMS, ni deuxième système de messages. Les notifications distantes nécessitent une installation native configurée ; le [guide SDK 57 Notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/) précise notamment les limites d’Expo Go.

## Appareil et consentement

Profil propose l’activation explicite des alertes de **cet appareil**. Il ne sélectionne plus arbitrairement le premier appareil du serveur. Une préférence SecureStore contient utilisateur, état et identifiant de l’enregistrement, sans recopier le jeton push dans les journaux. L’identifiant EAS réel vient de la configuration du projet ou `EXPO_PUBLIC_EAS_PROJECT_ID` ; aucune valeur fictive n’est fournie.

Android crée son canal avant la demande de permission. Le refus laisse les autres moyens de consultation disponibles. Les actualisations en arrière-plan de l’enregistrement lisent seulement une permission déjà accordée et ne demandent rien automatiquement. Un changement de jeton natif déclenche une nouvelle récupération du jeton Expo, pas l’envoi du jeton APNs/FCM brut à l’API. L’ancien enregistrement est révoqué lors d’une rotation aboutie. La désactivation et la déconnexion traitent l’appareil courant ; les autres appareils conservent leurs sessions respectives.

L’API lie l’appareil à l’utilisateur et à sa famille de session ; le travailleur refuse les familles expirées ou révoquées. `DeviceNotRegistered` révoque le seul appareil concerné. Un ticket accepté par Expo ne prouve pas la réception physique ou la lecture.

## Réception et navigation

Le composant racine `PushNavigation` écoute les interactions sur tous les écrans et le dernier événement d’ouverture à froid. Il configure la présentation sobre au premier plan. En arrière-plan, la notification est présentée par le système ; aucune tâche métier ou écriture financière n’est exécutée depuis une notification.

Les seuls objectifs admis sont un UUID de livraison ou le module `remises` avec une entreprise UUID. Aucune URL ni route arbitraire reçue n’est suivie. Après restauration de l’authentification, les permissions du contexte courant sont relues et la ressource est vérifiée par l’API. Si l’environnement ne convient pas, la sélection des environnements autorisés est ouverte ; l’objectif est réexaminé après choix. Les refus ne donnent aucun accès aux données d’un autre périmètre.

## Consultation et envoi

L’écran Notifications réunit les avis logistiques/confirmation et financiers déjà disponibles dans les endpoints existants. Les avis de collaboration restent dans leur module. Les alertes de confirmation OTP sont désormais incluses dans `/deliveries/notifications`, avec vérification de la mission dans le périmètre courant et payload réduit. Les listes sont bornées aux derniers avis, sans masquer cette limite.

`npm run confirmation:notifications` traite commandes/livraisons/confirmations. `npm run collections:notifications` peut également utiliser le push existant lorsque `DELIVERY_PUSH_ENABLED=true`. Le message externe est générique, sans nom, adresse, téléphone, montant ni OTP. L’email financier garde son circuit distinct. Sans activation de l’adaptateur, les avis push restent en attente et ne sont pas faussement marqués envoyés.

Les tests de l’adaptateur remplacent le fournisseur par une réponse contrôlée. Une recette FCM/APNs/Expo réelle, avec le projet et les certificats de l’équipe, reste obligatoire avant publication. Voir [tests réellement effectués](MOBILE_TESTING.md) et [préparation](MOBILE_RELEASE_PREPARATION.md).
