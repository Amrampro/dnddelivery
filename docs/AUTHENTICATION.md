# Authentification DND Delivery â€” Bloc 3

## Mise en service

Le backend utilise exclusivement MySQL/Prisma en fonctionnement normal. Le store en mÃ©moire est un double rÃ©servÃ© Ã  api/tests ; aucune variable ne permet de lâ€™activer dans lâ€™application. Aucun utilisateur, mot de passe ou Super Administrateur par dÃ©faut nâ€™a Ã©tÃ© crÃ©Ã©.

PrÃ©parer une nouvelle DATABASE_URL MySQL pour DND Delivery, appliquer les trois migrations puis configurer AUTH_ACCESS_SECRET avec un secret alÃ©atoire indÃ©pendant dâ€™au moins 32 octets. Ne pas reprendre automatiquement lâ€™ancien JWT_SECRET. Le .env API existant est conservÃ© ; complÃ©ter ses variables privÃ©es manuellement et redÃ©marrer lâ€™API. /api/health reste disponible sans config dâ€™authentification ni connexion MySQL.

```powershell
cd api
npm ci
npm run db:validate
npm run db:migrate:deploy
npm run db:generate
npm run db:seed
npm run build
npm start
```

Le seed ajoute workspace.access aux profils professionnels de rÃ©fÃ©rence, sauf company_member, qui reste une affiliation de base sans accÃ¨s gÃ©nÃ©ral Ã  lâ€™entreprise. Les tarifs ne sont toujours pas inventÃ©s. Les rÃ´les personnalisÃ©s doivent recevoir les permissions nÃ©cessaires de faÃ§on explicite.

## Connexion et accÃ¨s

Connexion e-mail/mot de passe, normalisation de lâ€™adresse, vÃ©rification Argon2id (64 MiB, trois passes, parallÃ©lisme 1). La politique des nouveaux mots de passe est 12 Ã  128 caractÃ¨res, sans exigence arbitraire de majuscule, symbole ou chiffre ; les espaces et caractÃ¨res Unicode ne sont pas supprimÃ©s. Les erreurs dâ€™identifiants sont gÃ©nÃ©riques, y compris pour un compte dÃ©sactivÃ©.

Le serveur Ã©met un access JWT de courte durÃ©e et un refresh alÃ©atoire de 256 bits. Le JWT contient sub et sid, aucun rÃ´le ni permission. Ã€ chaque endpoint privÃ©, le serveur relit la session et le compte. Les sessions expirÃ©es/rÃ©voquÃ©es ou les utilisateurs dÃ©sactivÃ©s sont refusÃ©s immÃ©diatement pour les nouvelles requÃªtes.

GET me retourne un profil public, les accÃ¨s autorisÃ©s et le contexte actif sâ€™il est encore valide. Le client sÃ©lectionne une clÃ© retournÃ©e par le serveur, jamais un rÃ´le Ã  sâ€™attribuer. Le changement est revÃ©rifiÃ© et enregistrÃ© dans la session. Les routes sensibles vÃ©rifient Ã  nouveau les permissions et le pÃ©rimÃ¨tre ; les interfaces ne constituent pas une barriÃ¨re de sÃ©curitÃ©.

## Contrat REST

PrÃ©fixe canonique : /api/auth. /api/health et /api/v1/health sont conservÃ©s. Ne pas dupliquer ces routes sous /api/v1/auth sans adapter les chemins des cookies.

| MÃ©thode et route | Corps/paramÃ¨tre | RÃ©sultat |
| --- | --- | --- |
| POST login | email, password, deviceName facultatif | Web : cookies + profil minimal et csrfToken ; mobile : accessToken, refreshToken et expirations |
| GET csrf | Cookie refresh Web | Jeton CSRF liÃ© Ã  la famille, sans rotation ; aucun token de session retournÃ© |
| POST refresh | Mobile : refreshToken ; Web : corps vide et cookie | Rotation et nouvelles expirations, nouveau JWT |
| POST logout | Mobile : refreshToken ; Web : cookie | 204 ; famille de cet appareil rÃ©voquÃ©e, cookies supprimÃ©s |
| POST logout-all | Session authentifiÃ©e | 204 ; toutes les sessions de lâ€™utilisateur rÃ©voquÃ©es |
| GET me | Session authentifiÃ©e | user, organizations, activeContext, csrfToken Web |
| PATCH me | fullName, phone (ou null) | Profil mis Ã  jour ; impossible de modifier rÃ´le, statut, e-mail ou affiliation |
| GET organizations | Session authentifiÃ©e | AccÃ¨s professionnels rÃ©ellement autorisÃ©s |
| POST switch-organization | contextKey | Profil et contexte fraÃ®chement contrÃ´lÃ©s |
| GET workspace | Session + contexte + workspace.access ; query permission facultative | Contexte du portail ; la permission supplémentaire est aussi contrôlée côté serveur |
| GET sessions | Session authentifiÃ©e | Appareils actifs de lâ€™utilisateur, sans hash ni token |
| DELETE sessions/:id | UUID dâ€™une session personnelle | 204 ; rÃ©vocation de sa famille, refus dâ€™un appareil Ã©tranger |
| POST forgot-password | email | 202 gÃ©nÃ©rique si service configurÃ© ; aucune promesse de livraison |
| POST reset-password | token, password | Mot de passe modifiÃ©, jetons de rÃ©cupÃ©ration consommÃ©s et sessions rÃ©voquÃ©es |
| POST change-password | currentPassword, newPassword | Modification et rÃ©vocation de tous les appareils |

