import { useState, useEffect, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { AccountLayout } from "../layouts/AccountLayout";
import { useAuth } from "../auth/AuthProvider";
import { PasswordInput } from "../auth/PasswordInput";
import { api } from "../auth/client";
export function AuthPage() {
  const auth = useAuth(),
    location = useLocation(),
    forgot = location.pathname === "/mot-de-passe-oublie",
    reset = location.pathname === "/reinitialisation";
  const [fromLink] = useState(
    () => reset && new URLSearchParams(location.hash.slice(1)).has("token"),
  );
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [token, setToken] = useState(() => {
      if (!reset) return "";
      const value =
        new URLSearchParams(location.hash.slice(1)).get("token") ?? "";
      return value;
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (reset && location.hash)
      window.history.replaceState(null, "", location.pathname);
  }, [reset, location.hash, location.pathname]);
  if (auth.state === "authenticated" && !forgot && !reset)
    return (
      <Navigate
        to={
          auth.profile?.activeContext
            ? `/portail/${auth.profile.activeContext.portal}`
            : "/organisations"
        }
        replace
      />
    );
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setMessage("");
    if (reset && password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setBusy(true);
    try {
      if (forgot) {
        const value = await api<{ message: string }>("/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email }),
        });
        setMessage(value.message);
      } else if (reset) {
        const value = await api<{ message: string }>("/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({ token, password }),
        });
        setMessage(value.message);
        setToken("");
        setPassword("");
        setConfirm("");
        await auth.reload();
      } else await auth.login(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "La demande n’a pas abouti.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <AccountLayout>
      <section className="entry-card auth-card">
        <span className="feature-icon">
          <LockKeyhole />
        </span>
        <span className="eyebrow">VOTRE ESPACE DND DELIVERY</span>
        <h1>
          {forgot
            ? "Retrouvez votre accès."
            : reset
              ? "Un nouveau départ."
              : "Votre activité vous attend."}
        </h1>
        <p>
          {forgot
            ? "Indiquez l’adresse e-mail de votre compte professionnel."
            : reset
              ? "Choisissez un mot de passe d’au moins 12 caractères."
              : "Connectez-vous pour retrouver votre environnement de travail."}
        </p>
        <form className="auth-form" onSubmit={submit}>
          {!reset && (
            <label className="auth-field" htmlFor="email">
              Adresse e-mail
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={254}
              />
            </label>
          )}
          {reset && !fromLink && (
            <label className="auth-field" htmlFor="reset-token">
              Jeton du lien de récupération
              <input
                id="reset-token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
                autoComplete="off"
              />
            </label>
          )}
          {!forgot && (
            <PasswordInput
              id="password"
              label={reset ? "Nouveau mot de passe" : "Mot de passe"}
              value={password}
              onChange={setPassword}
              autoComplete={reset ? "new-password" : "current-password"}
              minLength={reset ? 12 : undefined}
            />
          )}
          {reset && (
            <PasswordInput
              id="confirm-password"
              label="Confirmer le mot de passe"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              minLength={12}
            />
          )}
          <p className="auth-error" role="alert">
            {error || (auth.state === "error" ? auth.error : "")}
          </p>
          <p className="auth-success" role="status">
            {message}
          </p>
          <button
            className="button"
            disabled={busy || auth.state === "loading"}
          >
            {busy
              ? "Veuillez patienter…"
              : forgot
                ? "Demander un lien"
                : reset
                  ? "Modifier le mot de passe"
                  : "Se connecter"}
          </button>
        </form>
        {!forgot && !reset && (
          <Link className="text-link" to="/inscription-boutique">
            Inscrire une boutique partenaire
          </Link>
        )}
        {!forgot && !reset && (
          <Link className="text-link" to="/acces/entreprise-livraison">
            Demander un accès entreprise de livraison
          </Link>
        )}
        {!forgot && !reset && (
          <Link className="text-link" to="/mot-de-passe-oublie">
            Mot de passe oublié ?
          </Link>
        )}
        {(forgot || reset) && (
          <Link className="text-link" to="/connexion">
            Revenir à la connexion
          </Link>
        )}
        <Link className="text-link" to="/">
          <ArrowLeft size={16} /> Retour à l’accueil
        </Link>
      </section>
    </AccountLayout>
  );
}
