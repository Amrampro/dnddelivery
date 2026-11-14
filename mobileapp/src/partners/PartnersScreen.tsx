import { useApiData } from "../auth/useApiData";
import { useState } from "react";
import { Image, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../auth/client";
import type { Workspace } from "../auth/types";
import {
  Badge,
  Button,
  Card,
  Confirm,
  EmptyState,
  ErrorMessage,
  Input,
  ListRow,
  Loading,
  Selector,
  Sheet,
  ui,
} from "../design/ui";

import {
  partnerActionLabels,
  type PartnerPage as Page,
  type ShopProfile as Profile,
  type PartnerCompany,
  type PartnerCollaboration as Partner,
  type CollaborationEvent as Event,
  type ShopUser as Member,
} from "../../../shared/partners";
type Notification = {
  id: string;
  subject?: string;
  eventType?: string;
  sourceEvent?: string;
  status: string;
  createdAt: string;
  payload?: {
    title?: string;
    message?: string;
    shopName?: string;
    companyName?: string;
  };
};
export const partnerMobileModuleIds = [
  "profil-boutique",
  "transporteurs",
  "demandes-collaboration",
  "utilisateurs-boutique",
  "historique-boutique",
  "invitations-boutique",
  "partenaires",
  "demandes-partenaires",
  "invitations-partenaires",
  "notifications-boutique",
  "notifications-partenaires",
];
const statuses = [
  { id: "", label: "Tous les statuts" },
  { id: "PENDING", label: "En attente" },
  { id: "ACTIVE", label: "Active" },
  { id: "REJECTED", label: "Refusée" },
  { id: "SUSPENDED", label: "Suspendue" },
  { id: "ENDED", label: "Terminée" },
];
const names: Record<string, string> = {
  PENDING: "En attente",
  ACTIVE: "Active",
  REJECTED: "Refusée",
  SUSPENDED: "Suspendue",
  ENDED: "Terminée",
  COMPANY: "Entreprise",
  SHOP: "Boutique",
  owner: "Propriétaire",
  manager: "Gestionnaire",
  employee: "Employé",
  shop_owner: "Propriétaire",
  shop_manager: "Gestionnaire",
  shop_employee: "Employé",
};
const eventNames: Record<string, string> = {
  ...partnerActionLabels,
  PARTNER_REQUEST: "Nouvelle demande de collaboration",
  PARTNER_ACCEPT: "Collaboration acceptée",
  PARTNER_REJECT: "Collaboration refusée",
  PARTNER_SUSPEND: "Collaboration suspendue",
  PARTNER_TERMINATE: "Collaboration terminée",
  PARTNER_CREATED: "Boutique créée",
  PARTNER_UPDATED: "Profil modifié",
  SHOP_CREATED: "Boutique créée",
  SHOP_PROFILE_UPDATED: "Profil modifié",
  COLLABORATION_REQUESTED: "Demande de collaboration",
  COLLABORATION_ACCEPTED: "Collaboration acceptée",
  COLLABORATION_REJECTED: "Collaboration refusée",
  COLLABORATION_SUSPENDED: "Collaboration suspendue",
  COLLABORATION_ENDED: "Collaboration terminée",
  COLLABORATION_TERMINATED: "Collaboration terminée",
  SHOP_USER_INVITED: "Utilisateur invité",
  SHOP_USER_UPDATED: "Affiliation modifiée",
  SHOP_USER_REMOVED: "Affiliation retirée",
};
const date = (v?: string | null) =>
  v ? new Date(v).toLocaleString("fr-FR") : "—";
function useData<T>(url: string | null) {
  return useApiData<T>(url);
}
function State({ error, retry }: { error?: string; retry: () => void }) {
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
    <View style={{ gap: 10 }}>
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
function Logo({ url, label }: { url?: string | null; label: string }) {
  const r = useData<{ image: string; mime: string }>(url ?? null);
  return r.data ? (
    <Image
      accessibilityLabel={label}
      source={{ uri: `data:${r.data.mime};base64,${r.data.image}` }}
      style={{ width: 120, height: 82 }}
      resizeMode="contain"
    />
  ) : null;
}
function ProfileFields({ p }: { p: Profile | PartnerCompany }) {
  return (
    <>
      <Logo url={p.logoUrl} label={`Logo de ${p.name}`} />
      <Text role="heading" style={ui.sectionTitle}>
        {p.name}
      </Text>
      <Text style={ui.body}>{p.reference}</Text>
      {"status" in p && (
        <Badge success={p.status === "ACTIVE"}>
          {names[p.status] ?? p.status}
        </Badge>
      )}
      {"legalName" in p && !!p.legalName && (
        <Text style={ui.body}>{p.legalName}</Text>
      )}
      <Text style={ui.body}>
        {p.phone}
        {"\n"}
        {p.email}
        {"\n"}
        {p.address}
        {"\n"}
        {["district" in p ? p.district : null, p.city, p.countryCode]
          .filter(Boolean)
          .join(" · ")}
      </Text>
      {"description" in p && !!p.description && (
        <Text style={ui.body}>{p.description}</Text>
      )}
    </>
  );
}
function ShopProfile({ context }: { context: Workspace }) {
  const r = useData<Profile>("/partners/profile"),
    [edit, setEdit] = useState(false),
    [draft, setDraft] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  if (!r.data) return <State error={r.error} retry={r.reload} />;
  const p = r.data;
  const fields = [
    ["name", "Nom commercial"],
    ["legalName", "Raison sociale"],
    ["phone", "Téléphone professionnel"],
    ["email", "E-mail professionnel"],
    ["countryCode", "Pays (code à deux lettres)"],
    ["city", "Ville"],
    ["district", "Quartier"],
    ["address", "Adresse"],
    ["description", "Description"],
  ];
  function begin() {
    setDraft(
      Object.fromEntries(
        fields.map(([key]) => [key!, String(p[key as keyof Profile] ?? "")]),
      ),
    );
    setEdit(true);
    setError("");
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("/partners/profile", {
        method: "PATCH",
        body: JSON.stringify({
          ...draft,
          countryCode: draft.countryCode?.toUpperCase(),
          version: p.version,
        }),
      });
      setEdit(false);
      setNotice("Profil de la boutique enregistré.");
      r.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Card>
        <ProfileFields p={p} />
        {!!notice && (
          <Text role="status" style={ui.body}>
            {notice}
          </Text>
        )}
        {context.permissions.includes("shop.profile.write") && (
          <Button secondary title="Modifier le profil" onPress={begin} />
        )}
        <Button secondary title="Actualiser" onPress={r.reload} />
      </Card>
      <Sheet
        open={edit}
        onClose={() => {
          if (!busy) setEdit(false);
        }}
        title="Profil commercial"
      >
        {fields.map(([key, label]) => (
          <Input
            key={key}
            label={label!}
            value={draft[key!] ?? ""}
            multiline={key === "description" || key === "address"}
            autoCapitalize={key === "email" ? "none" : "sentences"}
            keyboardType={
              key === "email"
                ? "email-address"
                : key === "phone"
                  ? "phone-pad"
                  : "default"
            }
            onChangeText={(value) => setDraft((v) => ({ ...v, [key!]: value }))}
          />
        ))}
        {!!error && <ErrorMessage message={error} />}
        <Button title="Enregistrer" busy={busy} onPress={() => void save()} />
        <Button
          secondary
          title="Annuler"
          disabled={busy}
          onPress={() => setEdit(false)}
        />
      </Sheet>
    </>
  );
}
function CarrierSelector({ context }: { context: Workspace }) {
  const auth = useAuth(),
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const options = (auth.profile?.organizations ?? []).filter(
    (c) => c.scope === "SHOP" && c.shopId === context.shopId,
  );
  async function select(key: string) {
    setBusy(true);
    setError("");
    try {
      await auth.select(key);
      router.replace("/espace");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <Text role="heading" style={ui.sectionTitle}>
        Mon transporteur
      </Text>
      <Text style={ui.body}>
        Choisissez parmi les collaborations autorisées de cette boutique.
      </Text>
      <Selector
        label="Transporteur sélectionné"
        value={context.key}
        disabled={busy}
        options={options.map((c) => ({
          id: c.key,
          label: c.companyId
            ? c.companyName
            : "Ma boutique · sans transporteur",
          description:
            c.subscriptionAccess?.valid === false
              ? "Abonnement non valide · consultation seulement"
              : c.companyId
                ? "Collaboration active"
                : "Profil et collaborations de la boutique",
        }))}
        onChange={(key) => void select(key)}
      />
      {!!error && <ErrorMessage message={error} />}
      <Button
        secondary
        title="Actualiser mes accès"
        busy={busy}
        onPress={() => void auth.reload().catch((e) => setError(e.message))}
      />
    </Card>
  );
}
function CollaborationDetail({
  id,
  company,
  context,
  onBack,
}: {
  id: string;
  company: boolean;
  context: Workspace;
  onBack: () => void;
}) {
  const base = company ? "/company/partners" : "/partners/collaborations",
    r = useData<Partner>(`${base}/${id}`),
    auth = useAuth(),
    [action, setAction] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  if (!r.data) return <State error={r.error} retry={r.reload} />;
  const p = r.data,
    other = company ? p.shop : p.company,
    permission = company ? "partners.manage" : "shop.collaborations.manage",
    canManage =
      context.permissions.includes(permission) &&
      (!company || context.subscriptionAccess?.valid !== false),
    incoming = p.origin === (company ? "SHOP" : "COMPANY");
  async function transition() {
    setBusy(true);
    setError("");
    try {
      await api(`${base}/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify({
          version: p.version,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
      });
      setNotice("La collaboration a été mise à jour.");
      setAction("");
      setReason("");
      r.reload();
      await auth.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const titles: Record<string, string> = {
    accept: "Accepter la collaboration",
    reject: "Refuser la demande",
    suspend: "Suspendre la collaboration",
    terminate: "Terminer la collaboration",
    request: "Demander un nouvel accord",
  };
  return (
    <>
      <Button secondary title="Retour à la liste" onPress={onBack} />
      <Card>
        <ProfileFields p={other} />
        <Badge success={p.status === "ACTIVE"}>
          {names[p.status] ?? p.status}
        </Badge>
        <Text style={ui.body}>
          Demande initiée par : {names[p.origin] ?? p.origin}
          {"\n"}Demandée : {date(p.requestedAt)}
          {p.acceptedAt ? `\nAcceptée : ${date(p.acceptedAt)}` : ""}
          {p.suspendedAt ? `\nSuspendue : ${date(p.suspendedAt)}` : ""}
          {p.endedAt ? `\nTerminée : ${date(p.endedAt)}` : ""}
        </Text>
        {!!p.reason && <Text style={ui.body}>Motif : {p.reason}</Text>}
        {p.openOperations &&
          Object.values(p.openOperations).some((count) => count > 0) && (
            <View style={{ gap: 8 }}>
              <Text style={ui.sectionTitle}>Opérations à régulariser</Text>
              <Text style={ui.body}>
                {p.openOperations.stockLocations} emplacement(s) de stock ·{" "}
                {p.openOperations.openOrders} commande(s) ouverte(s) ·{" "}
                {p.openOperations.openDeliveries} livraison(s) en cours ·{" "}
                {p.openOperations.openTransfers} transfert(s) ouvert(s).
              </Text>
              <Text style={ui.body}>
                Ces opérations restent à régler avec le partenaire. Les
                historiques sont conservés après la fin de la collaboration.
              </Text>
            </View>
          )}
        {!!notice && (
          <Text role="status" style={ui.body}>
            {notice}
          </Text>
        )}
        {p.agencies?.length ? (
          <>
            <Text style={ui.sectionTitle}>Agences accessibles</Text>
            {p.agencies.map((a) => (
              <ListRow
                key={a.id}
                title={a.name}
                description={a.city ?? undefined}
                icon="home"
              />
            ))}
          </>
        ) : (
          <Text style={ui.body}>
            Aucune agence particulière n’est définie pour cette collaboration.
          </Text>
        )}
        {canManage && p.status === "PENDING" && incoming && (
          <>
            <Button title="Accepter" onPress={() => setAction("accept")} />
            <Button
              secondary
              title="Refuser"
              onPress={() => setAction("reject")}
            />
          </>
        )}
        {canManage && company && p.status === "ACTIVE" && (
          <Button
            secondary
            title="Suspendre"
            onPress={() => setAction("suspend")}
          />
        )}
        {canManage && ["ACTIVE", "SUSPENDED"].includes(p.status) && (
          <Button
            secondary
            title="Terminer la collaboration"
            onPress={() => setAction("terminate")}
          />
        )}
        {canManage && ["REJECTED", "ENDED", "SUSPENDED"].includes(p.status) && (
          <Button
            secondary
            title="Demander un nouvel accord"
            onPress={() => setAction("request")}
          />
        )}
        <Button secondary title="Actualiser" onPress={r.reload} />
      </Card>
      {!company && p.status === "ACTIVE" && (
        <CarrierSelector context={context} />
      )}
      <Card>
        <Text role="heading" style={ui.sectionTitle}>
          Historique de collaboration
        </Text>
        {p.history?.length ? (
          p.history.map((e) => (
            <ListRow
              key={e.id}
              title={eventNames[e.action] ?? "Modification de collaboration"}
              description={`${date(e.createdAt)}${e.metadata?.reason ? " · " + String(e.metadata.reason) : ""}`}
              icon="clock"
            />
          ))
        ) : (
          <Text style={ui.body}>Aucun événement à afficher.</Text>
        )}
      </Card>
      <Sheet
        open={!!action}
        onClose={() => {
          if (!busy) setAction("");
        }}
        title={titles[action] ?? "Confirmer"}
      >
        <Text style={ui.body}>
          {action === "request"
            ? "Une nouvelle demande sera envoyée. La collaboration restera en attente de l’accord de l’autre partie."
            : action === "terminate"
              ? "Les historiques sont conservés. Les nouvelles opérations seront bloquées pour ce transporteur."
              : "Cette décision sera enregistrée et communiquée à l’autre partie."}
        </Text>
        {action === "terminate" &&
          p.openOperations &&
          Object.values(p.openOperations).some((count) => count > 0) && (
            <Text style={ui.body}>
              Des opérations restent ouvertes. Convenez du règlement des
              opérations engagées et du retrait des marchandises avec votre
              partenaire.
            </Text>
          )}
        {action !== "accept" && (
          <Input
            label="Motif"
            value={reason}
            multiline
            onChangeText={setReason}
          />
        )}
        {!!error && <ErrorMessage message={error} />}
        <Button
          title="Confirmer"
          busy={busy}
          disabled={
            ["reject", "suspend", "terminate"].includes(action) &&
            !reason.trim()
          }
          onPress={() => void transition()}
        />
        <Button
          secondary
          title="Annuler"
          disabled={busy}
          onPress={() => setAction("")}
        />
      </Sheet>
    </>
  );
}
function RequestCarrier({ onCreated }: { onCreated: () => void }) {
  const [reference, setReference] = useState(""),
    [lookup, setLookup] = useState(""),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const r = useData<Page<Profile>>(
    lookup
      ? `/partners/directory/companies?reference=${encodeURIComponent(lookup)}`
      : null,
  );
  async function request() {
    setBusy(true);
    setError("");
    try {
      await api("/partners/collaborations", {
        method: "POST",
        body: JSON.stringify({ companyReference: lookup }),
      });
      setNotice(
        "Demande envoyée. L’entreprise doit l’accepter avant toute nouvelle opération.",
      );
      setOpen(false);
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <Text role="heading" style={ui.sectionTitle}>
        Demander une collaboration
      </Text>
      <Input
        label="Référence de l’entreprise"
        autoCapitalize="characters"
        value={reference}
        onChangeText={setReference}
      />
      <Button
        secondary
        title="Rechercher cette entreprise"
        disabled={!reference.trim()}
        onPress={() => {
          setLookup(reference.trim().toUpperCase());
          setError("");
        }}
      />
      {!!lookup && !r.data && <State error={r.error} retry={r.reload} />}
      {r.data?.items.map((p) => (
        <ListRow
          key={p.id}
          title={p.name}
          description={[p.city, p.countryCode].filter(Boolean).join(" · ")}
          icon="truck"
          onPress={() => setOpen(true)}
        />
      ))}
      {r.data && !r.data.items.length && (
        <Text style={ui.body}>
          Aucune entreprise disponible avec cette référence.
        </Text>
      )}
      {!!notice && (
        <Text role="status" style={ui.body}>
          {notice}
        </Text>
      )}
      <Confirm
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        onConfirm={() => void request()}
        title="Envoyer la demande"
        description="La collaboration restera en attente de validation par cette entreprise."
        busy={busy}
      />
      {!!error && <ErrorMessage message={error} />}
    </Card>
  );
}
function Collaborations({
  context,
  moduleId,
}: {
  context: Workspace;
  moduleId: string;
}) {
  const company = context.scope !== "SHOP",
    requests = [
      "demandes-partenaires",
      "demandes-collaboration",
      "invitations-boutique",
    ].includes(moduleId),
    [page, setPage] = useState(1),
    [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(requests ? "PENDING" : ""),
    [direction, setDirection] = useState(
      moduleId === "invitations-boutique" ? "received" : "",
    ),
    [selected, setSelected] = useState("");
  const base = company
      ? moduleId === "demandes-partenaires"
        ? "/company/partner-requests"
        : "/company/partners"
      : "/partners/collaborations",
    params = new URLSearchParams({
      page: String(page),
      size: "15",
      q: search,
      ...(status ? { status } : {}),
      ...(direction ? { direction } : {}),
    }),
    r = useData<Page<Partner>>(`${base}?${params}`);
  if (selected)
    return (
      <CollaborationDetail
        id={selected}
        company={company}
        context={context}
        onBack={() => {
          setSelected("");
          r.reload();
        }}
      />
    );
  return (
    <>
      {!company && <CarrierSelector context={context} />}
      <Card>
        <Input
          label={
            company ? "Rechercher une boutique" : "Rechercher un transporteur"
          }
          value={q}
          onChangeText={setQ}
          onSubmitEditing={() => {
            setSearch(q.trim());
            setPage(1);
          }}
        />
        <Button
          secondary
          title="Rechercher"
          onPress={() => {
            setSearch(q.trim());
            setPage(1);
          }}
        />
        <Selector
          label="Statut"
          value={status}
          options={statuses}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        {!company && (
          <Selector
            label="Demandes"
            value={direction}
            options={[
              { id: "", label: "Toutes" },
              { id: "received", label: "Invitations reçues" },
              { id: "sent", label: "Demandes envoyées" },
            ]}
            onChange={(v) => {
              setDirection(v);
              setPage(1);
            }}
          />
        )}
      </Card>
      {!r.data ? (
        <State error={r.error} retry={r.reload} />
      ) : (
        <>
          <Card>
            {r.data.items.map((p) => (
              <ListRow
                key={p.id}
                title={
                  company
                    ? p.shop.name
                    : (p.company.tradeName ?? p.company.name)
                }
                description={`${names[p.status] ?? p.status} · ${company ? p.shop.city : p.company.city}`}
                icon={company ? "shopping-bag" : "truck"}
                trailing={
                  <Badge success={p.status === "ACTIVE"}>
                    {names[p.status] ?? p.status}
                  </Badge>
                }
                onPress={() => setSelected(p.id)}
              />
            ))}
            {!r.data.items.length && (
              <EmptyState
                title="Aucune collaboration à afficher"
                description={
                  company
                    ? "Les boutiques invitées et les demandes reçues apparaîtront ici."
                    : "Votre boutique peut demander une collaboration ou accepter une invitation reçue."
                }
                icon="users"
              />
            )}
            <Button secondary title="Actualiser" onPress={r.reload} />
          </Card>
          <Pager page={page} total={r.data.total} setPage={setPage} />
        </>
      )}
      {!company &&
        context.permissions.includes("shop.collaborations.manage") && (
          <RequestCarrier onCreated={r.reload} />
        )}
    </>
  );
}
function Invitations({ shop = false }: { shop?: boolean }) {
  const [page, setPage] = useState(1),
    r = useData<
      Page<{
        id: string;
        email: string;
        fullName: string;
        deliveryStatus: string;
        role?: string;
        acceptedAt: string | null;
        revokedAt: string | null;
        expiresAt: string;
        createdAt: string;
      }>
    >(
      `${shop ? "/partners/invitations" : "/company/partner-invitations"}?page=${page}&size=15`,
    );
  if (!r.data) return <State error={r.error} retry={r.reload} />;
  return (
    <>
      <Card>
        <Text style={ui.body}>
          {shop
            ? "Retrouvez les invitations envoyées aux utilisateurs de votre boutique. Les renvois et retraits sont disponibles dans l’espace Web."
            : "Les invitations à inscrire une nouvelle boutique sont présentées ici. Les demandes adressées à une boutique existante sont suivies dans Boutiques partenaires."}
        </Text>
        {r.data.items.map((i) => (
          <ListRow
            key={i.id}
            title={i.fullName}
            description={`${i.email}\n${i.acceptedAt ? "Acceptée" : i.revokedAt ? "Révoquée" : new Date(i.expiresAt).getTime() <= Date.now() ? "Expirée" : i.deliveryStatus === "FAILED" ? "Envoi à reprendre sur le Web" : "En attente"} · ${date(i.createdAt)}`}
            icon="mail"
          />
        ))}
        {!r.data.items.length && (
          <EmptyState
            title="Aucune invitation envoyée"
            description={
              shop
                ? "Les invitations envoyées à votre équipe apparaîtront ici."
                : "Les invitations à inscrire une nouvelle boutique apparaîtront ici."
            }
            icon="mail"
          />
        )}
        <Button secondary title="Actualiser" onPress={r.reload} />
      </Card>
      <Pager page={page} total={r.data.total} setPage={setPage} />
    </>
  );
}
function Users() {
  const [page, setPage] = useState(1),
    r = useData<Page<Member>>(`/partners/users?page=${page}&size=15`);
  if (!r.data) return <State error={r.error} retry={r.reload} />;
  return (
    <>
      <Card>
        <Text style={ui.body}>
          Les invitations et la gestion détaillée des rôles sont disponibles
          dans l’espace Web de votre boutique.
        </Text>
        {r.data.items.map((m) => (
          <ListRow
            key={m.userId}
            title={m.user.fullName}
            description={`${names[m.role] ?? m.role} · ${m.active ? "Affiliation active" : "Affiliation inactive"}\n${m.user.email}`}
            icon="user"
          />
        ))}
        {!r.data.items.length && (
          <EmptyState
            title="Aucun utilisateur"
            description="Les personnes autorisées apparaîtront ici."
          />
        )}
      </Card>
      <Pager page={page} total={r.data.total} setPage={setPage} />
    </>
  );
}
function History() {
  const [page, setPage] = useState(1),
    r = useData<Page<Event>>(`/partners/history?page=${page}&size=15`);
  if (!r.data) return <State error={r.error} retry={r.reload} />;
  return (
    <>
      <Card>
        {r.data.items.map((e) => (
          <ListRow
            key={e.id}
            title={eventNames[e.action] ?? "Modification de la boutique"}
            description={date(e.createdAt)}
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
function Notifications({ company = false }: { company?: boolean }) {
  const [page, setPage] = useState(1),
    r = useData<Page<Notification>>(
      `${company ? "/company/partner-notifications" : "/partners/notifications"}?page=${page}&size=15`,
    );
  if (!r.data) return <State error={r.error} retry={r.reload} />;
  return (
    <>
      <Card>
        {r.data.items.map((n) => (
          <ListRow
            key={n.id}
            title={
              n.subject ??
              n.payload?.title ??
              eventNames[n.sourceEvent ?? n.eventType ?? ""] ??
              "Actualité de collaboration"
            }
            description={`${n.payload?.message ?? [n.payload?.shopName, n.payload?.companyName].filter(Boolean).join(" · ")}\n${date(n.createdAt)}`}
            icon="bell"
          />
        ))}
        {!r.data.items.length && (
          <Text style={ui.body}>Aucune notification à afficher.</Text>
        )}
      </Card>
      <Pager page={page} total={r.data.total} setPage={setPage} />
    </>
  );
}
function ShopSettings({ context }: { context: Workspace }) {
  const router = useRouter();
  return (
    <>
      <Card>
        <Text role="heading" style={ui.sectionTitle}>
          {context.shopName}
        </Text>
        <Text style={ui.body}>Rôle : {context.roleName}</Text>
        <ListRow
          title="Profil commercial"
          description="Coordonnées et informations de la boutique"
          icon="shopping-bag"
          onPress={() =>
            router.push({
              pathname: "/espace/[module]",
              params: { module: "profil-boutique" },
            })
          }
        />
        <ListRow
          title="Mon compte et ma sécurité"
          description="Mot de passe, informations personnelles et sessions"
          icon="shield"
          onPress={() => router.push("/profil")}
        />
        <ListRow
          title="Mes environnements"
          description="Choisir une boutique ou un transporteur autorisé"
          icon="home"
          onPress={() => router.push("/organisations")}
        />
      </Card>
      <CarrierSelector context={context} />
      {context.permissions.includes("shop.notifications.read") && (
        <Notifications />
      )}
    </>
  );
}
function ShopHome({ context }: { context: Workspace }) {
  const router = useRouter();
  return (
    <>
      <Card>
        <Text role="heading" style={ui.sectionTitle}>
          {context.shopName ?? "Ma boutique"}
        </Text>
        <Text style={ui.body}>
          Retrouvez vos partenaires et les demandes de collaboration de votre
          boutique.
        </Text>
        <ListRow
          title="Mon profil commercial"
          icon="shopping-bag"
          onPress={() =>
            router.push({
              pathname: "/espace/[module]",
              params: { module: "profil-boutique" },
            })
          }
        />
        <ListRow
          title="Mes transporteurs"
          icon="truck"
          onPress={() =>
            router.push({
              pathname: "/espace/[module]",
              params: { module: "transporteurs" },
            })
          }
        />
        <ListRow
          title="Demandes de collaboration"
          icon="mail"
          onPress={() =>
            router.push({
              pathname: "/espace/[module]",
              params: { module: "demandes-collaboration" },
            })
          }
        />
      </Card>
      <CarrierSelector context={context} />
      {context.subscriptionAccess?.valid === false && (
        <Card>
          <Text style={ui.body}>
            L’abonnement de ce transporteur n’est pas valide. Les nouvelles
            opérations sont bloquées pour lui. Vous pouvez consulter vos
            collaborations et choisir un autre transporteur actif.
          </Text>
        </Card>
      )}
    </>
  );
}
export function PartnersScreen({
  moduleId,
  context,
}: {
  moduleId: string;
  context: Workspace;
}) {
  const titles: Record<string, string> = {
    accueil: "Ma boutique",
    "profil-boutique": "Profil commercial",
    transporteurs: "Entreprises partenaires",
    "demandes-collaboration": "Demandes de collaboration",
    "invitations-boutique": "Invitations utilisateurs",
    "utilisateurs-boutique": "Utilisateurs de la boutique",
    "historique-boutique": "Historique de la boutique",
    partenaires: "Boutiques partenaires",
    "demandes-partenaires": "Demandes reçues",
    "invitations-partenaires": "Invitations envoyées",
    "notifications-boutique": "Notifications de la boutique",
    "notifications-partenaires": "Notifications des partenaires",
    parametres: "Paramètres de la boutique",
  };
  return (
    <View style={{ gap: 18 }}>
      <Text style={ui.kicker}>
        {context.scope === "SHOP" ? context.shopName : context.companyName}
      </Text>
      <Text role="heading" style={ui.sectionTitle}>
        {titles[moduleId] ?? "Mes partenaires"}
      </Text>
      {moduleId === "accueil" ? (
        <ShopHome context={context} />
      ) : moduleId === "profil-boutique" ? (
        <ShopProfile context={context} />
      ) : ["notifications-boutique", "notifications-partenaires"].includes(
          moduleId,
        ) ? (
        <Notifications company={context.scope !== "SHOP"} />
      ) : moduleId === "invitations-partenaires" ? (
        <Invitations />
      ) : moduleId === "invitations-boutique" ? (
        <Invitations shop />
      ) : moduleId === "utilisateurs-boutique" ? (
        <Users />
      ) : moduleId === "historique-boutique" ? (
        <History />
      ) : moduleId === "parametres" ? (
        <ShopSettings context={context} />
      ) : (
        <Collaborations context={context} moduleId={moduleId} />
      )}
    </View>
  );
}
