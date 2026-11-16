# Abonnements SaaS — Bloc 6

Une seule offre mensuelle active pour toutes les entreprises, indépendante du nombre d’agences. Aucun employé, livreur ou partenaire ne paie individuellement. Le prix est configuré dans le portail global; aucun montant commercial par défaut n’est ajouté par ce bloc. Voir le [journal central](JOURNAL_DE_DEVELOPPEMENT.md), les [paiements](SUBSCRIPTION_PAYMENTS.md), les [expirations](SUBSCRIPTION_EXPIRATION.md) et les [jobs Plesk](PLESK_SCHEDULED_JOBS.md).

## Plan et périodes

SubscriptionPlan et SubscriptionPrice sont réutilisés. Une offre active doit occuper referenceSlot=1, unique en SQL. Le tarif utilise DECIMAL(19,4), représenté par une chaîne dans les API et formulaires : jamais de calcul financier en flottant JavaScript. La devise est un code ISO de trois lettres. Les sommes du dashboard sont séparées par devise, sans conversion.

Modifier le tarif crée une nouvelle SubscriptionPrice; la précédente conserve son montant et sa date de début, seule sa borne de fin est fermée. Application immédiate ou programmée, dans l’ordre chronologique, au maximum un an à l’avance. Une version périmée renvoie 409; recharger. Une programmation existante ne peut pas être remplacée silencieusement. L’historique récent affiche les 100 dernières versions; toutes les versions restent en MySQL.

Règle commerciale : le tarif applicable est celui en vigueur au moment de la validation humaine. Le paiement doit avoir exactement ce montant et cette devise pour accorder un mois. Si un tarif a changé après le règlement déclaré, le validateur rejette la déclaration avec explication puis fait régulariser le règlement hors plateforme. Aucun prorata ni multiplication automatique de mois pour un montant supérieur.

Subscription conserve l’état agrégé; chaque validation crée une SubscriptionPeriod immuable, liée à un paiement unique et à sa version de tarif. SubscriptionEvent et AuditLog gardent les transitions. Le statut administratif Company n’est jamais modifié par un renouvellement.

## Calcul calendaire

Horodatages serveur UTC, bornes [début inclus, fin exclue). Première activation : instant du précontrôle serveur confirmé dans les cinq minutes. Abonnement encore valide : début à sa date de fin existante; sinon début à l’instant de réactivation préparé par le serveur. Le mois suivant conserve l’heure UTC et ramène le jour au dernier jour du mois cible si nécessaire : 31 janvier → 28/29 février. Un renouvellement depuis le 28 février donne le 28 mars : aucun ancrage implicite au 31. Ce choix est testé.

La confirmation signée inclut paiement, tarif, échéance précédente et dates proposées. Après cinq minutes ou changement concurrent du tarif/de l’échéance, recharger la confirmation. Les transactions sérialisables, le verrou entreprise et paymentId unique empêchent les chevauchements et doubles périodes.

États exposés : NONE (absence), PENDING, ACTIVE, EXPIRED, SUSPENDED, CANCELLED. EXPIRED est aussi calculé à la lecture selon la date serveur, sans attendre le job. Le champ lastActivatedAt et suspendedAt conservent les derniers événements. SUSPENDED/CANCELLED historiques sont respectés et ne sont pas levés implicitement; l’interface de ce bloc utilise la suspension administrative pour les décisions manuelles.

## Pages et API

Global : `/portail/super-admin/abonnements`, suffixes `/tarif`, `/historique`, `/notifications`; `/portail/super-admin/paiements` et `/:id`. Filtres des abonnements actifs, absents, expirés et proches de l’échéance; listes et recherche paginées. Le dashboard Bloc 5 garde ses données et ajoute les vrais indicateurs SaaS.

Entreprise : `/portail/entreprise/abonnement`, `/declarer` et `/:paymentId`. L’écran présente le tarif courant, le statut, le début de période connu, l’expiration, les jours restants et les deux historiques. Les montants réellement appliqués figurent dans les périodes, séparément du tarif courant.

| Préfixe /api/admin | Méthode | Accès |
| --- | --- | --- |
| /subscriptions | GET | GLOBAL + subscriptions.validate |
| /subscriptions/overview?days=30 | GET | Idem |
| /subscription-plan | GET, PATCH | Idem |
| /subscription-payments | GET | Idem |
| /subscription-payments/:id | GET | Idem |
| /subscription-payments/:id/preview | GET | Idem, confirmation préparée |
| /subscription-payments/:id/approve | POST | Idem, confirmation signée |
| /subscription-payments/:id/reject | POST | Idem, motif |
| /subscription-history | GET | Idem, périodes |
| /subscriptions/notifications | GET | Idem, journal d’envoi |

Entreprise : GET `/api/company/subscription`, GET/POST `/api/company/subscription/payments`, GET `/api/company/subscription/payments/:id`, GET `/api/company/subscription/history`. Contexte COMPANY autorisé et subscriptions.read; déclaration exige aussi subscriptions.declare. companyId vient exclusivement de la session vérifiée. Aucun paramètre companyId accepté. Les routes suivent le préfixe /api existant; /api/v1 reste uniquement la santé comme auparavant.

Écritures Web : origine autorisée, CSRF existant, validation stricte et 60 écritures/heure/utilisateur par processus. Réponses sans cache. Le seed et la migration ajoutent subscriptions.declare uniquement au rôle de référence company_admin, sans accorder de droit global.

## Migration et recette

Deux migrations additives : 20261028090000_subscription_management (champs, index, permission, immutabilité des paiements traités), 20261028100000_single_active_offer (contrainte explicite contre NULL). Préserver les sept migrations et les contraintes SQL manuelles des blocs précédents. Les nouvelles données absentes d’anciens paiements restent NULL; aucun historique financier n’est réécrit.

Une base contenant plusieurs offres actives non conformes doit être examinée avant migration : la contrainte échoue volontairement et ne désactive pas arbitrairement les offres. Sauvegarder et faire décider une régularisation explicite. Aucun reset automatique.

Recette : configurer une base cible et Auth selon AUTHENTICATION.md, appliquer les migrations revues puis seed. Configurer le tarif via le portail; créer une entreprise/administrateur selon COMPANY_MANAGEMENT.md. Déclarer un règlement déjà vérifié, consulter son état PENDING, puis faire valider par un autre compte global. Vérifier la période et le retour de l’accès; refaire avant/après échéance et vérifier la conservation des périodes. Tests automatisés : NODE_ENV=test, TEST_DATABASE_URL vers une base MySQL 8 dédiée nommée dnd_delivery*_test, `npm run test:db` depuis api.
