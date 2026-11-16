import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Store } from "lucide-react";
import { Brand } from "../components/Brand";
import { Button, Field } from "../design/ui";
import { api } from "../auth/client";
import "../orders/orders.css";

export function AccessChoice() {
  return (
    <main className="entry-page">
      <Brand />
      <div className="entry-card">
        <span className="eyebrow">REJOINDRE DND DELIVERY</span>
        <h1>Quel est votre profil ?</h1>
        <p>
          Choisissez l’activité de votre organisation pour accéder au bon
          formulaire.
        </p>
        <Link className="button" to="/acces/entreprise-livraison">
          <Building2 size={20} /> Je suis une entreprise de livraison
        </Link>
        <p>
          Vous organisez les livraisons et gérez des agences ou des livreurs.
          Votre demande sera examinée par l’administration.
        </p>
        <Link className="button" to="/inscription-boutique">
          <Store size={20} /> Je suis une boutique
        </Link>
        <p>
          Vous vendez des articles et confiez vos commandes à une entreprise de
          livraison.
        </p>
        <Link className="text-link" to="/connexion">
          J’ai déjà un compte : me connecter
        </Link>
        <Link className="text-link" to="/">
          Retour à l’accueil
        </Link>
      </div>
    </main>
  );
}

export function CompanyAccessForm() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const lock = useRef(false);
  return (
    <main className="entry-page">
      <Brand />
      <div className="entry-card">
        <span className="eyebrow">ENTREPRISE DE LIVRAISON</span>
        <h1>Demander votre accès professionnel.</h1>
        <p>
          Ce formulaire est réservé aux entreprises qui assurent les livraisons.
          Aucun compte n’est activé avant validation par l’administration.
        </p>
        <Link className="text-link" to="/inscription-boutique">
          Vous êtes une boutique ? Inscrivez votre boutique ici.
        </Link>
        {success ? (
          <div role="status">
            <h2>Demande prise en compte</h2>
            <p>{success}</p>
            <p>
              Après acceptation, un nouveau responsable reçoit une invitation
              par e-mail. Si vous possédez déjà un compte avec cette adresse,
              l’accès y sera rattaché.
            </p>
          </div>
        ) : (
          <form
            className="order-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (lock.current) return;
              const data = new FormData(e.currentTarget);
              lock.current = true;
              setBusy(true);
              setError("");
              try {
                const body = Object.fromEntries(data.entries());
                const result = await api<{ message: string }>(
                  "/company-access-requests",
                  {
                    method: "POST",
                    body: JSON.stringify({
                      ...body,
                      email: String(body.email).trim().toLowerCase(),
                      countryCode: String(body.countryCode)
                        .trim()
                        .toUpperCase(),
                      description: body.description || undefined,
                      organizationType: "DELIVERY_COMPANY",
                      confirmedDeliveryCompany:
                        data.get("confirmedDeliveryCompany") === "on",
                    }),
                  },
                );
                setSuccess(result.message);
              } catch (err) {
                setError((err as Error).message);
              } finally {
                lock.current = false;
                setBusy(false);
              }
            }}
          >
            <Field
              label="Nom de l’entreprise de livraison"
              name="name"
              required
              maxLength={160}
              autoComplete="organization"
            />
            <Field
              label="Nom complet du responsable"
              name="fullName"
              required
              minLength={2}
              maxLength={160}
              autoComplete="name"
            />
            <Field
              label="E-mail du responsable"
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
            />
            <Field
              label="Téléphone professionnel"
              name="phone"
              type="tel"
              required
              maxLength={32}
              autoComplete="tel"
            />
            <Field
              label="Pays (code à deux lettres, par exemple CM ou BE)"
              name="countryCode"
              required
              minLength={2}
              maxLength={2}
              pattern="[A-Za-z]{2}"
              autoComplete="country"
            />
            <Field
              label="Ville"
              name="city"
              required
              maxLength={120}
              autoComplete="address-level2"
            />
            <Field
              label="Adresse de l’entreprise"
              name="address"
              required
              maxLength={500}
              autoComplete="street-address"
            />
            <Field
              label="Présentation de votre activité (facultatif)"
              name="description"
              maxLength={2000}
            />
            <label>
              <input type="checkbox" name="confirmedDeliveryCompany" required />{" "}
              Je confirme représenter une entreprise de livraison et non une
              boutique expédiant ses produits.
            </label>
            <p>
              Ces informations permettent à l’administration d’examiner votre
              demande et de configurer votre accès.
            </p>
            {error && <p role="alert">{error}</p>}
            <Button type="submit" busy={busy} disabled={busy}>
              Envoyer ma demande d’entreprise de livraison
            </Button>
          </form>
        )}
        <Link className="text-link" to="/acces">
          Changer de profil
        </Link>
        <Link className="text-link" to="/connexion">
          Se connecter
        </Link>
      </div>
    </main>
  );
}
