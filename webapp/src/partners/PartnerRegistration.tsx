import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../auth/client";
import { useAuth } from "../auth/AuthProvider";
import { PasswordInput } from "../auth/PasswordInput";
import { AccountLayout } from "../layouts/AccountLayout";
import { Button, Choice, Field, Textarea } from "../design/ui";
import "./partners.css";

function Conditions() {
  return (
    <div className="partner-terms">
      <p>
        En demandant cette inscription, vous confirmez être autorisé à
        représenter la boutique, fournir des coordonnées exactes et utiliser DND
        Delivery pour vos activités professionnelles. Les accès aux
        agences de livraison nécessitent leur accord. Vous restez responsable des accès
        confiés à votre équipe.
      </p>
      <p>
        Les informations commerciales sont communiquées aux partenaires
        autorisés pour organiser vos collaborations. Les conditions commerciales
        de livraison sont convenues avec chaque agence de livraison.
      </p>
    </div>
  );
}
export function PartnerRegistration() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const fields = Object.fromEntries(
        [
          "name",
          "email",
          "phone",
          "address",
          "countryCode",
          "city",
          "district",
          "legalName",
          "description",
          "fullName",
          "website",
        ].map((k) => [k, String(f.get(k) ?? "")]),
      );
      const result = await api<{ message: string }>("/partner-registration", {
        method: "POST",
        body: JSON.stringify({
          ...fields,
          countryCode: String(f.get("countryCode")).toUpperCase(),
          termsAccepted: f.get("termsAccepted") === "on",
        }),
      });
      setMessage(result.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AccountLayout>
      <section className="entry-card partner-subscribe">
        <span className="eyebrow">BOUTIQUE PARTENAIRE</span>
        <h1>Un compte pour toutes vos agences de livraison.</h1>
        <p>
          Créez votre identité commerciale et choisissez ensuite les entreprises
          avec lesquelles collaborer.
        </p>
        {message ? (
          <>
            <p role="status">{message}</p>
            <p>
              Consultez votre messagerie pour vérifier votre adresse et terminer
              votre inscription.
            </p>
            <Link className="ds-button ds-primary" to="/connexion">
              Se connecter
            </Link>
          </>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <div className="partner-public-grid">
              <Field
                label="Nom commercial de la boutique"
                name="name"
                required
                minLength={2}
                maxLength={160}
              />
              <Field
                label="Raison sociale facultative"
                name="legalName"
                maxLength={160}
              />
              <Field
                label="Votre nom complet"
                name="fullName"
                required
                minLength={2}
                maxLength={160}
              />
              <Field
                label="Adresse e-mail du responsable"
                name="email"
                type="email"
                required
                maxLength={254}
                hint="Vous recevrez un lien de vérification. Un compte existant sera conservé."
              />
              <Field
                label="Téléphone professionnel"
                name="phone"
                required
                minLength={5}
                maxLength={32}
              />
              <Field
                label="Pays — code à deux lettres"
                name="countryCode"
                required
                minLength={2}
                maxLength={2}
                placeholder="CM"
              />
              <Field label="Ville" name="city" required maxLength={120} />
              <Field label="Quartier" name="district" maxLength={120} />
              <div className="partner-full">
                <Field
                  label="Adresse"
                  name="address"
                  required
                  maxLength={500}
                />
              </div>
              <div className="partner-full">
                <Textarea
                  label="Présentation facultative"
                  name="description"
                  maxLength={2000}
                />
              </div>
            </div>
            <div className="partner-honeypot" aria-hidden="true">
              <label>
                Site Internet
                <input name="website" autoComplete="off" tabIndex={-1} />
              </label>
            </div>
            <Conditions />
            <Choice
              label="J’accepte les conditions d’inscription ci-dessus et confirme mon autorisation de représenter cette boutique."
              name="termsAccepted"
              required
            />
            {error && (
              <p role="alert" className="ds-error-text">
                {error}
              </p>
            )}
            <Button type="submit" busy={busy}>
              Vérifier mon adresse e-mail
            </Button>
            <p>
              Déjà inscrit ? <Link to="/connexion">Connectez-vous</Link>.
            </p>
          </form>
        )}
      </section>
    </AccountLayout>
  );
}

