# auth

Authentification du Bloc 3 : routes sous /api/auth, service transactionnel, Argon2id, JWT et rotation de sessions persistées par Prisma. Aucun store simulé dans le runtime. Voir docs/AUTHENTICATION.md à la racine du projet. Les accès métier doivent employer le contexte autorisé et appliquer companyId et, selon le contexte, agencyId ou shopId. Le client Prisma brut reste réservé aux infrastructures et services internes.
