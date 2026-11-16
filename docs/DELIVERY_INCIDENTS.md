# Incidents et tentatives

Le livreur courant peut déclarer une tentative FAILED : catégorie (absent, injoignable, adresse introuvable, refus, dommage, transport, autre) et explication obligatoires. Aucune tentative précédente n’est supprimée ; aucun échec ne recrédite le stock. Une arrivée puis demande de confirmation crée AWAITING_CONFIRMATION et laisse AWAITING_PROOF, sans livraison définitive.

DeliveryIncident est distinct de DeliveryAttempt. Il peut survenir avant collecte, en agence, en transport, en distribution ou pendant un retour selon les actions autorisées. Il conserve entreprise/agence/auteur, catégorie, description, caractère bloquant, état/version, décision, responsable et date de résolution. Les tentatives sont immuables en MySQL.

Un incident bloquant met la mission en échec sans changer la garde. Décision motivée du responsable : RETRY, REASSIGN, RETURN ou NOTE. RETRY exige le traitement des autres blocages ; REASSIGN passe par une remise physique après enlèvement ; RETURN engage la procédure contrôlée. Historique et incidents antérieurs restent conservés.

Avant collecte : résolution possible pour une nouvelle collecte, sans sortie artificielle. En transit : le transporteur reste responsable jusqu’à réception réelle à destination ou retour explicite à l’origine. Une réception ou remise endommagée crée un blocage.

Web/Expo opérateur : liste des incidents, chronologie et décision. Expo livreur : signalement et tentative depuis la mission. Le suivi boutique masque les notes internes. L’outbox conserve les avis malgré une panne SMTP ou l’absence de push.

POST driver/missions/:id/attempt, /incident ; alias deliveries/:id/incident ; POST deliveries/:id/incidents/:incidentId/resolve et /retry. Voir [états](DELIVERY_STATUS_WORKFLOW.md) pour expiration et preuve finale.