Toutes les requÃªtes indiquent X-DND-Client: web ou mobile. Le navigateur envoie credentials: include ; le mobile utilise Authorization: Bearer pour lâ€™access token. Un JWT de session Web ne peut pas Ãªtre utilisÃ© comme session mobile et inversement. Les donnÃ©es sensibles ne sont pas retournÃ©es dans le profil ou la liste des sessions.

Erreurs JSON : error.code et error.message. 400 validation/lien invalide, 401 session/identifiants invalides, 403 contexte/CSRF/origine refusÃ©s, 404 session personnelle introuvable, 429 trop de tentatives, 503 authentification/base/SMTP non configurÃ©s selon le cas. Une panne de base peut produire une erreur de service gÃ©nÃ©rique sans exposer la chaÃ®ne de connexion.

## RÃ©cupÃ©ration par e-mail

SMTP_FROM est requis en plus de lâ€™hÃ´te/port. Sans configuration complÃ¨te, toutes les adresses reÃ§oivent la mÃªme indisponibilitÃ© 503. Avec SMTP configurÃ©, la rÃ©ponse 202 est identique que le compte existe ou non, avec dÃ©lai public minimal et temporisation alÃ©atoire. Lâ€™envoi est lancÃ© aprÃ¨s persistance du hash, en dehors de la transaction et sans rendre le temps de rÃ©ponse dÃ©pendant de SMTP. Un Ã©chec de transport est enregistrÃ© dans AuthEvent avec raison mail_delivery_failed, sans secret.

Les tokens de rÃ©cupÃ©ration sont alÃ©atoires, hashÃ©s, expirent par dÃ©faut aprÃ¨s 20 minutes et ne sont consommables quâ€™une fois. Un nouveau lien invalide les anciens. AprÃ¨s changement, toutes les sessions sont rÃ©voquÃ©es. Aucun endpoint ne rÃ©vÃ¨le le token en rÃ©ponse, dans un log ou via une page de dÃ©veloppement.

Depuis l’audit du 29 octobre 2026, les nouveaux liens Web et mobile de récupération utilisent /reinitialisation#token=… sur l’origine Web configurée (HTTPS obligatoire en production). Le fragment est effacé par l’interface. Aucun nouveau jeton de récupération n’est émis vers le schéma personnalisé dnddelivery, qui pourrait être revendiqué par une autre application. Un retour natif exige des App Links/Universal Links réellement vérifiés ; aucun domaine n’est inventé.

Pour le dÃ©veloppement, utiliser un SMTP local avec boÃ®te de test liÃ©e Ã  127.0.0.1 et ne jamais exposer sa consultation sur Internet. Le test automatisÃ© SMTP emploie un serveur local Ã©phÃ©mÃ¨re et des adresses example.invalid ; aucun e-mail extÃ©rieur nâ€™est envoyÃ©. Lâ€™envoi aprÃ¨s rÃ©ponse nâ€™est pas une outbox durable : un arrÃªt brutal peut interrompre le message, auquel cas lâ€™utilisateur doit demander un nouveau lien. Une file durable chiffrÃ©e peut Ãªtre ajoutÃ©e avec le futur module notifications.

## Bootstrap initial

Commande manuelle uniquement : npm run auth:bootstrap. Fournir dans un environnement privÃ© : BOOTSTRAP_CONFIRM=INITIALIZE_DND_SUPER_ADMIN, BOOTSTRAP_EMAIL (votre adresse rÃ©elle), BOOTSTRAP_NAME et BOOTSTRAP_PASSWORD (12â€“128 caractÃ¨res). Ne pas saisir le mot de passe en argument de commande ni le conserver dans lâ€™historique ; utiliser une saisie masquÃ©e ou un gestionnaire de secrets pour alimenter lâ€™environnement.

Le script verrouille la ligne du rÃ´le global dans une transaction, refuse toute nouvelle initialisation si un administrateur global existe dÃ©jÃ , refuse de promouvoir un compte existant et ne crÃ©e aucun compte sans paramÃ¨tres explicites. Une rÃ©pÃ©tition pour le mÃªme compte est sans modification du mot de passe ni doublon. Aucun endpoint public ne rÃ©alise ce bootstrap. Retirer les variables du bootstrap aprÃ¨s usage. Aucun compte de production nâ€™a Ã©tÃ© crÃ©Ã© pendant les contrÃ´les.

## Variables privÃ©es

DATABASE_URL, AUTH_ACCESS_SECRET, AUTH_ACCESS_TTL_SECONDS (600), AUTH_REFRESH_TTL_DAYS (30), AUTH_RESET_TTL_MINUTES (20), AUTH_COOKIE_SAMESITE (lax), WEB_APP_URL, CORS_ORIGINS, TRUST_PROXY_HOPS (0), SMTP_HOST, SMTP_PORT, SMTP_FROM, SMTP_USER, SMTP_PASSWORD, SMTP_SECURE et variables manuelles BOOTSTRAP_*. Les noms et exemples non confidentiels sont dans api/.env.example. Les .env Web et Expo restent publics et ne contiennent que leurs URL API.

Le Web transmet aussi X-DND-User et X-DND-Context comme préconditions des opérations. Le serveur les compare à la session authentifiée ; ces en-têtes ne créent aucun droit. Les réessais conservent l’identité initiale. Les écritures de profil, changement de mot de passe et actions de session restent liés au compte initial ; la lecture du profil courant et les flux publics de récupération/connexion/déconnexion permettent de retrouver la session courante. Voir SECURITY_AUDIT_2026-10-29.md pour les tests et réserves.
