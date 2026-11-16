import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, ArrowUpRight } from "lucide-react";
import { AccountLayout } from "../layouts/AccountLayout";
import { useAuth } from "../auth/AuthProvider";
export function Organizations() {
  const auth = useAuth(),
    navigate = useNavigate();
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  async function choose(key: string) {
    setBusy(key);
    setError("");
    try {
      const profile = await auth.select(key);
      if (profile.activeContext)
        navigate(`/portail/${profile.activeContext.portal}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Accès indisponible.");
    } finally {
      setBusy("");
    }
  }
  return (
    <AccountLayout>
      <section className="entry-card organizations-card">
        <span className="eyebrow">BONJOUR {auth.profile?.user.fullName}</span>
        <h1>Votre environnement de travail.</h1>
        <p>
          Choisissez une entreprise, une agence ou une boutique parmi vos accès
          autorisés.
        </p>
        <p role="alert" className="auth-error">
          {error}
        </p>
        <div className="organization-list">
          {auth.profile?.user.customerEnabled && (
            <Link className="organization-option" to="/mes-commandes">
              Mon espace client · Mes commandes <ArrowUpRight size={19} />
            </Link>
          )}
          {auth.profile?.organizations.map((context) => (
            <button
              className="organization-option"
              key={context.key}
              disabled={!!busy}
              onClick={() => void choose(context.key)}
            >
              <Building2 size={23} />
              <span>
                <strong>{context.companyName}</strong>
                <span>
                  {context.agencyName ?? context.shopName ?? context.roleName}
                </span>
                <small>{context.roleName}</small>
              </span>
              <ArrowUpRight size={19} />
              {busy === context.key && <small>Ouverture…</small>}
            </button>
          ))}
        </div>
        {!auth.profile?.organizations.length && (
          <p>
            Aucun accès professionnel actif. Contactez votre administrateur pour
            vérifier vos affiliations.
          </p>
        )}
        {!!auth.profile?.unavailableOrganizations?.length && (
          <section aria-label="Espaces indisponibles">
            <h2>Vos espaces indisponibles</h2>
            {auth.profile.unavailableOrganizations.map((org, index) => (
              <p key={`${org.kind}:${index}`}>
                <strong>{org.name}</strong> —{" "}
                {org.status === "INACTIVE"
                  ? "désactivée : l'administrateur global doit activer cet espace."
                  : org.status === "SUSPENDED"
                    ? "suspendue : contactez l'administrateur global."
                    : "archivée : cet espace n'est plus accessible."}
              </p>
            ))}
          </section>
        )}
        <button
          className="text-link"
          disabled={!!busy}
          onClick={async () => {
            setBusy("refresh");
            setError("");
            try {
              await auth.reload();
            } catch {
              setError("Impossible d'actualiser vos accès.");
            } finally {
              setBusy("");
            }
          }}
        >
          Actualiser mes accès
        </button>
        <Link className="text-link" to="/profil">
          Mon profil et mes sessions
        </Link>
        <button
          className="text-link"
          onClick={() => void auth.logout().catch((e) => setError(e.message))}
        >
          Se déconnecter
        </button>
      </section>
    </AccountLayout>
  );
}
