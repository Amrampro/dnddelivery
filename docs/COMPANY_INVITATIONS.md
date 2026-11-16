# Invitations d’entreprise — Bloc 5

Le Super Administrateur choisit un compte actif existant ou invite une nouvelle adresse. Pour un compte existant, utiliser l’association; une invitation ne peut pas remplacer son mot de passe ni prendre possession de son compte.

Le serveur génère un jeton aléatoire fort, ne stocke que son SHA-256 et fixe son expiration. `COMPANY_INVITATION_HOURS` vaut 48 par défaut (1 à 168 heures). Le lien contient le secret dans le fragment de `/invitation`; le Web le lit en mémoire puis retire le fragment de l’adresse. L’inspection et l’acceptation transmettent le jeton par POST, sans l’inscrire dans une query string.

L’invitation ne crée pas d’utilisateur avant acceptation. Le destinataire choisit son nom et son mot de passe (12 à 128 caractères), enregistré avec Argon2id. Création du compte, affiliation, éventuel principal, consommation du jeton et audit sont atomiques. Un lien expiré, révoqué, déjà consommé ou remplacé est inutilisable. Une entreprise suspendue ou archivée ne permet pas l’acceptation. Une entreprise inactive peut recevoir le compte, mais son contexte reste bloqué tant qu’elle n’est pas activée. Une connexion normale est nécessaire ensuite.

## SMTP et reprise

Configurer les variables privées SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM et SMTP_SECURE, ainsi que WEB_APP_URL. La configuration production impose le transport TLS prévu par le module SMTP existant. Aucun mot de passe n’est envoyé par courrier. Les secrets SMTP restent exclusivement dans l’API.

La transaction MySQL est validée avant l’envoi. Les états PENDING, SENT et FAILED distinguent l’enregistrement de la remise au serveur SMTP. SENT ne garantit pas la livraison dans la boîte finale. Un échec SMTP conserve l’entreprise et son invitation avec FAILED; le portail permet Renvoyer. Un arrêt entre commit et envoi peut laisser PENDING : une reprise manuelle est nécessaire. Il n’y a pas de worker durable ni de relance automatique dans ce bloc.

Chaque renvoi renouvelle le jeton et l’expiration, invalide l’ancien lien et trace l’action. Un ancien résultat d’envoi ne peut pas écraser l’état du nouveau jeton. La révocation est immédiate. La valeur brute n’apparaît jamais dans les listes et journaux API.

## Vérifications

Les tests MySQL couvrent expiration, révocation, rotation, rejeu, compte existant, affiliations et audit. Une recette complémentaire a reçu les courriers dans un véritable serveur SMTP local de test, activé le compte via HTTP et rejeté ancien lien/rejeu. Aucun courrier de production ni prestataire externe n’a été utilisé.

Les outils `api/tests/serve-admin-preview.ts` et `exercise-admin-preview.ts` sont réservés à la recette : NODE_ENV=test, indicateur DND_ADMIN_TEST_PREVIEW=1 et base dnd_delivery*_test obligatoires. Ils utilisent le code réel, uniquement sur boucle locale, et écrivent leurs secrets dans `.local-preserved/bloc5`, ignoré. Ne jamais les utiliser sur une base utile ni publier ce dossier.
