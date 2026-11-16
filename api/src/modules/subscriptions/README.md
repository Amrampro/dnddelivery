# subscriptions

Frontière du module préparée pour le Bloc 3. Aucune route CRUD ni authentification simulée. Utiliser le contexte autorisé, les clés composées du schéma et une transaction pour les écritures liées. Les repositories doivent appliquer companyId et, selon le contexte, agencyId ou shopId. Le client Prisma brut reste réservé aux infrastructures et services internes.
