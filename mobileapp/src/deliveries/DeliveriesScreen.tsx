import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Button,
  Card,
  Input,
  Selector,
  ListRow,
  ErrorMessage,
  EmptyState,
  ui,
} from "../design/ui";
import { LoadState, Pager, localKey, date } from "../stocks/ui";
import { api } from "../auth/client";
import type { Workspace } from "../auth/types";
import { useDeliveryData } from "./useDeliveryData";
import { DeliveryDetail } from "./DeliveryDetail";
import { DeliveryActionForm } from "./DeliveryActionForm";
import {
  deliveryPhases,
  deliveryStates,
  deliveryEvents,
  type DeliveryPage,
  type DeliveryMission,
  type DeliveryOptions,
  type DispatchOrder,
  type EligibleDriver,
  type PendingHandover,
} from "../../../shared/deliveries";
export function DeliveriesScreen({
  context,
  moduleId,
  scrollToTop,
}: {
  context: Workspace;
  moduleId: string;
  scrollToTop: () => void;
}) {
  const params = useLocalSearchParams<{ mission?: string }>(),
    router = useRouter(),
    [selected, setSelected] = useState<string | null>(params.mission ?? null),
    [page, setPage] = useState(1),
    [q, setQ] = useState(""),
    [filter, setFilter] = useState<Record<string, string>>({
      ...(moduleId === "confirmations" ? { phase: "AWAITING_PROOF" } : {}),
      ...(moduleId === "incidents" ? { incident: "open" } : {}),
      ...(moduleId === "retours" ? { returns: "true" } : {}),
      ...(moduleId === "acheminements" ? { transfers: "true" } : {}),
    }),
    [board, setBoard] = useState(moduleId === "affectations"),
    [filtersOpen, setFiltersOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [handover, setHandover] = useState<PendingHandover>(),
    creationKeys = useRef(new Map<string, string>()),
    lock = useRef(false);
  const driver =
      context.permissions.includes("deliveries.self.read") &&
      !context.permissions.includes("deliveries.supervise.read"),
    history = driver && moduleId === "historique",
    options = useDeliveryData<DeliveryOptions>("/deliveries/options"),
    list = useDeliveryData<DeliveryPage<DeliveryMission>>(
      !selected
        ? `/deliveries?${new URLSearchParams({ ...Object.fromEntries(Object.entries(filter).filter(([, v]) => v)), q, page: String(page), size: "10", ...(history ? { history: "true" } : {}) })}`
        : null,
    ),
    queue = useDeliveryData<DeliveryPage<DispatchOrder>>(
      board && !selected
        ? `/deliveries/queue?page=${page}&size=10&q=${encodeURIComponent(q)}`
        : null,
    ),
    incoming = useDeliveryData<PendingHandover[]>(
      driver && !selected ? "/driver/handovers" : null,
    ),
    notifications = useDeliveryData<
      Array<{
        id: string;
        payload: { publicNumber: string; deliveryId: string; event: string };
        createdAt: string;
      }>
    >(
      driver && moduleId === "notifications"
        ? "/deliveries/notifications"
        : null,
    ),
    [agency, setAgency] = useState(context.agencyId ?? ""),
    drivers = useDeliveryData<EligibleDriver[]>(
      board && agency
        ? `/deliveries/eligible-drivers?agencyId=${agency}`
        : null,
    );
  async function create(order: DispatchOrder) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      let key = creationKeys.current.get(order.id);
      if (!key) {
        key = localKey();
        creationKeys.current.set(order.id, key);
      }
      const mission = await api<DeliveryMission>("/deliveries", {
        method: "POST",
        body: JSON.stringify({
          orderId: order.id,
          orderVersion: order.version,
          operationKey: key,
        }),
      });
      setSelected(mission.id);
      queue.reload();
      list.reload();
      scrollToTop();
    } catch (e) {
      setError((e as Error).message);
      scrollToTop();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const change = (key: string, value: string) => {
    setPage(1);
    setFilter((f) => ({ ...f, [key]: value }));
  };
  if (handover)
    return (
      <DeliveryActionForm
        key={handover.id}
        code="HANDOVER_ACCEPT"
        handover={handover}
        context={context}
        scrollToTop={scrollToTop}
        onClose={() => {
          setHandover(undefined);
          scrollToTop();
        }}
        onDone={() => {
          setHandover(undefined);
          incoming.reload();
          list.reload();
          scrollToTop();
        }}
      />
    );
  if (selected)
    return (
      <DeliveryDetail
        id={selected}
        context={context}
        options={options.data}
        scrollToTop={scrollToTop}
        onBack={() => {
          setSelected(null);
          list.reload();
          queue.reload();
          incoming.reload();
          scrollToTop();
        }}
      />
    );
  return (
    <View style={ui.stack}>
      <Text style={ui.kicker}>EXPLOITATION LOGISTIQUE</Text>
      <Text role="heading" style={ui.sectionTitle}>
        {driver
          ? history
            ? "Historique de mes missions"
            : "Mes missions"
          : context.scope === "SHOP"
            ? "Suivi de mes colis"
            : board
              ? "Commandes à organiser"
              : "Livraisons et colis"}
      </Text>
      <Text style={ui.body}>
        {list.syncing
          ? "Synchronisation…"
          : list.lastSync
            ? `Actualisé à ${new Date(list.lastSync).toLocaleTimeString("fr-FR")}`
            : "Actualisation en attente"}
        {"\n"}Actualisation toutes les 30 secondes quand cet écran est actif.
      </Text>
      <Button
        secondary
        title="Actualiser les missions"
        onPress={() => {
          list.reload();
          queue.reload();
          incoming.reload();
          notifications.reload();
        }}
      />
      {driver && moduleId === "accueil" && (
        <Button
          secondary
          title="Ma disponibilité déclarée"
          onPress={() => router.push("/espace/profil-livreur")}
        />
      )}
      {context.permissions.includes("deliveries.assign") && (
        <Button
          secondary
          title={board ? "Consulter les missions" : "Ouvrir le dispatching"}
          onPress={() => {
            setBoard((v) => !v);
            setPage(1);
            scrollToTop();
          }}
        />
      )}
      {list.data?.summary && (
        <Card>
          <View style={ui.stack}>
            <Text style={ui.sectionTitle}>
              {list.data.summary.waiting} en attente / affectée(s)
            </Text>
            <Text style={ui.body}>
              {list.data.summary.active} en cours · {list.data.summary.failures}{" "}
              échec(s) à traiter
            </Text>
            <Text style={ui.body}>
              {list.data.summary.returns} retour(s) en cours
            </Text>
          </View>
        </Card>
      )}
      {!!error && <ErrorMessage message={error} />}
      {!!incoming.data?.length && (
        <Card>
          <View style={ui.stack}>
            <Text style={ui.sectionTitle}>Remises de garde à accepter</Text>
            {incoming.data.map((h) => (
              <ListRow
                key={h.id}
                title={h.publicNumber}
                description={`${h.fromName} · ${h.agencyName}`}
                onPress={() => {
                  setHandover(h);
                  scrollToTop();
                }}
              />
            ))}
          </View>
        </Card>
      )}
      {moduleId === "notifications" && notifications.data && (
        <Card>
          <View style={ui.stack}>
            <Text style={ui.sectionTitle}>Événements de mes missions</Text>
            {notifications.data.map((n) => (
              <ListRow
                key={n.id}
                title={deliveryEvents[n.payload.event] ?? "Mise à jour"}
                description={`${n.payload.publicNumber}\n${date(n.createdAt)}`}
                onPress={() => {
                  setSelected(n.payload.deliveryId);
                  scrollToTop();
                }}
              />
            ))}
          </View>
        </Card>
      )}
      <Input
        label="Référence ou destinataire"
        value={q}
        onChangeText={(v) => {
          setQ(v);
          setPage(1);
        }}
      />
      {!board && (
        <Button
          secondary
          title={filtersOpen ? "Masquer les filtres" : "Filtres de missions"}
          onPress={() => setFiltersOpen((v) => !v)}
        />
      )}
      {!board && filtersOpen && (
        <>
          <Selector
            label="État logistique"
            value={filter.phase ?? ""}
            options={[
              { id: "", label: "Toutes les étapes" },
              ...Object.entries(deliveryPhases).map(([id, label]) => ({
                id,
                label,
              })),
            ]}
            onChange={(v) => change("phase", v)}
          />
          <Selector
            label="Statut"
            value={filter.status ?? ""}
            options={[
              { id: "", label: "Tous" },
              ...Object.entries(deliveryStates).map(([id, label]) => ({
                id,
                label,
              })),
            ]}
            onChange={(v) => change("status", v)}
          />
          <Selector
            label="Agence actuelle"
            value={filter.agencyId ?? ""}
            options={[
              { id: "", label: "Toutes celles du contexte" },
              ...(options.data?.agencies ?? []).map((a) => ({
                id: a.id,
                label: a.name,
              })),
            ]}
            onChange={(v) => change("agencyId", v)}
          />
          {context.scope === "SHOP" && (
            <Selector
              label="Transporteur"
              value={filter.companyId ?? ""}
              options={[
                { id: "", label: "Tous ceux du contexte" },
                ...(options.data?.companies ?? []).map((a) => ({
                  id: a.id,
                  label: a.name,
                })),
              ]}
              onChange={(v) => {
                change("companyId", v);
                change("agencyId", "");
              }}
            />
          )}
          <Input
            label="Du · AAAA-MM-JJ"
            value={filter.from ?? ""}
            onChangeText={(v) => change("from", v)}
          />
          <Input
            label="Au · AAAA-MM-JJ"
            value={filter.to ?? ""}
            onChangeText={(v) => change("to", v)}
          />
        </>
      )}
      {board ? (
        <>
          <Card>
            <View style={ui.stack}>
              <Text style={ui.sectionTitle}>Livreurs et charge actuelle</Text>
              <Selector
                label="Agence de dispatching"
                value={agency}
                options={(options.data?.agencies ?? []).map((a) => ({
                  id: a.id,
                  label: a.name,
                }))}
                onChange={setAgency}
              />
              {drivers.error && (
                <ErrorMessage message={drivers.error} retry={drivers.reload} />
              )}
              {drivers.data?.map((d) => (
                <Text key={d.id} style={ui.body}>
                  {d.fullName} · {d.eligible ? "Disponible" : "Non éligible"} ·{" "}
                  {d.activeMissions} mission(s)
                </Text>
              ))}
            </View>
          </Card>
          {!queue.data ? (
            <LoadState error={queue.error} retry={queue.reload} />
          ) : queue.data.items.length ? (
            queue.data.items.map((o) => (
              <Card key={o.id}>
                <View style={ui.stack}>
                  <Text style={ui.sectionTitle}>{o.publicNumber}</Text>
                  <Text style={ui.body}>
                    {o.collaboration.shop.name} · {o.agency.name}
                    {"\n"}
                    {o.type === "FROM_STOCK" ? "Depuis stock" : "Ponctuelle"}
                  </Text>
                  <Text style={ui.body}>
                    {o.recipientName} · {o.recipientAddress}, {o.recipientCity}
                  </Text>
                  <Text style={ui.body}>
                    {o.pickup?.address ?? "Marchandises en agence"}
                  </Text>
                  <Button
                    busy={busy}
                    title="Organiser la mission"
                    onPress={() => void create(o)}
                  />
                </View>
              </Card>
            ))
          ) : (
            <EmptyState
              title="Aucune commande à organiser"
              description="Aucune commande sans mission dans ce périmètre."
            />
          )}
        </>
      ) : !list.data ? (
        <LoadState error={list.error} retry={list.reload} />
      ) : list.data.items.length ? (
        <>
          {list.error && (
            <ErrorMessage message={list.error} retry={list.reload} />
          )}
          {list.data.items.map((m) => {
            const old = m as unknown as { publicNumber?: string };
            return (
              <Card key={m.id}>
                <ListRow
                  title={
                    m.order?.publicNumber ??
                    old.publicNumber ??
                    "Mission passée"
                  }
                  description={`${m.order?.recipientName ?? "Historique des affectations personnelles"}\n${deliveryPhases[m.phase ?? ""] ?? deliveryStates[m.status]}\n${m.agency?.name ?? ""}${m.courier?.fullName ? ` · ${m.courier.fullName}` : ""}`}
                  onPress={
                    history
                      ? undefined
                      : () => {
                          setSelected(m.id);
                          scrollToTop();
                        }
                  }
                />
                {history && (
                  <Text style={ui.body}>
                    Données du destinataire masquées après la fin de votre
                    affectation.
                  </Text>
                )}
              </Card>
            );
          })}
        </>
      ) : (
        <EmptyState
          title="Aucune mission"
          description="Aucun résultat dans votre périmètre avec ces filtres."
        />
      )}
      <Pager
        page={page}
        size={10}
        total={(board ? queue.data?.total : list.data?.total) ?? 0}
        setPage={setPage}
      />
    </View>
  );
}
export function OrderDeliveryProgress({
  orderId,
  context,
}: {
  orderId: string;
  context: Workspace;
}) {
  const router = useRouter(),
    r = useDeliveryData<DeliveryMission | null>(
      `/deliveries/by-order/${orderId}`,
    );
  return (
    <Card>
      <View style={ui.stack}>
        <Text style={ui.sectionTitle}>Suivi logistique</Text>
        {r.error ? (
          <ErrorMessage message={r.error} retry={r.reload} />
        ) : r.data ? (
          <>
            <Text style={ui.body}>
              {deliveryPhases[r.data.phase ?? ""] ??
                deliveryStates[r.data.status]}
              {"\n"}
              {r.data.agency.name}
            </Text>
            <Button
              secondary
              title="Consulter l’acheminement et les événements"
              onPress={() =>
                router.push(
                  `/espace/${context.scope === "SHOP" ? "suivi" : "livraisons"}?mission=${r.data!.id}`,
                )
              }
            />
          </>
        ) : (
          <Text style={ui.body}>
            La mission sera visible après organisation par le transporteur.
          </Text>
        )}
      </View>
    </Card>
  );
}
