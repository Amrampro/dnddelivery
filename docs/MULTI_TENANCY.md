# Isolation des données

## Frontières

La base MySQL est partagée. MySQL/Prisma n’ajoutent pas automatiquement un filtre de tenant à chaque requête. Un companyId transmis par un client n’est jamais une preuve d’accès. Les FK composées empêchent les associations croisées, mais elles ne protègent pas une lecture qui oublie son filtre.

Les modèles globaux sont les identités, rôles, sessions, boutiques et catalogues, ainsi que les tarifs de référence. Toute lecture de leurs données personnelles ou d’une boutique doit passer par un contexte d’autorisation approprié. Les tables métier d’entreprise sont ancrées par companyId.

## Autorisation préparée

modules/authorization/tenant-access.ts émet des contextes immuables après vérification, via repositories/authorization.repository.ts : compte actif, entreprise active, affiliation active et permission exacte. Les agences sont revérifiées dans le tenant. Un rôle agence ne donne pas implicitement accès à toute l’entreprise. Un rôle d’entreprise explicitement autorisé peut couvrir les agences de cette entreprise.

Le parcours boutique exige une collaboration active et une affiliation ShopMembership active. Il conserve shopId dans le contexte et dans les filtres de commandes. Un même utilisateur peut ainsi accéder aux collaborations autorisées de la même boutique avec différentes entreprises. Une boutique ne voit pas celles d’une autre boutique.

Les contextes ne peuvent pas être remplacés par un simple objet reçu en JSON : une WeakSet interne vérifie leur émission. Ils sont liés à une permission exacte et doivent être recréés à chaque requête. Le userId doit impérativement venir d’un middleware d’authentification vérifié. Ce middleware complet appartient au Bloc 3 : aucune route métier n’est exposée aujourd’hui.

Les privilèges globaux exigent authorizeGlobal et un GlobalRoleGrant actif ; aucun super-administrateur implicite ne contourne les filtres d’un repository tenant. La future administration globale doit utiliser ses propres services avec permission et audit explicites.

## Repositories

Les repositories des modules imposent les filtres au lieu d’accepter un where arbitraire. Les commandes et stocks appliquent entreprise/agence/boutique ; les livraisons et encaissements traduisent le filtre boutique via leur commande. Les lectures d’entreprise, abonnements et utilisateurs refusent les contextes plus étroits qu’ils ne peuvent représenter. Les notifications ne retournent que celles de l’utilisateur courant ; les lectures d’audit ne retournent pas leurs métadonnées brutes par défaut.

L’accès direct à getDatabase, aux delegates Prisma, aux nested writes ou à une requête SQL brute est réservé aux infrastructures et aux services contrôlés. Les nouvelles écritures doivent utiliser le contexte, les clés composées et une transaction. Ne pas créer une extension Prisma qui fait croire qu’elle sécurise toutes les opérations : raw SQL, relations, agrégations et opérations globales demandent une revue explicite.

## Transactions et concurrence

reserveStock revérifie les affiliations/permissions dans la transaction sérialisable. Il vérifie le stock dans le périmètre, la commande FROM_STOCK, la boutique, le produit, l’agence et la quantité demandée. L’UPDATE conditionnel ne réussit que si physicalQuantity - reservedQuantity suffit. Réservation, mouvement et audit sont écrits dans la même transaction. Un échec annule tout. Les conflits P2034 sont réessayés au maximum trois fois ; aucun effet externe ne doit se produire dans ce callback réessayable.

La clé d’idempotence est unique par entreprise. Un replay identique retourne la réservation initiale ; changer la charge utile avec la même clé est refusé. Les verrous et le CHECK reservedQuantity <= physicalQuantity protègent la dernière unité disponible. La disponibilité calculée ne doit jamais servir à une lecture suivie d’une écriture non conditionnelle.

Les autorisations peuvent changer entre deux requêtes ; ne jamais conserver un contexte en cache utilisateur à long terme. Les prochaines validations financières, OTP et transferts devront revérifier l’autorisation dans leurs transactions critiques comme le fait la primitive de réservation.

## Limites actuelles

Pas d’authentification HTTP complète, pas de RLS MySQL, pas de garantie contre une nouvelle requête brute mal écrite. L’ORM ne remplace pas les permissions ni les tests. Les tests unitaires d’autorisation ont été exécutés ; les contraintes et tests d’intégration MySQL attendent une connexion de test dédiée. L’utilisateur SQL applicatif devra avoir des droits minimaux et ne pas pouvoir modifier les migrations ou les triggers d’audit.
