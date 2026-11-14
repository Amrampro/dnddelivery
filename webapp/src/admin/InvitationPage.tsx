import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../auth/client";
import { AccountLayout } from "../layouts/AccountLayout";
import { Button, Field } from "../design/ui";
import { PasswordInput } from "../auth/PasswordInput";
import { useAuth } from "../auth/AuthProvider";
export function InvitationPage() {
  const auth = useAuth();
  const location = useLocation(),
    [token, setToken] = useState(
      () => new URLSearchParams(location.hash.slice(1)).get("token") ?? "",
    ),
    [details, setDetails] = useState<{
      companyName: string;
      email: string;
      fullName: string;
      expiresAt: string;
      kind?: string;
      existingAccount?: boolean;
    } | null>(null),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (location.hash) window.history.replaceState(null, "", location.pathname);
  }, [location.hash, location.pathname]);
  useEffect(() => {
    let disposed = false;
    if (token)
      api<{
        companyName: string;
        email: string;
        fullName: string;
        expiresAt: string;
        kind?: string;
        existingAccount?: boolean;
      }>("/invitations/inspect", {
        method: "POST",
        body: JSON.stringify({ token }),
      })
        .then((v) => {
          if (!disposed) {
            setDetails(v);
            setName(v.fullName);
          }
        })
        .catch((e) => {
          if (!disposed) setError(e.message);
        });
    return () => {
      disposed = true;
    };
  }, [token]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (details?.existingAccount) {
      setBusy(true);
      try {
        if (auth.profile?.user.email !== details.email)
          await auth.login(details.email, password);
        const result = await api<{ message: string }>(
          "/invitations/accept-existing",
          { method: "POST", body: JSON.stringify({ token }) },
        );
        await auth.reload();
        setMessage(result.message);
        setToken("");
        setPassword("");
        setDetails(null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ message: string }>("/invitations/accept", {
        method: "POST",
        body: JSON.stringify({ token, fullName: name, password }),
      });
      setMessage(result.message);
      setToken("");
      setPassword("");
      setConfirm("");
      setDetails(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Activation impossible.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AccountLayout>
      <section className="entry-card auth-card">
        <span className="eyebrow">INVITATION DND DELIVERY</span>
        <h1>Votre espace vous attend.</h1>
        {message ? (
          <>
            <p role="status">{message}</p>
            <Link className="ds-button ds-primary" to="/connexion">
              Se connecter
            </Link>
          </>
        ) : (
          <>
            {!token && (
              <p role="alert">
                Le lien d’invitation est absent. Demandez un nouveau lien à
                l’administrateur.
              </p>
            )}
            {details && (
              <>
                <p>
                  Vous êtes invité à{" "}
                  {details.kind === "STAFF" ? "rejoindre" : "administrer"}{" "}
                  <strong>{details.companyName}</strong> avec l’adresse{" "}
                  {details.email}.
                </p>
                <form onSubmit={submit} className="auth-form">
                  {!details.existingAccount && (
                    <>
                      <Field
                        label="Votre nom complet"
                        required
                        minLength={2}
                        maxLength={160}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                      <PasswordInput
                        id="invitation-password"
                        label="Créer votre mot de passe — 12 caractères minimum"
                        value={password}
                        onChange={setPassword}
                        autoComplete="new-password"
                        minLength={12}
                      />
                      <PasswordInput
                        id="invitation-confirm"
                        label="Confirmer votre mot de passe"
                        value={confirm}
                        onChange={setConfirm}
                        autoComplete="new-password"
                        minLength={12}
                      />
                    </>
                  )}
                  {details.existingAccount &&
                    auth.profile?.user.email !== details.email && (
                      <PasswordInput
                        id="staff-existing-password"
                        label="Mot de passe de votre compte existant"
                        value={password}
                        onChange={setPassword}
                        autoComplete="current-password"
                      />
                    )}
                  {details.existingAccount && (
                    <p>
                      Cette invitation ajoute une affiliation à votre compte{" "}
                      {details.email}. Votre mot de passe et vos autres
                      entreprises sont conservés.
                    </p>
                  )}
                  <Button busy={busy} type="submit">
                    {details.existingAccount
                      ? "Accepter l’affiliation"
                      : "Activer mon compte"}
                  </Button>
                </form>
                <p className="ws-disclaimer">
                  L’accès à l’entreprise dépend de son statut administratif.
                </p>
              </>
            )}
            {error && (
              <p role="alert" className="ds-error-text">
                {error}
              </p>
            )}
          </>
        )}
      </section>
    </AccountLayout>
  );
}
