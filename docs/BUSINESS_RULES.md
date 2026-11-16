# Règles et transactions à conserver

## Commandes et destinataires

OrderType : ONE_OFF ou FROM_STOCK. Une commande ponctuelle peut avoir des lignes sans productId et ne nécessite pas de stock préalable. Une commande depuis stock réserve transactionnellement les lignes compatibles. La quantité demandée est un entier strictement positif. La primitive actuelle réserve une ligne sur un stock ; confirmation globale de commande, libération et consommation restent à intégrer dans les futurs parcours.

OrderStatus : PENDING, CONFIRMED, PREPARING, READY, IN_DELIVERY, DELIVERED, FAILED, CANCELLED, RETURNED. Ce vocabulaire ne constitue pas une permission de passer librement d’un état à un autre. Le Bloc 3 devra appliquer une machine de transitions par commande, conditions, acteur autorisé et événement atomique.

Recipient n’a pas besoin de compte utilisateur. Email, téléphone et adresse sont obligatoires. La commande conserve son propre instantané de nom, email, téléphone, adresse, ville et localisation. Un trigger interdit de modifier cet instantané. La modification ultérieure du profil Recipient ne réécrit pas les anciennes commandes ; une correction après création devra avoir une procédure d’amendement explicite.

## Stock et transferts

Stock disponible = physique - réservé. Les CHECK imposent réservé <= physique ; toutes les quantités métier unitaires sont entières. Mouvements : DEPOSIT, ISSUE, RESERVE, RELEASE, ADJUSTMENT, RETURN, TRANSFER_OUT, TRANSFER_IN. Un mouvement contient les deltas et les soldes après opération, et reste immuable.

Un transfert possède une entreprise, deux agences différentes, des lignes boutique/produit, un initiateur et un transporteur éventuel. Statuts DRAFT, IN_TRANSIT, RECEIVED, CANCELLED. Au départ : contrôler le stock disponible, sortir les quantités et ajouter les mouvements TRANSFER_OUT avec transferId commun. En transit : les lignes restent rattachées au transfert, sans apparaître disponibles à destination. À réception : verrouiller le transfert, empêcher une double réception, écrire les entrées TRANSFER_IN et passer RECEIVED dans une transaction. Une réception partielle n’est pas implémentée et nécessite une décision métier explicite avant ajout.

## Livraison et OTP

DeliveryStatus : PENDING, ASSIGNED, IN_PROGRESS, DELIVERED, FAILED, CANCELLED. Les réaffectations sont enregistrées dans DeliveryAssignment et DeliveryEvent. Les événements TransferEvent conservent séparément l’acheminement inter-agences.

DeliveryOtp prépare un hash, expiration, nombre/max de tentatives, statut et date de vérification, lié au tenant, à la livraison et au livreur. Le code devra être généré côté serveur avec une source cryptographique ; pour un petit OTP, utiliser un HMAC avec pepper serveur et liaison livraison/identifiant OTP, ou un mécanisme équivalent protégeant les essais hors ligne. Un simple hash rapide d’un code à six chiffres n’est pas suffisant. Le pepper n’est jamais public, n’est pas dans la base et n’a pas été inventé dans le .env.

La future validation doit verrouiller le challenge, vérifier expiration/tentatives/affectation, incrémenter les tentatives et valider une seule fois. Les triggers empêchent de réouvrir un OTP vérifié. Une DeliveryProof OTP doit référencer un challenge vérifié, non expiré et correspondant au livreur et à la livraison ; son unicité interdit le double emploi. Une exception exige un autre agent de la même entreprise et un motif ; le service devra contrôler sa permission spéciale. Aucune génération/envoi/validation OTP opérationnelle n’est exposée dans ce bloc.

Une livraison ne peut pas être insérée directement DELIVERED. La transition vers DELIVERED exige sa preuve. Un état DELIVERED ne peut pas être remis à un autre état pour être validé une seconde fois. Le service devra écrire preuve, clôture, événements et audit dans une transaction. La preuve est immuable ; ses photos restent privées même après ajout. Les téléchargements futurs devront vérifier tenant et permission puis délivrer un accès temporaire, jamais une URL publique permanente.

## Encaissements et remises

Le logiciel ne traite aucun paiement : il conserve des déclarations. CollectionStatus : PENDING, DECLARED, VERIFIED, DISPUTED, VOIDED. Ces états sont indépendants de DeliveryStatus. expectedAmount et declaredAmount utilisent Decimal, l’écart est dérivé. Une livraison terminée peut donc avoir un encaissement encore PENDING.

RemittanceStatus : DECLARED, CONFIRMED, DISPUTED, CANCELLED. Le livreur déclare, un agent de la même agence confirme. confirmedById doit différer de courierId. Les allocations lient encaissements et remise avec même entreprise, livreur, agence et devise. L’unicité de collectionId par entreprise empêche sa double comptabilisation, y compris avant confirmation : c’est volontairement plus strict qu’une unicité des seules remises confirmées.

Une annulation ne libère pas automatiquement une allocation. La future procédure de correction devra conserver l’historique et décider comment réallouer une remise annulée sans compter deux fois un encaissement. La confirmation devra verrouiller la remise et les encaissements, contrôler leur statut et les totaux, refuser une double confirmation, puis écrire événement et audit. Aucune validation financière opérationnelle n’est exposée.

## Abonnements

Un abonnement mensuel unique par entreprise, quel que soit le nombre d’agences. SubscriptionPlan.referenceSlot = 1 identifie l’unique plan actif de référence ; les plans/tarifs historiques restent conservés. SubscriptionPrice est versionné et son montant/devise ne peut être modifié après insertion. SubscriptionPeriod conserve le tarif appliqué, dates et devise, de façon immuable.

Les déclarations MTN/Orange Money/autres restent hors paiement automatique. SubscriptionPayment est PENDING/APPROVED/REJECTED, validable uniquement via une identité GlobalRoleGrant. Le service vérifiera l’activation et les permissions du Super Administrateur. Les périodes d’un même abonnement ne doivent pas se chevaucher : verrouiller la ligne Subscription avant renouvellement, contrôler l’approbation et créer période/expiration/audit/outbox dans la même transaction. L’absence de chevauchement et l’égalité exacte des montants appliqués ne sont pas garanties par une simple FK.

Le seed ne fixe aucun prix commercial et ne crée aucun utilisateur. Fournir SUBSCRIPTION_SEED_PRICE et SUBSCRIPTION_SEED_CURRENCY pour initialiser un premier tarif ; une réexécution conserve les tarifs existants. Les changements suivants se feront par une nouvelle version, sans modifier le passé.

## Notifications et audit

Notification est une outbox durable : canal EMAIL/PUSH, destinataire, événement source, modèle, payload, disponibilité, verrou de worker, tentatives, résultat et erreur. enqueueExpiryNotices prépare les échéances à J-3 et au jour J, avec clés de déduplication par période/destinataire. Aucun email/push n’a été envoyé. Un futur worker doit acquérir les tâches atomiquement, libérer les leases expirés, limiter les essais et réessayer avec temporisation. L’envoi ne doit pas bloquer la transaction métier.

Les événements et AuditLog sont append-only. Les métadonnées ne doivent contenir ni password, token, OTP, pepper ni contenu privé de fichier. Les adresses, documents et données destinataires doivent avoir une politique de conservation et des contrôles d’accès dédiés.

Notification.payload ne doit jamais contenir un OTP, mot de passe, token ou pepper en clair. Si un futur message OTP utilise une outbox, prévoir un payload chiffré avec clé hors base et durée de conservation courte, ou une autre livraison sécurisée du code.
