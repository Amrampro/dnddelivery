# Rapport — Bloc 2 et correction Expo SDK 57

Date : 20 octobre 2026. Travail direct dans le dépôt fourni. Aucun déploiement, aucune base existante réutilisée, aucune ancienne donnée supprimée, aucune interface redessinée.

## Mobile : correction réalisée

La tentative de migration mélangeait Expo 44, React Native 0.72 et des modules Expo 55/57/58. Le manifeste et le lockfile sont maintenant cohérents avec Expo 57.0.30 : React Native 0.86.3, React 19.2.3, Router 57.0.28, Reanimated 4.5.1, Worklets 0.10.1, TypeScript 6.0.3 et autres versions de la matrice native officielle. Les options de configuration obsolètes et le plugin Status Bar incorrect ont été retirés.

Expo Doctor a détecté puis confirmé la résolution d’un doublon natif react-native-screens. Une seule version 4.26.2 est désormais installée pour l’application et Router. Aucune dépendance forcée avec force/legacy-peer-deps, aucun contrôle Doctor masqué.

Les sources graphiques Web et les assets Web/mobile ont été comparés à leurs empreintes prises au début de cette intervention : aucun changement. Les écrans mobiles et leurs styles sont conservés ; seuls l’environnement, les dépendances, la configuration et la consigne de version AGENTS.md ont été adaptés. Les identifiants natifs restent com.goulbam.dnddelivery. Les .env publics n’ont pas été modifiés.

## Base de données préparée

**47 modèles Prisma et 47 tables applicatives décrites, mais aucune table effectivement créée localement.** La connexion à une nouvelle base MySQL n’était pas configurée. Ne pas confondre génération du SQL et application d’une migration.

Modèles : User, Role, Permission, RolePermission, GlobalRoleGrant, Company, CompanyMembership, Agency, AgencyMembership, Shop, ShopMembership, CompanyShop, Product, Session, AccountToken, AuthEvent, Stock, Transfer, TransferItem, TransferEvent, Recipient, Order, OrderItem, StockReservation, StockMovement, OrderEvent, Delivery, DeliveryAssignment, DeliveryEvent, DeliveryOtp, DeliveryProof, FileAsset, ProofPhoto, Collection, Remittance, RemittanceItem, CollectionEvent, RemittanceEvent, SubscriptionPlan, SubscriptionPrice, Subscription, SubscriptionPayment, SubscriptionPeriod, SubscriptionEvent, UserDevice, Notification, AuditLog.

Deux migrations versionnables sous api/prisma/migrations :

1. 20261020180000_initial : schéma relationnel, index et FK, générés par Prisma depuis un schéma vide.
2. 20261020181000_integrity : 57 CHECK et 29 triggers complémentaires : rôles, stock, quantités, montants, dates, preuve unique, OTP vérifié non réutilisable, clôture avec preuve, confidentialité des photos, instantanés et historiques immuables.

Prisma ORM/Migrate 7.10.1 stable a été retenu ; aucune migration vers la version 8 RC proposée par la CLI. Générateur TypeScript ESM et adaptateur MySQL avec UTC. Le client est initialisé à la demande ; l’API de santé reste indépendante de la base.

## Principales relations et protections

Entreprise/agences/utilisateurs par affiliations multiples et FK composées tenant. Une boutique unique peut collaborer avec plusieurs entreprises avec un catalogue partagé. Les stocks sont isolés par entreprise/agence/boutique/produit, et les lignes de commande/réservation doivent référencer la bonne boutique et le bon produit.

Commandes et destinataires sont distincts : coordonnées obligatoires et instantané immuable à la création, sans compte destinataire obligatoire. La référence publique de suivi est indépendante de l’UUID interne. Les commandes ponctuelles n’exigent pas de stock.

Une livraison principale par commande, avec réaffectations et événements séparés. Les preuves sont uniques par livraison ; les OTP sont liés au tenant, à la livraison et au livreur. Le modèle prévoit les exceptions autorisées et les fichiers de preuve privés. Aucun vrai service OTP n’a été implémenté.

Les encaissements et remises ont leurs propres états, indépendants de la livraison. Les allocations ne peuvent pas mélanger entreprise/livreur/agence/devise et un encaissement ne peut être alloué deux fois. L’agent qui confirme une remise doit différer du livreur.

Abonnement unique par entreprise, plan mensuel de référence unique, historique des tarifs et périodes appliquées. Paiements uniquement déclaratifs, validation globale, outbox à J-3/J0. Aucun paiement ni notification envoyé.

## Fondations backend ajoutées

Configuration Prisma 7, client MySQL lazy, transaction sérialisable avec retries bornés, contexte d’autorisation immuable, repository d’affiliations et repositories de lecture filtrés par module. Les contextes agence/boutique ne peuvent pas être élargis implicitement au tenant. Les droits globaux sont séparés.

