import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Package, Truck, MapPin, ShieldCheck } from "lucide-react";
import { api } from "../auth/client";
import { apiUrl } from "../config";
import { Brand } from "../components/Brand";
import { Button, Card, Field, ErrorState } from "../design/ui";
import { orderStatus } from "../../../shared/orders";
import type { TrackingSummary as PublicTracking } from "../../../shared/customer";
import "./tracking.css";
async function request<T>(path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(apiUrl + "/tracking" + path, {
      credentials: "include",
      method: body ? "POST" : "GET",
      headers: {
        "X-DND-Client": "web",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw Error(
      "Connexion interrompue. Les dernières informations restent affichées ; réessayez lorsque le réseau revient.",
    );
  }
  const data = await r.json().catch(() => null);
  if (!r.ok)
    throw Error(
      data?.error?.message ??
        "Suivi inaccessible. Demandez un nouveau lien personnel.",
    );
  return data as T;
}
export function TrackingPage({ customer = false }: { customer?: boolean }) {
  const params = useParams();
  const [publicInput, setPublicInput] = useState<{
    reference: string;
    email: string;
  }>();
  const secureRequest = useCallback(
    <T,>(path: string, body?: unknown): Promise<T> =>
      customer
        ? api<T>(
            "/customers/orders" + path,
            body ? { method: "POST", body: JSON.stringify(body) } : {},
          )
        : request<T>(path, body),
    [customer],
  );
  const initial = useRef(new URL(window.location.href)),
    [reference, setReference] = useState(() => {
      const url = new URL(window.location.href);
      return (
        new URLSearchParams(url.hash.slice(1)).get("reference") ??
        url.searchParams.get("reference") ??
        ""
      );
    }),
    [email, setEmail] = useState(""),
    [active, setActive] = useState(""),
    [data, setData] = useState<PublicTracking>(),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [code, setCode] = useState<{
      code: string;
      expiresAt: string;
      instruction: string;
    }>(),
    [loading, setLoading] = useState(true);
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const fragment = new URLSearchParams(initial.current.hash.slice(1));
    const ref =
        fragment.get("reference") ??
        params.reference ??
        initial.current.searchParams.get("reference"),
      secret = fragment.get("token");
    window.history.replaceState(
      null,
      "",
      window.location.pathname +
        (ref && !customer ? "?reference=" + encodeURIComponent(ref) : ""),
    );
    initial.current.hash = "";
    const start = async () => {
      try {
        if (ref && secret)
          await request("/verify", { reference: ref, token: secret });
        if (ref && (secret || customer)) {
          const next = await secureRequest<PublicTracking>(
            "/" + encodeURIComponent(ref),
          );
          setData(next);
          setActive(ref);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };
    void start();
  }, [customer, params.reference, secureRequest]);
  useEffect(() => {
    if (!active || publicInput) return;
    let stopped = false;
    const load = async () => {
      setCode(undefined);
      if (document.hidden) return;
      try {
        const next = await secureRequest<PublicTracking>(
          "/" + encodeURIComponent(active),
        );
        if (!stopped) {
          setData(next);
          setError("");
          if (!next.otpAvailable) setCode(undefined);
        }
      } catch (e) {
        if (!stopped) {
          setError((e as Error).message);
          setCode(undefined);
        }
      }
    };
    const timer = window.setInterval(() => void load(), 30000),
      expire = window.setInterval(
        () =>
          setCode((c) =>
            c && new Date(c.expiresAt).getTime() > Date.now() ? c : undefined,
          ),
        10000,
      );
    window.addEventListener("online", load);
    document.addEventListener("visibilitychange", load);
    return () => {
      stopped = true;
      clearInterval(timer);
      clearInterval(expire);
      window.removeEventListener("online", load);
      document.removeEventListener("visibilitychange", load);
    };
  }, [active, publicInput, secureRequest]);
  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const input = {
        reference: reference.trim().toUpperCase(),
        email: email.trim().toLowerCase(),
      };
      const r = await request<PublicTracking>("/status", input);
      setPublicInput(input);
      setData(r);
      setActive(r.reference);
      setCode(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setBusy(true);
    try {
      setCode(undefined);
      setData(
        publicInput
          ? await request<PublicTracking>("/status", publicInput)
          : await secureRequest<PublicTracking>(
              "/" + encodeURIComponent(active),
            ),
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="recipient-tracking">
      <header>
        <Brand />
        <span>Votre colis. Votre suivi.</span>
      </header>
      <div className="recipient-tracking-content">
        <div className="tracking-symbols" aria-hidden="true">
          <MapPin />
          <span />
          <Package size={40} />
          <span />
          <Truck />
        </div>
        <p className="eyebrow">DND DELIVERY · SUIVI PERSONNEL</p>
        <h1>{data ? "Chaque étape, en confiance." : "Suivre mon colis"}</h1>
        <p>
          {customer
            ? "Les étapes de votre livraison et votre code de remise personnel."
            : "Votre référence et votre e-mail suffisent pour consulter l'avancement, sans compte."}
        </p>
        {loading && <p role="status">Vérification de votre accès…</p>}
        {error && (
          <ErrorState
            message={error}
            retry={customer ? () => window.location.reload() : undefined}
          />
        )}
        {data ? (
          <>
            <Card>
              <div className="tracking-reference">{data.reference}</div>
              <h2>{orderStatus[data.status] ?? data.status}</h2>
              <p>{data.company && `${data.company} · ${data.shop}`}</p>
              <p>
                Enregistrée le{" "}
                {new Date(data.createdAt).toLocaleString("fr-FR")}
              </p>
              <p className="muted">
                Actualisé à{" "}
                {new Date(data.refreshedAt).toLocaleTimeString("fr-FR")} ·
                {publicInput
                  ? "Utilisez Actualiser pour consulter les dernières étapes."
                  : "Toutes les 30 secondes lorsque cette page est active."}
              </p>
              <Button
                disabled={busy}
                variant="secondary"
                onClick={() => void refresh()}
              >
                Actualiser le suivi
              </Button>
            </Card>
            {data.failure && (
              <Card>
                <h2>La remise n’a pas pu aboutir</h2>
                <p>{data.failure}</p>
              </Card>
            )}
            {data.confirmedAt && (
              <Card>
                <h2>Votre colis a été remis</h2>
                <p>
                  Confirmation enregistrée le{" "}
                  {new Date(data.confirmedAt).toLocaleString("fr-FR")}, avec les
                  preuves requises.
                </p>
              </Card>
            )}
            {data.otpAvailable && (
              <Card>
                <h2>Votre code de remise</h2>
                <p>
                  Communiquez ce code uniquement lorsque le livreur vous
                  présente votre colis.
                </p>
                {code ? (
                  <>
                    <p
                      className="recipient-otp"
                      aria-label={
                        "Code de remise : " + code.code.split("").join(" ")
                      }
                    >
                      {code.code}
                    </p>
                    <p>
                      Valable jusqu’à{" "}
                      {new Date(code.expiresAt).toLocaleTimeString("fr-FR")}.
                    </p>
                  </>
                ) : (
                  <Button
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        setCode(
                          await secureRequest(
                            "/" + encodeURIComponent(active) + "/code",
                            {},
                          ),
                        );
                        setError("");
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Afficher mon code
                  </Button>
                )}
                <p className="muted">
                  Le code de remise est distinct de votre référence de commande.
                  Il ne confirme aucun paiement.
                </p>
              </Card>
            )}
            <Card>
              <h2>Le parcours de votre colis</h2>
              <ol className="recipient-timeline">
                {data.events.map((e) => (
                  <li key={e.id}>
                    <strong>{e.label}</strong>
                    <time>{new Date(e.createdAt).toLocaleString("fr-FR")}</time>
                  </li>
                ))}
              </ol>
              <p className="muted">
                Seules les étapes enregistrées sont affichées.
              </p>
            </Card>
          </>
        ) : (
          !loading &&
          !customer && (
            <Card>
              <h2>Retrouver mon colis</h2>
              <p>
                Saisissez votre référence et l’adresse e-mail indiquée lors de
                la commande.
              </p>
              <form onSubmit={lookup}>
                <Field
                  label="Référence de commande"
                  required
                  maxLength={80}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  autoComplete="off"
                />
                <Field
                  label="Adresse e-mail de la commande"
                  required
                  type="email"
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
                <Button type="submit" disabled={busy}>
                  Suivre mon colis
                </Button>
              </form>
              {message && <p role="status">{message}</p>}
            </Card>
          )
        )}
        {publicInput && data && (
          <Card>
            <ShieldCheck />
            <h2>Votre code reste privé.</h2>
            <p>
              Retrouvez votre code de remise dans votre compte ou recevez votre
              accès personnel par e-mail.
            </p>
            <Link className="button" to="/mes-commandes">
              Mon espace client
            </Link>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  setMessage(
                    (await request<{ message: string }>("/lookup", publicInput))
                      .message,
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Recevoir mon accès par e-mail
            </Button>
            {message && <p role="status">{message}</p>}
            <Button
              variant="secondary"
              onClick={() => {
                setData(undefined);
                setActive("");
                setPublicInput(undefined);
                setMessage("");
                setError("");
              }}
            >
              Rechercher un autre colis
            </Button>
          </Card>
        )}
        {!customer && (
          <Card>
            <h2>Vos colis, réunis au même endroit.</h2>
            <p>
              Créez votre compte pour retrouver vos commandes et votre code de
              remise.
            </p>
            <Link className="text-link" to="/inscription-client">
              Créer un compte utilisateur →
            </Link>
          </Card>
        )}
        <footer>
          <p>Besoin d’aide ? Contactez votre boutique expéditrice.</p>
          <Link to={customer ? "/mes-commandes" : "/"}>
            {customer ? "Retour à mes commandes" : "Retour à l'accueil"}
          </Link>
        </footer>
      </div>
    </main>
  );
}
