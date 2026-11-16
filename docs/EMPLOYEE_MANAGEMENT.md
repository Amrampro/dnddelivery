# Personnel et invitations — Bloc 7

## Inviter et affecter

L'administrateur ouvre Personnel, invite par adresse électronique, choisit un rôle et une ou plusieurs agences actives. Rôles : employé, responsable agence, gestionnaire de stock, livreur. Un rôle logique par entreprise s'applique aux agences sélectionnées; au maximum 100 agences dans une demande d'affectation, avec sélecteur paginé. Le nombre d'agences de l'entreprise n'est pas limité à cette taille de page.

L'invitation ne donne aucun droit avant son acceptation. Un destinataire nouveau choisit son mot de passe; un compte existant se connecte et accepte avec la même adresse. Aucun mot de passe existant n'est remplacé. Jeton stocké sous forme de hash, expiration 48 heures, usage unique, révocation et renvoi avec rotation. Le lien est inspecté par les routes publiques existantes; POST /api/invitations/accept-existing exige une session authentifiée et la protection CSRF du Web.

À l'acceptation, le serveur revérifie l'autorité actuelle de l'émetteur, l'abonnement, les agences, le destinataire, la révocation et l'échéance, puis affecte et consomme le jeton dans une transaction. SMTP utilise le transport existant après validation en base. Un échec d'envoi reste visible et peut être renvoyé; aucune délivrabilité externe n'est présumée.

## Gérer une personne

La fiche permet rôle, agences et état ACTIVE/SUSPENDED/INACTIVE avec version. Le retrait exige confirmation et motif et désactive uniquement l'affiliation de cette entreprise. Le compte global et ses autres entreprises restent accessibles. Les contacts globaux sont consultés, sans modification arbitraire par l'employeur. Les administrateurs entreprise restent protégés et sont gérés dans le module Super Administrateur existant.

Le retrait ou changement d'affectation désactive les anciens liens, retire les responsabilités principales incompatibles et révoque immédiatement les permissions correspondantes. Le retrait d'un administrateur par l'ancien module global effectue également ce nettoyage. Un livreur retiré devient INACTIVE et UNAVAILABLE.

## API

Préfixe /api/company : GET /employees (q, role, status, agencyId, page, size), POST /employees/invite, GET/PATCH /employees/:id, DELETE /employees/:id/affiliation; GET /staff-invitations, POST /staff-invitations/:id/resend, POST /staff-invitations/:id/revoke. Les id des personnes sont leurs userId, toujours combinés au companyId de contexte.

Le responsable agence dispose de la lecture locale; invitation et modification exigent les permissions entreprise. La liste d'invitations est réservée au contexte entreprise autorisé, reste lisible après expiration, et ne contient jamais de hash de jeton. Le Web propose listes, filtres, fiches, invitation, affectations et confirmations; Expo consulte le personnel autorisé et ses propres affectations.
