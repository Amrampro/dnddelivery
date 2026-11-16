# Chaîne de garde

Delivery enregistre custodyType (SHOP, AGENCY, COURIER, TRANSPORT), custodyAgencyId et custodyUserId. agencyId est l’agence opérationnelle actuelle ; Order conserve l’agence d’origine. Les événements mémorisent la garde précédente et suivante. L’emplacement d’un colis ne représente pas un stock disponible de catalogue.

Avant collecte ponctuelle : garde boutique. Depuis stock : garde agence, marchandises réservées. Affecter n’est pas remettre. La garde passe au livreur à l’enlèvement explicite, ou au transporteur au départ inter-agences confirmé. L’arrivée déclarée ne suffit pas ; l’agence doit accepter physiquement le colis.

Entre livreurs : proposition motivée puis acceptation du nouveau livreur avec affiliations revalidées. Refus ou annulation : ancien détenteur conservé. Acceptation endommagée : nouvelle garde réelle et incident bloquant. Remise ou trajet actif interdit les changements incompatibles.

Création, affectation, préparation : aucun mouvement physique. Au premier enlèvement depuis stock ou premier départ inter-agences, les réservations ACTIVE doivent correspondre exactement aux articles actifs, quantités et périmètre de départ. Une transaction utilise StockService (Bloc 9) : ISSUE, physicalDelta=-Q, reservedDelta=-Q puis réservation CONSUMED. Clés uniques par réservation et stockIssuedAt empêchent la double sortie.

Une prise en charge après transit, réaffectation ou réception ailleurs n’effectue aucune nouvelle sortie ni entrée de catalogue. Une commande ponctuelle ne touche jamais au stock. Un échec ne recrédite rien. Seule la réception réelle intacte et une réintégration autorisée produisent RETURN, physicalDelta=+Q ; voir [retours](DELIVERY_RETURNS.md).

Les agences gardant un colis actif, attendant un transit ou un retour non résolu sont protégées contre la désactivation. Historique et affectations restent conservés. Le Bloc 13 devra produire la preuve finale ; les événements logistiques ne la remplacent pas.
