# Bloc 10 — Commandes et destinataires

Réalisation du 28 octobre 2026 dans le projet existant. Le journal et les modèles préparés ont été examinés avant modification. API, Web et Expo sont connectés à MySQL ; les étapes d'affectation, livraison et encaissement réel ne sont pas ajoutées.

## Résultat

Commandes ponctuelles et depuis stock, brouillons sauvegardés, création par boutique ou agent autorisé, destinataire sans compte, répertoire isolé, coordonnées/articles historiques, référence serveur unique, montants exacts, édition versionnée et annulation motivée. Les réservations sont atomiques avec la commande, ajustées lors d'une édition structurelle et libérées lors d'une annulation. L'historique et l'outbox sont persistés.

Le Web propose les listes/indicateurs réels, filtres/tri/pagination, formulaire de quatre étapes, récapitulatif, fiche et historique. Expo propose les mêmes opérations essentielles et conserve le formulaire ouvert après erreur réseau. Les menus du contexte boutique autonome utilisent explicitement shop.orders.read/create ; les écritures ne sont pas déduites d'un simple droit de lecture.

## Vérifications réellement exécutées

| Contrôle | Résultat final |
|---|---|
| Suite complète MySQL 8.4.13, Blocs 3 à 10 et intégrité | 146 tests réussis, 0 échec |
| Dont suite commandes | 27 tests TAP, inclus dans les 146 |
| API/authentification/HTTP/SMTP | 32 réussis, 0 échec |
| Contrats, validations de formulaire et navigation partagés | 14 réussis, 0 échec |
| Total distinct | **192 réussis, 0 échec** |
| API | typecheck source/tests/outils, lint, build et validation Prisma réussis |
| Web | build et lint réussis |
| Expo SDK 57 | typecheck, lint et contrôle local des dépendances réussis |
| Exports Expo finaux | Web, Android et iOS réussis ; 12 routes Web |
| Migrations appliquées | 16, toutes les empreintes correspondent aux fichiers |
| Fichiers protégés | 24 empreintes vérifiées, aucune modification |

Le contrôle de dépendances Expo utilise la matrice installée et `expo install --check` hors ligne, qui affiche son avertissement sur la fiabilité de la validation hors ligne. Aucune dépendance native n'est changée ; pas de nouveau passage Expo Doctor revendiqué. Les exports Android/iOS sont des bundles Hermes, pas des installations sur appareil ni des applications signées.

Les tests couvrent notamment les deux types, absence de compte destinataire, plusieurs articles, aucune réservation partielle si une ligne échoue, courses concurrentes 4+4 sur 5, rejeu simultané d'une même clé, brouillons sans stock, soumission revalidée, modification des quantités, rollback de modification, versions périmées, annulation unique, historique immuable, interdiction de modifier manuellement une réservation liée, collaboration inactive, isolation entreprise/agence/boutique et transporteur sélectionné, contacts internationaux, montant exact à quatre décimales, références concurrentes, fiches distinctes sans fusion, snapshot stable après modification du répertoire, statuts non modifiables, changement d'agence atomique, pagination, expiration, SMTP en échec/reprise et modification financière sans mouvement.

Commandes exécutées dans les dossiers appropriés :

```text
api      npm run typecheck ; npm run lint ; npm run build ; npm run db:validate
api      npm test ; npm run test:db ; npm run db:migrate:status
webapp   npm run build ; npm run lint ; npm test
mobileapp npm run typecheck ; npm run lint ; npm run check:dependencies
mobileapp expo export --platform all --output-dir ../.local-preserved/bloc10/mobile-final
```

Les journaux privés sont conservés dans `.local-preserved/bloc10`, dont mysql-final.log, orders-final.log, api-tests.log, shared-tests.log et mobile-all-final.log. Les rejouages ciblés ne sont pas ajoutés une seconde fois au total.

## Recette réelle Web / Expo Web

Compte boutique de recette et entreprise de test conservés des blocs précédents. Le parcours n'utilise aucune donnée de production ni adresse e-mail distribuable.

