# Boutiques et accès des entreprises — 16 novembre 2026

## Ajouter un article depuis une boutique

1. Se connecter avec le propriétaire ou un gestionnaire autorisé et ouvrir l'espace boutique.
2. Choisir **Mon catalogue**, puis **Ajouter un article**.
3. Renseigner le nom, l'unité et, si nécessaire, la référence SKU, la catégorie, la description et une image.
4. Enregistrer. L'article pourra être sélectionné dans une nouvelle commande.

Le catalogue appartient à la boutique et peut être créé sans entreprise de livraison partenaire. Un employé disposant uniquement de `shop.products.read` peut le consulter mais ne peut pas créer de produit. Créer un article ne crée pas de quantité de stock physique ; les dépôts et mouvements de stock restent des opérations distinctes.

## Administration globale

Le portail global présente **Entreprises de livraison** et **Boutiques**. La rubrique Boutiques (`/portail/super-admin/boutiques`) propose une recherche par nom, référence ou e-mail, un filtre de statut et une pagination. La fiche présente les coordonnées, les propriétaires, les collaborations et l'historique récent.

- **Suspendre** bloque les accès de la boutique et les nouvelles opérations la concernant. Les comptes personnels et historiques restent conservés.
- **Réactiver** rend ses accès disponibles aux membres toujours autorisés. Les statuts des collaborations ne sont pas changés automatiquement.
- **Supprimer la boutique** effectue un archivage définitif dans cette interface : les invitations encore ouvertes sont révoquées et la boutique n'est plus utilisable. Les commandes, stocks, traces financières, propriétaires et historiques ne sont pas effacés.

Chaque décision demande une confirmation et un motif. Le serveur exige un contexte global avec `platform.manage`, vérifie de nouveau l'autorisation dans la transaction, verrouille la boutique, contrôle sa version et enregistre l'action. Aucune suppression physique en cascade n'est effectuée.

## Responsable d'une entreprise de livraison

Le formulaire créait auparavant les entreprises avec le statut **INACTIVE** par défaut. L'association d'un responsable ne suffisait donc pas à lui donner un espace utilisable. La nouvelle valeur par défaut est **ACTIVE** ; le choix explicite d'une création désactivée reste possible.

Pour une entreprise déjà créée et désactivée : **Entreprises de livraison → fiche de l'entreprise → Activer l'entreprise**, puis vérifier le responsable dans **Administrateurs**. Les anciennes entreprises ne sont pas réactivées en masse.

Un compte existant est associé immédiatement ; un nouvel utilisateur invité doit accepter son invitation et définir son mot de passe. À la connexion, un unique espace autorisé est sélectionné automatiquement. Plusieurs espaces autorisés conservent le choix d'environnement. Sans accès actif, la page présente les entreprises ou boutiques désactivées, suspendues ou archivées auxquelles le compte est encore affilié. Ce diagnostic ne confère aucune permission. Le bouton **Actualiser mes accès** permet de relire les droits après activation.

L'activation administrative ne crée pas d'abonnement : les règles d'abonnement existantes continuent de s'appliquer aux opérations concernées.

## Déploiement et validation

Les modifications concernent l'API et le Web, avec navigation partagée et sélection initiale du contexte également utilisable par le mobile. Aucune migration de schéma n'est nécessaire : les statuts, versions, affiliations et journaux existants sont utilisés. Le code doit être publié par le déploiement habituel pour apparaître sur le site en ligne.

Les tests couvrent les permissions globales, les versions périmées, l'archivage, la suspension/réactivation, les diagnostics d'accès limités au compte connecté, la connexion avec zéro/un/plusieurs espaces et le catalogue indépendant de la boutique. La recette MySQL utilise exclusivement la base locale dédiée de test, jamais la base de production.

Résultats : 30 tests API ciblés réussis, 49 tests partagés réussis, 23 tests MySQL réussis (dont les deux scénarios parents). TypeScript API/Web et tests, ESLint API/Web et build de production Web réussis. Aucune recette visuelle dans le navigateur de production ni aucun déploiement n'a été effectué pendant cette correction.
