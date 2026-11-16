import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Store,
  Truck,
  MapPin,
  ShieldCheck,
  Smartphone,
  PackageCheck,
} from "lucide-react";
import { Header } from "../components/Header";
import { Brand } from "../components/Brand";
import { TrackingForm } from "../components/TrackingForm";
import { DeliveryScene } from "../components/DeliveryScene";
import "./landing.css";

export function Landing() {
  return (
    <div className="delivery-home">
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <Header />
      <main id="contenu">
        <section className="home-hero">
          <div className="container home-hero-grid">
            <div className="home-copy">
              <span className="home-kicker">
                <span /> PLUS PROCHES DE VOS CLIENTS
              </span>
              <h1>
                Vos colis avancent.
                <br />
                <em>Vous gardez le fil.</em>
              </h1>
              <p>
                De la boutique au destinataire, retrouvez vos commandes, vos
                équipes et vos livraisons au même endroit.
              </p>
              <div className="home-actions">
                <Link className="button" to="/connexion">
                  Accéder à mon espace <ArrowUpRight size={18} />
                </Link>
                <a className="button home-secondary" href="#suivi">
                  Suivre un colis <ArrowRight size={18} />
                </a>
              </div>
              <Link className="home-join" to="/acces">
                Vous nous rejoignez ? Demander un accès{" "}
                <ArrowUpRight size={15} />
              </Link>
              <div className="home-reassurance">
                <span>
                  <ShieldCheck size={16} /> Accès professionnel sécurisé
                </span>
                <span>
                  <Smartphone size={16} /> Web & mobile
                </span>
              </div>
            </div>
            <DeliveryScene />
          </div>
        </section>
        <section className="container home-section" id="solution">
          <div className="home-heading">
            <span className="home-kicker">
              CHACUN SON ESPACE. UN MÊME MOUVEMENT.
            </span>
            <h2>
              La bonne information,
              <br />
              pour la bonne personne.
            </h2>
          </div>
          <div className="home-roles">
            {[
              {
                Icon: Store,
                title: "Vous êtes une boutique",
                text: "Créez vos commandes, choisissez votre entreprise de livraison et suivez vos envois.",
                link: "/acces",
                action: "Inscrire ma boutique",
              },
              {
                Icon: Truck,
                title: "Vous livrez au quotidien",
                text: "Organisez les commandes, affectez vos livreurs et gardez une vue sur vos opérations.",
                link: "/acces",
                action: "Accès entreprise de livraison",
              },
              {
                Icon: MapPin,
                title: "Vous attendez un colis",
                text: "Retrouvez les étapes de votre livraison grâce à votre référence et à votre accès personnel.",
                link: "/suivi",
                action: "Retrouver mon colis",
              },
            ].map(({ Icon, title, text, link, action }) => (
              <article key={title}>
                <span className="home-role-icon">
                  <Icon size={25} />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
                <Link to={link}>
                  {action}
                  <ArrowUpRight size={17} />
                </Link>
              </article>
            ))}
          </div>
        </section>
        <section className="home-path" id="parcours">
          <div className="container home-path-inner">
            <div className="home-heading">
              <span className="home-kicker">DU DÉPART À L’ARRIVÉE</span>
              <h2>
                Un parcours clair.
                <br />À chaque étape.
              </h2>
            </div>
            <ol className="home-steps">
              {[
                {
                  title: "La boutique prépare",
                  text: "Elle enregistre la commande et les informations du destinataire.",
                },
                {
                  title: "L’entreprise organise",
                  text: "Elle prend en charge la demande et affecte un livreur de son équipe.",
                },
                {
                  title: "Le colis arrive",
                  text: "Le livreur actualise les étapes et confirme la remise avec les preuves requises.",
                },
              ].map((step, i) => (
                <li key={step.title}>
                  <span>0{i + 1}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
        <section className="container home-connected" id="experience">
          <Smartphone size={28} />
          <div>
            <h2>Au bureau comme sur le terrain.</h2>
            <p>
              Un espace Web pour organiser l’activité. Une application mobile
              pour accompagner les équipes en mouvement.
            </p>
          </div>
          <Link to="/connexion" className="text-link">
            Retrouver mon espace <ArrowRight size={17} />
          </Link>
        </section>
        <section className="tracking-section" id="suivi">
          <div className="container tracking-grid">
            <div>
              <span className="home-kicker">VOTRE COLIS, SIMPLEMENT</span>
              <h2>
                Où en est
                <br />
                <span>votre livraison ?</span>
              </h2>
              <p>
                Saisissez votre référence pour accéder au parcours de suivi
                sécurisé.
              </p>
            </div>
            <TrackingForm />
          </div>
        </section>
      </main>
      <footer className="footer">
        <div className="container home-footer">
          <div>
            <Brand />
            <p>Plus proches de vos clients.</p>
          </div>
          <nav aria-label="Liens utiles">
            <Link to="/connexion">Connexion</Link>
            <Link to="/acces">Demander un accès</Link>
            <a href="#suivi">Suivre un colis</a>
          </nav>
          <span>
            <PackageCheck size={19} /> Vos équipes connectées.
          </span>
        </div>
        <div className="container footer-bottom">
          <span>
            © {new Date().getFullYear()} DND Delivery. Tous droits réservés.
          </span>
          <div>
            <Link to="/mentions-legales">Mentions légales</Link>
            <Link to="/confidentialite">Confidentialité</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
