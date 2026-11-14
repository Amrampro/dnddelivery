import {
  Box,
  ArrowUpRight,
  Building2,
  LayoutDashboard,
  Truck,
  Check,
  MapPin,
  Package,
  Wallet,
} from "lucide-react";
export function DashboardPreview({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`dashboard ${compact ? "compact" : ""}`}
      aria-label="Maquette de démonstration, données fictives"
    >
      <div className="dash-top">
        <span className="window-dots">● ● ●</span>
        <span>Votre espace de pilotage</span>
        <span className="demo-label">DÉMONSTRATION</span>
      </div>
      <div className="dash-body">
        <aside className="dash-sidebar">
          <img
            src="/logo%20square.jpg"
            width="38"
            height="38"
            alt="DND Delivery"
          />
          <LayoutDashboard />
          <Box />
          <Truck />
          <Wallet />
        </aside>
        <div className="dash-main">
          <div className="dash-heading">
            <div>
              <small>VUE D’ENSEMBLE</small>
              <h3>Une journée bien orchestrée.</h3>
            </div>
            <span className="avatar">DD</span>
          </div>
          <div className="dash-stats">
            <div>
              <span>Commandes</span>
              <strong>
                128 <Package size={17} />
              </strong>
              <small>Exemple de volume</small>
            </div>
            <div>
              <span>En livraison</span>
              <strong>
                36 <Truck size={17} />
              </strong>
              <small>Tournées de démonstration</small>
            </div>
            <div>
              <span>Livrées</span>
              <strong>
                92 <Check size={17} />
              </strong>
              <small>Exemple de suivi</small>
            </div>
          </div>
          <div className="map-panel">
            <div className="map-grid" />
            <svg viewBox="0 0 500 220" aria-hidden="true">
              <path
                className="road"
                d="M-20 60 L150 60 L210 125 L510 125 M80 -20 L80 240 M320 -20 L320 240 M-20 190 L510 190 M400 -20 L180 240"
              />
              <path
                className="delivery-path"
                d="M80 60 L150 60 L210 125 L320 125 L320 190 L420 190"
              />
            </svg>
            <div className="map-label">
              <span className="live-dot" /> Réseau connecté{" "}
              <small>Vue illustrative</small>
            </div>
            <span className="map-pin pin-a">
              <Building2 size={21} />
            </span>
            <span className="map-pin pin-b">
              <Truck size={21} />
            </span>
            <span className="map-pin pin-c">
              <MapPin size={21} />
            </span>
            <div className="map-tooltip">
              <span className="check-circle">
                <Check size={15} />
              </span>
              <div>
                Chaque étape, en un regard.
                <small>De l’agence au destinataire</small>
              </div>
              <ArrowUpRight size={16} />
            </div>
          </div>
          <div className="dash-bottom">
            <span>
              <i className="live-dot" /> Toutes vos opérations, connectées.
            </span>
            <span>Explorer →</span>
          </div>
        </div>
      </div>
    </div>
  );
}
