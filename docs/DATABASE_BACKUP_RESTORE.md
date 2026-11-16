# Sauvegarde et restauration MySQL et fichiers privés

## Sauvegarde cohérente

Identifier le schéma, l’instance et le propriétaire de la sauvegarde. Préparer un stockage chiffré, hors racine publique et hors machine, avec droits et durée de conservation validés. Pour une copie cohérente, arrêter les écritures de l’API et les jobs pendant la capture de MySQL, des preuves, logos et autres médias persistants. Interdire les migrations pendant cette fenêtre. Si une solution de snapshots coordonnés est disponible, documenter et tester la procédure de synchronisation.

Utiliser un profil login-path MySQL ou un fichier d’options privé avec TLS vérifié pour un hôte distant. Sous Linux, saisir le mot de passe via l’invite de `mysql_config_editor`. Le profil et les archives doivent rester privés. Utiliser le client compatible avec le serveur.

```sh
umask 077
set -eu
mysqldump --login-path=dnd_backup --single-transaction --quick \
  --no-tablespaces --set-gtid-purged=OFF --triggers --routines --events \
  --result-file="$BACKUP/mysql.sql" "$SOURCE_DB"
tar -C "$PRIVATE_DATA_ROOT" -czf "$BACKUP/private-media.tar.gz" delivery-proofs company-logos product-images
(cd "$BACKUP" && sha256sum mysql.sql private-media.tar.gz > SHA256SUMS)
```

Adapter les chemins à l’installation. Copier dans le coffre séparé la version de l’application, le paramétrage et les secrets nécessaires à la restauration. Protéger particulièrement `DELIVERY_SECRET` pour le suivi et les OTP déjà émis. Conserver les identifiants et clés hors des archives de livrables et des journaux. Si l’hébergeur impose une sauvegarde gérée ou des droits différents, faire valider la présence des déclencheurs, procédures et événements dans la restauration. [Options mysqldump](https://dev.mysql.com/doc/refman/8.4/en/mysqldump.html).

## Exercice de restauration

1. Vérifier date, empreintes, version MySQL et version applicative. Créer une base et un répertoire privés neufs dans une préproduction isolée. Suspendre SMTP/push et connecter uniquement l’application de récupération à cette base.
2. Importer avec `mysql --login-path=dnd_restore "$RESTORE_DB" < "$BACKUP/mysql.sql"` ou, sous Windows, `mysql --execute="source C:/chemin/mysql.sql"` sur le schéma de restauration. Valider la provenance de l’archive et ses chemins avant extraction. Restituer les droits sur les répertoires privés. Un DBA peut être nécessaire pour les déclencheurs lorsque le journal binaire est actif. [MySQL 8.4 et journal binaire](https://dev.mysql.com/doc/refman/8.4/en/stored-programs-logging.html).
3. Comparer avec la source le nombre de migrations appliquées et les déclencheurs, des totaux de commandes et de stock, montants décimaux et remises, événements d’audit et empreintes de preuves et médias. Contrôler le démarrage de la version restaurée, les deux sondes, l’isolation et une lecture authentifiée. Vérifier le rejet des accès directs aux fichiers.
4. Mesurer durée, perte de données et fenêtre de reprise. En cas d’incident réel, faire approuver une fenêtre de bascule et rapprocher les opérations entre la date de la copie et la coupure. Réactiver les jobs après validation. Une restauration ancienne peut réintroduire des sessions révoquées. Réévaluer et révoquer les sessions restaurées avant réouverture.

Fréquence de départ proposée pour validation métier, sauvegarde quotidienne, test trimestriel et avant chaque changement de schéma. RPO 24 h et RTO 4 h sont des objectifs à négocier et à mesurer sur la cible. Une exigence plus stricte nécessite une stratégie complémentaire, par exemple restauration à un instant donné.

## Particularité vérifiée en recette

Avec MySQL 8.4.13 sous Windows, l’import du dump local a échoué sur des déclencheurs mono-instruction dont le corps se termine par `; */;;`. Garder le dump original et n’utiliser la normalisation qu’après avoir identifié cette erreur de syntaxe. Créer une copie via `node scripts/normalize-mysql-trigger-dump.mjs original.sql restored-copy.sql`. Examiner le nombre de changements, restaurer la copie dans une autre base vide et vérifier le nombre de déclencheurs ainsi que leur comportement avant toute bascule.

L’exercice local a corrigé 33 fins de déclencheur dans une copie. Après import, MySQL contenait les 28 migrations et 56 déclencheurs, deux commandes, six articles physiques et zéro réservé, une remise à 50,1234 XAF et 46 événements d’audit. La photo copiée correspondait à l’empreinte SHA-256 en base. Le déclencheur restauré a rejeté une tentative d’édition du journal. Le dump de 386 712 octets et sa restauration avec contrôles ont pris environ 17 s. Ces mesures portent sur des données fictives. Les secrets, logos, images et sauvegardes de la cible doivent faire l’objet d’un exercice dédié.

Pour un rollback, conserver l’artefact précédent et vérifier la compatibilité de son API avec le schéma courant. Préférer des migrations additives et vérifier une reprise sur clone représentatif avant modification destructive. En cas de migration partielle, examiner `_prisma_migrations` et les objets réellement créés. Faire valider l’action de reprise avant toute utilisation de `migrate resolve`. Ne jamais réinitialiser un schéma de production par la commande de test.
