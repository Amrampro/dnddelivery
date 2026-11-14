import { useApiData } from "../auth/useApiData";
import { useState } from "react";
import { Text, View, Image } from "react-native";
import { api } from "../auth/client";
import type { Workspace } from "../auth/types";
import {
  Button,
  Card,
  Badge,
  Input,
  ListRow,
  Loading,
  ErrorMessage,
  ui,
} from "../design/ui";
import {
  organizationLabel as label,
  organizationActions,
  type Page,
  type Agency,
  type Employee,
  type CompanyProfile,
  type StaffInvitation,
} from "../../../shared/organization";
function useOrganization<T>(url: string | null) {
  return useApiData<T>(url);
}
function LoadingState({ error, retry }: { error?: string; retry: () => void }) {
  return error ? <ErrorMessage message={error} retry={retry} /> : <Loading />;
}
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
    <View style={{ gap: 10, marginVertical: 12 }}>
      <Text style={ui.body}>
        Page {page} · {total} résultat(s)
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button
          secondary
          title="Précédent"
          disabled={page === 1}
          onPress={() => setPage(page - 1)}
        />
        <Button
          secondary
          title="Suivant"
          disabled={page * 15 >= total}
          onPress={() => setPage(page + 1)}
        />
      </View>
    </View>
  );
}
function Profile() {
  const r = useOrganization<CompanyProfile>("/company/profile"),
    logo = useOrganization<{ mime: string; image: string }>(
      r.data?.logoUrl ?? null,
    );
  if (!r.data) return <LoadingState error={r.error} retry={r.reload} />;
  const p = r.data;
  return (
    <Card>
      <Text role="heading" style={ui.sectionTitle}>
        {p.tradeName ?? p.name}
      </Text>
      <Text style={ui.body}>
        {p.reference} · {label(p.status)}
      </Text>
      {logo.data && (
        <Image
          accessibilityLabel="Logo de votre entreprise"
          source={{
            uri: "data:" + logo.data.mime + ";base64," + logo.data.image,
          }}
          style={{ width: 140, height: 100 }}
          resizeMode="contain"
        />
      )}
      <Text style={ui.body}>
        {p.address}
        {"\n"}
        {p.city} · {p.countryCode}
        {"\n"}
        {p.phone}
        {"\n"}
        {p.email}
      </Text>
      {p.description && <Text style={ui.body}>{p.description}</Text>}
      <Text style={ui.body}>
        Les modifications du siège sont disponibles dans l’espace Web autorisé.
      </Text>
      <Button secondary title="Actualiser" onPress={r.reload} />
    </Card>
  );
}
function OwnProfile({
  context,
  driver = false,
}: {
  context: Workspace;
  driver?: boolean;
}) {
  const r = useOrganization<Employee>(
      driver ? "/driver/profile" : "/company/organization/self",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (!r.data) return <LoadingState error={r.error} retry={r.reload} />;
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
    <Card>
      <Text role="heading" style={ui.sectionTitle}>
        {m.user.fullName}
      </Text>
      <Text style={ui.body}>
        {context.companyName} · {context.agencyName ?? "Entreprise"}
      </Text>
      <Text style={ui.body}>
        {m.user.email}
        {"\n"}
        {m.user.phone ?? "Téléphone non renseigné"}
      </Text>
      {m.agencyMembership_membershipRecords.map((a, i) => (
        <ListRow
          key={a.agencyId ?? i}
          title={a.agency.name}
          description={
            label(a.role.code) +
            " · " +
            (a.active ? label(a.agency.status) : "Affiliation retirée")
          }
          icon="home"
        />
      ))}
      {driver && d && (
        <>
          <Text role="heading" style={ui.sectionTitle}>
            Ma disponibilité
          </Text>
          <Badge success={d.status === "ACTIVE"}>
            {"Profil " + label(d.status)}
          </Badge>
          <Text style={ui.body}>
            {d.employeeNumber ?? "Sans matricule"} · {label(d.transport)}
            {"\n"}
            {label(d.availability)} ·{" "}
            {new Date(d.availabilityChangedAt).toLocaleString("fr-FR")}
          </Text>
          {["AVAILABLE", "UNAVAILABLE"].map((value) => (
            <Button
              key={value}
              title={
                value === "AVAILABLE"
                  ? "Me rendre disponible"
                  : "Me rendre indisponible"
              }
              secondary={value === "UNAVAILABLE"}
              busy={busy}
              disabled={
                d.status !== "ACTIVE" ||
                d.availability === value ||
                !context.permissions.includes("drivers.availability.write") ||
                context.subscriptionAccess?.valid === false
              }
              onPress={() => void availability(value)}
            />
          ))}
          {!!error && <ErrorMessage message={error} />}
          <Text style={ui.body}>
            La disponibilité ne constitue pas une affectation à une course.
            Aucune mission n’est simulée.
          </Text>
        </>
      )}
      <Button secondary title="Actualiser mon état" onPress={r.reload} />
    </Card>
  );
}
function AgencyDetails({
  id,
  context,
  back,
}: {
  id: string;
  context: Workspace;
  back: () => void;
}) {
  const r = useOrganization<Agency>("/company/agencies/" + id);
  if (!r.data) return <LoadingState error={r.error} retry={r.reload} />;
  const a = r.data;
  return (
    <>
      <Button secondary title="Retour aux agences" onPress={back} />
      <Card>
        <Text role="heading" style={ui.sectionTitle}>
          {a.name}
        </Text>
        <Badge success={a.status === "ACTIVE"}>{label(a.status)}</Badge>
        <Text style={ui.body}>
          {a.reference}
          {"\n"}
          {a.address}
          {"\n"}
          {a.city} · {a.zone ?? "—"} · {a.countryCode ?? "—"}
          {"\n"}
          {a.phone}
          {"\n"}
          {a.email ?? "—"}
          {"\n"}
          {a.locationNotes ?? ""}
        </Text>
        {context.permissions.includes("employees.read") && (
          <>
            <Text role="heading" style={ui.sectionTitle}>
              Équipe affectée
            </Text>
            {a.agencyMembership_agencyRecords?.map((m) => (
              <ListRow
                key={m.userId}
                title={m.membership.user.fullName}
                description={label(m.role.code)}
                icon="user"
              />
            ))}
            {!a.agencyMembership_agencyRecords?.length && (
              <Text style={ui.body}>Aucun employé affecté.</Text>
            )}
          </>
        )}
      </Card>
    </>
  );
}
function PersonDetails({
  id,
  drivers,
  back,
}: {
  id: string;
  drivers: boolean;
  back: () => void;
}) {
  const r = useOrganization<Employee>(
    "/company/" + (drivers ? "drivers" : "employees") + "/" + id,
  );
  if (!r.data) return <LoadingState error={r.error} retry={r.reload} />;
  const m = r.data;
  return (
    <>
      <Button secondary title="Retour à la liste" onPress={back} />
      <Card>
        <Text role="heading" style={ui.sectionTitle}>
          {m.user.fullName}
        </Text>
        <Text style={ui.body}>
          {m.user.email}
          {"\n"}
          {m.user.phone ?? "—"}
          {"\n"}
          {label(
            m.role.code === "company_admin"
              ? "company_admin"
              : m.organizationRole,
          )}{" "}
          · {m.active ? label(m.employmentStatus) : "Affiliation inactive"}
        </Text>
        {m.agencyMembership_membershipRecords.map((a, i) => (
          <ListRow
            key={a.agencyId ?? i}
            title={a.agency.name}
            description={
              label(a.role.code) + " · " + (a.active ? "Affecté" : "Retiré")
            }
          />
        ))}
        {m.driverProfile && (
          <>
            <Text role="heading" style={ui.sectionTitle}>
              Profil livreur
            </Text>
            <Text style={ui.body}>
              {label(m.driverProfile.status)} ·{" "}
              {label(m.driverProfile.availability)}
              {"\n"}
              {label(m.driverProfile.transport)} ·{" "}
              {m.driverProfile.employeeNumber ?? "Sans matricule"}
              {"\n"}État enregistré le{" "}
              {new Date(m.driverProfile.availabilityChangedAt).toLocaleString(
                "fr-FR",
              )}
            </Text>
          </>
        )}
        <Text style={ui.body}>
          Les affectations et changements de rôle sont gérés depuis l’espace Web
          autorisé.
        </Text>
      </Card>
    </>
  );
}
function OrganizationList({
  moduleId,
  context,
}: {
  moduleId: string;
  context: Workspace;
}) {
  const [page, setPage] = useState(1),
    [q, setQ] = useState(""),
    [selected, setSelected] = useState<string | null>(null);
  const path =
      moduleId === "agences"
        ? "agencies"
        : moduleId === "livreurs"
          ? "drivers"
          : "employees",
    r = useOrganization<Page<Agency | Employee>>(
      "/company/" + path + "?page=" + page + "&q=" + encodeURIComponent(q),
    );
  if (selected)
    return moduleId === "agences" ? (
      <AgencyDetails
        id={selected}
        context={context}
        back={() => setSelected(null)}
      />
    ) : (
      <PersonDetails
        id={selected}
        drivers={moduleId === "livreurs"}
        back={() => setSelected(null)}
      />
    );
  return (
    <>
      <Input
        label="Rechercher dans mon périmètre"
        value={q}
        onChangeText={(v) => {
          setQ(v);
          setPage(1);
        }}
      />
      {!r.data ? (
        <LoadingState error={r.error} retry={r.reload} />
      ) : (
        <>
          <Card>
            {r.data.items.map((row) =>
              "reference" in row ? (
                <ListRow
                  key={row.id}
                  title={row.name}
                  description={
                    row.reference + " · " + row.city + " · " + label(row.status)
                  }
                  icon="home"
                  onPress={() => setSelected(row.id)}
                />
              ) : (
                <ListRow
                  key={row.id}
                  title={row.user.fullName}
                  description={
                    label(
                      row.role.code === "company_admin"
                        ? "company_admin"
                        : row.organizationRole,
                    ) +
                    (row.driverProfile
                      ? " · " + label(row.driverProfile.availability)
                      : "")
                  }
                  icon="user"
                  onPress={() => setSelected(row.userId)}
                />
              ),
            )}
            {!r.data.items.length && (
              <Text style={ui.body}>Aucun résultat dans votre périmètre.</Text>
            )}
          </Card>
          <Pager page={page} total={r.data.total} setPage={setPage} />
        </>
      )}
    </>
  );
}
function Invitations() {
  const [page, setPage] = useState(1);
  const r = useOrganization<Page<StaffInvitation>>(
    "/company/staff-invitations?page=" + page,
  );
  if (!r.data) return <LoadingState error={r.error} retry={r.reload} />;
  return (
    <>
      <Card>
        {r.data.items.map((i) => (
          <ListRow
            key={i.id}
            title={i.fullName}
            description={
              i.email +
              " · " +
              label(i.staffRole) +
              " · " +
              (i.acceptedAt
                ? "Acceptée"
                : i.revokedAt
                  ? "Révoquée"
                  : label(i.deliveryStatus))
            }
            icon="mail"
          />
        ))}
        {!r.data.items.length && (
          <Text style={ui.body}>Aucune invitation.</Text>
        )}
        <Text style={ui.body}>
          Le renvoi et la révocation sont disponibles dans l’espace Web.
        </Text>
      </Card>
      <Pager page={page} total={r.data.total} setPage={setPage} />
    </>
  );
}
function History() {
  const [page, setPage] = useState(1);
  const r = useOrganization<
    Page<{ id: string; action: string; createdAt: string }>
  >("/company/organization/history?page=" + page);
  if (!r.data) return <LoadingState error={r.error} retry={r.reload} />;
  return (
    <>
      <Card>
        {r.data.items.map((i) => (
          <ListRow
            key={i.id}
            title={organizationActions[i.action] ?? i.action}
            description={new Date(i.createdAt).toLocaleString("fr-FR")}
            icon="clock"
          />
        ))}
        {!r.data.items.length && (
          <Text style={ui.body}>Aucune action enregistrée.</Text>
        )}
      </Card>
      <Pager page={page} total={r.data.total} setPage={setPage} />
    </>
  );
}
export function OrganizationScreen({
  moduleId,
  context,
}: {
  moduleId: string;
  context: Workspace;
}) {
  return (
    <View style={{ gap: 18 }}>
      <Text style={ui.kicker}>
        {context.companyName}
        {context.agencyName ? " · " + context.agencyName : ""}
      </Text>
      <Text role="heading" style={ui.sectionTitle}>
        {{
          entreprise: "Mon entreprise",
          agences: "Mes agences",
          employes: "Personnel",
          livreurs: "Livreurs",
          "mes-affectations": "Mes affectations",
          "profil-livreur": "Mon profil livreur",
          "invitations-equipe": "Invitations",
          "historique-organisation": "Historique",
        }[moduleId] ?? "Mon organisation"}
      </Text>
      {moduleId === "entreprise" ? (
        <Profile />
      ) : ["agences", "employes", "livreurs"].includes(moduleId) ? (
        <OrganizationList moduleId={moduleId} context={context} />
      ) : moduleId === "invitations-equipe" ? (
        <Invitations />
      ) : moduleId === "historique-organisation" ? (
        <History />
      ) : (
        <OwnProfile context={context} driver={moduleId === "profil-livreur"} />
      )}
    </View>
  );
}
