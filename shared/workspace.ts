/** UI metadata only. Effective roles, scope and permissions always come from /auth/workspace. */
export interface Context {
  portal: string;
  permissions: string[];
  scope: string;
  key: string;
}
export interface Module {
  id: string;
  label: string;
  permission: string;
  icon: string;
  description: string;
  columns?: string[];
}
const item = (
  id: string,
  label: string,
  permission: string,
  icon: string,
  description = `L’espace ${label.toLocaleLowerCase("fr")} accueillera les données de votre organisation.`,
  columns?: string[],
): Module => ({ id, label, permission, icon, description, columns });
const overview = item("accueil", "Vue d’ensemble", "workspace.access", "grid");
const companyProfile = item(
  "entreprise",
  "Mon entreprise",
  "company.profile.read",
  "building",
);
const ownAssignments = item(
  "mes-affectations",
  "Mes affectations",
  "organization.self.read",
  "users",
);
const organizationAgencies = item(
  "agences",
  "Agences",
  "agencies.read",
  "building",
);
const organizationEmployees = item(
  "employes",
  "Personnel",
  "employees.read",
  "users",
);
const organizationDrivers = item(
  "livreurs",
  "Livreurs",
  "drivers.read",
  "truck",
);
const orders = item(
  "commandes",
  "Commandes",
  "orders.read",
  "package",
  "Retrouvez ici les commandes du périmètre sélectionné.",
  ["Référence", "Destinataire", "Statut", "Mise à jour"],
);
const deliveries = item(
  "livraisons",
  "Livraisons",
  "deliveries.read",
  "truck",
  "Les livraisons autorisées seront regroupées ici.",
  ["Référence", "Destination", "Livreur", "Statut"],
);
const stocks = item(
  "stocks",
  "Stocks",
  "stocks.read",
  "layers",
  "Consultez les quantités physiques, réservées, disponibles et en transit de votre périmètre.",
  ["Produit", "Emplacement", "Disponible", "Réservé"],
);
const products = item(
  "produits",
  "Produits",
  "stocks.read",
  "box",
  "Consultez les produits des boutiques autorisées pour les opérations de stock.",
  ["Produit", "Référence", "Catégorie", "Statut"],
);
const collections = item(
  "encaissements",
  "Encaissements",
  "financial.supervise.read",
  "wallet",
);
const confirmations = item(
  "confirmations",
  "Confirmations et preuves",
  "delivery.proofs.read",
  "clipboard",
  "Examinez les remises en attente de confirmation, les photos et les demandes d’exception.",
);
const stockOperations = [
  item("depots", "Dépôts", "stocks.read", "arrow-down"),
  item("mouvements", "Mouvements de stock", "stocks.read", "repeat"),
  item("sorties", "Sorties de stock", "stocks.read", "arrow-up"),
  item("reservations", "Réservations", "stocks.read", "clipboard"),
  item(
    "transferts-stock",
    "Transferts de marchandises",
    "stocks.read",
    "truck",
  ),
  item("inventaires", "Inventaires", "stocks.read", "clipboard"),
  item("alertes-stock", "Alertes de stock", "stocks.read", "alert"),
];
const transfers = item(
  "remises",
  "Remises de fonds",
  "remittances.read",
  "repeat",
);
const reports = item("rapports", "Rapports", "reports.read", "chart");
const notifications = item(
  "notifications",
  "Notifications",
  "workspace.access",
  "bell",
  "Retrouvez les avis opérationnels liés à vos accès actuels.",
);
const settings = item(
  "parametres",
  "Paramètres",
  "workspace.access",
  "settings",
  "Vos informations de compte et vos sessions restent accessibles depuis votre profil.",
);
const history = (permission: string) =>
  item("historique", "Historique", permission, "clock");
export const workspaces: Record<
  string,
  {
    title: string;
    subtitle: string;
    eyebrow: string;
    metrics: string[];
    modules: Module[];
    mobile: string[];
  }
