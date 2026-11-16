# Rapport Bloc 6 — 28 octobre 2026

## Résultat

Le Web et l’API gèrent les abonnements réels dans MySQL : offre mensuelle unique, versions de tarif, déclaration de règlement externe, validation humaine globale, rejet motivé, mois calendaires, périodes immuables, expiration, accès limité et notifications persistantes. Aucun checkout ou transfert financier. Le statut administratif de l’entreprise reste indépendant.

Le [journal central](JOURNAL_DE_DEVELOPPEMENT.md) est créé : audit factuel des Blocs 1 à 5, fonctionnement détaillé du Bloc 6, évolutions datées et règle de mise à jour pour les prochains blocs. Aucun historique Git n’était disponible; les dates et résultats historiques restent attribués aux rapports existants.

## Pages et endpoints

Global : vue d’ensemble abonnements/entreprises, configuration du tarif et versions, déclarations filtrées/paginées et détail, confirmation affichant la période serveur, rejet, historique des paiements via filtre, périodes accordées, expirés/proches et journal des notifications. Le dashboard Bloc 5 conserve ses indicateurs et ajoute les comptes et montants réels par devise.

Entreprise : Mon abonnement, déclaration, historique/détail des déclarations et périodes, avertissement de validité et accès limité sans boucle de redirection. Un utilisateur multi-entreprises conserve le choix d’un autre contexte.

Les routes `/api/admin/subscriptions`, `/subscriptions/overview`, `/subscription-plan`, `/subscription-payments`, détail/preview/approve/reject, `/subscription-history` et `/subscriptions/notifications` utilisent subscriptions.validate en contexte GLOBAL. `/api/company/subscription`, `/payments` et `/history` utilisent le contexte COMPANY actuel; déclaration protégée par subscriptions.declare. [Liste complète et paramètres](SUBSCRIPTIONS.md).

## Données et règles

Réutilisation de huit modèles : SubscriptionPlan, SubscriptionPrice, Subscription, SubscriptionPayment, SubscriptionPeriod, SubscriptionEvent, Notification, AuditLog. Pas de nouvelle table. Ajout lastActivatedAt, paidAt, rejectionReason, idempotencyKey, duplicateKey et index associés. Permission de déclaration ajoutée au rôle company_admin. Migrations additives :

1. `20261028090000_subscription_management`.
2. `20261028100000_single_active_offer`.

Sept migrations conservées et appliquées à la seule base de test. Les anciennes migrations et données ne sont ni réinitialisées ni supprimées. Une CHECK MySQL acceptant UNKNOWN a été renforcée pour interdire plusieurs offres actives avec référence NULL. L’offre créée par ce test négatif a été désactivée uniquement dans la base de recette, sans suppression.

Montants DECIMAL(19,4) et chaînes exactes. Un règlement confirmé accorde un seul mois au tarif courant de validation, à montant/devise identiques; pas de prorata ni paiement couvrant plusieurs mois implicitement. Versions précédentes et périodes confirmées conservées. Après rejet, une déclaration corrigée peut reprendre la référence avec une nouvelle clé, tandis qu’une référence en attente ou confirmée reste protégée.

Bornes UTC [début,fin), mois calendaire ramené au dernier jour disponible. Première activation ou réactivation : instant de précontrôle serveur, confirmation valable cinq minutes. Renouvellement avant échéance : prolongation depuis la fin existante. Signature, verrou entreprise, transaction sérialisable et unicité du paiement empêchent rejeu et doubles périodes. [Détails](SUBSCRIPTION_PAYMENTS.md).

## Expiration, colis et jobs

Le contrôle immédiat dans authorizeTenant et le moteur interne de réservation refuse une nouvelle mutation sans abonnement réellement valide, même si le job est retardé. Les lectures filtrées, compte, changements de contexte et renouvellement restent accessibles selon les droits. Le job expire persiste EXPIRED, dates, événements et avis sans doublons; aucune donnée n’est effacée.

La continuité des colis est implémentée comme garde transactionnel `assertSafeClosure`, testé avec une vraie livraison MySQL. Il contrôle colis IN_PROGRESS, entreprise/agence, livreur ou administrateur, prise en charge antérieure à l’échéance et action limitée : clôture, preuve ou déclaration liée à ce colis. Aucune création ni nouvelle affectation admise. **Les routes logistiques et leur métier restent aux futurs blocs**, conformément aux restrictions : aucune route de preuve/encaissement n’est prétendue disponible aujourd’hui. [Politique et routes autorisées](SUBSCRIPTION_EXPIRATION.md).

Notifications J-3, jour J, après expiration, renouvellement validé et rejet. Outbox existante, déduplication SQL, bail de cinq minutes, workers concurrents via SKIP LOCKED, cinq tentatives contrôlées, annulation des avis devenus obsolètes et journal. SMTP hors transaction; un échec ne peut pas annuler le métier. Transport au moins une fois avec Message-ID stable, pas de garantie de livraison exactement une fois.

Commandes compilées : `npm run subscriptions:expire`, `npm run subscriptions:reminders`, `npm run subscriptions:notifications`. Prêtes pour des tâches Plesk toutes les cinq minutes/heure/minute respectivement. [Installation et reprise](PLESK_SCHEDULED_JOBS.md). Aucun ordonnanceur de production configuré.

## Fichiers principaux

