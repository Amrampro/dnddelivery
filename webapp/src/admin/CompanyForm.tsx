import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../auth/client";
import {
  Button,
  Card,
  Field,
  Select,
  Textarea,
  ErrorState,
  Skeleton,
} from "../design/ui";
import { UserLookup, type SelectedUser } from "./UserLookup";
import { companyBase, type Company, type CompanyDetail } from "./types";
import { useResource } from "./useResource";
type Values = {
  name: string;
  reference: string;
  email: string;
  phone: string;
  city: string;
  countryCode: string;
  address: string;
  tradeName: string;
  registrationNumber: string;
  description: string;
};
export function EditCompany({ id }: { id: string }) {
  const r = useResource<CompanyDetail>(`/admin/companies/${id}`);
  return r.error ? (
    <ErrorState message={r.error} retry={r.reload} />
  ) : r.data ? (
    <CompanyForm key={r.data.company.version} company={r.data.company} />
  ) : (
    <Skeleton rows={5} />
  );
}
export function CompanyForm({ company }: { company?: Company }) {
  const navigate = useNavigate();
  const [values, setValues] = useState<Values>({
      name: company?.name ?? "",
      reference: company?.reference ?? "",
      email: company?.email ?? "",
      phone: company?.phone ?? "",
      city: company?.city ?? "",
      countryCode: company?.countryCode ?? "",
      address: company?.address ?? "",
      tradeName: company?.tradeName ?? "",
      registrationNumber: company?.registrationNumber ?? "",
      description: company?.description ?? "",
    }),
    [mode, setMode] = useState("invite"),
    [adminEmail, setAdminEmail] = useState(""),
    [adminName, setAdminName] = useState(""),
    [user, setUser] = useState<SelectedUser | null>(null),
    [status, setStatus] = useState("INACTIVE"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [logo, setLogo] = useState<File | null>(null);
  function change(key: keyof Values, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!company && mode === "existing" && !user) {
      setError("Recherchez et sélectionnez un utilisateur existant.");
      return;
    }
    if (
      logo &&
      (!["image/png", "image/jpeg", "image/webp"].includes(logo.type) ||
        logo.size > 2 * 1024 * 1024)
    ) {
      setError("Logo : PNG, JPEG ou WebP, 2 Mo maximum.");
      return;
    }
    setBusy(true);
    try {
      const { reference, ...fields } = values;
      const payload = {
        ...fields,
        email: fields.email.trim(),
        countryCode: fields.countryCode.toUpperCase(),
        tradeName: fields.tradeName.trim() || null,
        registrationNumber: fields.registrationNumber.trim() || null,
        description: fields.description.trim() || null,
      };
      const result = await api<{
        company: Company;
        invitationDelivery?: string | null;
      }>(company ? `/admin/companies/${company.id}` : "/admin/companies", {
        method: company ? "PATCH" : "POST",
        body: JSON.stringify(
          company
            ? { ...payload, version: company.version }
            : {
                ...payload,
                reference,
                status,
                administrator:
                  mode === "existing"
                    ? { mode, userId: user!.id }
                    : {
                        mode: "invite",
                        email: adminEmail.trim(),
                        fullName: adminName,
                      },
              },
        ),
      });
      let notice =
        result.invitationDelivery === "FAILED"
          ? "Entreprise enregistrée. L’invitation est conservée mais son e-mail n’a pas été envoyé. Vous pouvez réessayer depuis Invitations."
          : "Entreprise enregistrée.";
      if (logo) {
        try {
          await api(`/admin/companies/${result.company.id}/logo`, {
            method: "PUT",
            body: logo,
            headers: {
              "Content-Type": logo.type,
              "X-Company-Version": String(result.company.version),
            },
          });
        } catch (e) {
          notice += ` Le logo n’a pas été associé : ${e instanceof Error ? e.message : "réessayez depuis la fiche"}`;
        }
      }
      navigate(`${companyBase}/${result.company.id}`, {
        replace: true,
        state: { notice },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="ws-page-title">
        <div>
          <span className="ws-eyebrow">GESTION DES ENTREPRISES</span>
          <h1>
            {company
              ? "Modifier les informations."
              : "Une nouvelle entreprise."}
          </h1>
          <p>
            {company
              ? "La référence technique reste immuable."
              : "Créez un environnement et désignez son premier administrateur."}
          </p>
        </div>
        <Link
          className="ds-button ds-secondary"
          to={company ? `${companyBase}/${company.id}` : companyBase}
        >
          Retour
        </Link>
      </header>
      <form className="admin-form" onSubmit={submit}>
        <Card title="Informations de l’entreprise">
          <div className="ds-form-grid">
            <Field
              label="Nom officiel"
              required
              maxLength={160}
              value={values.name}
              onChange={(e) => change("name", e.target.value)}
            />
            <Field
              label="Nom commercial (facultatif)"
              maxLength={160}
              value={values.tradeName}
              onChange={(e) => change("tradeName", e.target.value)}
            />
            <Field
              label="Référence interne immuable"
              required
              disabled={!!company}
              minLength={2}
              maxLength={50}
              pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,49}"
              value={values.reference}
              onChange={(e) =>
                change("reference", e.target.value.toUpperCase())
              }
            />
            <Field
              label="Numéro d’immatriculation (facultatif)"
              maxLength={100}
              value={values.registrationNumber}
              onChange={(e) => change("registrationNumber", e.target.value)}
            />
            <Field
              label="Adresse e-mail professionnelle"
              type="email"
              required
              maxLength={254}
              value={values.email}
              onChange={(e) => change("email", e.target.value)}
            />
            <Field
              label="Téléphone professionnel"
              type="tel"
              required
              maxLength={32}
              value={values.phone}
              onChange={(e) => change("phone", e.target.value)}
            />
            <Field
              label="Pays (code à deux lettres)"
              required
              pattern="[A-Za-z]{2}"
              maxLength={2}
              placeholder="Ex. CM"
              value={values.countryCode}
              onChange={(e) =>
                change("countryCode", e.target.value.toUpperCase())
              }
            />
            <Field
              label="Ville"
              required
              maxLength={120}
              value={values.city}
              onChange={(e) => change("city", e.target.value)}
            />
            <Field
              label="Adresse du siège"
              required
              maxLength={500}
              value={values.address}
              onChange={(e) => change("address", e.target.value)}
            />
            <Textarea
              label="Description (facultative)"
              maxLength={2000}
              value={values.description}
              onChange={(e) => change("description", e.target.value)}
            />
            <Field
              label="Logo d’entreprise (facultatif)"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
              hint="PNG, JPEG ou WebP ; 2 Mo maximum. Stockage contrôlé, image réencodée."
            />
          </div>
        </Card>
        {!company && (
          <>
            <Card title="Administrateur principal">
              <Select
                label="Désigner le responsable"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="invite">Inviter un nouvel utilisateur</option>
                <option value="existing">Associer un compte existant</option>
              </Select>
              {mode === "existing" ? (
                <UserLookup selected={user} onSelect={setUser} />
              ) : (
                <div className="ds-form-grid">
                  <Field
                    label="Nom du futur administrateur"
                    required
                    maxLength={160}
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                  />
                  <Field
                    label="E-mail du futur administrateur"
                    required
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                  />
                  <p className="ws-disclaimer">
                    Le destinataire définira lui-même son mot de passe. Si un
                    compte existe déjà, utilisez l’association d’un compte
                    existant.
                  </p>
                </div>
              )}
            </Card>
            <Card title="Accès administratif">
              <Select
                label="Statut initial"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="INACTIVE">
                  Désactivée — activation manuelle ultérieure
                </option>
                <option value="ACTIVE">Active</option>
              </Select>
              <p className="ws-disclaimer">
                Une entreprise désactivée n’a pas accès à son espace. Aucun
                abonnement actif n’est créé automatiquement.
              </p>
            </Card>
          </>
        )}
        {error && (
          <div role="alert" className="ds-feedback">
            {error}
          </div>
        )}
        <div className="ds-actions">
          <Button type="submit" busy={busy}>
            {company ? "Enregistrer les modifications" : "Créer l’entreprise"}
          </Button>
          <Link
            className="ds-button ds-secondary"
            to={company ? `${companyBase}/${company.id}` : companyBase}
          >
            Annuler
          </Link>
        </div>
      </form>
    </>
  );
}
