# Encaissements à la livraison — Bloc 12

La plateforme trace les fonds reçus hors de l’application. Elle ne débite aucun compte et ne réalise aucun paiement, transfert ou règlement boutique/transporteur. Le statut financier est indépendant du statut logistique et de la preuve de livraison du Bloc 13.

## Montants et responsabilité

L’obligation actuelle est `Order.amountToCollect`, avec `collectionRequired` et une devise. Les affectations conservent un instantané du montant attendu ; cet instantané historique ne remplace pas l’obligation actuelle après correction autorisée. Une affectation ne crée aucun encaissement.

Le livreur affecté à la distribution finale peut déclarer après prise en charge physique, lorsque le colis est sous sa garde. Les phases finales et FAILED permettent de documenter les fonds déjà reçus. Une mission de simple enlèvement ou d’acheminement ne donne pas ce droit. Une commande sans encaissement requis refuse une déclaration. Une déclaration n’autorise jamais DELIVERED.

Plusieurs déclarations sont possibles : montant, devise de la commande, moyen externe, date, auteur, agence de responsabilité, référence et observations. Un montant nul ou excédentaire exige un motif et ouvre un écart. Une déclaration nulle après couverture de l’obligation est refusée. Les erreurs ne se corrigent pas par suppression de la déclaration originale.

Tous les montants unitaires sont DECIMAL(19,4), transmis sous forme de chaînes. Les calculs utilisent des entiers à quatre décimales, sans flottants. L’interface accepte une virgule puis transmet un point. Les devises restent séparées, sans conversion ni addition entre devises.

## Lecture des chiffres

Pour une source d’encaissement, avec corrections approuvées seulement :

- Brut déclaré = déclaration originale + ajustements COLLECTION approuvés.
- Net déclaré reçu du destinataire = brut − remboursements du livreur − remboursements de l’agence.
- Reste client = max(attendu actuel − somme des nets déclarés, 0).
- Excédent = max(somme des nets déclarés − attendu actuel, 0).
- Responsabilité du livreur = brut − remboursements du livreur − réceptions effectives confirmées par l’agence.
- Disponible pour une nouvelle remise = responsabilité du livreur − montants engagés dans des remises encore en attente.
- Fonds conservés par l’agence = réceptions confirmées − remboursements externes effectués par l’agence.

Les réceptions confirmées comprennent les allocations effectivement reçues et leurs corrections RECEIPT approuvées. Un remboursement réalisé par l’agence réduit le net client et les fonds conservés par l’agence ; il ne recrée pas de dette chez le livreur. Les tableaux distinguent déclaration, réception, engagement en attente et responsabilité restante.

Une réaffectation ne transfère pas les encaissements historiques : l’ancien livreur conserve sa responsabilité et son historique, le nouveau voit le reste client de sa mission actuelle. Le changement d’agence logistique ne déplace pas les fonds historiques. Une désaffiliation est bloquée si des responsabilités financières ou régularisations restent ouvertes. Échec, annulation ou retour n’effacent pas les fonds reçus.

Les anciens enregistrements sans clé opérationnelle ni allocation rapprochable restent consultables et signalés comme historiques non rapprochés. Ils sont exclus des nouveaux calculs ; aucun montant manquant n’est inventé.

## États et corrections

NOT_REQUIRED, PENDING, PARTIAL, DECLARED_COMPLETE, NONE_RECEIVED, EXCESS, REFUNDED décrivent le suivi client. Une contestation est un indicateur distinct : elle ne masque pas le montant partiel réellement déclaré. « Complet déclaré » n’est ni réception agence, ni preuve de livraison.

Les corrections sont des demandes PENDING avec motif et valeurs d’origine/cible. Un administrateur d’entreprise distinct les approuve ou les refuse ; le demandeur et le livreur source ne peuvent pas approuver eux-mêmes. Les déclarations originales restent immuables.

COLLECTION ajuste la déclaration sans descendre sous les fonds remboursés par le livreur, confirmés ou déjà réservés. REFUND documente un remboursement externe déjà effectué par le livreur, limité aux fonds disponibles. AGENCY_REFUND documente un remboursement par l’agence, limité à ses fonds conservés ; les deux demandent une référence externe. RECEIPT ajuste une réception confirmée sans modifier l’original ni réduire les réceptions sous les remboursements déjà effectués par l’agence.

EXPECTED corrige l’obligation avec validation distincte et abonnement valide. Après prise en charge, le demandeur doit disposer du droit exceptionnel d’entreprise ; une demande antérieure ne contourne pas ce contrôle au moment de l’approbation. EXCEPTION documente une dérogation avec instantanés attendu/net déclaré, revalidés à l’approbation. Si les montants changent, cette dérogation ne s’applique plus. Elle ne diminue ni l’attendu ni le reste client, et n’exécute aucune livraison finale.

## Parcours et API

Web : Encaissements, montants attendus, déclarations et détails ; les fiches commande et mission ont un résumé financier. Expo : onglet Encaissements prioritaire pour le livreur, déclaration depuis la mission autorisée, motif et confirmation explicite. Les formulaires conservent la saisie après erreur réseau, gardent la même clé de reprise et la même version d’origine. Rafraîchissement périodique lorsque l’écran est actif. Les listes et les fonds sélectionnables pour remise sont paginés.

Préfixe des routes : `/api`. Contexte entreprise/agence/boutique issu de la session ; les identifiants de filtre ne créent aucun droit.

| Méthode | Route | Objet |
| --- | --- | --- |
| GET | /financial-options | Périmètres autorisés |
| GET | /financial-overview | Agrégats par devise, agence et livreur |
| GET | /financial-obligations | Instructions et reste client, filtre orderId |
| GET | /collections et /collections/:id | Déclarations et historique autorisés |
| POST | /driver/collections | Déclaration du livreur courant |
| GET, POST | /financial-corrections | Demandes de régularisation |
| POST | /financial-corrections/:id/decision | Approbation ou refus distinct |
| GET | /financial-history | Journal financier paginé |
| GET | /financial-notifications | Avis internes autorisés |

Filtres selon la ressource : recherche, agence/transporteur, livreur, boutique, commande, devise, statut et période. Pagination plafonnée à 50 ; les agrégats ne dépendent pas de la page affichée.

## Modèles et sécurité

Collection, CollectionEvent, Remittance, RemittanceItem et RemittanceEvent sont réutilisés. FinancialCorrection, FinancialDiscrepancy et FinancialEvent complètent la traçabilité. Les deux migrations additives du 29 octobre 2026 ajoutent contraintes, clés contextuelles, permissions et protections d’immutabilité ; le schéma contient 64 modèles et 21 migrations. Les 19 migrations antérieures restent intactes.

Transactions sérialisables et verrou entreprise protègent les soldes concurrents. Chaque mutation porte une clé d’idempotence, une empreinte de requête et, lorsque nécessaire, une version. Même clé et même requête : reprise sans doublon ; contenu différent : conflit. Permissions et contexte sont relus à chaque opération. Authentification, origine autorisée, CSRF selon le mode de session, limitation des écritures et Cache-Control no-store sont appliqués.

Voir [remises](CASH_REMITTANCES.md), [écarts](FINANCIAL_DISCREPANCIES.md), [permissions](FINANCIAL_PERMISSIONS.md) et [rapport de validation](BLOC-12-RAPPORT.md).