- `api/src/modules/subscriptions/{rules,service,repository,routes,access,jobs}.ts` et `api/src/jobs/subscriptions.ts`.
- `webapp/src/subscriptions/Subscriptions.tsx` : composants des pages; intégration PortalLayout, dashboard et types Auth.
- Autorisations/repository, workspaces Auth, SMTP, routeur API, seed, scripts npm, schéma/migrations et contrôle de réservation existant.
- `mobileapp/src/workspace/WorkspaceScreen.tsx` et `src/auth/types.ts` : seul état limité, vérification et changement d’entreprise. Aucune dépendance native modifiée.
- `api/tests/subscriptions.test.ts`, `tests/database/subscriptions.database.test.ts`, `tests/serve-subscriptions-preview.ts`; adaptation explicite de la fixture stock et des stores mémoire de test; lanceur MySQL séquentiel incluant le Bloc 6.
- Journal et quatre guides spécifiques, README, DATABASE_DESIGN, MIGRATIONS et ce rapport.

## Vérifications exécutées

| Vérification | Résultat |
| --- | --- |
| API, Auth, HTTP/CSRF, SMTP local, calendrier et montants | 30 tests réussis, 0 échec |
| MySQL : intégrité, stock concurrent, Auth, Bloc 5 et abonnements | 42 tests réussis, 0 échec |
| Navigation partagée et permissions Web/mobile | 8 tests réussis, 0 échec |
| API typecheck, lint, build | Réussis |
| Web build et lint | Réussis |
| Mobile typecheck et lint | Réussis |
| Expo install --check | Matrice locale cohérente; contrôle hors ligne signalé par Expo |

Total automatisé : **80 tests réussis**. Le sous-ensemble SaaS (18 tests TAP, parent inclus) a été rejoué après le dernier ajustement du worker et passe. Les chiffres ne prétendent pas compter 80 scénarios utilisateur distincts : Node inclut les suites parentes dans son total.

MySQL Community 8.4.13 réel, boucle locale, base dédiée `dnd_delivery_bloc5_test`. Tests positifs/négatifs : plan unique/prix/version, droits et isolation, déclaration sans activation, doublon/idempotence, précontrôle, confirmation unique et concurrence, rejet et correction, auto-validation interdite, mois 29/30/31 et année bissextile, renouvellements avant/après échéance, historique immuable, job et blocage avant job, suspension administrative indépendante, contexte multiple, J-3/jour J, SMTP en échec puis reçu localement, pagination/agrégats et clôture d’un colis réel avant/après limite. Horloge injectée dans ces scénarios pour exercer les échéances sans attendre plusieurs mois; les fixtures peuvent donc porter des dates futures dans cette base privée.

Les trois commandes compilées ont été exécutées avec succès contre la base de recette. Les commandes à l’heure réelle ont trouvé des lots vides; l’envoi effectif et la reprise sont validés séparément par le test avec serveur SMTP local. Aucun courrier externe envoyé, aucun résultat CI distant déclaré réussi.

Recette navigateur avec vrais comptes/Express/MySQL : connexion globale et entreprise, listes/recherche, tarif historisé, détail et précontrôle avec dates exactes (annulé sans accorder d’accès depuis le navigateur), écran limité et accès Mon abonnement. Une déclaration de recette a été enregistrée depuis le formulaire Web et sa persistance après rechargement vérifiée. Vue entreprise contrôlée à 390 pixels sans débordement horizontal; tableau contenu dans son défilement. Captures dans docs/previews/bloc6-*.png. Aucun faux règlement réel : les fixtures portent explicitement la mention de recette.

## Préservation et limites

Les 39 empreintes protégées du Bloc 5 ont été comparées : seules les deux sources mobiles autorisées pour l’état d’abonnement ont changé. Landing, logos, assets et anciennes migrations répertoriés sont inchangés. Fichiers privés d’environnement conservés. Aucun SDK reconstruit, export natif, téléphone physique ou build signé testé; aucune nouvelle dépendance applicative. Prettier npm a servi uniquement à formater le code.

Pas de justificatif exposé, car l’infrastructure actuelle ne fournit qu’un transfert de logos et des métadonnées de fichiers. Pas de routes logistiques, de multi-formules ou de passerelle. Les abonnements SUSPENDED/CANCELLED hérités ne sont pas levés automatiquement; l’administration manuelle utilise les statuts d’entreprise du Bloc 5. Les limites de débit restent par processus. La remise SMTP finale et la planification Plesk sont à vérifier lors de la mise en service.

Les serveurs temporaires de recette ont été arrêtés et les ports vérifiés. Leurs comptes et secrets restent sous `.local-preserved`, ignoré. Aucun service système MySQL préexistant n’a été modifié. Aucun déploiement, aucune PR faute de dépôt Git, aucun Bloc 7.

## Pour tester et mettre en service ultérieurement

Configurer une nouvelle base cible et les secrets/origines selon AUTHENTICATION.md; sauvegarder, examiner les migrations et appliquer `npm run db:migrate:deploy`, puis seed et bootstrap manuel si nécessaire. Aucune nouvelle variable de production obligatoire : DATABASE_URL, Auth, WEB_APP_URL, CORS_ORIGINS et SMTP_* existantes sont réutilisées. DATABASE_RSA_PUBLIC_KEY_FILE reste facultative pour la recette locale; préférer TLS vérifié en production.

Configurer le vrai tarif dans le portail global, suivre le parcours décrit dans SUBSCRIPTIONS.md et faire vérifier les règlements hors plateforme par un autre compte autorisé. Construire API/Web et préparer les trois tâches Plesk selon leur guide; SMTP et ordonnanceur ne sont pas provisionnés par ce travail. Pour reproduire la suite MySQL, utiliser NODE_ENV=test et TEST_DATABASE_URL vers une base dédiée dnd_delivery*_test, puis `npm run test:db`. Ne jamais utiliser la base de production ou publier `.local-preserved`.
