# Logs de l’administration globale

Depuis le portail super administrateur, ouvrir **Logs**. La route est `/portail/super-admin/logs`. Les deux journaux offrent recherche, période, résultat, pagination, actualisation et détails. L’accès API `/api/admin/logs` exige une session valide et le contexte global avec `platform.manage`. Les administrateurs d’entreprise et les employés reçoivent un refus d’accès.

Le journal de sécurité lit les événements AuthEvent existants et conserve les événements à venir. Chaque entrée présente l’événement, le résultat, la date, le nom et l’e-mail du compte lorsqu’il existe, son UUID, l’identifiant de session lorsqu’il est disponible et l’identifiant de l’événement. Une tentative avec une adresse inconnue reste identifiée par l’e-mail saisi. Les événements historiques peuvent être dépourvus d’un identifiant de session. Le nom affiché est le nom actuel du compte. Les mots de passe, jetons et codes OTP sont exclus de la projection affichée.

Les connexions réussies ou échouées, déconnexions, révocations et changements de mot de passe proviennent du service d’authentification. Les refus d’autorisation et de session sont enregistrés par le traitement des erreurs. Une tentative de réutilisation de jeton est identifiée par son motif. Un échec d’envoi de récupération figure avec le résultat Échec.

Le journal technique est écrit sous `TECHNICAL_LOG_DIR`, par défaut `api/storage/technical-logs` lorsque le processus est lancé depuis `api`. Prévoir un chemin absolu persistant hors racine publique sur le serveur. Les fichiers JSONL sont répartis par jour UTC. Les lectures refusent les fichiers symboliques et les lignes invalides. L’accès au disque doit être limité au compte du service et aux opérateurs autorisés. Sauvegarder ces fichiers et définir leur durée de conservation avec l’équipe. Les événements techniques restent enregistrables pendant une panne de MySQL. Leur consultation dans le portail redevient possible une fois l’authentification rétablie.

Les événements techniques identifient le processus, la tâche ou la référence d’exploitation concernés. L’auteur d’une tâche automatique est indiqué Système / ordonnanceur. Les réponses 5xx de l’API incluent méthode, chemin sans query string, statut et identifiant de requête. Les transitions de disponibilité sont enregistrées lors des sondes. Les tâches existantes consignent leur résultat ou un échec, y compris les compteurs d’échecs partiels retournés par les workers.

## Surveillance indépendante

Après compilation, planifier `npm run ops:monitor` dans `api`, par exemple toutes les minutes depuis un ordonnanceur indépendant du processus API. `API_MONITOR_URL` est l’origine de l’API à contrôler. Sa valeur locale par défaut est `http://127.0.0.1:3000`. La commande vérifie `/api/ready`, enregistre un succès ou une indisponibilité et sort avec le code 1 si le contrôle échoue. Un arrêt brutal n’émet pas d’événement depuis le processus arrêté. Ce contrôle indépendant permet d’enregistrer son indisponibilité.

## Résultats des sauvegardes

Raccorder l’ordonnanceur de sauvegarde aux commandes suivantes, après avoir obtenu le résultat réel de son opération. Utiliser une référence opaque telle qu’un identifiant de sauvegarde. Les sauvegardes et restaurations restent conduites selon la [procédure d’exploitation](DATABASE_BACKUP_RESTORE.md).

Le script existant `api/scripts/backup-database.mjs` enregistre directement son résultat dans ce journal après compilation de l’API. Les commandes ci-dessous servent aux outils de sauvegarde et de restauration supplémentaires.

```sh
npm run ops:record -- BACKUP_COMPLETED backup-20261118-001
npm run ops:record -- BACKUP_FAILED backup-20261118-001
npm run ops:record -- RESTORE_VERIFIED restore-20261118-001
npm run ops:record -- RESTORE_FAILED restore-20261118-001
```

L’intégration de ces commandes au planificateur réel doit être réalisée avec les chemins et les comptes de la cible. La commande enregistre une déclaration du planificateur. Pour une restauration vérifiée, le planificateur doit avoir exécuté et contrôlé la restauration avant de déclarer sa réussite.
