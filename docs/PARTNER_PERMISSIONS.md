# Permissions boutiques et partenaires — Bloc 8

| Profil | Permissions ajoutées |
| --- | --- |
| Administrateur entreprise | partners.read, partners.manage |
| Propriétaire boutique | workspace.access, shop.profile.read/write, shop.users.read/manage, shop.collaborations.read/manage, shop.history.read, shop.notifications.read |
| Gestionnaire boutique | Même lecture et gestion du profil/collaborations, sans shop.users.manage |
| Employé boutique | workspace.access, shop.profile.read, shop.collaborations.read, shop.notifications.read |

Le rôle SHOP existant shop_owner est réutilisé; shop_manager et shop_employee complètent le catalogue. Le propriétaire gère les affiliations; le gestionnaire lit l'équipe sans pouvoir inviter ni attribuer de rôle. Un employé ne gère ni collaboration, ni profil, ni utilisateur. Les anciennes permissions métier ne sont pas utilisées pour simuler des fonctionnalités futures.

L'affiliation ShopMembership est unique par shopId/userId; un même User peut avoir plusieurs affiliations. Les permissions sont relues en base et les écritures revérifient l'acteur dans la transaction. Aucun userId, rôle propriétaire ou companyId fourni librement ne permet de contourner les contrôles. L'entreprise n'a aucun accès aux utilisateurs internes de la boutique.

Le contexte SHOP sans entreprise sert aux opérations propres à la boutique; authorizeShop vérifie compte, boutique et affiliation actifs. Les opérations liées au transporteur passent toujours par le contexte de collaboration vérifié et les gardes multi-tenant/subscription existants. L'interface utilise les mêmes permissions pour ses menus, mais le serveur reste l'autorité.

Les mutations exigent une origine de confiance et, sur le Web, un jeton CSRF. Les invitations et inscriptions publiques appliquent les limites de débit; les corps stricts refusent les champs supplémentaires. Les versions optimistes évitent l'écrasement silencieux, et les verrous/transactions sérialisables protègent les transitions et le dernier propriétaire. AuditLog conserve les décisions sans token ni mot de passe; ShopInvitation ne conserve que le hash du jeton.

Pour les futurs stocks/commandes : vérifier companyId, shopId, statut du couple, abonnement et agences autorisées dans la même transaction. Lire une collaboration terminée n'autorise aucune création. La résolution des opérations déjà engagées devra utiliser des permissions dédiées et les gardes de clôture des blocs concernés.
