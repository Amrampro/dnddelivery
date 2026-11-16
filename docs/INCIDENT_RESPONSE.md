# Réponse aux incidents

1. Relever l’heure en UTC, l’environnement, le commit, la première alerte et son périmètre. Nommer un responsable et limiter l’accès aux preuves. Collecter les identifiants de requête et les journaux sans copier secrets, OTP, photos ou données personnelles dans les tickets.
2. En cas d’accès interentreprises, clé compromise ou écritures incohérentes, isoler les fonctions touchées, suspendre les écritures et jobs concernés selon l’impact, puis prendre une copie de diagnostic chiffrée et horodatée. Conserver les journaux d’audit, clés d’opération et rapprochements.
3. Vérifier sondes, proxy, MySQL et sessions. Corriger puis tester dans un environnement isolé. Pour une rotation, remplacer les secrets atteints, révoquer les sessions et vérifier les liens qui dépendent de `DELIVERY_SECRET`. Reconfigurer tous les jobs concernés.
4. En cas de panne de migration, conserver l’état, les journaux et la table Prisma. Revenir au candidat précédent si compatible. Sinon restaurer vers une base distincte et rapprocher les commandes et mouvements avant bascule. Pour SMTP ou push, contrôler les tentatives et reprendre les échecs ciblés. Dédupliquer les inscriptions ou notifications après une fenêtre de panne.
5. Rejouer santé, connexion, contrôle interentreprises et un parcours métier de recette après rétablissement. Consigner durée d’impact, pertes, actions et responsable du suivi.

Le responsable de traitement doit valider la conservation, la procédure d’accès ou de suppression de données et les obligations de notification selon les pays d’exploitation. L’exercice technique et les suites automatisées couvrent une partie de ces obligations. Prévoir un canal d’escalade et des coordonnées internes adaptées à chacun des environnements.
