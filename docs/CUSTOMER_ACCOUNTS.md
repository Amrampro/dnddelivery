# Comptes clients et suivi de colis

## Parcours Web et mobile

- Le client s'inscrit avec son nom, son e-mail, son téléphone et son acceptation des conditions. Aucun compte n'est créé avant la vérification de l'e-mail.
- Le lien reçu, valable 24 heures, ouvre le Web pour définir le mot de passe. Depuis le mobile, revenir ensuite dans l'application pour se connecter. Un compte existant doit fournir son mot de passe actuel : cette inscription ne remplace ni son mot de passe ni son profil professionnel.
- L'espace client contient ses commandes soumises, leur chronologie et son profil personnel. Le code de remise est accessible seulement lorsque la livraison est éligible à la distribution finale, selon les règles OTP existantes.
- Les commandes sans propriétaire sont rattachées au compte vérifié par leur e-mail destinataire. Un changement d'e-mail ne transfère jamais une commande déjà rattachée à un autre compte.
- L'accueil mobile propose, dans l'ordre : accès à mon espace, création d'une boutique, création d'un utilisateur, suivi du colis. L'inscription boutique utilise le parcours partenaire existant, avec un formulaire natif.

## Boutique et administration

La boutique peut rechercher un client par son e-mail exact pendant la création de commande. Seuls le nom, l'e-mail et le téléphone d'un compte client actif et vérifié sont proposés ; l'adresse de livraison reste à renseigner. La saisie d'un destinataire sans compte reste possible.

La page globale « Utilisateurs et accès » comprend une liste paginée, une recherche et un filtre des comptes clients. L'API exige les droits de gestion de la plateforme.

## Trois niveaux d'accès au suivi

| Accès | Informations disponibles |
| --- | --- |
| Référence + e-mail, sans connexion | Statut, dates et chronologie publique limitée ; aucun code de remise ni donnée personnelle |
| Compte client connecté | Ses commandes et leur détail ; code de remise lorsque disponible |
| Lien personnel reçu par e-mail | Suivi sécurisé et code selon les règles existantes, même sans compte |

Le suivi public s'actualise à la demande. Le suivi authentifié s'actualise toutes les 30 secondes lorsque visible. Le code est masqué lors du passage en arrière-plan et à son expiration. Les notifications de distribution finale continuent d'envoyer le code au destinataire par e-mail.

## API et migrations

- `POST /api/customers/register`, `POST /api/customers/verify` : inscription et vérification.
- `GET /api/customers/orders`, `GET /api/customers/orders/:reference`, `POST /api/customers/orders/:reference/code` : espace client authentifié ; CSRF pour le code depuis le Web.
- `POST /api/tracking/status` : suivi public limité, avec quota persistant.
- `POST /api/orders/customer-lookup` : recherche exacte depuis le formulaire professionnel autorisé.
- `GET /api/admin/users` : annuaire réservé à l'administration globale.

Appliquer les migrations `20261116210000_customer_accounts` et `20261116211000_customer_order_lookup_index` avec la procédure de déploiement habituelle, puis générer Prisma et construire l'API et le Web. Elles ajoutent les comptes en attente de validation, le marqueur client, la relation commande/client et les index. Aucune réinitialisation de base n'est nécessaire. Le service utilise la configuration SMTP existante et `WEB_APP_URL` pour les liens de vérification.

## Vérifications

Tests locaux dédiés : inscription, vérification, absence de réinitialisation d'un compte existant, rattachement historique et nouvelles commandes, accès aux seules commandes du client, suivi public sans secret, OTP et notifications, comptes désactivés, expiration et erreur SMTP. Tests HTTP : authentification, CSRF et annuaire réservé à l'administration globale.

Les tests de régression des commandes, confirmations de livraison et authentification passent, ainsi que les tests mobiles. Le parcours Web a été vérifié dans le navigateur avec des données locales isolées, sur grand et petit écran.

La compilation Web et les vérifications TypeScript API/Web/mobile passent. La suite clients est ajoutée au lanceur de tests de base de données utilisé en CI. L'export Expo local a été interrompu après être resté au démarrage de Metro, y compris lors d'un essai Android hors ligne : aucun export natif réussi ni test physique iPhone/Android n'est revendiqué.

Après déploiement, vérifier la réception réelle des e-mails, le lien HTTPS d'inscription, la connexion sur téléphone, les quatre boutons d'accueil et une commande de recette avec code de remise. Aucune modification de production ni aucun push n'a été effectué pendant cette implémentation.
