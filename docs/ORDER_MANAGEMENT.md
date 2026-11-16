# Gestion des commandes — Bloc 10

Les commandes sont persistées dans MySQL par le module `api/src/modules/orders`. Les boutiques et les opérateurs autorisés utilisent les mêmes services depuis le Web et Expo SDK 57. Les sessions, le Design System et les réservations du Bloc 9 sont réutilisés.

## Deux types et un périmètre explicite

`ONE_OFF` décrit un colis à collecter : adresse, contact, téléphone international, instructions et articles libres ou issus du catalogue. Il ne réserve aucun stock. `FROM_STOCK` utilise des produits actifs distincts de la boutique dans l'agence partagée choisie. Il réserve les quantités à la soumission, sans diminuer le physique.

Chaque commande conserve entreprise, boutique, agence, créateur, destinataire historique, type, articles historiques, colis, instructions, montant et devise. L'entreprise et la boutique ne changent jamais après création. La référence publique est générée par le serveur : `DND-<année UTC>-<UUID sans tirets>`. Une contrainte unique MySQL empêche les collisions. Cette référence n'ouvre aucun accès public et n'est pas une authentification.

## États, édition et annulation

La machine `OrderStatus` existante est conservée. Le brouillon est distingué par `isDraft=true`, sans ajouter un statut logistique concurrent. Seules création/soumission en `PENDING` et annulation préalable en `CANCELLED` sont proposées. Aucun livreur ni objet Delivery n'est créé.

| Situation | Actions autorisées avec les permissions actuelles |
|---|---|
| Brouillon PENDING | Modifier le contenu, soumettre, abandonner avec motif |
| Soumise PENDING, aucune Delivery | Modifier articles, quantités, agence, type, collecte, colis, instructions et montant ; annuler avec motif |
| Soumise, coordonnées destinataire | Snapshot conservé ; annuler/recréer pour changer ces coordonnées |
| Autre statut ou Delivery présente | Édition et annulation préalable refusées ; règles logistiques à développer au Bloc 11 |
| CANCELLED | Consultation et historique ; aucune remise en attente ni réservation nouvelle |

L'édition attend le contenu complet et `version`. Une version périmée produit un conflit. Si articles/type/agence changent, libération et nouvelles réservations se font dans la même transaction ; l'échec restaure la commande et ses anciennes réservations. Une modification financière seule avec articles inchangés ne touche pas au stock. Les anciennes lignes sont conservées avec `active=false` lorsqu'elles sont remplacées.

L'annulation demande un motif et une confirmation dans l'interface. Elle conserve l'auteur, l'heure serveur, l'ancien/nouveau statut et libère toutes les réservations actives de la commande. Une répétition de la même annulation ne libère pas deux fois. Une collaboration terminée n'empêche pas la clôture d'une ancienne commande depuis le contexte autonome de la boutique, avec droits actuels, agence active et abonnement valide. L'expiration bloque toutes ces écritures ; les lectures autorisées restent possibles.

## Permissions

| Rôle | Permissions nouvelles |
|---|---|
| company_admin, agency_manager | orders.read/create/edit/cancel |
| agency_employee | orders.read/create/edit ; pas d'annulation |
| shop_owner, shop_manager | shop.orders.read/create/edit/cancel |
| shop_employee | shop.orders.read/create/edit ; pas d'annulation |
| stock_manager, courier, super_admin | Aucun droit opérationnel de commande ajouté |

Une permission de création de commande autorise uniquement les réservations rattachées à cette commande ; elle n'accorde pas la gestion générale des stocks. Un opérateur d'agence reste dans l'agence sélectionnée, même s'il possède plusieurs affectations. La boutique autonome peut sélectionner un transporteur actif ; un contexte boutique déjà lié à un transporteur ne peut pas en substituer un autre par le corps HTTP.

Les gardes relisent compte/affiliations/permissions, entreprise, abonnement, boutique, collaboration, agence partagée et produits dans la transaction. Les lectures de boutique portent uniquement sur son `shopId`. Une référence, un identifiant ou un filtre ne remplace pas ces contrôles.

## API authentifiée

Toutes les routes ci-dessous sont sous `/api`. Cookies Web avec CSRF/origine contrôlée, ou session mobile Bearer. Corps Zod stricts ; limites de taille, de fréquence et pagination serveur.

| Méthode et chemin | Usage |
|---|---|
| GET /orders | Liste, synthèse réelle, pagination et filtres |
| POST /orders | Contenu complet, clientKey stable et draft facultatif |
| GET /orders/options | Collaborations actives et agences partagées minimales |
| GET /orders/catalogue | Produits actifs et disponible dans la cible autorisée ; companyId/shopId/agencyId requis |
| GET /orders/drafts | Liste des brouillons |
| GET /orders/:id | Fiche, articles actuels et réservations |
| PATCH /orders/:id | Contenu complet et version |
| POST /orders/:id/submit | version ; revalidation serveur intégrale |
| POST /orders/:id/cancel | version et reason non vide |
| GET /orders/:id/history | Événements immuables et auteurs |
| GET /orders/:id/items | Articles actuels et réservations liées |
| GET/POST /recipients | Répertoire autorisé / nouvelle fiche explicite |
| GET/PATCH /recipients/:id | Lecture / modification versionnée d'une fiche, sans modifier les snapshots |

Filtres liste : `q`, `companyId`, `shopId`, `agencyId`, `status`, `type`, `draft=true|false`, `collectionRequired=true|false`, `from`/`to` au format AAAA-MM-JJ, `sort=newest|oldest`, `page`, `size` (1 à 50). La borne `to` inclut la journée UTC entière. Le tri ajoute l'identifiant aux dates pour rester stable. Les compteurs de synthèse portent sur le contexte autorisé, indépendamment des filtres de liste. Les options de création ne proposent que les collaborations actives ; les anciennes commandes restent consultables sans ces options.

Le corps de création contient companyId/shopId/agencyId, type, recipient, items, parcelDescription, collectionRequired, amountToCollect (chaîne décimale), currency ; pickup est requis pour ONE_OFF. Facultatifs : recipientId, saveRecipient, notes, financialNotes. Les identifiants de créateur, statuts et références ne sont jamais choisis par le client. Les clés de rejeu et leurs empreintes ne sont pas renvoyées dans les réponses.

## Montants et limites

`DECIMAL(19,4)` conserve exactement les montants. L'API attend une chaîne avec point et au plus quatre décimales, sans exposant ni conversion flottante. Encaissement non requis : zéro ; requis : strictement positif. Devise : trois lettres majuscules. Les valeurs déclarées facultatives des articles suivent la même précision. Aucune conversion, vérification de paiement, recette d'encaissement ou intégration de paiement électronique.

Au plus 100 articles par commande, quantités entières positives jusqu'à 2 147 483 647. Les brouillons sauvegardés demandent actuellement un contenu complet valide ; il n'y a pas d'autosauvegarde partielle ou de file hors ligne durable. Une coupure réseau conserve le formulaire ouvert et sa clé de rejeu, pas une application fermée.

Voir [parcours](ORDER_WORKFLOWS.md), [destinataires](RECIPIENT_MANAGEMENT.md), [stock](ORDER_STOCK_INTEGRATION.md) et [rapport de vérification](BLOC-10-RAPPORT.md).
