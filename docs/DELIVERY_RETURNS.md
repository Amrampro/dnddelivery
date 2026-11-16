# Retour physique et contrôle du stock

Le responsable demande un retour motivé d’un colis déjà pris en charge. DeliveryReturn conserve agence, demandeur, réceptionnaire, motif, état/condition, dates de réception, réintégration et restitution boutique. Une procédure de retour par mission dans ce bloc.

RETURN_REQUESTED ne change pas la garde. Le livreur confirme RETURNING puis RETURN_ARRIVED. L’agence attendue contrôle la présence et l’état. Si le colis est déjà en agence, la réception contrôlée s’y fait ; sinon le trajet de retour doit être tracé. Un retour entre agences utilise ParcelLeg. Pour le stock, le contrôle/réintégration concerne l’agence d’origine des réservations.

GOOD : réception intacte. DAMAGED : QUARANTINED, hors stock disponible. REFUSED : garde précédente conservée, explication requise. Une arrivée déclarée ou un échec ne constitue jamais une réception ni un crédit de stock.

La réception ne réintègre rien par défaut. Avec deliveries.returns et abonnement valide, l’opérateur peut explicitement réintégrer à la réception ou plus tard. StockService écrit RETURN pour les réservations CONSUMED de cette commande : +Q physique, aucune nouvelle réservation. Transaction, invariants et clés uniques interdisent le double crédit. Une commande ponctuelle ne crée aucune entrée de catalogue.

Pas de réintégration directe d’un retour endommagé. Sa garde est conservée jusqu’au traitement ultérieur ou à la restitution physique à la boutique, avec motif et représentant mentionné. Une restitution déjà réintégrée est bloquée : utiliser le circuit de sortie Bloc 9 pour ne pas créer un stock fictif. Le suivi boutique masque les notes internes.

Après expiration, company_admin peut recevoir sans réintégrer un colis pris en charge avant échéance selon la clôture limitée ; renouvellement requis pour le crédit de stock. Cette exception n’est pas donnée à tout agent de réception. Aucun nouveau trajet n’est ouvert pendant l’expiration.

POST deliveries/:id/return, /return/receive (restock=false par défaut), /return/reintegrate, /return/shop. Droits, agence, version, clé de reprise et étapes précédentes sont vérifiés. Web et Expo exposent ces opérations depuis les fiches et Retours.
