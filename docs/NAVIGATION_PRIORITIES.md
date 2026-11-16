# Priorités de navigation

Les menus sont définis dans `shared/workspace.ts`, utilisé par le Web et le mobile. L'ordre reflète le parcours opérationnel demandé, pas des statistiques de fréquentation mesurées dans DND Delivery.

- Entreprise et agence : vue d'ensemble, commandes, affectation des livreurs, livraisons, incidents, retours, confirmations et preuves. Viennent ensuite les livreurs, les acheminements, les brouillons, les notifications, la finance, les stocks et les partenaires. L'administration et les historiques terminent le menu.
- Boutique : vue d'ensemble, nouvelle commande, commandes, suivi des livraisons, brouillons, catalogue, marchandises, suivi financier, notifications et agences de livraison. Le profil, les utilisateurs et les historiques viennent ensuite.
- Barre mobile entreprise/agence : accueil, commandes, affecter, livraisons, profil.
- Barre mobile boutique : accueil, créer, commandes, suivi, profil. Les autres modules restent dans le menu de l'espace.

« Dispatching » devient « Affectation des livreurs » ; « Affecter » est le libellé court de l'onglet mobile. Les identifiants des routes et les permissions sont conservés. Les confirmations et preuves concernent les remises ; ce menu n'est pas renommé en confirmation de commande.

## Repères consultés le 16 novembre 2026

- [Onfleet — Entities](https://docs.onfleet.com/reference/entities) : consulter et affecter les tâches, surveiller la progression des livreurs.
- [Onfleet — Task Assignment](https://support.onfleet.com/hc/en-us/articles/360023910111-Task-Assignment) : affectation des tâches aux livreurs et aux équipes.
- [Shopify — Managing orders](https://help.shopify.com/en/manual/fulfillment/managing-orders) : gestion des commandes, préparation et brouillons.
- [Shopify — Fulfilling orders](https://help.shopify.com/en/manual/fulfillment/fulfilling-orders) : préparation, expédition et suivi.

Ces références étayent le choix de placer les opérations quotidiennes avant la configuration ; elles ne prescrivent pas l'ordre exact des menus DND Delivery.
