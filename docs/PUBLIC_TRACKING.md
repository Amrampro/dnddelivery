# Suivi destinataire — Bloc 13

> Mise à jour : le suivi simple par référence et e-mail utilise désormais `POST /api/tracking/status` et affiche uniquement le statut et la chronologie publique, sans code ni données personnelles. Le compte client et le parcours mobile sont décrits dans [CUSTOMER_ACCOUNTS.md](CUSTOMER_ACCOUNTS.md). Les sections ci-dessous décrivent le parcours sécurisé par lien personnel, qui reste disponible pour les destinataires sans compte.

Le suivi personnel se trouve sur `/suivi`, intégré au site existant. Le formulaire de la page d’accueil y conduit. Une référence n’est jamais un secret d’accès.

## Accès par lien personnel

1. Le destinataire saisit la référence et l’e-mail enregistré sur la commande.
2. `POST /api/tracking/lookup` répond toujours 202 avec le même message pour une demande bien formée, même si la paire est inconnue. L’envoi éventuel va exclusivement à l’adresse enregistrée ; aucune adresse n’est divulguée.
3. L’e-mail contient un lien personnel : jeton aléatoire de 32 octets dans le fragment de l’URL, valable 30 jours. Sa comparaison utilise un HMAC ; une copie chiffrée permet de réutiliser le lien dans les notifications. Aucune valeur brute n’est enregistrée dans un journal.
4. `POST /api/tracking/verify` échange le lien contre une session de lecture de 24 heures. Le fragment est retiré de l’URL. Le cookie est HttpOnly, SameSite=Lax, Secure en production, limité au chemin de la référence. Le jeton de session est uniquement haché en base.
5. `GET /api/tracking/:reference` exige cette session et contrôle à nouveau référence, commande, entreprise active, version et expiration.

Un renouvellement autorisé par `POST /api/deliveries/:id/tracking/renew` révoque liens et sessions existants, incrémente la version et invalide les OTP actifs. Une nouvelle notification personnelle est créée. Cette opération est auditée et idempotente.

## Confidentialité et limites

- Le détail public contient le numéro, le transporteur, la boutique, les statuts, dates et événements réellement enregistrés. Les libellés sont publics et maîtrisés ; les notes internes ne sont jamais recopiées.
- Aucun téléphone, adresse, e-mail, nom de salarié, photographie privée, position GPS ou état de caisse n’est exposé. Il n’y a ni carte animée ni estimation inventée.
- Les brouillons et les entreprises suspendues ne sont pas accessibles. Une référence ou un lien d’une autre commande ne permet pas de lire celle-ci.
- Les anciennes livraisons peuvent afficher leur statut historique. Une remise avec preuves du Bloc 13 n’est annoncée comme telle que si la preuve tracée existe.
- Réponses `no-store` et `Referrer-Policy: no-referrer`. Les mutations du navigateur conservent le contrôle d’origine et l’en-tête `X-DND-Client: web`.

Les quotas persistants sont de 20 demandes par IP et par heure, puis 5 par référence et par heure ; un nouvel envoi identique est dédupliqué pendant 15 minutes. La vérification du lien est limitée à 30 tentatives par IP sur 15 minutes. Un quota HTTP supplémentaire de 90 requêtes sur 15 minutes protège les routes publiques. Une demande limitée conserve la réponse générique.

La page conserve les dernières informations en cas d’erreur, indique la connexion indisponible et propose une actualisation. Elle interroge le serveur toutes les 30 secondes lorsqu’elle est visible, ainsi qu’au retour en ligne. Un code affiché est effacé en cas d’échec d’actualisation ou lorsque le serveur le rend indisponible.

Le bouton « Afficher mon code » appelle `POST /api/tracking/:reference/code`. Le code ne peut être communiqué que lorsque le colis est réellement en distribution finale sur son affectation courante. Voir [DELIVERY_OTP.md](DELIVERY_OTP.md).

Implémentation : `src/tracking/TrackingPage.tsx`, `api/src/modules/confirmation/tracking.ts`, `security.ts`, `routes.ts`.
