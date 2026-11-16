# Base DND Delivery

Schéma MySQL : schema.prisma (47 modèles). Migrations : migrations/, initiale générée puis invariants SQL complémentaires. Client généré dans ../src/generated/prisma et ignoré par Git.

Voir ../../docs/DATABASE_DESIGN.md, ../../docs/MULTI_TENANCY.md et ../../docs/MIGRATIONS.md. Le .env API reste privé ; aucune migration ni connexion automatique au démarrage. Une nouvelle DATABASE_URL est nécessaire pour appliquer les migrations. Ne jamais réutiliser une ancienne base.
