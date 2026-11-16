import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Package, ArrowUpRight, MailCheck, UserRound } from "lucide-react";
import { AccountLayout } from "../layouts/AccountLayout";
import { api } from "../auth/client";
import { useAuth } from "../auth/AuthProvider";
import { Button, Field, ErrorState } from "../design/ui";
import { orderStatus } from "../../../shared/orders";
import type { CustomerOrders } from "../../../shared/customer";
import "../tracking/tracking.css";
export function CustomerRegistration() {
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get("token") || "",
  );
  const [email, setEmail] = useState(""),
    [fullName, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [terms, setTerms] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (token) window.history.replaceState(null, "", window.location.pathname);
  }, [token]);
  return (
    <AccountLayout>
      <section className="entry-card auth-card">
        <span className="feature-icon">
          <UserRound />
        </span>
        <span className="eyebrow">ESPACE CLIENT</span>
        <h1>
          {token
            ? "Votre adresse, vos colis."
            : "Tous vos colis, au même endroit."}
        </h1>
        <p>
          {token
            ? "Définissez votre mot de passe (12 caractères minimum). Si vous avez déjà un compte DND Delivery, saisissez son mot de passe habituel."
            : "Créez votre compte utilisateur pour retrouver vos commandes, leur avancement et votre code de remise. Ce compte est destiné aux destinataires, pas aux boutiques."}
        </p>
        {error && <ErrorState message={error} />}
        {message ? (
          <div role="status">
            <MailCheck />
            <p>{message}</p>
            <Link className="button" to="/connexion">
              Me connecter
            </Link>
          </div>
        ) : (
          <form
            className="auth-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              if (token && password !== confirm) {
                setError("Les mots de passe ne correspondent pas.");
                return;
              }
              setBusy(true);
              try {
                const r = await api<{ message: string }>(
                  token ? "/customers/verify" : "/customers/register",
                  {
                    method: "POST",
                    body: JSON.stringify(
                      token
                        ? { token, password }
                        : {
                            email: email.trim().toLowerCase(),
                            fullName,
                            phone,
                            termsAccepted: terms,
                          },
                    ),
                  },
                );
                setMessage(r.message);
                setPassword("");
                setConfirm("");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {token ? (
              <>
                <Field
                  label="Mot de passe"
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  value={password}
                  required
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Field
                  label="Confirmer le mot de passe"
                  type="password"
                  value={confirm}
                  required
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </>
            ) : (
              <>
                <Field
                  label="Nom complet"
                  autoComplete="name"
                  value={fullName}
                  minLength={2}
                  maxLength={160}
                  required
                  onChange={(e) => setName(e.target.value)}
                />
                <Field
                  label="Adresse e-mail"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  value={email}
                  required
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Field
                  label="Téléphone"
                  type="tel"
                  autoComplete="tel"
                  minLength={5}
                  maxLength={32}
                  value={phone}
                  required
                  onChange={(e) => setPhone(e.target.value)}
                />
                <label>
                  <input
                    type="checkbox"
                    required
                    checked={terms}
                    onChange={(e) => setTerms(e.target.checked)}
                  />{" "}
                  J'accepte la création de mon compte et le rattachement des
                  commandes envoyées à mon adresse e-mail vérifiée.
                </label>
              </>
            )}
            <Button type="submit" disabled={busy}>
              {busy
                ? "En cours…"
                : token
                  ? "Activer mon compte"
                  : "Recevoir mon e-mail de vérification"}
            </Button>
          </form>
        )}
        <p>
          <Link to="/connexion">J'ai déjà un compte</Link> ·{" "}
          <Link to="/inscription-boutique">Je suis une boutique</Link>
        </p>
      </section>
    </AccountLayout>
  );
}
export function CustomerHome() {
  const auth = useAuth();
  const [page, setPage] = useState(1),
    [data, setData] = useState<CustomerOrders>(),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    if (auth.profile?.user.customerEnabled)
      api<CustomerOrders>(`/customers/orders?page=${page}`)
        .then((v) => {
          if (live) setData(v);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [page, retry, auth.profile?.user.id, auth.profile?.user.customerEnabled]);
  function reload(nextPage = page) {
    setData(undefined);
    setError("");
    setPage(nextPage);
    setRetry((v) => v + 1);
  }
  return (
    <main className="recipient-tracking">
      <div className="recipient-tracking-content customer-content">
        <nav className="customer-nav">
          <Link to="/">DND Delivery</Link>
          <Link to="/profil">Mon profil</Link>
          {!!auth.profile?.organizations.length && (
            <Link to="/organisations">Espaces professionnels</Link>
          )}
          <button className="text-link" onClick={() => void auth.logout()}>
            Se déconnecter
          </button>
        </nav>
        <div className="tracking-hero">
          <Package size={36} />
          <span className="eyebrow">MON ESPACE CLIENT</span>
          <h1>Bonjour {auth.profile?.user.fullName}.</h1>
          <p>Vos colis et leur parcours, réunis ici.</p>
        </div>
        {!auth.profile?.user.customerEnabled ? (
          <div className="tracking-panel">
            <h2>Activez votre espace client</h2>
            <p>Vérifiez votre adresse pour retrouver vos commandes.</p>
            <Link className="button" to="/inscription-client">
              Activer mon espace client
            </Link>
          </div>
        ) : (
          <>
            {error && <ErrorState message={error} retry={() => reload()} />}
            {!data && !error && (
              <p role="status">Chargement de vos commandes…</p>
            )}
            {data && (
              <>
                <div className="customer-nav">
                  <h2>Mes commandes · {data.total}</h2>
                  <Button variant="secondary" onClick={() => reload()}>
                    Actualiser
                  </Button>
                </div>
                {!data.items.length && (
                  <div className="tracking-panel">
                    <Package />
                    <h2>Vos prochaines livraisons apparaîtront ici.</h2>
                    <p>
                      Indiquez à la boutique votre e-mail :{" "}
                      <strong>{auth.profile?.user.email}</strong>. Seules les
                      commandes envoyées à cette adresse et soumises sont
                      affichées.
                    </p>
                  </div>
                )}
                <div className="customer-orders">
                  {data.items.map((o) => (
                    <Link
                      className="tracking-panel customer-order"
                      key={o.reference}
                      to={`/mes-commandes/${encodeURIComponent(o.reference)}`}
                    >
                      <Package />
                      <span className="tracking-reference">{o.reference}</span>
                      <h2>{orderStatus[o.status] ?? o.status}</h2>
                      <p>
                        {o.shop} · {o.company}
                      </p>
                      <time>
                        {new Date(o.createdAt).toLocaleDateString("fr-FR")}
                      </time>
                      <span className="text-link">
                        Voir mon colis <ArrowUpRight size={16} />
                      </span>
                    </Link>
                  ))}
                </div>
                <nav className="customer-nav">
                  <Button
                    variant="secondary"
                    disabled={page === 1}
                    onClick={() => reload(page - 1)}
                  >
                    Précédent
                  </Button>
                  <span>Page {page}</span>
                  <Button
                    variant="secondary"
                    disabled={page * 20 >= data.total}
                    onClick={() => reload(page + 1)}
                  >
                    Suivant
                  </Button>
                </nav>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
