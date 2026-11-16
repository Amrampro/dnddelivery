# Collaborations multi-entreprises — Bloc 8

## États et accords

Une seule CompanyShop existe pour chaque couple companyId/shopId (contrainte unique conservée). Les demandes concurrentes ne produisent pas de second couple. Chaque changement conserve son audit avec acteur, date serveur, version et motif; une nouvelle demande réutilise le couple sans effacer les événements précédents.

| État initial | Action | Auteur autorisé | Résultat |
| --- | --- | --- | --- |
| Aucun couple | Demander | Entreprise ou boutique autorisée | PENDING avec origine explicite |
| PENDING | Accepter | Partie destinataire uniquement | ACTIVE |
| PENDING | Refuser avec motif | Partie destinataire uniquement | REJECTED |
| ACTIVE | Suspendre avec motif | Entreprise uniquement | SUSPENDED |
| ACTIVE ou SUSPENDED | Terminer avec motif | L'une des deux parties autorisées | ENDED |
| REJECTED, ENDED ou SUSPENDED | Nouvelle demande | L'une des deux parties autorisées | PENDING, nouvel accord de l'autre partie obligatoire |

Il n'existe aucune réactivation directe. Accepter sa propre demande, décider d'un état incompatible ou écrire avec une version périmée est refusé. Demande et acceptation exigent un transporteur actif avec abonnement valide. L'espace propre de la boutique reste accessible indépendamment de tout abonnement de transporteur. Les écritures de l'entreprise suivent les gardes d'abonnement; la boutique peut mettre fin à une collaboration même si le transporteur expire.

## Sélection et confidentialité

Chaque boutique dispose d'un contexte shop-home:<shopId>, sans transporteur. Les contextes shop:<companyId>:<shopId> ne sont proposés que pour ses collaborations ACTIVE avec une entreprise active. Le backend recharge les affiliations et collaborations à chaque sélection et requête : une clé ou un companyId inventé ne suffit pas. Un contexte d'un transporteur expiré permet la lecture autorisée, bloque les nouvelles opérations et ne bloque pas le choix d'un autre transporteur valide. Les données administratives propres à la boutique passent par les permissions shop.* indépendantes du transporteur sélectionné.

Une entreprise ne reçoit que les collaborations dont elle est partie, le profil commercial autorisé et l'historique du couple. Elle ne reçoit ni les autres transporteurs de la boutique, ni les utilisateurs de celle-ci. La boutique reçoit les profils professionnels de ses partenaires, pas leur personnel ni leurs coordonnées internes. La recherche pour initier un partenariat exige une référence exacte et renvoie uniquement identité commerciale et localisation minimale.

Les agences accessibles sont explicitement sélectionnées par l'entreprise et validées dans son périmètre. Une liste vide n'ouvre aucune agence par défaut; les fiches ne présentent que les agences autorisées encore actives. Les futurs modules devront appliquer cette sélection lors des opérations en agence.

## API

Entreprise /api/company : GET /partners (q/status/direction/page/size), GET /partner-requests, GET/POST /partner-invitations, POST /partner-invitations/:id/resend ou /revoke; GET /partners/:id; POST /partners/:id/request, /accept, /reject, /suspend, /terminate; GET /partner-directory?reference=…; GET /partner-history; GET /partner-notifications.

Boutique /api/partners : GET/POST /collaborations (création par companyReference); GET /collaborations/:id; POST /collaborations/:id/request, /accept, /reject, /suspend, /terminate; GET /directory/companies?reference=…. Les mutations d'état transmettent version et motif selon l'action. Les logos partenaires disposent d'une route authentifiée attachée à la collaboration.

## Fin et opérations antérieures

Terminer ou suspendre ne supprime aucun stock, commande, livraison ou historique. La fiche expose les comptes d'opérations ouvertes et emplacements de stock concernés; les confirmations signalent que leur traitement reste nécessaire. Aucun mouvement de restitution fictif n'est créé. Le garde assertActiveCollaboration doit être appelé dans les futures transactions créant des opérations; il exige couple ACTIVE, boutique/entreprise actives et abonnement valide. Les futurs modules doivent ajouter leurs règles de clôture et de restitution en conservant les historiques et les permissions. Ces parcours logistiques ne sont pas implémentés dans le Bloc 8.

## Notifications

Chaque demande et décision produit des avis durables pour les utilisateurs concernés, avec clé de déduplication par couple/version/événement/destinataire. Les utilisateurs consultent leur boîte d'avis filtrée par contexte. La commande npm run partners:notifications exécute le worker PARTNER_ uniquement, distinct du worker SUBSCRIPTION_. Envoi hors transaction, bail de cinq minutes, tentatives bornées, délai progressif, contrôle de l'éligibilité actuelle, Message-ID stable. Une panne SMTP ne remet pas en cause le métier. Livraison au moins une fois : une interruption après acceptation SMTP peut provoquer une répétition malgré le Message-ID stable.

Future tâche Plesk conseillée : une exécution par minute après build de l'API et configuration SMTP; PARTNER_NOTIFICATION_BATCH de 1 à 1000 (100 par défaut). Aucun planificateur n'est installé dans ce bloc.