> = {
  "super-admin": {
    title: "Une vision claire de votre plateforme.",
    subtitle: "Pilotez DND Delivery depuis un espace centralisé.",
    eyebrow: "ADMINISTRATION SAAS",
    metrics: [
      "Entreprises enregistrées",
      "Entreprises actives",
      "Entreprises suspendues",
      "Abonnements actifs",
      "Abonnements expirés",
    ],
    modules: [
      overview,
      item("entreprises", "Entreprises", "platform.manage", "building"),
      item(
        "abonnements",
        "Abonnements",
        "subscriptions.validate",
        "credit-card",
      ),
      item(
        "paiements",
        "Paiements déclarés",
        "subscriptions.validate",
        "wallet",
      ),
      item("utilisateurs", "Utilisateurs et accès", "platform.manage", "users"),
      item("rapports", "Rapports globaux", "platform.manage", "chart"),
      item("activite", "Journal d’activité", "platform.manage", "clock"),
      item(
        "parametres",
        "Paramètres de la plateforme",
        "platform.manage",
        "settings",
      ),
    ],
    mobile: ["accueil", "notifications", "profil"],
  },
  entreprise: {
    title: "Votre activité, en perspective.",
    subtitle: "Un espace pour superviser vos agences et vos opérations.",
    eyebrow: "DIRECTION D’ENTREPRISE",
    metrics: [
      "Commandes du jour",
      "Livraisons en cours",
      "Livraisons réussies",
      "Livraisons en échec",
      "Livreurs actifs",
      "Alertes de stock",
      "Encaissements à remettre",
      "Performances des agences",
    ],
    modules: [
      overview,
      companyProfile,
      organizationAgencies,
      item("partenaires", "Partenaires", "partners.read", "store"),
      item(
        "demandes-partenaires",
        "Demandes de boutiques",
        "partners.read",
        "mail",
      ),
      item(
        "invitations-partenaires",
        "Invitations de boutiques",
        "partners.read",
        "mail",
      ),
      item(
        "notifications-partenaires",
        "Avis des partenaires",
        "partners.read",
        "bell",
      ),
      organizationEmployees,
      organizationDrivers,
      item(
        "invitations-equipe",
        "Invitations du personnel",
        "employees.read",
        "mail",
      ),
      item(
        "historique-organisation",
        "Historique organisationnel",
        "organization.audit.read",
        "clock",
      ),
      ownAssignments,
      products,
      stocks,
      ...stockOperations,
      orders,
      item("brouillons", "Brouillons de commande", "orders.read", "clipboard"),
      deliveries,
      confirmations,
      item("affectations", "Dispatching", "deliveries.assign", "repeat"),
      item(
        "acheminements",
        "Acheminements inter-agences",
        "deliveries.read",
        "truck",
      ),
      item("incidents", "Incidents de livraison", "deliveries.read", "alert"),
      item("retours", "Retours de colis", "deliveries.read", "repeat"),
      collections,
      transfers,
      item(
        "soldes-livreurs",
        "Soldes des livreurs",
        "financial.supervise.read",
        "wallet",
      ),
      item(
        "ecarts-financiers",
        "Écarts financiers",
        "financial.supervise.read",
        "alert",
      ),
      item(
        "corrections-financieres",
        "Régularisations financières",
        "financial.supervise.read",
        "repeat",
      ),
      item(
        "historique-financier",
        "Historique financier",
        "financial.history.read",
        "clock",
      ),
      reports,
      item("abonnement", "Abonnement", "subscriptions.read", "credit-card"),
      item("parametres", "Paramètres", "company.manage", "settings"),
      notifications,
    ],
    mobile: ["accueil", "encaissements", "remises", "livraisons", "profil"],
  },
  agence: {
    title: "Une journée bien orchestrée.",
    subtitle: "Gardez le cap sur les priorités de votre agence.",
    eyebrow: "OPÉRATIONS D’AGENCE",
    metrics: [
      "Commandes du jour",
      "Livraisons en cours",
      "Livraisons réussies",
      "Encaissements à remettre",
    ],
    modules: [
      overview,
      organizationAgencies,
      companyProfile,
      organizationEmployees,
      ownAssignments,
      orders,
      item("brouillons", "Brouillons de commande", "orders.read", "clipboard"),
      item("affectations", "Dispatching", "deliveries.assign", "repeat"),
      deliveries,
      confirmations,
      item(
        "acheminements",
        "Acheminements inter-agences",
        "deliveries.read",
        "truck",
      ),
      item("retours", "Retours de colis", "deliveries.read", "repeat"),
      organizationDrivers,
      stocks,
      products,
      ...stockOperations,
      collections,
      transfers,
      item(
        "soldes-livreurs",
        "Soldes des livreurs",
        "financial.supervise.read",
        "wallet",
      ),
      item(
        "ecarts-financiers",
        "Écarts financiers",
        "financial.supervise.read",
        "alert",
      ),
      item(
        "corrections-financieres",
        "Régularisations financières",
        "financial.supervise.read",
        "repeat",
      ),
      item(
        "historique-financier",
        "Historique financier",
        "financial.history.read",
        "clock",
      ),
      item("incidents", "Incidents", "deliveries.read", "alert"),
      history("orders.read"),
      notifications,
      settings,
    ],
    mobile: ["accueil", "encaissements", "remises", "affectations", "profil"],
  },
  stock: {
    title: "Chaque produit à sa place.",
    subtitle: "Votre espace pour préparer une gestion de stock précise.",
    eyebrow: "GESTION DES STOCKS",
    metrics: [
      "Produits référencés",
      "Stock disponible",
      "Mouvements du jour",
      "Alertes de stock",
    ],
    modules: [
      overview,
      organizationAgencies,
      companyProfile,
      ownAssignments,
      products,
      stocks,
      ...stockOperations,
      history("stocks.read"),
      deliveries,
      confirmations,
      settings,
    ],
    mobile: ["accueil", "stocks", "depots", "inventaires", "profil"],
  },
  boutique: {
    title: "Vos expéditions commencent ici.",
    subtitle: "Un seul compte, vos collaborations de livraison autorisées.",
    eyebrow: "BOUTIQUE PARTENAIRE",
    metrics: [
      "Commandes en préparation",
      "Livraisons en cours",
      "Livraisons terminées",
      "Stocks déposés",
    ],
    modules: [
      overview,
      item(
        "profil-boutique",
        "Profil commercial",
        "shop.profile.read",
        "store",
      ),
      item(
        "demandes-collaboration",
        "Demandes et invitations",
        "shop.collaborations.read",
        "mail",
      ),
      item(
        "utilisateurs-boutique",
        "Utilisateurs de boutique",
        "shop.users.read",
        "users",
      ),
      item(
        "invitations-boutique",
        "Invitations utilisateurs",
        "shop.users.manage",
        "mail",
      ),
      item(
        "historique-boutique",
        "Historique de boutique",
        "shop.history.read",
        "clock",
      ),
      item(
        "notifications-boutique",
        "Notifications",
        "shop.notifications.read",
        "bell",
      ),
      item(
        "nouvelle-commande",
        "Nouvelle commande",
        "shop.orders.create",
        "plus",
        "Préparez une commande ponctuelle ou depuis le stock, puis vérifiez le récapitulatif.",
      ),
      item(
        "commandes",
        "Mes commandes",
        "shop.orders.read",
        "package",
        orders.description,
        orders.columns,
      ),
      item("brouillons", "Mes brouillons", "shop.orders.read", "clipboard"),
      item(
        "transporteurs",
        "Mes transporteurs",
        "shop.collaborations.read",
        "truck",
        "Changez de transporteur parmi vos collaborations autorisées depuis le sélecteur d’environnement.",
      ),
      item("produits", "Mon catalogue", "shop.products.read", "box"),
      item("stocks", "Mes marchandises", "shop.stocks.read", "layers"),
      ...stockOperations
        .filter((m) =>
          [
            "depots",
            "mouvements",
            "transferts-stock",
            "alertes-stock",
          ].includes(m.id),
        )
        .map((m) => ({ ...m, permission: "shop.stocks.read" })),
      item("suivi", "Suivi des livraisons", "shop.deliveries.read", "route"),
      item(
        "suivi-financier",
        "Suivi financier des commandes",
        "shop.collections.read",
        "wallet",
      ),
      history("orders.read"),
      settings,
    ],
    mobile: ["accueil", "nouvelle-commande", "commandes", "stocks", "profil"],
  },
  livreur: {
    title: "Prêt pour votre prochaine course.",
    subtitle: "Un espace simple pour rester concentré sur vos livraisons.",
    eyebrow: "ESPACE LIVREUR",
    metrics: ["Courses à venir", "Courses en cours", "Courses terminées"],
    modules: [
      overview,
      item("profil-livreur", "Mon profil livreur", "drivers.self.read", "user"),
      organizationAgencies,
      companyProfile,
      ownAssignments,
      item(
        "courses",
        "Mes missions",
        "deliveries.self.read",
        "truck",
        "Consultez vos missions et confirmez les opérations physiques qui vous sont attribuées.",
        deliveries.columns,
      ),
      history("deliveries.read"),
      item(
        "encaissements",
        "Mes encaissements",
        "collections.self.read",
        "wallet",
      ),
      item(
        "remises",
        "Mes remises de fonds",
        "remittances.self.read",
        "repeat",
      ),
      item(
        "ecarts-financiers",
        "Mes écarts financiers",
        "collections.self.read",
        "alert",
      ),
      item(
        "corrections-financieres",
        "Mes régularisations",
        "collections.self.read",
        "repeat",
      ),
      item(
        "historique-financier",
        "Mon historique financier",
        "financial.history.self.read",
        "clock",
      ),
      notifications,
      settings,
    ],
    mobile: ["accueil", "courses", "encaissements", "remises", "profil"],
  },
};
export function definition(context: Context) {
  return Object.hasOwn(workspaces, context.portal)
    ? workspaces[context.portal]
    : undefined;
}
export function navigation(context: Context): Module[] {
  const modules = (
    definition(context)?.modules.filter(
      (m) =>
        (m.id !== "invitations-equipe" || context.scope === "COMPANY") &&
        context.permissions.includes("workspace.access") &&
        context.permissions.includes(m.permission),
    ) ?? []
  );
  const reportPermission = ["reports.read", "stocks.read", "shop.orders.read", "shop.stocks.read", "deliveries.self.read", "collections.self.read"].find(p=>context.permissions.includes(p));
  if (context.permissions.includes("workspace.access") && reportPermission && !modules.some(m=>m.id==="rapports"))
    modules.push(item("rapports", "Rapports et statistiques", reportPermission, "chart", "Consultez et exportez les données de votre périmètre."));
  return modules;
}
export function moduleAccess(context: Context, id: string) {
  return navigation(context).find((m) => m.id === id);
}
export function mobileNavigation(context: Context): Module[] {
  const available = [
    ...navigation(context),
    ...(context.portal === "entreprise"
      ? [item("activite", "Activité", "reports.read", "chart")]
      : []),
    ...(context.portal === "stock"
      ? [item("mouvements", "Mouvements", "stocks.read", "repeat")]
      : []),
    item("profil", "Profil", "workspace.access", "user"),
  ];
  return (definition(context)?.mobile ?? []).flatMap((id) => {
    const m = available.find((v) => v.id === id);
    return m &&
      context.permissions.includes("workspace.access") &&
      context.permissions.includes(m.permission)
      ? [m]
      : [];
  });
}
export function mobileModuleAccess(context: Context, id: string) {
  return [...navigation(context), ...mobileNavigation(context)].find(
    (m) => m.id === id,
  );
}
