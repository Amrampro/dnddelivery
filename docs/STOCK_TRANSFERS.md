# Transferts inter-agences et incidents — Bloc 9

Un transfert reste dans une seule entreprise. Origine et destination doivent être différentes, actives et autorisées pour la boutique. La préparation DRAFT contient référence unique, propriétaire, lignes entières distinctes et observation. Elle ne déplace ni ne réserve silencieusement les quantités; le départ revérifie le disponible.

## États et transit

DRAFT → IN_TRANSIT après départ, ou DRAFT → CANCELLED. Chaque départ retire les articles du physique disponible d'origine et produit TRANSFER_OUT. La destination n'obtient rien avant réception. Les réceptions peuvent être partielles et ajoutent uniquement les quantités réellement acceptées, avec TRANSFER_IN et événement de réception.

Pour chaque ligne en transit : restant = quantity − receivedQuantity − returnedQuantity − lostQuantity. Le total physique des agences n'inclut jamais ce restant. Le total entreprise le compte une fois; la vue d'un solde expose son transit sortant. Une synthèse d'agence peut présenter les transferts qui la concernent en entrée ou sortie : ne pas additionner ces vues de suivi d'agences entre elles pour reconstruire le total entreprise.

RECEIVED signifie que toutes les unités ont été traitées et qu'aucun incident n'est ouvert; le code peut couvrir des articles reçus, retournés ou perdus après validation. Les interfaces présentent alors le transfert comme clôturé et distinguent les quantités reçues, retournées et perdues. Une ancienne réception complète est normalisée uniquement dans les nouveaux compteurs, sans modifier physique ni mouvements historiques.

## Réceptions et incidents

Le contexte de destination confirme la réception; le contexte d'origine ne peut pas la simuler. Un administrateur en contexte entreprise peut agir selon ses permissions. Le backend vérifie référence, version, lignes et transit restant, interdit les doubles réceptions et met à jour stock, compteurs et historique dans la même transaction.

MISSING, DAMAGED, REFUSED ou OTHER crée un incident OPEN avec auteur, heure, produit, quantité et description. Les quantités litigieuses sont isolées : une autre déclaration ou une réception ordinaire ne les consomme pas. Il n'y a aucune perte automatique.

Une personne dotée de stocks.approve résout, avec motif et version du transfert :

- RECOVER_TO_DESTINATION : ajoute physiquement à destination et incrémente reçu.
- RETURN_TO_ORIGIN : rétablit physiquement à l'origine et incrémente retourné, jamais perdu.
- CONFIRM_LOSS : valide explicitement une perte de transit et incrémente perdu, sans simuler de mouvement physique nul dans une agence.

Une résolution restaurant des unités exige l'agence cible dans le contexte d'agence; l'approbation à l'origine ne donne pas accès à la destination. L'incident et l'événement conservent la décision, le valideur et sa date. Les biens endommagés/refusés restent non disponibles tant qu'ils ne sont pas effectivement traités.

Une réception/résolution d'un transfert déjà en transit peut traiter une collaboration devenue inactive ou un partage retiré. L'entreprise, l'utilisateur, son agence et l'abonnement doivent toujours être valides. Aucun nouveau départ sous collaboration inactive, ni aucune mutation sous abonnement expiré.

## API et parcours

/api/stock-transfers : GET/POST /; GET /:id; POST /:id/dispatch ou /cancel {version,reason?}; POST /:id/receive {version,items:[{itemId,quantity}],notes?}; POST /:id/incidents {version,itemId,quantity,kind,description}; POST /:id/incidents/:incidentId/resolve {version,action,reason}.

Web et Expo : préparation avec sélection de boutique/produits/agences, départ, réception partielle, déclaration et consultation d'incidents; décisions selon permissions. La boutique consulte ses seuls articles et leurs emplacements, sans droit de les déplacer. Les entreprises et agences étrangères sont refusées même si leurs identifiants sont connus. Aucun livreur, dispatch ou commande n'est créé.
