# Colis entre agences

ParcelLeg décrit une étape de colis : source, destination prévue, transporteur, auteur, état/version, dates, réceptionnaire, condition et lieu réel de réception. Il est distinct de StockTransfer (Bloc 9), qui transfère des marchandises de catalogue. Aucun second moteur de stock n’est créé.

L’agence détenant le colis prépare un trajet vers une autre agence active de la même entreprise, avec transporteur éligible au départ. DRAFT ne déplace rien ; abandon motivé possible avant départ. Une seule étape active, sans remise concurrente.

Après remise réelle, départ confirmé : IN_TRANSIT, affectation TRANSPORT et garde transporteur. Si la commande depuis stock n’a encore jamais quitté le catalogue, ses réservations sont consommées à cet instant. Les départs ultérieurs ne répètent pas la sortie.

La destination voit les colis effectivement partis. GOOD ferme le trajet et donne la garde à l’agence ; aucun stock de catalogue n’est ajouté. DAMAGED reçoit mais ouvre un blocage. REFUSED conserve la garde au transporteur avec incident.

Après incident en transit, l’origine peut réceptionner le retour réel avec returnToOrigin=true, motif et condition. receivedAgencyId indique alors l’origine et returnedToOrigin=true ; la destination prévue reste conservée. Le trajet fermé ne doit pas être présenté comme arrivé à cette destination.

Plusieurs trajets successifs peuvent changer agences et transporteurs. Après réception finale, une affectation FINAL et un enlèvement lancent la distribution, sans nouvelle sortie des réservations. Un retour à l’agence du stock peut également passer par un trajet inter-agences, distinct de la réintégration.

POST deliveries/:id/transfers et /transfers/:legId/dispatch, /cancel, /receive. Version mission, clé de reprise et version trajet sont vérifiées, avec droits de départ/réception et agence réellement concernée.
