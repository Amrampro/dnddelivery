# Remises de fonds — Bloc 12

Une remise est la déclaration d’une transmission physique/externe de fonds à une agence. Elle n’est pas un paiement réalisé par DND Delivery. Le montant annoncé par le livreur et le montant effectivement reçu par le responsable sont conservés séparément.

## Parcours livreur

Depuis Remises sur Web ou Expo, le livreur choisit son agence, une devise et les encaissements disponibles. Il peut sélectionner plusieurs commandes, avec un montant partiel par source. Les sources sont paginées et les sélections restent conservées entre pages. Une remise comporte au plus 100 allocations uniques et ne mélange ni livreurs, ni agences de responsabilité, ni devises.

Le serveur recalcule les fonds disponibles et réserve les allocations dans une transaction. Deux remises concurrentes ne peuvent pas engager les mêmes fonds au-delà du disponible. Une correction en attente sur une source empêche son utilisation jusqu’à décision. Les remises historiques non rapprochées restent en lecture seule.

État initial DECLARED : les fonds sont engagés, mais la responsabilité du livreur reste entière et l’agence n’a encore aucune réception confirmée. La référence, la date, les sources, les montants et les observations restent traçables.

## Réception agence

Un responsable autorisé dans le périmètre, ou un administrateur d’entreprise autorisé, examine la remise. Il ne peut pas confirmer sa propre remise, même avec plusieurs rôles. Une décision demande un motif et la version courante.

| Décision | Effet |
| --- | --- |
| CONFIRM | Allocation reçue égale à l’allocation déclarée ; état CONFIRMED |
| DISPUTE | Saisie du montant réellement reçu par source ; état DISPUTED, écart conservé |
| REJECT | Aucune réception comptabilisée ; allocations libérées, état CANCELLED |
| REQUEST_CORRECTION | Aucune réception comptabilisée ; déclaration originale conservée et nouvelle remise possible |

CONFIRM et DISPUTE exigent toutes les allocations effectives. Un excédent confirmé reste plafonné aux fonds réellement disponibles de la source, en tenant compte des autres engagements. Une décision est définitive ; le rejeu de la même clé reprend son résultat, une autre tentative de décision est refusée. Une erreur ultérieure suit la procédure RECEIPT à deux personnes, avec valeurs originales et valeurs effectives affichées séparément.

Exemple : attendu client 25 000 XAF, déclaré reçu 20 000, remise annoncée 15 000. Avant confirmation : responsabilité livreur 20 000, engagement 15 000, disponible 5 000, réception agence 0. Le responsable reçoit réellement 14 000 et choisit DISPUTE : responsabilité livreur 6 000, réception agence 14 000, engagement 0, reste client 5 000. Le montant attendu, la logistique et la preuve restent indépendants.

## API et persistance

Préfixe `/api` : GET `/cash-remittances`, GET `/cash-remittances/:id`, POST `/driver/cash-remittances`, POST `/cash-remittances/:id/decision`. Les écritures portent `operationKey` ; la décision porte `version`, `decision`, `reason` et, pour une réception, `items[{id,confirmedAmount}]`. La création porte `agencyId`, `currency`, `items[{collectionId,amount}]` et les observations autorisées.

Remittance conserve le déclarant, l’agence, la devise, le montant déclaré, le montant reçu initial, la décision et le responsable. RemittanceItem conserve le détail des allocations déclarées/reçues. RemittanceEvent et FinancialEvent gardent l’historique. Les contraintes SQL préservent les identités et décisions ; les corrections approuvées ajustent le calcul sans réécrire les déclarations.

L’abonnement expiré et le profil livreur suspendu permettent la régularisation des fonds existants dans les droits conservés. Ils n’autorisent pas de nouvelles opérations commerciales. La déclaration client après expiration est limitée à une prise en charge antérieure à l’échéance. Voir [permissions](FINANCIAL_PERMISSIONS.md).