1. Depuis Expo, boutique autonome → transporteur Centre → agence Douala → commande depuis stock → destinataire fictif international → trois T-shirts → récapitulatif.
2. API arrêtée volontairement : erreur réseau visible, formulaire et clé de validation conservés. API rétablie : même saisie enregistrée en brouillon, sans doublon.
3. Brouillon `DND-2026-883F2E34E7EC4B03A9B40C4C53C99753` : le Web affiche 17 physiques, 0 réservée, 17 disponibles.
4. Soumission Expo : le Web affiche 17 physiques, 3 réservées, 14 disponibles ; le T-shirt reste à 12 physiques, 3 réservés, 9 disponibles. L'entreprise retrouve la même commande, le créateur boutique, le destinataire, les articles et l'historique.
5. Annulation motivée et confirmée depuis Expo : état Annulée, réservation Libérée, événements conservés. Le Web affiche à nouveau 17 physiques, 0 réservée, 17 disponibles.

Captures dans `docs/previews/bloc10-*.png` : brouillon, commande Expo, commande Web, réservation Web, annulation Expo, stock libéré et reprise réseau. Les captures Expo proviennent de l'aperçu Web dans le navigateur ; elles ne prouvent pas une installation native. Aucune erreur applicative nouvelle sur le parcours ; un avertissement de déconnexion Metro provient du redémarrage volontaire du serveur de développement.

## Migrations, incidents corrigés et conservation

56 modèles conservés. Extensions de Recipient, Order, OrderItem et OrderEvent ; StockReservation est relié aux vrais articles. Trois migrations incrémentales : 20261028160000_order_management, 20261028161000_order_permissions et 20261028162000_order_permission_metadata. Les treize migrations antérieures restent intactes.

La première application de test s'est interrompue sur la création du trigger faute du réglage MySQL nécessaire aux créateurs de triggers avec journal binaire. Les instructions restantes ont été exécutées après relance autorisée du serveur de test, puis la migration résolue comme appliquée. Une insertion initiale de permissions avec IGNORE avait produit des métadonnées de dates invalides : les deux migrations suivantes complètent les droits et réparent ces seules métadonnées sans supprimer de données. Le passage complet final et les 16 checksums sont vérifiés. Prévoir les privilèges/réglages de triggers et appliquer toute la série avant d'ouvrir la nouvelle version.

L'export natif initial a échoué sur un droit d'écriture du compilateur Hermes dans un dossier temporaire Windows. Le rejeu autorisé avec TEMP/TMP dans le dossier privé du projet réussit pour les trois plateformes. Aucune version de dépendance n'a été changée pour contourner le compilateur.

La fixture d'intégrité antérieure portant un montant positif indique désormais explicitement collectionRequired=true, conformément à la nouvelle contrainte ; ses assertions sont conservées. Les logos, dépendances mobiles, anciens mouvements, anciennes migrations et `.env` ne sont pas remplacés. Aucune nouvelle base, réinitialisation ou migration de production.

## Limites et suites

Brouillons complets validés, sans autosauvegarde partielle ni synchronisation hors ligne après fermeture. Au plus 100 lignes ; répertoire rattaché au couple entreprise/boutique ; édition du répertoire disponible par API sans écran d'administration dédié. Un téléphone international est validé syntaxiquement, sans vérification de son existence.

Les écritures sont sérialisées par entreprise ; les limites HTTP restent par processus. Tester débit, appareils Android/iOS réels, signature et SMTP de production avant exploitation. Aucun build natif signé, CI distante, appareil physique, e-mail externe, publication ou déploiement revendiqué.

Le Bloc 11 devra gérer affectation et prise en charge, sortie physique et transitions logistiques. Le Bloc 12 traitera les encaissements/remises réels. Le Bloc 13 traitera suivi public sécurisé et notifications complètes. Aucun de ces parcours n'est développé ici.

Guides : ORDER_MANAGEMENT.md, ORDER_WORKFLOWS.md, RECIPIENT_MANAGEMENT.md et ORDER_STOCK_INTEGRATION.md. Historique permanent complété dans JOURNAL_DE_DEVELOPPEMENT.md.
