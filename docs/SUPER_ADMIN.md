# Super administrateur — Bloc 5

Le portail Web utilise les données MySQL réelles. L’accès demande une session active, le contexte GLOBAL et la permission `platform.manage`; la navigation exige aussi `workspace.access`. Chaque requête recharge les droits effectifs. Un administrateur d’entreprise ne peut pas appeler ces routes en changeant un identifiant.

## Pages

- `/portail/super-admin` : compteurs réels, créations par jour sur 7/30/90 jours, dernières entreprises et actions.
- `/portail/super-admin/entreprises` : recherche, statut, pays, ville, tri et pagination serveur.
- `/portail/super-admin/entreprises/nouvelle` : création avec responsable existant ou invitation.
- `/portail/super-admin/entreprises/:id` : fiche, statut, coordonnées, logo privé et dernières actions.
- Suffixes `/modifier`, `/administrateurs`, `/invitations`, `/historique` : modification, responsables, invitations et journal paginé.
- `/portail/super-admin/utilisateurs` : recherche exacte d’un compte actif par e-mail, puis choix de l’entreprise.
- `/portail/super-admin/invitations` et `/activite` : listes globales paginées.
- `/invitation` : activation publique par lien reçu, sans connexion automatique.

## Endpoints

Préfixe `/api/admin` (également sous le préfixe versionné existant) :

| Méthode | Route | Usage |
| --- | --- | --- |
| GET | /dashboard | Agrégats MySQL et période |
| GET, POST | /companies | Liste filtrée, création atomique |
| GET, PATCH | /companies/:id | Fiche, modification versionnée |
| PATCH | /companies/:id/status | Motif obligatoire et traçabilité |
| GET, POST | /companies/:id/admins | Responsables, association existante |
| POST | /companies/:id/admins/invite | Nouvelle invitation |
| PATCH, DELETE | /companies/:id/admins/:userId | Principal, retrait d’affiliation |
| GET, PUT | /companies/:id/logo | Lecture privée JSON, image binaire |
| GET | /invitations | Pagination, filtre companyId facultatif |
| POST | /invitations/:id/resend | Rotation et nouvel envoi |
| POST | /invitations/:id/revoke | Révocation |
| GET | /activity | Journal, filtre companyId facultatif |
| GET | /users/lookup?email=… | Compte actif exact |

Public : `POST /api/invitations/inspect` et `/accept`. Le jeton est dans le corps JSON. Voir COMPANY_INVITATIONS.md.

Les écritures Web exigent l’origine autorisée et le jeton CSRF de l’authentification existante. Validation stricte des champs, limites de débit, réponses sans cache. Limites par processus : lectures 120/min/IP, écritures 60/h/utilisateur, invitations et renvois 10/h/utilisateur; création avec invitation incluse dans les 60 écritures. Pour plusieurs instances, prévoir un stockage partagé des limites.

## Configuration et recette

1. Configurer une nouvelle base MySQL 8 compatible, les secrets Auth, WEB_APP_URL et CORS_ORIGINS selon AUTHENTICATION.md. Sauvegarder avant toute migration utile.
2. Depuis api : `npm ci`, `npm run db:migrate:deploy`, `npm run db:seed`, puis bootstrap manuel sécurisé du premier super administrateur selon AUTHENTICATION.md. Aucun compte de production par défaut.
3. Configurer SMTP et le stockage des logos selon les deux guides associés. `npm run build` puis `npm start` pour l’API; construire le Web avec sa VITE_API_URL réelle.
4. Se connecter, sélectionner Administration DND Delivery, créer une entreprise avec un responsable, vérifier la fiche après rechargement, modifier et suspendre/réactiver; vérifier le refus depuis le contexte entreprise.
5. Recevoir une invitation sur une boîte de recette, renvoyer puis vérifier que seul le nouveau lien fonctionne. Activer une fois, se connecter avec le compte créé, vérifier l’affiliation.

Les abonnements, paiements et modules logistiques restent aux blocs suivants. Le statut administratif ne prouve aucun paiement et n’accorde aucun abonnement. Aucun déploiement réalisé.
