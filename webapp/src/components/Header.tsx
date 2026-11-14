import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Brand } from "./Brand";
export function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="header">
      <div className="container header-inner">
        <Brand />
        <nav aria-label="Navigation principale" className="desktop-nav">
          <a href="/#solution">La solution</a>
          <a href="/#parcours">Comment ça marche</a>
          <a href="/#suivi">Suivre un colis</a>
        </nav>
        <div className="header-actions">
          <Link className="login-link" to="/connexion">
            Connexion
          </Link>
          <Link className="button small" to="/acces">
            Demander un accès <ArrowUpRight size={16} />
          </Link>
        </div>
        <button
          className="menu-toggle"
          aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav
            id="mobile-nav"
            aria-label="Navigation mobile"
            className="mobile-nav"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            {[
              ["La solution", "/#solution"],
              ["Comment ça marche", "/#parcours"],
              ["Suivre un colis", "/#suivi"],
              ["Connexion", "/connexion"],
              ["Demander un accès", "/acces"],
            ].map(([label, url]) => (
              <Link key={url} to={url} onClick={() => setOpen(false)}>
                {label}
              </Link>
            ))}
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
