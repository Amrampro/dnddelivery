# Jobs serveur et préparation Plesk

Les jobs ne dépendent ni d’une visite Web ni d’un timer Express. Aucun ordonnanceur de production n’est configuré automatiquement. Utiliser un compte de service à droits minimaux et le même environnement API privé. Aucun secret dans la ligne de commande, le Web ou les journaux.

## Commandes exactes après compilation

Depuis le dossier api, après `npm ci`, `npm run db:generate` et `npm run build` :

```text
npm run subscriptions:expire
npm run subscriptions:reminders
npm run subscriptions:notifications
```

Équivalents directs pour une tâche Plesk, avec le bon répertoire de travail api :

```text
node dist/jobs/subscriptions.js expire
node dist/jobs/subscriptions.js reminders
node dist/jobs/subscriptions.js notifications
```

Dans Plesk, choisir la version Node compatible du site, une tâche de commande et les chemins absolus de Node et de api réellement installés. Exemple à adapter : `cd /var/www/vhosts/DOMAINE/PROJET/api && /opt/plesk/node/22/bin/node dist/jobs/subscriptions.js expire`. Ne pas copier les emplacements locaux Windows sur le VPS. Le `.env` de api est chargé par le job; conserver ses droits privés et vérifier DATABASE_URL, AUTH_ACCESS_SECRET, WEB_APP_URL et SMTP_* selon AUTHENTICATION.md.

Fréquences conseillées : expire toutes les 5 minutes; reminders toutes les heures; notifications toutes les minutes. La sécurité des nouvelles opérations reste assurée à chaque requête même si expire est retardé. Plesk peut capturer stdout/stderr : sortie limitée aux compteurs ou au type d’erreur, sans URL de base ni message SMTP sensible. Surveiller le code de sortie et le journal des notifications dans le portail.

## Concurrence et reprise

expire verrouille l’entreprise et ne traite que les abonnements encore ACTIVE et arrivés à échéance. reminders conserve une clé unique par événement/échéance/destinataire. Plusieurs exécutions sont admises.

notifications réclame une ligne via FOR UPDATE SKIP LOCKED, bail de 5 minutes et identifiant de propriétaire. Envoi hors transaction, puis résultat enregistré seulement si le bail appartient encore au worker. Maximum 100 lignes par exécution; cinq tentatives par notification, attente 5/10/20/40 minutes avant les suivantes (plafond de calcul 24h). Une ligne PROCESSING abandonnée peut être reprise après expiration du bail; après la dernière tentative abandonnée, elle devient FAILED sans rester bloquée. Une affiliation supprimée ou une échéance remplacée entraîne CANCELLED.

Une panne SMTP conserve la notification FAILED et availableAt : la relance suivante la reprend si elle n’a pas épuisé maxAttempts. Après cinq échecs, intervention opérateur nécessaire : corriger SMTP, examiner le journal et décider explicitement une reprise ciblée sur la notification concernée, sans réinitialiser toute la file. Aucune relance infinie.

Un serveur SMTP peut accepter le message puis perdre la connexion avant l’enregistrement MySQL du succès. L’envoi est donc **au moins une fois**, avec Message-ID stable; un doublon de transport reste possible dans ce cas précis. La clé de déduplication garantit l’unicité des événements en base, pas une livraison SMTP exactement une fois. SENT signifie acceptation par le transport, pas garantie de remise finale.

Les commandes métier peuvent réussir même si SMTP est indisponible. Le journal conserve tentatives et diagnostic générique; surveiller les notifications FAILED. Aucune passerelle financière et aucune donnée de paiement externe envoyée à un prestataire dans la recette locale.

## Worker logistique Bloc 11

Après compilation, la commande disponible est npm run deliveries:notifications dans api. Elle traite uniquement les événements Notification DELIVERY_ avec le SMTP existant ; bail, reprise différée et tentatives bornées. L’adaptateur push est prévu mais aucune infrastructure de push n’est installée : les avis PUSH restent en attente. Configurer les véritables secrets SMTP et la cadence relève de l’exploitation ; aucun job ni déploiement de production n’a été créé pendant ce bloc. Voir DELIVERY_MANAGEMENT.md.
# Complément Bloc 12 — notifications financières

Commande disponible dans `api` : `npm run collections:notifications`. Utilise le SMTP configuré, `FINANCIAL_NOTIFICATION_BATCH` (défaut 100, entre 1 et 1000), baux et reprises avec Message-ID stable. Le job revalide les destinataires et ne traite que les événements FINANCE_. Sans adaptateur push, aucun push externe n’est envoyé ; les avis restent consultables dans les interfaces. Aucun planificateur de production n’a été activé durant ce bloc. Voir [notifications et limites](FINANCIAL_DISCREPANCIES.md).


## Complément Bloc 13 — boîte d’envoi et fichiers privés

Après migrations et compilation, lancer dans api : npm run confirmation:notifications. Le job regroupe les travailleurs commandes, livraisons et alertes internes sur leurs sources distinctes ; DELIVERY_NOTIFICATION_BATCH vaut 100 par défaut (1 à 1000). SMTP existant, DELIVERY_SECRET et dossier DELIVERY_PROOF_DIR privé requis. DELIVERY_PUSH_ENABLED reste false par défaut ; l’activer exige les appareils Expo configurés et liés aux sessions. Aucun job Plesk de production n’a été installé ici.

Pour le stockage : npm run confirmation:cleanup est une simulation ; -- --apply traite seulement les fichiers UUID non référencés de plus de 24 heures. Sauvegarder fichiers privés et base de manière cohérente. Le relais accepte un message sans garantir sa délivrance ; reprises au moins une fois. Voir [notifications](DELIVERY_NOTIFICATIONS.md) et [preuves](DELIVERY_PROOFS.md). Le complément Bloc 13 étend la limite historique concernant le push du Bloc 11.
