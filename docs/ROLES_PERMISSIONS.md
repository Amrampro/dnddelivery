# Rôles et permissions

User ne possède pas de champ role. Les affectations sont GlobalRoleGrant, CompanyMembership, AgencyMembership et ShopMembership. Role.scope et les FK composées empêchent d’appliquer un rôle global à une affiliation tenant. Les permissions sont reliées par RolePermission et relues depuis la base.

| Profil | Scope | Accès au portail |
| --- | --- | --- |
| super_admin | GLOBAL | super-admin, sans entreprise cliente obligatoire |
| company_admin | COMPANY | entreprise ; sélection des agences autorisées par ses droits |
| agency_manager | AGENCY | agence, avec affiliation entreprise active |
| stock_manager | AGENCY | stock |
| shop_owner | SHOP | boutique, filtrée par collaboration et boutique |
| courier | AGENCY | livreur |
| company_member | COMPANY | Affiliation technique de base, sans permission générale implicite |

Le destinataire final ne doit pas créer de compte ; le suivi public demeure hors périmètre.

workspace.access ouvre uniquement la structure d’accueil professionnelle. Cette permission ne donne aucun accès implicite aux commandes, stocks, finances ou abonnements. Les permissions plus fines existantes du Bloc 2 restent séparées. Les modules métier correspondants ne sont pas exposés dans ce bloc.

Une affiliation d’agence nécessite une CompanyMembership active et une agence active dans la même entreprise. Les permissions d’agence sont l’union des permissions d’entreprise et du rôle de cette agence ; elles ne s’étendent pas aux autres agences. Une affiliation entreprise sans droit général ne permet pas de sélectionner toute l’entreprise. L’interface propose les agences compatibles, pas une liste de tous les tenants.

Une boutique conserve son compte et son catalogue communs à ses collaborations. Chaque choix boutique contient companyId et shopId ; la collaboration, la boutique et son affiliation doivent être actives. Les autres boutiques restent exclues. Les droits globaux exigent une affectation globale et une permission globale distinctes ; un super-administrateur ne reçoit pas de faux rôle dans chaque entreprise.

Les rôles personnalisés peuvent exister. Leur scope doit rester cohérent avec la table d’affiliation et workspace.access doit être explicitement accordée avant l’ouverture du portail. Le futur module employés utilisera les modèles, les validations et l’autorisation serveur existants ; aucune route publique de création d’affiliation, de rôle ou d’auto-promotion n’est ajoutée ici.

La suspension d’une entreprise conserve les données et retire ses contextes. Un utilisateur ayant un autre accès actif peut toujours le sélectionner. La suppression logique d’une affiliation retire immédiatement ses droits lors de la requête suivante, même avec un ancien JWT valide. Un compte désactivé perd tous ses accès, y compris globaux.

## Bloc 8 — Permissions partenaires

partnerGrants complète les rôles company_admin et shop_owner, et ajoute shop_manager/shop_employee. Voir PARTNER_PERMISSIONS.md pour la matrice, les contextes autonomes, la séparation entre boutique et transporteur et les règles de consentement.

## Bloc 9 — Catalogue et stock

Permissions shop.products.read/manage pour le catalogue propriétaire et shop.stocks.read pour ses marchandises. Les opérateurs utilisent stocks.read/deposit/withdraw/reserve/transfer/inventory/approve/threshold; le gestionnaire n'a pas stocks.approve. Une consommation exige reserve ET withdraw. Les agences partagées et l'abonnement sont revérifiés dans chaque transaction. Voir STOCK_MANAGEMENT.md et les guides spécifiques.

## Bloc 10 — Commandes

orders.read/create/edit/cancel pour les opérateurs autorisés ; shop.orders.read/create/edit/cancel pour la boutique. L'employé d'agence et l'employé boutique n'ont pas cancel. Les menus de boutique autonome utilisent shop.orders.*, car son contexte exclut volontairement les droits tenant génériques. Une création autorise seulement ses réservations liées, pas les opérations générales du stock. Versions, agences explicitement partagées, propriétaire, collaboration et abonnement sont vérifiés côté serveur. Voir la matrice et les limites de statut dans ORDER_MANAGEMENT.md.

## Bloc 11 — droits logistiques explicites

Les définitions actuelles sont dans api/src/modules/deliveries/permissions.ts. company_admin et agency_manager supervisent/affectent dans leur périmètre. agency_employee prépare/réceptionne/signale ; stock_manager prépare/réceptionne sans dispatching ni montants. courier utilise deliveries.self.read/pickup/progress/attempt/incident.report/handover.accept/amount.read, toujours sur ses missions et agence active. shop_owner, shop_manager et shop_employee lisent leur suivi via shop.deliveries.read. Un droit de lecture générale ne donne aucune écriture. super_admin ne reçoit pas de droit implicite de dispatching. Voir DELIVERY_MANAGEMENT.md pour la matrice et la réduction des DTO.
# Complément Bloc 12 — finances opérationnelles

Les permissions financières sont explicites et contextualisées. Les responsables supervisent leur périmètre, les livreurs leur propre responsabilité, les boutiques leurs propres commandes avec données internes masquées. Approbation de correction réservée à un administrateur distinct ; réception de remise interdite au déclarant lui-même. Voir la [matrice financière complète](FINANCIAL_PERMISSIONS.md), y compris abonnement expiré et régularisation d’un profil suspendu.


## Complément Bloc 13 — remise et preuves

Permissions explicites dans api/src/modules/confirmation/permissions.ts, ajoutées par migration et seed sans supprimer les droits précédents. Entreprise/agence : lecture des preuves, gestion OTP, approbation indépendante et suivi. Livreur : uniquement ses missions affectées et gardées. Propriétaire, gestionnaire et employé boutique : preuves finales et notifications de ses commandes chez le transporteur sélectionné. Aucun droit de dispatching global implicite. Voir la [matrice et les contrôles](DELIVERY_CONFIRMATION.md).
