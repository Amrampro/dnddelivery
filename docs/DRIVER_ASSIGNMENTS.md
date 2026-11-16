# Affectations et missions personnelles

Depuis la file des commandes soumises sans mission, l’opérateur crée le colis principal et choisit un livreur. Éligibilité : compte/entreprise actifs, affiliation active à l’entreprise avec rôle company_courier (agences facultatives), profil ACTIVE, disponibilité déclarée AVAILABLE et abonnement valide. Indisponible, suspendu, autre entreprise ou agence de mission inactive : refus. Web et mobile proposent tous les livreurs de l’entreprise et un filtre sur ceux rattachés à l’agence.

La disponibilité déclarée est distincte de la charge calculée. Plusieurs missions actives sont permises ; l’interface affiche leur nombre et laisse le responsable choisir. Affecter ne change ni garde ni stock. DeliveryAssignment conserve auteur, motif et dates ; une seule affectation active est permise par mission en SQL et en transaction.

Réaffectation avec motif obligatoire. Avant enlèvement : clôture de l’ancienne affectation et création de la nouvelle. Après enlèvement : proposition ParcelHandover ; le livreur actuel reste responsable jusqu’à la confirmation physique du nouveau livreur. Le responsable ne peut pas confirmer à sa place. GOOD accepte ; DAMAGED transfère la garde réelle mais ouvre un incident bloquant ; REFUSED laisse l’ancienne garde. L’opérateur peut annuler la proposition avec motif sans déplacer le colis.

Expo affiche les missions personnelles de toute l’entreprise dans le contexte entreprise, ou celles de l’agence dans un contexte agence facultatif : collecte, destinataire, contact, instructions, articles, montant attendu autorisé et étapes possibles. Le livreur confirme l’enlèvement après remise réelle. Depuis stock : préparation préalable et consommation des réservations à la première prise en charge. Réaffectation ultérieure : aucune deuxième sortie.

Le serveur calcule les actions puis les revérifie à l’écriture. L’historique personnel après retrait de mission ne donne plus accès aux coordonnées du destinataire. Les affectations organisationnelles du Bloc 7 et les affectations de mission du Bloc 11 restent distinctes.

Endpoints : POST deliveries/:id/assign et /reassign ; GET deliveries/eligible-drivers ; GET driver/missions et driver/handovers ; POST driver/handovers/:id/confirm ; POST deliveries/:id/handovers/:id/cancel. Voir [garde](PARCEL_CUSTODY.md).
