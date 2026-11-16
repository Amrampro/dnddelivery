# Validation du deploiement automatique

Le controle de production compare la version publiee sur main a release.json sur Plesk.

1. Relever la version courante, les compteurs des tables et les empreintes privees du .env et des fichiers persistants.
2. Pousser une modification de documentation sur main.
3. Verifier les controles API, Web, mobile, MySQL et MariaDB dans GitHub Actions.
4. Verifier le build et la publication automatique sur plesk-deploy.
5. Verifier sur Plesk la nouvelle version, la sauvegarde avant migration, le statut des migrations et le redemarrage Passenger.
6. Comparer les donnees et fichiers persistants puis verifier /api/ready et le portail.

Ne jamais publier les secrets ou leurs valeurs dans ce rapport. Une base sans migrations en attente valide la reexecution idempotente, pas une nouvelle modification du schema en production.

Les sauvegardes quotidiennes Plesk sont volontairement desactivees pour le moment. La sauvegarde de base avant migration reste active.
