import { motion } from "motion/react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  Smartphone,
  Globe2,
  ShieldCheck,
  Layers3,
  Truck,
} from "lucide-react";
import { Header } from "../components/Header";
import { Brand } from "../components/Brand";
import { DashboardPreview } from "../components/DashboardPreview";
import { TrackingForm } from "../components/TrackingForm";
import { features, steps } from "../data";
const reveal = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.15 },
  transition: { duration: 0.45 },
};
export function Landing() {
  return (
    <>
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <Header />
      <main id="contenu">
        <section className="hero">
          <div className="container hero-grid">
            <motion.div {...reveal} className="hero-copy">
              <span className="eyebrow">
                <span className="live-dot" /> LA LOGISTIQUE, MIEUX CONNECTÉE
              </span>
              <h1>
                Toute votre
                <br />
                logistique.
                <br />
                <span>
                  Une seule
                  <br className="desktop-break" /> plateforme.
                </span>
              </h1>
              <p>
                Centralisez vos agences, commandes, stocks, livreurs et
                opérations de livraison dans une solution intelligente,
                accessible partout.
              </p>
              <div className="hero-actions">
                <a className="button" href="#solution">
                  Découvrir la plateforme <ArrowRight size={18} />
                </a>
                <Link className="text-link" to="/acces">
                  Demander un accès <ArrowUpRight size={17} />
                </Link>
              </div>
              <div className="hero-notes">
                <span>
                  <Check /> Pensée pour vos équipes
                </span>
                <span>
                  <Check /> Web & mobile
                </span>
              </div>
            </motion.div>
            <motion.div
              {...reveal}
              transition={{ delay: 0.15, duration: 0.6 }}
              className="hero-visual"
            >
              <div className="visual-caption">
                <span className="line" /> UNE VISION CLAIRE. DU DÉPART À
                L’ARRIVÉE.
              </div>
              <DashboardPreview />
              <div className="floating-chip">
                <span className="chip-icon">
                  <PackageIcon />
                </span>
                <div>
                  Moins de dispersion.<strong>Plus de mouvement.</strong>
                </div>
                <span className="chip-arrow">↗</span>
              </div>
              <div className="visual-footnote">
                Aperçu de l’expérience cible · Données fictives
              </div>
            </motion.div>
          </div>
          <div className="container hero-bottom">
            <span>UN ÉCOSYSTÈME. TOUTE VOTRE ACTIVITÉ.</span>
            <div>
              <BuildingLabel text="Agences" />
              <BuildingLabel text="Boutiques" />
              <BuildingLabel text="Livreurs" />
              <BuildingLabel text="Destinataires" />
            </div>
          </div>
        </section>
        <section className="section container" id="solution">
          <motion.div {...reveal} className="section-heading">
            <div>
              <span className="eyebrow">01 / LA SOLUTION</span>
              <h2>
                Tout s’articule.
                <br />
                <span>Tout devient plus simple.</span>
              </h2>
            </div>
            <p>
              Votre activité avance mieux quand l’information circule. DND
              Delivery prépare un espace commun pour chaque maillon de votre
              logistique.
            </p>
          </motion.div>
          <div className="feature-grid">
            {features.map(({ icon: Icon, title, text }, i) => (
              <motion.article {...reveal} key={title} className="feature-card">
                <div className="feature-top">
                  <span className="feature-icon">
                    <Icon size={24} />
                  </span>
                  <span className="feature-number">0{i + 1}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
                <span className="feature-line" />
              </motion.article>
            ))}
          </div>
          <p className="section-note">
            Les modules présentés constituent la vision produit. Leur
            intégration métier sera réalisée progressivement.
          </p>
        </section>
        <section className="journey section" id="parcours">
          <div className="container">
            <motion.div {...reveal} className="center-heading">
              <span className="eyebrow">02 / UN PARCOURS CONNECTÉ</span>
              <h2>
                De votre première agence
                <br />
                au dernier kilomètre.
              </h2>
              <p>Un fonctionnement pensé pour que chacun sache où aller.</p>
            </motion.div>
            <div className="steps">
              {steps.map((s, i) => (
                <motion.div {...reveal} className="step" key={s}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <h3>{s}</h3>
                  <p>
                    {
                      [
                        "Votre entreprise dispose de son point de départ.",
                        "Votre réseau prend forme.",
                        "Vos boutiques lancent le mouvement.",
                        "Vos responsables organisent le terrain.",
                        "Vos livreurs prennent le relais.",
                        "Vos destinataires gardent le fil.",
                      ][i]
                    }
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
        <section className="section container experience" id="experience">
          <motion.div {...reveal} className="experience-visual">
            <div className="mini-desktop">
              <DashboardPreview compact />
            </div>
            <div className="phone">
              <div className="phone-notch" />
              <div className="phone-top">
                <img src="/logo%20square.jpg" alt="DND Delivery" />
                <span>9:41</span>
              </div>
              <small>VOTRE JOURNÉE, SIMPLIFIÉE</small>
              <h3>
                Prêt pour
                <br />
                le prochain départ ?
              </h3>
              <div className="phone-card">
                <Truck />
                <strong>Votre espace terrain</strong>
                <p>Vos missions à portée de main.</p>
                <span>
                  À venir <ArrowUpRight size={16} />
                </span>
              </div>
              <div className="phone-placeholder">
                <span />
                <span />
                <span />
              </div>
              <p className="phone-demo">MAQUETTE DE DÉMONSTRATION</p>
            </div>
          </motion.div>
          <motion.div {...reveal} className="experience-copy">
            <span className="eyebrow">03 / PARTOUT AVEC VOUS</span>
            <h2>
              Au bureau.
              <br />
              Sur le terrain.
              <br />
              <span>Toujours connectés.</span>
            </h2>
            <p>
              Un espace Web pour prendre de la hauteur. Une expérience mobile
              pour accompagner le mouvement. La même clarté, quel que soit votre
              écran.
            </p>
            <ul className="benefits">
              <li>
                <Globe2 /> Un pilotage central depuis le Web
              </li>
              <li>
                <Smartphone /> Une expérience pensée pour le terrain
              </li>
              <li>
                <Layers3 /> Une identité commune à toute l’équipe
              </li>
            </ul>
            <Link to="/acces" className="text-link">
              Découvrir votre futur espace <ArrowRight size={17} />
            </Link>
          </motion.div>
        </section>
        <section className="tracking-section" id="suivi">
          <div className="container tracking-grid">
            <div>
              <span className="eyebrow">04 / GARDER LE FIL</span>
              <h2>
                Un colis en route ?<br />
                <span>Tout commence ici.</span>
              </h2>
              <p>
                Le futur point de repère de vos destinataires.
                <br />
                Un accès simple au parcours de leur colis.
              </p>
            </div>
            <TrackingForm />
          </div>
        </section>
        <section className="section container">
          <motion.div {...reveal} className="cta">
            <div className="cta-orbit" aria-hidden="true" />
            <span className="eyebrow">LE PROCHAIN DÉPART, C’EST LE VÔTRE.</span>
            <h2>
              Donnez une nouvelle
              <br />
              direction à votre logistique.
            </h2>
            <p>
              Une plateforme pensée pour les entreprises qui font avancer les
              choses.
            </p>
            <Link className="button light" to="/acces">
              Rejoindre DND Delivery <ArrowUpRight size={18} />
            </Link>
            <span className="cta-note">
              <ShieldCheck size={15} /> Accès aux entreprises · Plateforme en
              préparation
            </span>
          </motion.div>
        </section>
      </main>
      <footer className="footer">
        <div className="container footer-main">
          <div>
            <Brand />
            <p>
              Plus proches de vos clients.
              <br />
              Plus connectés à votre activité.
            </p>
          </div>
          <div>
            <strong>La plateforme</strong>
            <a href="#solution">La solution</a>
            <a href="#parcours">Comment ça marche</a>
            <a href="#experience">Web & mobile</a>
          </div>
          <div>
            <strong>Votre espace</strong>
            <Link to="/connexion">Connexion</Link>
            <a href="#suivi">Suivre un colis</a>
            <Link to="/acces">Demander un accès</Link>
          </div>
          <div className="footer-tag">
            <span className="live-dot" /> Le mouvement commence ici.
          </div>
        </div>
        <div className="container footer-bottom">
          <span>
            © {new Date().getFullYear()} DND Delivery. Tous droits réservés.
          </span>
          <div>
            <Link to="/mentions-legales">Mentions légales</Link>
            <Link to="/confidentialite">Confidentialité</Link>
          </div>
          <span>Conçu pour aller plus loin ↗</span>
        </div>
      </footer>
    </>
  );
}
function BuildingLabel({ text }: { text: string }) {
  return (
    <span>
      <span className="tiny-cross">+</span>
      {text}
    </span>
  );
}
function PackageIcon() {
  return <Layers3 size={23} />;
}
