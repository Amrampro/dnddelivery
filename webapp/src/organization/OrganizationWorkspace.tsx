import { useState, type FormEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api } from "../auth/client";
import type { Workspace } from "../auth/types";
import { useResource } from "../admin/useResource";
import { ConfirmAction, type AdminAction } from "../admin/ConfirmAction";
import { CompanyStatus } from "../admin/components";
import {
  Button,
  Card,
  Field,
  Select,
  Textarea,
  ErrorState,
  Skeleton,
  Badge,
} from "../design/ui";
import {
  organizationLabel as label,
  organizationActions,
  organizationHistoryDetail,
  type Agency,
  type CompanyProfile,
  type DriverProfile,
  type Employee,
  type Page,
  type StaffInvitation,
} from "../../../shared/organization";
import "../admin/admin.css";
import "./organization.css";
const dates = (v: string | null) =>
  v ? new Date(v).toLocaleString("fr-FR") : "—";
const roles = ["employee", "agency_manager", "stock_manager", "courier"];
function Pager({
  page,
  total,
  setPage,
}: {
  page: number;
  total: number;
  setPage: (v: number) => void;
}) {
  return (
    <div className="admin-toolbar">
      <Button
        type="button"
        variant="secondary"
        disabled={page === 1}
        onClick={() => setPage(page - 1)}
      >
        Précédent
      </Button>
      <span>
        Page {page} · {total} résultat(s)
      </span>
      <Button
        type="button"
        variant="secondary"
        disabled={page * 15 >= total}
        onClick={() => setPage(page + 1)}
      >
        Suivant
      </Button>
    </div>
  );
}
function AgencySelector({
  selected,
  setSelected,
  initial = [],
}: {
  selected: string[];
  setSelected: (v: string[]) => void;
  initial?: { id: string; name: string }[];
}) {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1);
  const r = useResource<Page<Agency>>(
    `/company/agencies?status=ACTIVE&q=${encodeURIComponent(q)}&page=${page}`,
  );
  return (
    <fieldset className="org-agency-selector">
      <legend>Rattachements aux agences</legend>
      <p>
        {selected.length} agence(s) sélectionnée(s). Les affectations sont
        limitées aux agences actives de cette entreprise. Pour un livreur, ces rattachements sont facultatifs : il peut recevoir des missions de toute l’entreprise, même sans agence sélectionnée.
      </p>
      <div className="org-chips">
        {selected.map((id) => (
          <Button
            type="button"
            variant="secondary"
            key={id}
            onClick={() => setSelected(selected.filter((x) => x !== id))}
          >
            {initial.find((a) => a.id === id)?.name ??
              r.data?.items.find((a) => a.id === id)?.name ??
              id}{" "}
            ×
          </Button>
        ))}
      </div>
      <Field
        label="Rechercher une agence à affecter"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
      />
      {r.error ? (
        <ErrorState message={r.error} retry={r.reload} />
      ) : !r.data ? (
        <Skeleton rows={2} />
      ) : (
        <>
          <div className="org-checkboxes">
            {r.data.items.map((a) => (
              <label key={a.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(a.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, a.id]
                        : selected.filter((x) => x !== a.id),
                    )
                  }
                />
                {a.name} · {a.reference}
              </label>
            ))}
          </div>
          <Pager page={page} total={r.data.total} setPage={setPage} />
        </>
      )}
    </fieldset>
  );
}
function ProfilePage({ can }: { can: (p: string) => boolean }) {
  const r = useResource<CompanyProfile>("/company/profile"),
    [edit, setEdit] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  if (r.error) return <ErrorState message={r.error} retry={r.reload} />;
  if (!r.data) return <Skeleton />;
  const p = r.data;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const saved = await api<CompanyProfile>("/company/profile", {
        method: "PATCH",
        body: JSON.stringify({
          version: p.version,
          tradeName: f.get("tradeName") || null,
          address: f.get("address"),
          phone: f.get("phone"),
          email: f.get("email"),
          city: f.get("city"),
          countryCode: String(f.get("countryCode")).toUpperCase(),
          description: f.get("description") || null,
        }),
      });
      const logo = f.get("logo");
      if (logo instanceof File && logo.size) {
        try {
          await api<CompanyProfile>("/company/profile/logo", {
            method: "PUT",
            body: logo,
            headers: {
              "Content-Type": logo.type,
              "X-Company-Version": String(saved.version),
            },
          });
        } catch (e) {
          setNotice(
            `Profil enregistré. Le logo doit être repris : ${(e as Error).message}`,
          );
          setEdit(false);
          r.reload();
          return;
        }
      }
      setNotice("Profil de l’entreprise enregistré.");
      setEdit(false);
      r.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Mon entreprise</h1>
      {notice && <p role="status">{notice}</p>}
      <Card title={p.name}>
        <CompanyStatus
          status={p.status as "ACTIVE" | "INACTIVE" | "SUSPENDED" | "ARCHIVED"}
        />
        <p>
          Référence : {p.reference}. Identité et statut administratifs réservés
          à l’administration globale.
        </p>
        {edit ? (
          <form className="admin-form org-form" onSubmit={submit}>
            <Field
              name="tradeName"
              label="Nom commercial"
              defaultValue={p.tradeName ?? ""}
              maxLength={160}
            />
            {(
              ["address", "phone", "email", "city", "countryCode"] as const
            ).map((name) => (
              <Field
                key={name}
                name={name}
                label={
                  {
                    address: "Adresse du siège",
                    phone: "Téléphone",
                    email: "E-mail",
                    city: "Ville",
                    countryCode: "Pays (code ISO à deux lettres)",
                  }[name]
                }
                defaultValue={p[name]}
                required
                type={name === "email" ? "email" : "text"}
                maxLength={
                  name === "countryCode" ? 2 : name === "address" ? 500 : 160
                }
              />
            ))}
            <Textarea
              label="Description"
              name="description"
              defaultValue={p.description ?? ""}
              maxLength={2000}
            />
            <Field
              name="logo"
              type="file"
              label="Logo facultatif — PNG, JPEG ou WebP, 2 Mo maximum"
              accept="image/png,image/jpeg,image/webp"
            />
            {error && <p role="alert">{error}</p>}
            <div className="ds-actions">
              <Button type="submit" busy={busy}>
                Enregistrer le profil
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => setEdit(false)}
              >
                Annuler
              </Button>
            </div>
          </form>
        ) : (
          <>
            <dl className="org-details">
              {[
                ["Nom commercial", p.tradeName],
                ["Adresse du siège", p.address],
                ["Téléphone", p.phone],
                ["E-mail", p.email],
                ["Ville / pays", `${p.city} · ${p.countryCode}`],
                ["Description", p.description],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v || "—"}</dd>
                </div>
              ))}
            </dl>
            <PrivateLogo url={p.logoUrl} />
            {can("company.profile.write") && (
              <Button onClick={() => setEdit(true)}>
                Modifier les informations autorisées
              </Button>
            )}
          </>
        )}
      </Card>
    </>
  );
}
function PrivateLogo({ url }: { url: string | null }) {
  const r = useResource<{ mime: string; image: string }>(
    url ?? "/company/profile/logo",
  );
  if (!url) return <p>Aucun logo associé.</p>;
  return r.data ? (
    <img
      className="org-logo"
      alt="Logo de votre entreprise"
      src={`data:${r.data.mime};base64,${r.data.image}`}
    />
  ) : (
    <p>{r.error ? "Logo indisponible." : "Chargement du logo…"}</p>
  );
}
function AgencyForm({ initial, done }: { initial?: Agency; done: () => void }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    navigate = useNavigate(),
    { role: currentRole } = useParams();
  const fields = [
    ["reference", "Référence dans l’entreprise"],
    ["name", "Nom de l’agence"],
    ["phone", "Téléphone"],
    ["email", "E-mail (facultatif)"],
    ["countryCode", "Pays (code ISO)"],
    ["city", "Ville"],
    ["zone", "Quartier (facultatif)"],
    ["address", "Adresse"],
    ["locationNotes", "Précisions de localisation (facultatif)"],
  ] as const;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget),
      payload = Object.fromEntries(
        fields.map(([name]) => [
          name,
          ["email", "zone", "locationNotes"].includes(name)
            ? f.get(name) || null
            : f.get(name),
        ]),
      );
    try {
      const a = await api<Agency>(
        `/company/agencies${initial ? "/" + initial.id : ""}`,
        {
          method: initial ? "PATCH" : "POST",
          body: JSON.stringify({
            ...payload,
            ...(initial ? { version: initial.version } : {}),
          }),
        },
      );
      done();
      navigate(`/portail/${currentRole}/agences/${a.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="admin-form org-form" onSubmit={submit}>
      {fields.map(([name, title]) => (
        <Field
          key={name}
          label={title}
          name={name}
          defaultValue={initial?.[name] ?? ""}
          required={!["email", "zone", "locationNotes"].includes(name)}
          maxLength={
            name === "countryCode"
              ? 2
              : name === "locationNotes"
                ? 1000
                : name === "address"
                  ? 500
                  : 160
          }
          type={name === "email" ? "email" : "text"}
        />
      ))}
      {error && <p role="alert">{error}</p>}
      <Button type="submit" busy={busy}>
        {initial ? "Enregistrer les modifications" : "Créer l’agence"}
      </Button>
    </form>
  );
}
function Agencies({
  base,
  can,
}: {
  base: string;
  can: (p: string) => boolean;
}) {
  const [page, setPage] = useState(1),
    [q, setQ] = useState(""),
    [status, setStatus] = useState("");
  const r = useResource<Page<Agency>>(
    `/company/agencies?page=${page}&q=${encodeURIComponent(q)}${status ? "&status=" + status : ""}`,
  );
  return (
    <>
      <header className="ws-page-title">
        <h1>Agences</h1>
        {can("agencies.create") && (
          <Link
            className="ds-button ds-primary"
            to={`${base}/agences/nouvelle`}
          >
            Créer une agence
          </Link>
        )}
      </header>
      <Card title="Les agences de votre périmètre">
        <div className="admin-toolbar">
          <Field
            label="Rechercher une agence"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
          <Select
            label="Statut"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tous</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
        </div>
        {r.error ? (
          <ErrorState message={r.error} retry={r.reload} />
        ) : !r.data ? (
          <Skeleton />
        ) : (
          <>
            <div className="ds-table-wrap">
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>Agence</th>
                    <th>Localisation</th>
                    <th>Contact</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {r.data.items.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <Link to={`${base}/agences/${a.id}`}>{a.name}</Link>
                        <br />
                        {a.reference}
                      </td>
                      <td>
                        {a.city} · {a.countryCode ?? "—"}
                      </td>
                      <td>
                        {a.phone}
                        <br />
                        {a.email ?? "—"}
                      </td>
                      <td>
                        <Badge>{label(a.status)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!r.data.items.length && <p>Aucune agence correspondante.</p>}
            <Pager page={page} total={r.data.total} setPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
function AgencyDetail({
  id,
  base,
  can,
  canViewTeam,
}: {
  id: string;
  base: string;
  can: (p: string) => boolean;
  canViewTeam: boolean;
}) {
  const r = useResource<Agency>(`/company/agencies/${id}`),
    [edit, setEdit] = useState(false),
    [action, setAction] = useState<AdminAction | null>(null),
    [notice, setNotice] = useState("");
  if (r.error) return <ErrorState message={r.error} retry={r.reload} />;
  if (!r.data) return <Skeleton />;
  const a = r.data;
  const managers =
    a.agencyMembership_agencyRecords?.filter(
      (m) => m.role.code === "agency_manager",
    ) ?? [];
  return (
    <>
      <h1>{a.name}</h1>
      <p>
        {a.reference} · <Badge>{label(a.status)}</Badge>
      </p>
      {notice && <p role="status">{notice}</p>}
      <Card title="Informations générales">
        {edit ? (
          <AgencyForm
            initial={a}
            done={() => {
              setEdit(false);
              setNotice("Agence enregistrée.");
              r.reload();
            }}
          />
        ) : (
          <>
            <dl className="org-details">
              {[
                ["Adresse", a.address],
                ["Ville / quartier", `${a.city} · ${a.zone ?? "—"}`],
                ["Pays", a.countryCode],
                ["Localisation", a.locationNotes],
                ["Téléphone", a.phone],
                ["E-mail", a.email],
                ["Créée le", dates(a.createdAt)],
                ["Modifiée le", dates(a.updatedAt)],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v ?? "—"}</dd>
                </div>
              ))}
            </dl>
            <div className="ds-actions">
              {can("agencies.update") && (
                <Button onClick={() => setEdit(true)}>Modifier</Button>
              )}
              {can("agencies.status") && (
                <Button
                  variant={a.status === "ACTIVE" ? "danger" : "secondary"}
                  onClick={() =>
                    setAction({
                      title:
                        a.status === "ACTIVE"
                          ? "Désactiver cette agence ?"
                          : "Activer cette agence ?",
                      description:
                        "Les données et les affiliations sont conservées. Toute opération ouverte nécessitant une action corrective empêchera la désactivation.",
                      reason: true,
                      submit: (reason) =>
                        api(`/company/agencies/${id}/status`, {
                          method: "PATCH",
                          body: JSON.stringify({
                            version: a.version,
                            status:
                              a.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                            reason,
                          }),
                        }),
                    })
                  }
                >
                  {a.status === "ACTIVE" ? "Désactiver" : "Activer"}
                </Button>
              )}
            </div>
          </>
        )}
      </Card>
      <Card title="Responsable principal">
        <p>
          {managers.find((m) => m.userId === a.primaryManagerUserId)?.membership
            .user.fullName ?? "Aucun responsable principal désigné."}
        </p>
        {can("agencies.update") && (
          <Select
            label="Changer le responsable principal"
            value={a.primaryManagerUserId ?? ""}
            onChange={(e) => {
              const userId = e.target.value || null;
              setAction({
                title: "Changer le responsable principal ?",
                description:
                  "Le responsable choisi doit être actif et déjà affecté à cette agence.",
                submit: () =>
                  api(`/company/agencies/${id}/primary`, {
                    method: "PATCH",
                    body: JSON.stringify({ version: a.version, userId }),
                  }),
              });
            }}
          >
            <option value="">Aucun</option>
            {managers.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.membership.user.fullName}
              </option>
            ))}
          </Select>
        )}
      </Card>
      {canViewTeam && (
        <Card title="Équipe affectée">
          {!a.agencyMembership_agencyRecords?.length ? (
            <p>Aucun employé affecté.</p>
          ) : (
            a.agencyMembership_agencyRecords.map((m) => (
              <p key={m.userId}>
                {m.membership.user.fullName} · {label(m.role.code)}
              </p>
            ))
          )}
          <Link to={`${base}/employes?agence=${id}`}>
            Consulter le personnel de cette agence
          </Link>
        </Card>
      )}
      {action && (
        <ConfirmAction
          action={action}
          close={() => setAction(null)}
          done={(m) => {
            setNotice(m);
            r.reload();
          }}
        />
      )}
      <Link to={`${base}/agences`}>Retour aux agences</Link>
    </>
  );
}
function People({
  base,
  drivers,
  can,
}: {
  base: string;
  drivers: boolean;
  can: (p: string) => boolean;
}) {
  const [search] = useSearchParams(),
    [q, setQ] = useState(""),
    [role, setRole] = useState(""),
    [agency, setAgency] = useState(search.get("agence") ?? ""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1);
  const path = drivers ? "drivers" : "employees",
    module = drivers ? "livreurs" : "employes";
  const r = useResource<Page<Employee>>(
    `/company/${path}?page=${page}&q=${encodeURIComponent(q)}${role ? "&role=" + role : ""}${agency ? "&agencyId=" + agency : ""}${status ? "&status=" + status : ""}`,
  );
  const agencies = useResource<Page<Agency>>("/company/agencies?size=50");
  return (
    <>
      <header className="ws-page-title">
        <h1>{drivers ? "Livreurs" : "Personnel"}</h1>
        {can("employees.invite") && (
          <Link
            className="ds-button ds-primary"
            to={`${base}/employes/inviter`}
          >
            Inviter un employé
          </Link>
        )}
      </header>
      <Card
        title={
          drivers
            ? "Profils livreurs et disponibilités"
            : "Affiliations à votre organisation"
        }
      >
        <div className="admin-toolbar">
          <Field
            label="Rechercher nom ou e-mail"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
          {!drivers && (
            <Select
              label="Rôle"
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Tous</option>
              {[...roles, "company_admin"].map((v) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ))}
            </Select>
          )}
          <Select
            label="Agence"
            value={agency}
            onChange={(e) => {
              setAgency(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Toutes mes agences autorisées</option>
            {agencies.data?.items.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Select
            label="Statut"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tous</option>
            {["ACTIVE", "SUSPENDED", "INACTIVE"].map((v) => (
              <option key={v} value={v}>
                {label(v)}
              </option>
            ))}
          </Select>
        </div>
        {r.error ? (
          <ErrorState message={r.error} retry={r.reload} />
        ) : !r.data ? (
          <Skeleton />
        ) : (
          <>
            <div className="ds-table-wrap">
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>Personne</th>
                    <th>Rôle / agences</th>
                    <th>Statut</th>
                    {drivers && <th>Disponibilité</th>}
                  </tr>
                </thead>
                <tbody>
                  {r.data.items.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <Link to={`${base}/${module}/${m.userId}`}>
                          {m.user.fullName}
                        </Link>
                        <br />
                        {m.user.email}
                      </td>
                      <td>
                        {label(
                          m.role.code === "company_admin"
                            ? "company_admin"
                            : m.organizationRole,
                        )}
                        <br />
                        {m.agencyMembership_membershipRecords
                          .filter((a) => a.active)
                          .map((a) => a.agency.name)
                          .join(" · ") || "Sans agence"}
                      </td>
                      <td>
                        {label(
                          drivers
                            ? m.driverProfile?.status
                            : m.active
                              ? m.employmentStatus
                              : "INACTIVE",
                        )}
                      </td>
                      {drivers && (
                        <td>{label(m.driverProfile?.availability)}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!r.data.items.length && (
              <p>Aucun résultat dans votre périmètre.</p>
            )}
            <Pager page={page} total={r.data.total} setPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
function InvitationForm({ base }: { base: string }) {
  const [role, setRole] = useState("employee"),
    [agencyIds, setAgencyIds] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    navigate = useNavigate();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await api<{ invitationDelivery: string }>(
        "/company/employees/invite",
        {
          method: "POST",
          body: JSON.stringify({
            email: f.get("email"),
            fullName: f.get("fullName"),
            role,
            agencyIds,
          }),
        },
      );
      navigate(`${base}/invitations-equipe`, {
        state: {
          notice:
            result.invitationDelivery === "FAILED"
              ? "Invitation conservée. L’envoi a échoué : vous pouvez la renvoyer."
              : "Invitation enregistrée et transmise au serveur mail.",
        },
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Inviter un employé</h1>
      <Card title="Nouvelle affiliation">
        <p>
          Un compte existant recevra une invitation à accepter après connexion.
          Aucun mot de passe n’est créé ni envoyé par l’entreprise.
        </p>
        <form className="admin-form" onSubmit={submit}>
          <Field
            label="Adresse e-mail"
            name="email"
            type="email"
            required
            maxLength={254}
          />
          <Field
            label="Nom du destinataire"
            name="fullName"
            required
            maxLength={160}
          />
          <Select
            label="Rôle organisationnel"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {roles.map((v) => (
              <option key={v} value={v}>
                {label(v)}
              </option>
            ))}
          </Select>
          <AgencySelector selected={agencyIds} setSelected={setAgencyIds} />
          {error && <p role="alert">{error}</p>}
          <Button type="submit" busy={busy}>
            Envoyer l’invitation
          </Button>
        </form>
      </Card>
    </>
  );
}
function AssignmentsForm({
  employee,
  done,
}: {
  employee: Employee;
  done: () => void;
}) {
  const [role, setRole] = useState(employee.organizationRole),
    [status, setStatus] = useState(employee.employmentStatus),
    [ids, setIds] = useState(
      employee.agencyMembership_membershipRecords
        .filter((a) => a.active && a.agencyId)
        .map((a) => a.agencyId!),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/company/employees/${employee.userId}`, {
        method: "PATCH",
        body: JSON.stringify({
          version: employee.version,
          role,
          status,
          agencyIds: ids,
        }),
      });
      done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="admin-form" onSubmit={submit}>
      <Select
        label="Rôle organisationnel"
        value={role}
        onChange={(e) => setRole(e.target.value)}
      >
        {roles.map((v) => (
          <option key={v} value={v}>
            {label(v)}
          </option>
        ))}
      </Select>
      <Select
        label="État de l’affiliation"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
      >
        {["ACTIVE", "SUSPENDED", "INACTIVE"].map((v) => (
          <option key={v} value={v}>
            {label(v)}
          </option>
        ))}
      </Select>
      <AgencySelector
        selected={ids}
        setSelected={setIds}
        initial={employee.agencyMembership_membershipRecords
          .filter((a) => a.agencyId)
          .map((a) => ({ id: a.agencyId!, name: a.agency.name }))}
      />
      {error && <p role="alert">{error}</p>}
      <Button type="submit" busy={busy}>
        Enregistrer les affectations
      </Button>
    </form>
  );
}
function DriverForm({
  driver,
  userId,
  done,
}: {
  driver: DriverProfile;
  userId: string;
  done: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api(`/company/drivers/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({
          version: driver.version,
          employeeNumber: f.get("employeeNumber") || null,
          status: f.get("status"),
          transport: f.get("transport") || null,
          notes: f.get("notes") || null,
        }),
      });
      done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="admin-form org-form" onSubmit={submit}>
      <Field
        name="employeeNumber"
        label="Matricule interne (facultatif)"
        defaultValue={driver.employeeNumber ?? ""}
        maxLength={50}
      />
      <Select
        name="status"
        label="Statut du profil"
        defaultValue={driver.status}
      >
        {["ACTIVE", "SUSPENDED", "INACTIVE"].map((v) => (
          <option key={v} value={v}>
            {label(v)}
          </option>
        ))}
      </Select>
      <Select
        name="transport"
        label="Moyen de transport"
        defaultValue={driver.transport ?? ""}
      >
        <option value="">Non précisé</option>
        {["MOTORBIKE", "BICYCLE", "CAR", "VAN", "OTHER"].map((v) => (
          <option key={v} value={v}>
            {label(v)}
          </option>
        ))}
      </Select>
      <Textarea
        name="notes"
        label="Observations autorisées"
        defaultValue={driver.notes ?? ""}
        maxLength={2000}
      />
      {error && <p role="alert">{error}</p>}
      <Button type="submit" busy={busy}>
        Enregistrer le profil livreur
      </Button>
    </form>
  );
}
function EmployeeDetail({
  id,
  drivers,
  can,
}: {
  id: string;
  drivers: boolean;
  can: (p: string) => boolean;
}) {
  const r = useResource<Employee>(
      `/company/${drivers ? "drivers" : "employees"}/${id}`,
    ),
    [notice, setNotice] = useState(""),
    [action, setAction] = useState<AdminAction | null>(null);
  if (r.error) return <ErrorState message={r.error} retry={r.reload} />;
  if (!r.data) return <Skeleton />;
  const m = r.data,
    done = () => {
      setNotice("Organisation enregistrée.");
      r.reload();
    };
  return (
    <>
      <h1>{m.user.fullName}</h1>
      {notice && <p role="status">{notice}</p>}
      <Card title="Compte et affiliation">
        <p>
          {m.user.email} · {m.user.phone ?? "Téléphone non renseigné"}
        </p>
        <p>
          {label(
            m.role.code === "company_admin"
              ? "company_admin"
              : m.organizationRole,
          )}{" "}
          · {label(m.active ? m.employmentStatus : "INACTIVE")}
        </p>
        <p>
          Le compte personnel et les autres entreprises ne sont pas modifiés.
        </p>
        {m.role.code === "company_admin" ? (
          <p>
            Les administrateurs sont gérés dans le module global, avec
            protection du dernier responsable.
          </p>
        ) : can("employees.manage") ? (
          <AssignmentsForm key={`${m.version}`} employee={m} done={done} />
        ) : (
          <ul>
            {m.agencyMembership_membershipRecords.map((a) => (
              <li key={a.agencyId}>
                {a.agency.name} · {label(a.role.code)} ·{" "}
                {a.active ? "Affectation active" : "Affectation retirée"}
              </li>
            ))}
          </ul>
        )}
        {m.role.code !== "company_admin" &&
          m.active &&
          can("employees.remove") && (
            <Button
              variant="danger"
              onClick={() =>
                setAction({
                  title: "Retirer cette affiliation ?",
                  description:
                    "Le compte, ses données et ses autres entreprises seront conservés. Les accès à cette entreprise et à ses agences seront retirés.",
                  reason: true,
                  submit: (reason) =>
                    api(`/company/employees/${id}/affiliation`, {
                      method: "DELETE",
                      body: JSON.stringify({ version: m.version, reason }),
                    }),
                })
              }
            >
              Retirer de cette entreprise
            </Button>
          )}
      </Card>
      {m.driverProfile && (
        <Card title="Profil livreur">
          <p>
            Profil : {label(m.driverProfile.status)} · Disponibilité :{" "}
            {label(m.driverProfile.availability)} depuis{" "}
            {dates(m.driverProfile.availabilityChangedAt)}
          </p>
          {can("drivers.manage") &&
          m.active &&
          m.organizationRole === "courier" ? (
            <DriverForm
              key={m.driverProfile.version}
              driver={m.driverProfile}
              userId={id}
              done={done}
            />
          ) : (
            <p>
              {m.driverProfile.employeeNumber ?? "Sans matricule"} ·{" "}
              {label(m.driverProfile.transport)}
            </p>
          )}
          <p>
            Aucune mission n’est créée. Le livreur modifie lui-même sa
            disponibilité.
          </p>
        </Card>
      )}
      {action && (
        <ConfirmAction
          action={action}
          close={() => setAction(null)}
          done={(s) => {
            setNotice(s);
            r.reload();
          }}
        />
      )}
    </>
  );
}
function Invitations({ can }: { can: (p: string) => boolean }) {
  const [page, setPage] = useState(1),
    [action, setAction] = useState<AdminAction | null>(null),
    [notice, setNotice] = useState("");
  const r = useResource<Page<StaffInvitation>>(
    `/company/staff-invitations?page=${page}`,
  );
  return (
    <>
      <h1>Invitations du personnel</h1>
      {notice && <p role="status">{notice}</p>}
      <Card title="Invitations et état de l’envoi">
        {r.error ? (
          <ErrorState message={r.error} retry={r.reload} />
        ) : !r.data ? (
          <Skeleton />
        ) : (
          <>
            <div className="ds-table-wrap">
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>Destinataire</th>
                    <th>Rôle</th>
                    <th>Expiration</th>
                    <th>État</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {r.data.items.map((i) => (
                    <tr key={i.id}>
                      <td>
                        {i.fullName}
                        <br />
                        {i.email}
                      </td>
                      <td>{label(i.staffRole)}</td>
                      <td>{dates(i.expiresAt)}</td>
                      <td>
                        {i.acceptedAt
                          ? "Acceptée"
                          : i.revokedAt
                            ? "Révoquée"
                            : new Date(i.expiresAt) < new Date()
                              ? "Expirée"
                              : "En attente"}{" "}
                        · {label(i.deliveryStatus)}
                      </td>
                      <td>
                        {can("employees.invite") &&
                          !i.acceptedAt &&
                          !i.revokedAt &&
                          (["resend", "revoke"] as const).map((a) => (
                            <Button
                              variant="secondary"
                              key={a}
                              onClick={() =>
                                setAction({
                                  title:
                                    a === "resend"
                                      ? "Renvoyer cette invitation ?"
                                      : "Révoquer cette invitation ?",
                                  description:
                                    a === "resend"
                                      ? "Un nouveau lien remplacera immédiatement l’ancien."
                                      : "Le lien ne permettra plus d’activer cette affiliation.",
                                  submit: () =>
                                    api(
                                      `/company/staff-invitations/${i.id}/${a}`,
                                      {
                                        method: "POST",
                                        body: JSON.stringify({
                                          version: i.version,
                                        }),
                                      },
                                    ),
                                })
                              }
                            >
                              {a === "resend" ? "Renvoyer" : "Révoquer"}
                            </Button>
                          ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!r.data.items.length && <p>Aucune invitation.</p>}
            <Pager page={page} total={r.data.total} setPage={setPage} />
          </>
        )}
      </Card>
      {action && (
        <ConfirmAction
          action={action}
          close={() => setAction(null)}
          done={(m) => {
            setNotice(m);
            r.reload();
          }}
        />
      )}
    </>
  );
}
function SelfPage({
  driver = false,
  context,
}: {
  driver?: boolean;
  context: Workspace;
}) {
  const r = useResource<Employee>(
      driver ? "/driver/profile" : "/company/organization/self",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (r.error) return <ErrorState message={r.error} retry={r.reload} />;
  if (!r.data) return <Skeleton />;
  const m = r.data,
    d = m.driverProfile;
  async function availability(value: string) {
    setBusy(true);
    setError("");
    try {
      await api("/driver/availability", {
        method: "PATCH",
        body: JSON.stringify({ version: d!.version, availability: value }),
      });
      r.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>{driver ? "Mon profil livreur" : "Mes affectations"}</h1>
      <Card title={m.user.fullName}>
        <p>
          {context.companyName} · {context.agencyName ?? "Entreprise"} ·{" "}
          {m.user.email}
        </p>
        <ul>
          {m.agencyMembership_membershipRecords.map((a, i) => (
            <li key={a.agencyId ?? i}>
              {a.agency.name} · {label(a.role.code)} ·{" "}
              {a.active ? label(a.agency.status) : "Affiliation retirée"}
            </li>
          ))}
        </ul>
        {driver && d && (
          <>
            <p>
              Profil : {label(d.status)} ·{" "}
              {d.employeeNumber ?? "Sans matricule"} · {label(d.transport)}
            </p>
            <p>
              Disponibilité : {label(d.availability)} ·{" "}
              {dates(d.availabilityChangedAt)}
            </p>
            <div className="ds-actions">
              {["AVAILABLE", "UNAVAILABLE"].map((v) => (
                <Button
                  key={v}
                  busy={busy}
                  disabled={
                    d.status !== "ACTIVE" ||
                    d.availability === v ||
                    !context.permissions.includes(
                      "drivers.availability.write",
                    ) ||
                    context.subscriptionAccess?.valid === false
                  }
                  onClick={() => void availability(v)}
                >
                  {label(v)}
                </Button>
              ))}
            </div>
            {error && <p role="alert">{error}</p>}
            <p>
              La disponibilité ne correspond pas à une mission. Aucune course
              fictive n’est affichée.
            </p>
          </>
        )}
      </Card>
    </>
  );
}
function History() {
  const [page, setPage] = useState(1);
  const r = useResource<
    Page<{
      id: string;
      action: string;
      createdAt: string;
      actor: { fullName: string } | null;
      metadata: unknown;
    }>
  >(`/company/organization/history?page=${page}`);
  return (
    <>
      <h1>Historique de l’organisation</h1>
      <Card title="Journal administratif interne">
        {r.error ? (
          <ErrorState message={r.error} retry={r.reload} />
        ) : !r.data ? (
          <Skeleton />
        ) : (
          <>
            <div className="ds-table-wrap">
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Auteur</th>
                    <th>Date</th>
                    <th>Détails</th>
                  </tr>
                </thead>
                <tbody>
                  {r.data.items.map((i) => (
                    <tr key={i.id}>
                      <td>{organizationActions[i.action] ?? i.action}</td>
                      <td>{i.actor?.fullName ?? "—"}</td>
                      <td>{dates(i.createdAt)}</td>
                      <td>{organizationHistoryDetail(i.metadata)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} total={r.data.total} setPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
export function OrganizationWorkspace({
  context,
  moduleId,
}: {
  context: Workspace;
  moduleId: string;
}) {
  const { entityId } = useParams(),
    base = `/portail/${context.portal}`,
    can = (p: string) =>
      context.scope === "COMPANY" &&
      context.permissions.includes(p) &&
      context.subscriptionAccess?.valid !== false;
  if (moduleId === "entreprise") return <ProfilePage can={can} />;
  if (moduleId === "agences") {
    if (entityId === "nouvelle")
      return can("agencies.create") ? (
        <>
          <h1>Créer une agence</h1>
          <Card title="Informations de l’agence">
            <AgencyForm done={() => {}} />
          </Card>
        </>
      ) : (
        <p>Création non autorisée dans ce contexte.</p>
      );
    return entityId ? (
      <AgencyDetail
        id={entityId}
        base={base}
        can={can}
        canViewTeam={context.permissions.includes("employees.read")}
      />
    ) : (
      <Agencies base={base} can={can} />
    );
  }
  if (moduleId === "employes" && entityId === "inviter")
    return can("employees.invite") ? (
      <InvitationForm base={base} />
    ) : (
      <p>Invitation non autorisée.</p>
    );
  if (["employes", "livreurs"].includes(moduleId))
    return entityId ? (
      <EmployeeDetail
        id={entityId}
        drivers={moduleId === "livreurs"}
        can={can}
      />
    ) : (
      <People base={base} drivers={moduleId === "livreurs"} can={can} />
    );
  if (moduleId === "invitations-equipe") return <Invitations can={can} />;
  if (moduleId === "historique-organisation") return <History />;
  return <SelfPage driver={moduleId === "profil-livreur"} context={context} />;
}
