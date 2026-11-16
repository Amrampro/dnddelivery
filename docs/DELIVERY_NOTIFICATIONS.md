# Notifications de livraison — Bloc 13

Les notifications réutilisent `Notification`, la boîte d’envoi persistante des Blocs 10/11 et les appareils `UserDevice`. Il n’y a pas de file de messages parallèle à maintenir.

## E-mails et exécution

Les changements importants de commande/livraison créent les messages dans la transaction métier : enregistrement, affectation, prise en charge, distribution finale, échec, reprise, retour, annulation et remise finale. La demande de lien et le renouvellement OTP ajoutent les messages dédiés. Les modèles texte/HTML utilisent les couleurs DND, un objet explicite, la référence et le bouton personnel « Suivre mon colis ». Les secrets ne sont pas présents dans le payload ni les journaux applicatifs ; ils sont introduits à la préparation du message pour le destinataire enregistré.

Un OTP n’est ajouté qu’au message de distribution finale ou de renouvellement, si la mission et le code sont encore éligibles au moment du traitement. La création d’une commande ne divulgue aucun code prématuré. Chaque e-mail rappelle que le code n’atteste aucun paiement.

`npm run confirmation:notifications` exécute les travailleurs commandes, livraisons et alertes internes. Les commandes historiques continuent de traiter leurs sources respectives. `FOR UPDATE SKIP LOCKED`, bail de cinq minutes, identifiant de message stable et mises à jour conditionnées au propriétaire du bail permettent des traitements concurrents. Cinq tentatives au maximum, délai de reprise exponentiel commençant à cinq minutes et plafonné à 24 heures. Les tentatives terminées et leur résultat sont appendus dans `NotificationAttempt` atomiquement avec le changement d’état.

| État affiché | Signification |
| --- | --- |
| En attente / en traitement | Message persistant, non encore accepté |
| Nouvelle tentative programmée | Échec technique avec date de reprise |
| Accepté par le fournisseur | Le relais SMTP a accepté le destinataire ou Expo a accepté le ticket |
| Échec | Limite atteinte ou erreur définitive |

La valeur historique `Notification.status=SENT` est conservée pour compatibilité ; `deliveryState=ACCEPTED` en précise la signification. **Aucun accusé de lecture ni délivrance en boîte mail n’est affirmé.** Un crash après acceptation SMTP et avant validation en base peut produire un doublon : garantie au moins une fois, pas exactement une fois. Les erreurs techniques restent internes ; les boutiques et opérateurs voient un état sobre, sans secrets/adresse.

SMTP utilise les variables existantes `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`. Les tests utilisent exclusivement un relais de capture local. Aucune preuve de réception dans une vraie boîte externe n’en est déduite.

## Alertes internes et push

Les événements utiles ciblent les responsables des agences concernées, les administrateurs entreprise et la boutique propriétaire lorsque pertinent. Les demandes d’exception notifient les approbateurs potentiels. Au traitement, les appartenances et permissions sont relues : un accès retiré ne reçoit pas une ancienne alerte en attente.

Le push Expo est optionnel (`DELIVERY_PUSH_ENABLED=true` pour le travailleur, `EXPO_PUBLIC_EAS_PROJECT_ID` ou identifiant EAS configuré côté application). L’écran Profil demande les permissions uniquement après action explicite ; un refus laisse e-mails et suivi disponibles. L’enregistrement `/api/delivery-devices` associe l’appareil à l’utilisateur et à la famille de session. GET liste les identifiants sans jetons ; POST `/revoke` révoque son appareil. Une session révoquée/expirée ne peut plus recevoir d’alerte ; un appareil d’une autre famille active ne peut pas être repris silencieusement.

L’adaptateur Expo utilise l’endpoint officiel, un contenu générique sans données destinataire et révoque les appareils `DeviceNotRegistered`. Sans adaptateur activé, les push restent en attente et ne sont pas faussement marqués envoyés. Aucun SMS ni service tiers supplémentaire n’est introduit.

L’écoute des ouvertures est montée au niveau racine de l’application native, y compris pour l’ouverture à froid. Elle conduit à « Mes environnements », protégé par le contrôle de session et les accès courants ; aucun identifiant reçu dans la notification ne contourne ces contrôles. Le réglage d’opt-in reste sur le profil. L’installation native signée, l’autorisation matérielle et les accusés Expo réels nécessitent une recette sur appareils physiques configurés.
