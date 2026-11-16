# Consultation du journal d’audit

`GET /api/reports/audit`, strictement en lecture. Aucun endpoint PATCH/DELETE d’AuditLog. Les protections d’immutabilité MySQL préexistantes sont conservées.

L’auteur authentifié et les affiliations sont relus au serveur. Entreprise : audit.read ou organization.audit.read, companyId fixé. Agence : même permission, companyId et agencyId fixés. Un événement sans agence ne devient pas visible à toute agence ; le contexte entreprise reste nécessaire. Les boutiques, livreurs et gestionnaires de stock sans ce droit sont refusés.

Super Administrateur : platform.manage, uniquement événements companyId NULL. Un filtre d’entreprise est refusé sur ce journal pour ne pas transformer l’administration SaaS en accès aux données opérationnelles. Le compteur d’activité général est un agrégat séparé et ne révèle pas ces lignes.

Filtres : période locale, actorId (UUID), module (entityType exact), action exacte, agence dans le contexte autorisé. Tri createdAt DESC puis id DESC, pagination 1–100 lignes. Comptage avec le même WHERE que les lignes. Tous les paramètres sont validés puis liés, sans concaténation de valeurs en SQL.

Liste positive du DTO : createdAt UTC, nom d’auteur si présent (sinon son identifiant), action, entityType, entityId, companyId et agencyId. Les métadonnées JSON libres ne sont jamais sélectionnées. Les corps de requêtes, mots de passe, empreintes de jetons, codes OTP, liens privés et notes personnelles ne sont pas exportés. Le résultat n’est pas déduit lorsqu’il n’existe pas comme champ structuré. Les informations pertinentes sont action et entité ; les détails métier se consultent dans leurs modules avec leurs propres permissions.

Exports soumis au même contrôle, même DTO et quotas que la consultation. REPORT_EXPORTED conserve seulement format/type de rapport/période, auteur et périmètre disponible ; pas de contenu complet du fichier. Ces événements ne modifient aucun historique métier.

Tests MySQL : événement contenant délibérément password/OTP/token dans metadata ; aucun de ces champs dans la réponse. Tests d’isolement et d’export refusé sans autorisation ; contrôles HTTP origine/CSRF/session. Consulter le rapport Bloc 15 pour les résultats exécutés et les limites de recette.
