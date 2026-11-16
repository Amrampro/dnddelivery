# Boutiques partenaires — Bloc 8

Le runtime est PartnerService et ses routes, avec contexte professionnel vérifié. Le repository de lecture préparatoire du Bloc 2 reste conservé pour compatibilité; les nouvelles pages utilisent les services versionnés, filtrés par boutique et entreprise.

Voir docs/PARTNER_MANAGEMENT.md, docs/PARTNER_COLLABORATIONS.md et docs/PARTNER_PERMISSIONS.md. Les nouveaux modules logistiques doivent appeler assertActiveCollaboration dans leur transaction. Les invitations conservent uniquement le hash du jeton; les notifications de collaboration réutilisent l'outbox Notification avec worker distinct PartnerNotifications. La colonne companyId de Notification reste obligatoire, les vérifications d'inscription et invitations indépendantes utilisent ShopInvitation et le transport SMTP existant.
