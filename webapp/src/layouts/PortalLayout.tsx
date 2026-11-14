import { useEffect, useState, lazy, Suspense } from "react";
import { availableReports } from "../../../shared/reports";
const ReportsWorkspace = lazy(()=>import("../reports/ReportsWorkspace").then(m=>({default:m.ReportsWorkspace})));
import {
  Link,
  Navigate,
  NavLink,
  useLocation,
  useParams,
} from "react-router-dom";
import {
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  Palette,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { motion } from "motion/react";
import {
  definition,
  moduleAccess,
  navigation,
  adminModuleIds,
} from "../admin/navigation";
const AdminWorkspace = lazy(() =>
  import("../admin/AdminWorkspace").then((m) => ({
    default: m.AdminWorkspace,
  })),
);
import { deliveryModuleIds } from "../../../shared/deliveries";
import { financeModuleIds } from "../../../shared/finance";
const FinanceWorkspace = lazy(() =>
  import("../finance/FinanceWorkspace").then((m) => ({
    default: m.FinanceWorkspace,
  })),
);
const DeliveryWorkspace = lazy(() =>
  import("../deliveries/DeliveryWorkspace").then((m) => ({
    default: m.DeliveryWorkspace,
  })),
);
import { orderModuleIds } from "../../../shared/orders";
const OrderWorkspace = lazy(() =>
  import("../orders/OrderWorkspace").then((m) => ({
    default: m.OrderWorkspace,
  })),
);
const OrganizationWorkspace = lazy(() =>
  import("../organization/OrganizationWorkspace").then((m) => ({
    default: m.OrganizationWorkspace,
  })),
);
const StockWorkspace = lazy(() =>
  import("../stocks/StockWorkspace").then((m) => ({
    default: m.StockWorkspace,
  })),
);
const stockModules = [
  "produits",
  "stocks",
  "depots",
  "mouvements",
  "sorties",
  "reservations",
  "transferts-stock",
  "inventaires",
  "alertes-stock",
];
const PartnersWorkspace = lazy(() =>
  import("../partners/PartnersWorkspace").then((m) => ({
    default: m.PartnersWorkspace,
  })),
);
const partnerModules = [
  "partenaires",
  "demandes-partenaires",
  "invitations-partenaires",
  "profil-boutique",
  "transporteurs",
  "demandes-collaboration",
  "utilisateurs-boutique",
  "historique-boutique",
  "invitations-boutique",
  "notifications-boutique",
  "notifications-partenaires",
];
import { organizationModuleIds } from "../../../shared/organization";
import {
  SubscriptionWorkspace,
  RestrictedSubscription,
} from "../subscriptions/Subscriptions";
import { Brand } from "../components/Brand";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../auth/client";
import type { Workspace } from "../auth/types";
import {
  AccessDenied,
  Badge,
  Button,
  Confirm,
  Dialog,
  ErrorState,
  Popover,
  Skeleton,
} from "../design/ui";
import { Dashboard } from "../workspace/Dashboard";
import { ModulePage } from "../workspace/ModulePage";
import { ModuleIcon } from "../workspace/ModuleIcon";
import { DesignLibrary } from "../workspace/DesignLibrary";
import { ContextPicker } from "../workspace/ContextPicker";
import "../design/design.css";
export function PortalLayout() {
  const auth = useAuth(),
    { role, module: requested } = useParams(),
    location = useLocation();
  const moduleId = requested ?? "accueil",
    key = auth.profile?.activeContext?.key;
  const [result, setResult] = useState<{
      request: string;
      context?: Workspace;
      error?: string;
    } | null>(null),
    [retry, setRetry] = useState(0);
  const [collapsed, setCollapsed] = useState(false),
    [menu, setMenu] = useState(false),
    [logout, setLogout] = useState(false),
    [busy, setBusy] = useState(false),
    [logoutError, setLogoutError] = useState("");
  const request = `${auth.profile?.user.id}:${key}:${moduleId}:${retry}:${JSON.stringify(auth.profile?.activeContext)}`,
    initial = auth.profile?.activeContext;
  const permission = initial && moduleAccess(initial, moduleId)?.permission;
  useEffect(() => {
    let disposed = false;
    if (key)
      api<{ context: Workspace }>(
        `/auth/workspace${permission ? `?permission=${encodeURIComponent(permission)}` : ""}`,
      )
        .then((v) => {
          if (!disposed) setResult({ request, context: v.context });
        })
        .catch((e) => {
          if (!disposed) setResult({ request, error: e.message });
        });
    return () => {
      disposed = true;
    };
  }, [key, request, permission, location.key]);
  if (!key) return <Navigate to="/organisations" replace />;
  if (result?.request === request && result.error)
    return (
      <main className="ws-standalone">
        <Brand />
        <ErrorState
          message={result.error}
          retry={() => setRetry((v) => v + 1)}
        />
        <Link to="/organisations" className="ds-button ds-secondary">
          Vérifier mes affiliations
        </Link>
      </main>
    );
  if (result?.request !== request || !result.context)
    return (
      <main className="ws-standalone">
        <Brand />
        <Skeleton rows={5} />
      </main>
    );
  const context = result.context,
    config = definition(context);
  if (role !== context.portal)
    return <Navigate to={`/portail/${context.portal}`} replace />;
  const modules = navigation(context),
    selected = moduleAccess(context, moduleId),
    base = `/portail/${context.portal}`;
  async function signOut() {
    setBusy(true);
    try {
      await auth.logout();
    } catch (e) {
      setLogoutError(
        e instanceof Error ? e.message : "Déconnexion impossible.",
      );
    } finally {
      setBusy(false);
    }
  }
  const nav = (
    <>
      <div className="ws-nav-label">ESPACE DE TRAVAIL</div>
      {modules.map((m) => (
        <NavLink
          key={m.id}
          end
          to={m.id === "accueil" ? base : `${base}/${m.id}`}
          title={collapsed ? m.label : undefined}
          onClick={() => setMenu(false)}
        >
          <ModuleIcon name={m.icon} />
          <span>{m.label}</span>
          {m.id === "accueil" && <span className="ws-nav-dot" />}
        </NavLink>
      ))}
    </>
  );
  return (
    <div className={`ws-shell ${collapsed ? "ws-collapsed" : ""}`}>
      <a className="ws-skip" href="#workspace-content">
        Aller au contenu
      </a>
      <aside className="ws-sidebar">
        <div className="ws-sidebar-brand">
          <Brand />
          <Button
            variant="ghost"
            aria-label={
              collapsed ? "Déplier la navigation" : "Replier la navigation"
            }
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          </Button>
        </div>
        <div className="ws-product-label">VOTRE LOGISTIQUE. SIMPLIFIÉE.</div>
        <nav aria-label="Navigation professionnelle">{nav}</nav>
        <div className="ws-sidebar-bottom">
          <div className="ws-help">
            <ShieldCheck size={21} />
            <strong>Votre espace, sécurisé.</strong>
            <p>Des accès liés à vos responsabilités.</p>
            <Link to="/profil">
              Gérer mes sessions <ChevronRight size={13} />
            </Link>
          </div>
          <NavLink to={`${base}/composants`}>
            <Palette size={18} />
            <span>Composants UI</span>
          </NavLink>
          <button onClick={() => setLogout(true)}>
            <LogOut size={18} />
            <span>Se déconnecter</span>
          </button>
        </div>
      </aside>
      <div className="ws-main">
        <header className="ws-header">
          <Button
            variant="ghost"
            className="ws-menu-toggle"
            aria-label="Ouvrir la navigation"
            onClick={() => setMenu(true)}
          >
            <Menu size={21} />
          </Button>
          <ContextPicker context={context} />
          <div className="ws-header-actions">
            {modules.some((m) => m.id === "notifications") && (
              <Link
                to={`${base}/notifications`}
                className="ws-icon-button"
                aria-label="Notifications"
              >
                <Bell size={19} />
              </Link>
            )}
            <span className="ws-header-divider" />
            <Popover
              label={
                <>
                  <span className="ws-avatar">
                    {auth.profile?.user.fullName.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="ws-profile-label">
                    <strong>{auth.profile?.user.fullName}</strong>
                    <small>{context.roleName}</small>
                  </span>
                  <ChevronDown size={14} />
                </>
              }
            >
              <div className="ws-account-caption">
                {auth.profile?.user.email}
              </div>
              <Link to="/profil">
                <UserRound size={16} />
                Mon profil et mes sessions
              </Link>
              <Link to="/organisations">
                <ModuleIcon name="building" />
                Changer d’environnement
              </Link>
              <button onClick={() => setLogout(true)}>
                <LogOut size={16} />
                Se déconnecter
              </button>
            </Popover>
          </div>
        </header>
        <div className="ws-breadcrumb">
          <Link to={base}>Espace professionnel</Link>
          <ChevronRight size={13} />
          <span>
            {moduleId === "composants"
              ? "Composants UI"
              : (selected?.label ?? "Accès refusé")}
          </span>
          <Badge>
            {context.agencyName ??
              context.shopName ??
              (context.scope === "GLOBAL" ? "Global" : "Entreprise")}
          </Badge>
        </div>
        <motion.main
          id="workspace-content"
          tabIndex={-1}
          key={`${auth.profile?.user.id}:${context.key}:${location.pathname}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
          className="ws-content"
        >
          {!config ? (
            <AccessDenied />
          ) : moduleId === "composants" ? (
            <DesignLibrary />
          ) : !selected ? (
            <AccessDenied />
          ) : (moduleId === "rapports" || moduleId === "accueil" || (moduleId === "activite" && context.scope === "GLOBAL")) && availableReports(context).length > 0 ? (
            <Suspense fallback={<Skeleton />}><ReportsWorkspace context={context} dashboard={moduleId === "accueil"} defaultKind={moduleId === "activite" ? "audit" : "overview"}/></Suspense>
          ) : (context.scope === "GLOBAL" &&
              ["abonnements", "paiements"].includes(moduleId)) ||
            (context.scope === "COMPANY" && moduleId === "abonnement") ? (
            <SubscriptionWorkspace context={context} moduleId={moduleId} />
          ) : financeModuleIds.includes(moduleId) ? (
            <Suspense fallback={<Skeleton />}>
              <FinanceWorkspace context={context} moduleId={moduleId} />
            </Suspense>
          ) : deliveryModuleIds.includes(moduleId) ||
            (context.portal === "livreur" &&
              ["accueil", "historique", "notifications"].includes(moduleId)) ? (
            <Suspense fallback={<Skeleton />}>
              <DeliveryWorkspace context={context} moduleId={moduleId} />
            </Suspense>
          ) : orderModuleIds.includes(moduleId) ? (
            <Suspense fallback={<Skeleton />}>
              <OrderWorkspace context={context} moduleId={moduleId} />
            </Suspense>
          ) : stockModules.includes(moduleId) ||
            (context.portal === "stock" && moduleId === "accueil") ? (
            <Suspense fallback={<Skeleton />}>
              <StockWorkspace
                context={context}
                moduleId={moduleId === "accueil" ? "stocks" : moduleId}
              />
            </Suspense>
          ) : partnerModules.includes(moduleId) ||
            (context.scope === "SHOP" &&
              ["accueil", "parametres"].includes(moduleId)) ? (
            <Suspense fallback={<Skeleton />}>
              <PartnersWorkspace context={context} moduleId={moduleId} />
            </Suspense>
          ) : context.companyId && organizationModuleIds.includes(moduleId) ? (
            <Suspense fallback={<Skeleton />}>
              <OrganizationWorkspace context={context} moduleId={moduleId} />
            </Suspense>
          ) : context.companyId &&
            context.subscriptionAccess &&
            !context.subscriptionAccess.valid &&
            !["notifications", "parametres"].includes(moduleId) ? (
            <RestrictedSubscription context={context} />
          ) : context.portal === "super-admin" &&
            adminModuleIds.includes(moduleId) ? (
            <Suspense fallback={<Skeleton />}>
              <AdminWorkspace moduleId={moduleId} />
            </Suspense>
          ) : moduleId === "accueil" ? (
            <Dashboard
              context={context}
              fullName={auth.profile?.user.fullName ?? ""}
            />
          ) : (
            <ModulePage module={selected} />
          )}
        </motion.main>
        <footer className="ws-footer">
          <span>© {new Date().getFullYear()} DND Delivery</span>
          <span>Plus proches de vos clients.</span>
        </footer>
      </div>
      <Dialog
        open={menu}
        onClose={() => setMenu(false)}
        title="Votre espace"
        drawer
      >
        <Brand />
        <nav
          className="ws-mobile-nav"
          aria-label="Navigation professionnelle mobile"
        >
          {nav}
          <Link to="/profil">Mon profil</Link>
          <Link to="/organisations">Changer d’environnement</Link>
        </nav>
      </Dialog>
      <Confirm
        open={logout}
        onClose={() => setLogout(false)}
        onConfirm={() => void signOut()}
        busy={busy}
        title="Fermer votre session ?"
        description="Vous devrez vous reconnecter pour retrouver votre espace professionnel."
      />
      {logoutError && (
        <div role="alert" className="ds-toast">
          {logoutError}
          <Button variant="ghost" onClick={() => setLogoutError("")}>
            Fermer
          </Button>
        </div>
      )}
    </div>
  );
}
