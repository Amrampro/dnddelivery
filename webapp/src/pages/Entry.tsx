import { Link, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  LockKeyhole,
  Search,
  Clock3,
} from "lucide-react";
import { Brand } from "../components/Brand";
import { TrackingForm } from "../components/TrackingForm";
export function Entry() {
  const { pathname } = useLocation();
  const login = pathname === "/connexion";
  const access = pathname === "/acces";
  const tracking = pathname === "/suivi";
  const legal = ["/mentions-legales", "/confidentialite"].includes(pathname);
  const title = login
    ? "Votre prochain point de départ."
    : access
      ? "Faisons avancer votre logistique."
      : tracking
        ? "Gardez le fil de votre colis."
        : legal
          ? pathname === "/confidentialite"
            ? "Confidentialité"
            : "Mentions légales"
          : "Cette page n’existe pas.";
  return (
    <main className="entry-page">
      <Brand />
      <div className="entry-card">
        <span className="feature-icon">
          {login ? <LockKeyhole /> : tracking ? <Search /> : <Clock3 />}
        </span>
        <span className="eyebrow">DND DELIVERY</span>
        <h1>{title}</h1>
        {tracking ? (
          <TrackingForm />
        ) : (
          <>
            <p>
              {login
                ? "La connexion sécurisée sera disponible lors de l’intégration de l’authentification. Aucun compte ne peut encore être utilisé."
                : access
                  ? "L’ouverture des accès entreprises est en préparation. Le formulaire de demande sera disponible après l’intégration du service. Aucune demande n’est collectée pour le moment."
                  : legal
                    ? "Cette rubrique sera complétée avec les informations légales validées avant l’ouverture commerciale. Aucun formulaire de collecte ni outil de mesure d’audience n’est intégré dans cette version."
                    : "Retrouvez la présentation de la plateforme depuis l’accueil."}
            </p>
            {login && (
              <Link to="/acces" className="text-link">
                Découvrir les futurs accès <ArrowUpRight size={16} />
              </Link>
            )}
          </>
        )}
        <Link className="button" to="/">
          <ArrowLeft size={17} /> Retour à l’accueil
        </Link>
      </div>
    </main>
  );
}