La primitive interne reserveStock prépare l’atomicité : permission revérifiée dans la transaction, stock compatible avec la ligne, UPDATE conditionnel, réservation/mouvement/audit atomiques et clé d’idempotence par entreprise. Aucun endpoint opérationnel ni CRUD public n’a été ajouté. Le rapport et les notifications ne simulent aucune donnée métier.

Seed non destructif pour rôles/permissions ; tarif uniquement si explicitement configuré, aucun prix commercial inventé, aucun compte ni mot de passe initial. Les prix existants ne sont pas écrasés. Le workflow CI comporte un job MySQL 8.4 dédié ; son exécution distante n’a pas été vérifiée.

## Tests réellement exécutés

| Contrôle | Résultat |
| --- | --- |
| Mobile lint | Succès |
| Mobile TypeScript 6 | Succès |
| Expo check:dependencies | Versions cohérentes et à jour |
| Expo Doctor | 21/21, aucun problème |
| Export final Android/iOS/Web | Succès après déduplication, six routes statiques |
| Démarrage Expo/Metro | Succès sur 8082 |
| Parcours SDK 57 dans l’export Web | Accueil, suivi et connexion préparatoire contrôlés ; saisie/soumission correcte ; aucune erreur/alerte de console constatée |
| Préservation visuelle | Empreintes des sources Web et assets Web/mobile identiques |
| Web lint et build | Succès, sans modification de ses sources |
| Schéma Prisma | Validation réussie |
| Client Prisma | Génération réussie |
| SQL initial depuis schéma vide | Généré, 47 CREATE TABLE ; non appliqué |
| API lint, typecheck (sources/tests/scripts/seed), build | Succès |
| Tests HTTP/configuration/autorisation | 8 tests réussis, 0 échec |
| API compilée sans MySQL | Démarrage et /api/health vérifiés, JSON status=ok |
| Manifestes/lockfiles | Synchronisés pour les trois applications |
| Tests MySQL réels | Non exécutés : TEST_DATABASE_URL absente ; la commande s’arrête explicitement sans migration |

Les huit tests exécutés couvrent configuration MySQL, endpoints de santé/sécurité/CORS/404/JSON invalide, affiliation absente, entreprise suspendue, utilisateur inactif, séparation des scopes agence/entreprise, contexte boutique multi-entreprises, faux contextes et privilèges globaux séparés. Ils ne prouvent pas l’application des contraintes dans MySQL.

Les tests d’intégration préparés couvrent les FK et unicités, la boutique multi-entreprises, les affiliations, la lecture d’une commande étrangère, les réservations concurrentes et replays, les états financiers indépendants, la validation unique, les instantanés et les remises. Ils restent à exécuter sur une base dédiée.

## Commandes utiles

```powershell
cd mobileapp
npm ci
npm run doctor
npm run check:dependencies
npm run lint
npm run typecheck
npm run build
npm run start:clear
```

```powershell
cd api
npm ci
npm run db:validate
npm run db:generate
npm run typecheck
npm run lint
npm run build
npm test
npm run dev
```

Après création et configuration d’une **nouvelle** base : db:migrate:deploy, db:migrate:status, db:seed. Pour les tests : fournir TEST_DATABASE_URL vers dnd_delivery*_test puis npm run test:db. Le service compose.test.yml fournit une option isolée sur le port 3307 ; voir MIGRATIONS.md.

## Limites et préparation du Bloc 3

- Aucune migration MySQL ni seed réellement exécutés, aucune contrainte SQL/triggers vérifiés sur serveur. Ces tests restent nécessaires avant de considérer la couche base de données validée en intégration.
- Aucun appareil Android/iOS physique, simulateur natif ou build signé testé. Les exports ne remplacent pas ces contrôles. Utiliser un client compatible SDK 57 et vider l’ancien cache Metro si nécessaire.
- Pas de dépôt .git détecté ; règles d’exclusion préparées mais index/historique Git impossibles à auditer. Vérifier le suivi des migrations et l’absence de secrets au rattachement du dépôt.
- Authentification HTTP réelle et émission de principal fiable restent à développer. Ne jamais utiliser un userId client comme identité authentifiée.
- Les machines de transitions, réconciliation financière, libération/consommation de réservations, transferts complets, validation OTP, workers de notifications et formulaires métier restent au Bloc 3 ou aux blocs concernés. Les permissions doivent être contrôlées dans leurs transactions.
- Définir tarif/devise réels, règles d’arrondi, retours, remises annulées, réceptions partielles et politiques de conservation. Les contraintes impossibles à exprimer avec une simple FK sont détaillées dans BUSINESS_RULES.md.

Documentation : DATABASE_DESIGN.md, ENTITY_RELATIONSHIPS.md, MULTI_TENANCY.md, BUSINESS_RULES.md, MIGRATIONS.md et MOBILE_SDK_57.md. Aucun passage au Bloc 3 et aucune mise en production.
