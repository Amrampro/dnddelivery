# Déploiement sur OVH Plesk

## Préparer trois configurations

| Environnement | API et données | Clients |
| --- | --- | --- |
| Développement | MySQL local ou isolé, clés locales, SMTP capturé | Web local, Expo development, URLs publiques de test si appareil distant |
| Préproduction | Hôte HTTPS, MySQL et stockage privés dédiés, clés et boîte SMTP propres | Web statique de préproduction, EAS preview interne |
| Production | MySQL et comptes dédiés, stockage persistant privé et sauvegardé, secrets de production | Web statique public, EAS production |

| Paramètre API | Attendu |
| --- | --- |
| `NODE_ENV`, `PORT`, `HOST` | `production`, valeurs compatibles avec le processus Node de Plesk |
| `DATABASE_URL` | DSN MySQL actuel, caractères de compte encodés, `ssl=true` et certificat vérifié pour une connexion distante |
| `WEB_APP_URL`, `CORS_ORIGINS` | HTTPS, liste d’origines exactes, comportant l’origine Web |
| `AUTH_ACCESS_SECRET`, `DELIVERY_SECRET` | Deux clés indépendantes et aléatoires, au moins 32 octets chacune |
| `TRUST_PROXY_HOPS`, `AUTH_COOKIE_SAMESITE` | Nombre de sauts effectivement maîtrisés. Préférer des sous-domaines en même site et vérifier le cookie Secure et HttpOnly avec HTTPS. |
| `SMTP_*` | Identifiants privés si requis, TLS implicite ou STARTTLS obligatoire selon le port |
| `COMPANY_LOGO_DIR`, `PRODUCT_IMAGE_DIR`, `DELIVERY_PROOF_DIR` | Répertoires absolus persistants hors de toute racine publique, accès réservé au compte de service |
| `REPORT_TIMEZONE` | Fuseau métier approuvé. Écritures MySQL conservées en UTC. |

Le fichier d’exemple liste les paramètres actifs. Lors d’une installation depuis une ancienne configuration, constituer `DATABASE_URL` depuis les paramètres MySQL et provisionner `AUTH_ACCESS_SECRET` et `CORS_ORIGINS`. Définir le tarif et la devise validés uniquement pour une installation initiale. L’équipe doit vérifier dans Plesk la version disponible de Node, le gestionnaire Node/Passenger, le point d’entrée, le compte d’exécution, l’IP et la version MySQL, les racines publiques et le proxy réel. Le couple cible de référence est Node 22.23.4 et MySQL 8.4. [Documentation Node.js de Plesk](https://docs.plesk.com/en-US/obsidian/administrator-guide/website-management/nodejs-support.76652/).

## API

Depuis le répertoire API privé de la release, avec le Node retenu et la configuration de la cible injectée côté serveur. Faire provisionner deux comptes MySQL distincts. Le compte de service exécute les requêtes métier et ne crée ni ne modifie le schéma. Le compte de maintenance est utilisé ponctuellement pour les migrations.

```sh
npm ci
npm run build
npm run db:validate
npm run db:migrate:status
```

Si des migrations sont en attente, sauvegarder avant de migrer et contrôler l’état `_prisma_migrations`. Exécuter `npm run db:migrate:deploy` via le compte de maintenance, puis `npm run db:migrate:status`. La création des déclencheurs MySQL peut requérir le DBA lorsque le journal binaire est actif. Ne pas ajouter de droit global au compte API ni modifier le réglage serveur pour contourner les migrations. Confier les migrations au DBA autorisé.

La commande de déploiement lit la version du moteur avant d'appliquer les migrations. La cible Plesk utilise MariaDB 10.11.19 avec `DATABASE_ENGINE=mariadb`. Les 28 migrations et les 303 tests de base de données ont réussi sur MariaDB 10.11.19 dans GitHub Actions le 14 novembre 2026 (voir MIGRATIONS.md). Cette validation ne constitue pas un déploiement sur Plesk. MySQL 8.4 conserve son historique canonique. Le moteur doit correspondre à DATABASE_ENGINE. Une ancienne migration partiellement appliquée doit être examinée sur sa base d'origine avant toute intervention.

Sur première installation, exécuter `npm run db:seed` avec le tarif validé puis `npm run auth:bootstrap` avec les paramètres privés à usage unique prescrits dans [AUTHENTICATION.md](AUTHENTICATION.md). Retirer les paramètres de bootstrap dès la fin. Exécuter `npm run ops:preflight` avec le compte API, qui doit pouvoir lire et écrire dans les répertoires privés. Définir ensuite `dist/server.js` comme point d’entrée Node. Utiliser le redémarrage géré par Plesk. En exécution autonome, `npm start` lance le même fichier.

```sh
curl --fail --silent --show-error https://api.example.invalid/api/health
curl --fail --silent --show-error https://api.example.invalid/api/ready
```

Réussite attendue HTTP 200 pour les deux sondes. Tester également connexion, contexte, un endpoint avec MySQL, CORS depuis le Web HTTPS, cookies Secure/HttpOnly, SMTP de recette et absence d’accès aux fichiers privés depuis chaque vhost. TLS et routage sont vérifiés sur le nom public. Surveiller codes 5xx, disponibilité, latence, workers et place disque. Les [jobs Plesk](PLESK_SCHEDULED_JOBS.md) utilisent les mêmes secrets et répertoires. Éviter d’ordonnancer deux workers qui traitent la même boîte d’envoi. Tester le nettoyage en simulation avant toute activation.

## Web

Construire depuis la racine partagée ou utiliser l’artefact CI. Dans `webapp`, fournir `VITE_API_URL=https://api.example.invalid/api` puis exécuter `npm ci` et `npm run build`. Publier le contenu de `dist` dans la racine du vhost Web. Configurer le fallback de navigation vers `index.html` pour les routes React, en réservant des 404 pour les assets manquants. Si nginx sert directement les fichiers, adapter son routage. Avec Apache, mettre en place et tester la réécriture sur le vhost effectivement utilisé. Routes à tester par accès direct et actualisation `/connexion`, `/espace`, `/suivi`. Gérer le cache long des assets hachés et la revalidation de `index.html`. Tester les en-têtes CSP, `nosniff`, politique de référent et anti-iframe dans le navigateur cible. Activer HSTS selon la validation HTTPS des hôtes.

Exemple de racine statique nginx à adapter après avoir confirmé le routage du vhost.

```nginx
location /assets/ {
    try_files $uri =404;
    add_header Cache-Control "public, max-age=31536000, immutable";
}
location = /index.html {
    add_header Cache-Control "no-cache";
}
location / {
    try_files $uri $uri/ /index.html;
}
```

Conserver le candidat précédent, ses URLs et sa configuration. En cas de panne, revenir au candidat précédent si le schéma est compatible. Sinon appliquer la procédure [sauvegarde et restauration](DATABASE_BACKUP_RESTORE.md). Le rollback de fichiers seul ne restaure pas MySQL.