type Inspection = {
  kind: "REGISTRATION" | "USER" | "PARTNER";
  email: string;
  name: string;
  fullName?: string;
  existingAccount: boolean;
  role?: string;
  expiresAt?: string;
};
export function PartnerInvitation() {
  const auth = useAuth(),
    location = useLocation();
  const [token, setToken] = useState(
      () => new URLSearchParams(location.hash.slice(1)).get("token") ?? "",
    ),
    [details, setDetails] = useState<Inspection | null>(null),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (location.hash) window.history.replaceState(null, "", location.pathname);
  }, [location.hash, location.pathname]);
  useEffect(() => {
    let stopped = false;
    if (token)
      api<Inspection>("/partner-registration/inspect", {
        method: "POST",
        body: JSON.stringify({ token }),
      })
        .then((d) => {
          if (!stopped) {
            setDetails(d);
            setName(d.fullName ?? "");
          }
        })
        .catch((e) => {
          if (!stopped) setError(e.message);
        });
    return () => {
      stopped = true;
    };
  }, [token]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!details) return;
    const f = new FormData(e.currentTarget);
    setError("");
    if (!details.existingAccount && password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setBusy(true);
    try {
      if (details.existingAccount && auth.profile?.user.email !== details.email)
        await auth.login(details.email, password);
      const result = await api<{ message: string }>(
        details.existingAccount
          ? "/partner-registration/accept-existing"
          : "/partner-registration/accept",
        {
          method: "POST",
          body: JSON.stringify({
            token,
            termsAccepted: f.get("termsAccepted") === "on",
            ...(!details.existingAccount ? { fullName: name, password } : {}),
            ...(details.kind === "PARTNER"
              ? {
                  profile: Object.fromEntries(
                    [
                      "name",
                      "email",
                      "phone",
                      "address",
                      "countryCode",
                      "city",
                      "district",
                      "legalName",
                      "description",
                    ].map((k) => [
                      k,
                      k === "countryCode"
                        ? String(f.get(k) ?? "").toUpperCase()
                        : String(f.get(k) ?? ""),
                    ]),
                  ),
                }
              : {}),
          }),
        },
      );
      setMessage(result.message);
      setToken("");
      setDetails(null);
      setPassword("");
      setConfirm("");
      if (details.existingAccount) await auth.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AccountLayout>
      <section className="entry-card auth-card">
        <span className="eyebrow">BOUTIQUE DND DELIVERY</span>
        <h1>
          {details?.kind === "USER"
            ? "Rejoindre votre boutique."
            : "Confirmer votre inscription."}
        </h1>
        {message ? (
          <>
            <p role="status">{message}</p>
            <Link
              className="ds-button ds-primary"
              to={
                auth.state === "authenticated" ? "/organisations" : "/connexion"
              }
            >
              {auth.state === "authenticated"
                ? "Ouvrir mes espaces"
                : "Se connecter"}
            </Link>
          </>
        ) : (
          <>
            {!token && (
              <p role="alert">
                Ce lien est absent. Utilisez le lien reçu par e-mail ou demandez
                une nouvelle invitation.
              </p>
            )}
            {details ? (
              <>
                <p>
                  Pour <strong>{details.name}</strong>, avec l’adresse{" "}
                  <strong>{details.email}</strong>.
                </p>
                {details.kind === "PARTNER" && (
                  <p>
                    L’inscription prépare une demande de collaboration. La
                    boutique doit encore donner son accord depuis son espace.
                  </p>
                )}
                <form className="auth-form" onSubmit={submit}>
                  {details.existingAccount ? (
                    <>
                      {auth.profile?.user.email !== details.email && (
                        <PasswordInput
                          id="partner-existing-password"
                          label="Mot de passe de votre compte existant"
                          value={password}
                          onChange={setPassword}
                          autoComplete="current-password"
                        />
                      )}
                      <p>
                        Votre compte existant, votre mot de passe et vos autres
                        affiliations sont conservés.
                      </p>
                    </>
                  ) : (
                    <>
                      <Field
                        label="Votre nom complet"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        minLength={2}
                        maxLength={160}
                      />
                      <PasswordInput
                        id="partner-new-password"
                        label="Créer votre mot de passe — 12 caractères minimum"
                        value={password}
                        onChange={setPassword}
                        autoComplete="new-password"
                        minLength={12}
                      />
                      <PasswordInput
                        id="partner-confirm-password"
                        label="Confirmer votre mot de passe"
                        value={confirm}
                        onChange={setConfirm}
                        autoComplete="new-password"
                        minLength={12}
                      />
                    </>
                  )}
                  {details.kind === "PARTNER" && (
                    <div className="partner-public-grid">
                      <Field
                        name="name"
                        label="Nom commercial"
                        defaultValue={details.name}
                        required
                        minLength={2}
                        maxLength={160}
                      />
                      <Field
                        name="legalName"
                        label="Raison sociale facultative"
                        maxLength={160}
                      />
                      <Field
                        name="email"
                        label="E-mail professionnel"
                        defaultValue={details.email}
                        type="email"
                        required
                      />
                      <Field
                        name="phone"
                        label="Téléphone professionnel"
                        required
                        minLength={5}
                        maxLength={32}
                      />
                      <Field
                        name="countryCode"
                        label="Pays — code à deux lettres"
                        required
                        minLength={2}
                        maxLength={2}
                      />
                      <Field
                        name="city"
                        label="Ville"
                        required
                        maxLength={120}
                      />
                      <Field name="district" label="Quartier" maxLength={120} />
                      <Field
                        name="address"
                        label="Adresse"
                        required
                        maxLength={500}
                      />
                      <Textarea
                        name="description"
                        label="Présentation facultative"
                        maxLength={2000}
                      />
                    </div>
                  )}
                  <Conditions />
                  <Choice
                    name="termsAccepted"
                    label="J’accepte les conditions d’inscription et confirme être autorisé à rejoindre cette boutique."
                    required
                  />
                  <Button type="submit" busy={busy}>
                    {details.existingAccount
                      ? "Confirmer avec mon compte"
                      : "Vérifier et activer mon compte"}
                  </Button>
                </form>
              </>
            ) : (
              token && !error && <p role="status">Vérification du lien…</p>
            )}
            {error && (
              <p role="alert" className="ds-error-text">
                {error}
              </p>
            )}
            <Link to="/connexion">Retour à la connexion</Link>
          </>
        )}
      </section>
    </AccountLayout>
  );
}
