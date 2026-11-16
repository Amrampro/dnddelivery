# Contexte actif et isolation des accès

## Résolution

1. Vérifier la signature, l’algorithme HS256, l’émetteur, l’audience et l’expiration du JWT.
2. Relire sa session par sid, vérifier userId, type de client, expiration et révocation.
3. Relire le compte actif. Un userId de corps ou d’URL ne remplace jamais cette identité.
4. Calculer les contextes d’après les affiliations et permissions actuelles.
5. Pour un changement, accepter uniquement une contextKey présente dans ces accès et l’enregistrer côté session.
6. Sur une route sensible, résoudre à nouveau le contexte et la permission. Les handlers utilisent l’utilisateur de res.locals, pas une identité fournie par le navigateur.

Le JSON activeContext de Session ne contient que la clé sélectionnée, jamais une copie durable des permissions. La rotation la conserve mais ne conserve pas d’anciens rôles. GET me renvoie activeContext=null si l’affiliation ou l’organisation n’est plus autorisée ; GET workspace renvoie 403. Les interfaces renvoient vers la sélection plutôt que d’afficher un portail d’un autre rôle.

## Contrôles effectivement raccordés

requireAuthentication protège me, organisations, workspace, profil et sessions. requireCsrf protège les mutations authentifiées Web. requireTrustedOrigin couvre les mutations publiques et privées. requirePermission(workspace.access) est raccordé au portail et utilise les contrôles Global/Company/Agency/Shop du Bloc 2. La récupération du profil, la gestion des sessions et la modification du compte n’acceptent aucune identité de tiers.

Les mots de passe et les refresh/reset tokens ne sont jamais fournis par les lectures utilisateur. Les filtres des repositories métier du Bloc 2 restent obligatoires pour leurs futurs endpoints ; l’autorisation de l’interface ne les remplace pas. Aucun endpoint de commandes, stocks, finances ou employés n’est ajouté.

## Transactions

Rotation : verrouiller la session par hash du refresh, vérifier le compte, créer le successeur puis révoquer l’ancien avec replacedById. Un ancien token réutilisé entraîne la révocation de toute la famille. La transaction retourne ensuite un refus : elle ne lève pas l’erreur avant commit, ce qui annulerait la révocation.

Changement/réinitialisation du mot de passe : vérifier et verrouiller l’identité/session ou le token, modifier le hash, consommer tous les liens, révoquer toutes les sessions et enregistrer l’événement dans la même transaction. Les transactions utilisent l’isolation sérialisable et un nombre borné de nouvelles tentatives sur P2034. Aucun envoi SMTP n’a lieu dans le callback réessayable.

Bootstrap : verrou du rôle super_admin, recherche d’une initialisation existante, création et affectation globales atomiques, sans affiliation entreprise artificielle. Les comptes existants ne sont pas promus implicitement.

## Vérifications

Les tests exécutés couvrent entreprise étrangère, agence étrangère, utilisateur multi-entreprises, retrait d’affiliation, permission supprimée, entreprise suspendue, utilisateur désactivé et accès global indépendant. Les tests HTTP utilisent le vrai routeur et la vraie cryptographie avec un store de test isolé. Les tests Prisma/MySQL supplémentaires sont préparés sous api/tests/database ; ils n’ont pas été exécutés faute de TEST_DATABASE_URL. L’isolation réelle par les FK et verrous MySQL reste donc à vérifier sur une base dédiée.
