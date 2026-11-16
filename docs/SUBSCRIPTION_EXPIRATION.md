# Expiration et continuité des opérations

L’accès professionnel combine statut administratif ACTIVE, affiliation et permissions actuelles, et abonnement ACTIVE avec startedAt ≤ heure serveur < expiresAt. Ces conditions sont indépendantes. Un renouvellement ne remet jamais Company.status à ACTIVE.

## Contrôle immédiat et traitement différé

authorizationStore relit MySQL à chaque autorisation. authorizeTenant bloque les permissions de mutation sans abonnement valide, même si aucun job n’a tourné. workspace.access et subscriptions.declare restent possibles pour les comptes autorisés; les permissions *.read conservent une consultation filtrée, sans nouvelle écriture. Le moteur de réservation de stock existant reprend ce contrôle dans sa transaction et verrouille l’entreprise. Les futurs services de mutation devront appeler assertNewOperation dans la transaction après ce verrou, sans réutiliser une autorisation ancienne comme preuve d’accès courant.

Le job expire parcourt les abonnements ACTIVE dont la fin est atteinte, verrouille chaque entreprise, recontrôle la date, enregistre EXPIRED, suspendedAt, événement, audit et notification. Une seconde exécution n’ajoute aucun événement. Les données, affiliations, agences et permissions ne sont jamais supprimées. Même une société archivée peut voir son abonnement comptablement expirer; le job ne change pas son état administratif.

Les contextes restent sélectionnables lorsque seul l’abonnement a expiré; le profil et workspace renvoient subscriptionAccess. Web affiche un état d’accès limité et garde Mon abonnement, déclarations, compte et changement d’entreprise. Expo ajoute uniquement cet état et les boutons de vérification/changement d’entreprise/compte, sans modification native ou reconstruction SDK. Une suspension administrative continue d’être refusée selon le Bloc 3, indépendamment du SaaS.

## Colis déjà pris en charge

Politique fournie dans `api/src/modules/subscriptions/access.ts` : aucune exception pour CREATE, réservation ou nouvelle affectation. assertSafeClosure exige un contexte actuel avec deliveries.read, un identifiant réellement lu dans MySQL, la même entreprise/agence autorisée, un colis IN_PROGRESS non clôturé, une prise en charge strictement antérieure à l’échéance, et le livreur affecté ou l’administrateur company_admin. Les comptes boutique ne peuvent pas utiliser cette exception. Une suspension/résiliation propre à l’abonnement ou une suspension administrative la refuse.

Actions limitées admises par ce garde : DELIVERY_CLOSE, DELIVERY_PROOF, COLLECTION_DECLARE pour ce colis précis. Le contrôle doit être appelé dans la transaction de clôture après verrou, puis les preuves, événements et déclarations doivent être conservés par le futur module. Les permissions existantes et preuves restent nécessaires; ce garde ne crée ni preuve ni encaissement et ne délivre pas une autorisation générale de mutation.

**Périmètre réel :** les routes logistiques n’existent pas encore et leur développement est explicitement hors Bloc 6. Il n’y a donc aucune route de livraison/proof/collection ouverte par exception aujourd’hui. Le garde est implémenté et testé avec un vrai colis MySQL; les futurs blocs doivent l’intégrer à leurs seules routes de clôture. La consultation interne existante ordersRepository reste filtrée par tenant avec orders.read. Aucune route de création/affectation n’a été ajoutée.

Routes conservées en accès limité : Auth (profil, sessions, changement de contexte), GET /api/auth/workspace avec une permission de lecture autorisée, GET /api/company/subscription, GET des déclarations/détails/historique de cette entreprise, POST /api/company/subscription/payments pour subscriptions.declare. Les API globales restent accessibles aux comptes globaux autorisés. Le Web affiche des états d’attente pour les opérations dont les routes n’existent pas encore, sans inventer de suivi.

## Notifications

Jobs distincts : J-3 selon la date civile UTC, le jour d’expiration UTC, après expiration, après validation et après rejet. Destinataires : administrateurs company_admin actifs de l’entreprise. DedupeKey unique par événement, échéance/source et destinataire; les réexécutions ne recréent pas les notices. Le worker vérifie à nouveau l’affiliation et annule une notice d’échéance devenue obsolète après renouvellement.

J-3 et jour J nécessitent que le job tourne pendant la journée UTC correspondante; une interruption couvrant toute cette journée ne fabrique pas rétroactivement un rappel trompeur. Le job expire rattrape toujours les expirations passées et le contrôle d’accès par requête reste immédiat. Voir les fréquences et reprises dans [PLESK_SCHEDULED_JOBS.md](PLESK_SCHEDULED_JOBS.md).
