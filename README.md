# DND delivery

This draft branch validates the API migration history on MariaDB 10.11.19. It contains API/shared sources and isolated CI, not the complete web/mobile deployment.

Validation: 28 migrations applied successfully, 303 database tests passed, and repeated migration deployment found no pending migrations.

[Successful validation](https://github.com/Amrampro/dnddelivery/actions/runs/43613356230)

See docs/MIGRATIONS.md for engine selection and migration history handling. Production deployment remains a separate step. Never commit the API .env or production secrets.
