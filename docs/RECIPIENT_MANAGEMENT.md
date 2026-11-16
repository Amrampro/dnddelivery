# Destinataires — Bloc 10

Un destinataire est un contact de livraison, sans affiliation ou compte DND obligatoire. `Recipient` est réutilisé ; `shopId`, pays, détails et version complètent le modèle existant. La FK SQL vers Shop doit être préservée dans les futures migrations, même si shopId est scalaire dans Prisma.

## Coordonnées

Obligatoires pour une commande : nom (160), e-mail (254), téléphone, pays (120), ville (120) et adresse/lieu (500). Facultatifs : quartier (160), repère (300), accès (1000), date/heure souhaitée, observations (1000), latitude de −90 à 90 et longitude de −180 à 180. Les GPS sont saisis volontairement, sans permission de géolocalisation demandée.

Les e-mails passent par Zod côté API et une validation de formulaire côté clients. Les téléphones acceptent un préfixe international `+`, suivi de 7 à 15 chiffres, sans zéro initial ; espaces, tirets, points et parenthèses sont normalisés. Aucun préfixe camerounais n'est imposé. Cette validation est syntaxique : elle ne vérifie pas qu'une ligne téléphonique existe.

L'API accepte une date ISO 8601 avec fuseau, normalisée en UTC. Le Web offre une saisie de date/heure locale ; Expo accepte une saisie de date et d'heure avec exemple. Le client convertit cette heure en instant UTC avant l'appel. La date souhaitée est une indication, pas une programmation ou une garantie de livraison.

## Répertoire et historique

Une création peut cocher saveRecipient ; sans cette option la commande conserve uniquement ses coordonnées historiques. Une fiche nouvelle reste distincte même si son e-mail ou son téléphone existent déjà. Une commande peut également sélectionner recipientId, appartenant strictement à la même entreprise et boutique.

GET /api/recipients recherche nom/e-mail/téléphone avec pagination. Une boutique voit seulement ses fiches, et le formulaire filtre le transporteur choisi. Un opérateur d'entreprise voit son entreprise ; un opérateur d'agence voit les fiches déjà utilisées dans ses commandes d'agence. Les identifiants d'une autre boutique ne donnent aucun accès. Les anciennes fiches sans shopId ne deviennent pas un répertoire partagé.

POST /api/recipients attend companyId, shopId, agencyId et recipient. PATCH /api/recipients/:id ajoute version ; les mêmes droits et périmètres sont relus. Cette édition est disponible par API ; les clients proposent d'abord la recherche/réutilisation et la saisie dans la commande, sans écran séparé d'administration du répertoire.

Une commande copie les coordonnées dans ses colonnes existantes et recipientDetails. Modifier la fiche de répertoire ne change jamais ses commandes antérieures. La protection SQL de snapshot reste stricte pour une commande soumise ; elle permet seulement l'édition des coordonnées tant que la commande est un brouillon. L'historique des modifications de brouillon conserve les valeurs avant/après. Aucun rapprochement automatique, import massif ou suppression de répertoire n'est ajouté.
