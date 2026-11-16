import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AccountLayout } from "../layouts/AccountLayout";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../auth/client";
import { PasswordInput } from "../auth/PasswordInput";
import type { DeviceSession } from "../auth/types";
import { Confirm } from "../design/ui";
export function ProfilePage() {
  const auth = useAuth();
  const [confirmAll, setConfirmAll] = useState(false);
  const [fullName, setFullName] = useState(auth.profile?.user.fullName ?? ""),
    [phone, setPhone] = useState(auth.profile?.user.phone ?? ""),
    [sessions, setSessions] = useState<DeviceSession[]>([]),
    [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const loadSessions = () =>
    api<{ sessions: DeviceSession[] }>("/auth/sessions").then((v) =>
      setSessions(v.sessions),
    );
  useEffect(() => {
    void loadSessions().catch((e) => setError(e.message));
  }, []);
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "La demande a échoué.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AccountLayout>
      <section className="entry-card profile-card">
        <span className="eyebrow">MON COMPTE</span>
        <h1>Vos informations. Vos accès.</h1>
        <p>{auth.profile?.user.email}</p>
        <p role="alert" className="auth-error">
          {error}
        </p>
        <p role="status" className="auth-success">
          {message}
        </p>
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await api("/auth/me", {
                method: "PATCH",
                body: JSON.stringify({ fullName, phone: phone || null }),
              });
              await auth.reload();
              setMessage("Informations mises à jour.");
            });
          }}
        >
          <label className="auth-field">
            Nom complet
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              minLength={2}
              maxLength={160}
              autoComplete="name"
            />
          </label>
          <label className="auth-field">
            Téléphone
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={32}
              autoComplete="tel"
              type="tel"
            />
          </label>
          <button className="button" disabled={busy}>
            Enregistrer
          </button>
        </form>
        <h2>Mot de passe</h2>
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              if (next !== confirm)
                throw new Error("Les mots de passe ne correspondent pas.");
              await api("/auth/change-password", {
                method: "POST",
                body: JSON.stringify({
                  currentPassword: current,
                  newPassword: next,
                }),
              });
              await auth.reload();
            });
          }}
        >
          <PasswordInput
            id="current-password"
            label="Mot de passe actuel"
            value={current}
            onChange={setCurrent}
          />
          <PasswordInput
            id="new-password"
            label="Nouveau mot de passe — 12 caractères minimum"
            value={next}
            onChange={setNext}
            autoComplete="new-password"
            minLength={12}
          />
          <PasswordInput
            id="confirm-new-password"
            label="Confirmer le nouveau mot de passe"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            minLength={12}
          />
          <button className="button" disabled={busy}>
            Modifier et fermer les sessions
          </button>
        </form>
        <h2>Appareils connectés</h2>
        <ul className="session-list">
          {sessions.map((session) => (
            <li key={session.id}>
              <span>
                <strong>
                  {session.deviceName}
                  {session.current ? " · Cet appareil" : ""}
                </strong>
                <small>
                  {session.clientType === "WEB"
                    ? "Navigateur"
                    : "Application mobile"}{" "}
                  · Expire le{" "}
                  {new Date(session.expiresAt).toLocaleDateString("fr-FR")}
                </small>
              </span>
              <button
                className="text-link"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await api(`/auth/sessions/${session.id}`, {
                      method: "DELETE",
                    });
                    if (session.current) await auth.reload();
                    else await loadSessions();
                  })
                }
              >
                Révoquer
              </button>
            </li>
          ))}
        </ul>
        <button
          className="button"
          disabled={busy}
          onClick={() => setConfirmAll(true)}
        >
          Déconnecter tous les appareils
        </button>
        {!!auth.profile?.organizations.length && (
          <Link className="text-link" to="/organisations">
            Choisir mon environnement
          </Link>
        )}
        {auth.profile?.user.customerEnabled && (
          <Link className="text-link" to="/mes-commandes">
            Mes commandes personnelles
          </Link>
        )}
        <button
          className="text-link"
          disabled={busy}
          onClick={() => void act(auth.logout)}
        >
          Se déconnecter
        </button>
      </section>
      <Confirm
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        title="Déconnecter tous les appareils ?"
        description="Toutes vos sessions seront fermées, y compris celle de ce navigateur."
        busy={busy}
        onConfirm={() =>
          void act(async () => {
            await api("/auth/logout-all", { method: "POST", body: "{}" });
            setConfirmAll(false);
            await auth.reload();
          })
        }
      />
    </AccountLayout>
  );
}
