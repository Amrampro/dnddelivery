# Boutiques partenaires — Bloc 8

Date : 28 octobre 2026. Le module réutilise Shop, ShopMembership, CompanyShop, User, Notification et AuditLog. Une boutique possède une identité unique et peut collaborer avec plusieurs entreprises; un utilisateur peut gérer plusieurs boutiques sans recréer son compte.

## Inscription et identité

Le lien Web /inscription-boutique recueille les informations commerciales, l'identité du responsable et son accord aux conditions d'inscription affichées. Ces conditions courtes portent sur l'autorisation de représenter la boutique, l'exactitude des informations, la gestion des accès et l'accord des partenaires; version shop-registration-2026-10-28. Elles ne constituent pas une validation des documents juridiques de production.

L'inscription envoie un lien de vérification à l'adresse fournie. Aucune boutique ni affiliation propriétaire n'est créée avant consommation du jeton. Un nouveau compte choisit un mot de passe de 12 à 128 caractères; un compte existant doit s'authentifier comme destinataire et conserve son mot de passe. Le jeton, hashé en base, expire après 48 heures et n'est utilisable qu'une fois. Un champ piège, un plafond HTTP par IP et l'absence de nouvelle demande identique en attente limitent les abus. La réponse publique reste générique pour une adresse déjà utilisée.

Une entreprise peut préparer une inscription par e-mail. Après vérification, la boutique créée reçoit une collaboration PENDING et doit encore donner son accord. Une boutique déjà existante doit être demandée par sa référence : l'entreprise ne crée pas de doublon et n'obtient aucun rôle dans la boutique.

## Profil et utilisateurs

Le profil contient référence serveur, nom commercial, raison sociale et description facultatives, coordonnées professionnelles, pays/ville/quartier/adresse, logo privé, statut et version. La référence et le statut ne sont pas modifiables dans le formulaire commercial. Le logo réutilise le stockage privé et le décodage/réencodage sécurisé du Bloc 5. Aucun logo officiel n'est remplacé.

Le propriétaire peut inviter un compte existant ou nouveau et attribuer propriétaire, gestionnaire ou employé. Aucun droit avant acceptation authentifiée/vérifiée; l'autorité actuelle de l'émetteur est revérifiée. Le propriétaire peut changer rôle/activité ou retirer une affiliation avec motif. La dernière personne propriétaire active est protégée. Les comptes globaux, autres boutiques et historiques sont conservés. La gestion complexe des utilisateurs reste sur le Web; Expo consulte l'équipe selon permissions.

## API

Préfixe /api/partner-registration : POST / (demande publique), /inspect, /accept, /accept-existing (session requise). Acceptation commune aux invitations REGISTRATION, USER et PARTNER. Le lien de vérification Web est /invitation-boutique#token=…; le fragment est effacé de l'URL par le client.

Préfixe /api/partners, contexte SHOP vérifié : GET/PATCH /profile; GET/PUT /profile/logo (X-Shop-Version); GET /users, POST /users/invite, PATCH/DELETE /users/:userId; GET /invitations, POST /invitations/:id/resend ou /revoke; GET /history; GET /notifications. Les listes utilisent page/size (50 maximum), recherche selon endpoint. Voir PARTNER_COLLABORATIONS.md pour les collaborations.

## Données et exploitation

Migration additive 20261028140000_partner_collaborations : champs commerciaux/version/accords et clé d'inscription unique sur Shop; affiliationStatus et version sur ShopMembership; état REJECTED et métadonnées/version sur CompanyShop; nouveau ShopInvitation. 50 modèles, dix migrations au total. Les clés étrangères scalaires de ShopInvitation sont définies en SQL : les préserver lors des migrations futures. Aucune donnée existante n'est supprimée ou réinitialisée.

Les envois d'invitation sont faits après validation de la transaction; FAILED reste visible, renvoi manuel avec rotation du jeton et révocation disponibles aux administrateurs autorisés. Les avis de collaboration réutilisent l'outbox Notification. La livraison SMTP externe et les documents juridiques de production restent à configurer/valider avant mise en service.

Code : api/src/modules/partners; shared/partners.ts; webapp/src/partners; mobileapp/src/partners. L'authentification et les sessions existantes restent la seule identité du produit.
