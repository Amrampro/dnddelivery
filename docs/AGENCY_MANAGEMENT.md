# Gestion des agences — Bloc 7

## Parcours

Dans l'espace entreprise, ouvrir Agences puis Nouvelle agence. Saisir référence unique dans l'entreprise, nom, pays, ville, coordonnées et indications. Après validation, la fiche persistée s'ouvre; recherche, filtre de statut et pagination sont disponibles. Une autre entreprise peut réutiliser la même référence.

Pour désigner le responsable principal, inviter ou affecter d'abord une personne au rôle Responsable agence dans cette agence, puis la sélectionner sur la fiche. Le serveur exige un utilisateur et une affiliation actifs. Un retrait ou changement de rôle retire automatiquement cette responsabilité et laisse une trace d'audit.

La désactivation exige confirmation et motif. Les affiliations et historiques restent conservés. Les commandes ouvertes, livraisons en cours, stocks physiques/réservés positifs et transferts non terminés empêchent la désactivation. agencyBlockers est le point à compléter lorsque les prochains modules ajoutent d'autres opérations ouvertes. Une désactivation de la dernière agence active d'un livreur le rend indisponible.

## API et sécurité

Sous /api/company : GET/POST /agencies, GET/PATCH /agencies/:id, PATCH /agencies/:id/status, PATCH /agencies/:id/primary. Les modifications exigent la version courante; le principal est un userId ou null. Lecture paginée : q, status, page, size (50 maximum).

Un responsable ne voit que l'agence de son contexte courant; il change de contexte pour une autre agence autorisée. Un identifiant d'une autre entreprise ne donne aucun accès. Les membres sans employees.read ne reçoivent pas les listes de personnel dans la fiche agence. Aucun prix d'abonnement par agence n'est introduit.

## Données

Agency ajoute countryCode, locationNotes, primaryManagerUserId et version. Une clé étrangère composée SQL (companyId, id, primaryManagerUserId) cible AgencyMembership(companyId, agencyId, userId). Elle est documentée manuellement, car sa représentation Prisma créerait des relations partagées ambiguës; préserver cette contrainte lors de toute future migration. Le service vérifie aussi le rôle et l'activité du responsable.

La fiche Web fournit création, modification, statut et responsabilité. Expo fournit consultation paginée, recherche et détail. Les droits d'écriture de structure restent sur le Web dans ce bloc.
