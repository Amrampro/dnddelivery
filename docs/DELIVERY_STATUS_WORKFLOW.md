# États et transitions logistiques

Le statut Delivery existant est conservé ; phase précise la situation physique. Aucun changement arbitraire de statut n’est proposé. Chaque opération écrit un événement séquencé : statut/phase/garde avant-après, acteur, date, motif applicable. Order reçoit également un événement minimal et un état cohérent.

| Étape | Phase et effet |
|---|---|
| Création ponctuelle | WAITING_COLLECTION, garde boutique |
| Création depuis stock | AT_AGENCY, garde agence, réservations actives |
| Affectation | ASSIGNED, phase physique conservée ; Order CONFIRMED |
| Préparation | PREPARED, aucune sortie |
| Enlèvement | WITH_COURIER, IN_PROGRESS ; Order IN_DELIVERY ; première sortie stock |
| Départ | IN_TRANSIT, garde livreur |
| Arrivée agence | ARRIVED_AGENCY, garde encore livreur |
| Réception agence | AT_AGENCY ou FAILED si blocage ; garde agence |
| Distribution finale | FINAL_DISTRIBUTION puis AT_DESTINATION |
| Demande de confirmation | AWAITING_PROOF ; tentative AWAITING_CONFIRMATION, jamais DELIVERED |
| Échec / incident bloquant | FAILED, motif/date conservés, garde inchangée |
| Retour demandé puis départ | RETURN_REQUESTED puis RETURNING |
| Arrivée retour | RETURN_ARRIVED, contrôle encore nécessaire |
| Réception retour | RETURN_RECEIVED intact ou QUARANTINED endommagé ; Order RETURNED |
| Restitution boutique | RETURNED_TO_SHOP |

Les trajets inter-agences ont leur cycle DRAFT → IN_TRANSIT → RECEIVED. Abandon seulement avant départ. Après incident, réception à l’origine possible avec motif et lieu réel explicites.

Nouvelle tentative : décision responsable et incidents bloquants résolus. Selon garde : boutique → collecte ; agence → attente ; livreur → distribution finale. Aucun effacement des tentatives. Annulation motivée limitée à WAITING_COLLECTION/AT_AGENCY/PREPARED avant pickedUpAt : libération des seules réservations actives. Annulation depuis FAILED bloquée.

Saut de phase, autre livreur, réception prématurée, remise concurrente, double sortie et double réintégration sont refusés. Versions et clés protègent les doubles clics. La contrainte MySQL de livraison définitive avec DeliveryProof reste active ; le Bloc 11 ne crée pas cette preuve.

Après expiration : lectures conservées ; affectation, préparation, enlèvement, nouvelle tentative et nouveau trajet bloqués. Un colis pris en charge avant échéance peut être sécurisé par son livreur actuel ou company_admin : progression de clôture, incident, retour, réception contrôlée. Aucun crédit de stock par cette exception : abonnement valide requis pour réintégrer. Suspension/annulation d’abonnement n’ouvre pas l’exception ; droits et affiliations courants restent requis. Les anciennes missions sans phase gardent leur politique antérieure.
