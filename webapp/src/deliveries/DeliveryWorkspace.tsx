import { useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api } from "../auth/client";
import type { Workspace } from "../auth/types";
import {
  Button,
  Card,
  DataTable,
  Select,
  Field,
  ErrorState,
  Skeleton,
  EmptyState,
  Badge,
} from "../design/ui";
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
import "../orders/orders.css";
import "../stocks/stocks.css";
import "./deliveries.css";
export function DeliveryWorkspace({
  context,
  moduleId,
}: {
  context: Workspace;
  moduleId: string;
}) {
  const [params] = useSearchParams(),
    [selected, setSelected] = useState<string | null>(params.get("mission")),
    [page, setPage] = useState(1),
    [filter, setFilter] = useState<Record<string, string>>({
      ...(moduleId === "confirmations" ? { phase: "AWAITING_PROOF" } : {}),
      ...(moduleId === "incidents" ? { incident: "open" } : {}),
      ...(moduleId === "retours" ? { returns: "true" } : {}),
      ...(moduleId === "acheminements" ? { transfers: "true" } : {}),
    }),
    [q, setQ] = useState(""),
    [board, setBoard] = useState(moduleId === "affectations"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [handover, setHandover] = useState<PendingHandover>();
  const isDriver =
      context.permissions.includes("deliveries.self.read") &&
      !context.permissions.includes("deliveries.supervise.read"),
    history = isDriver && moduleId === "historique",
    options = useDeliveryData<DeliveryOptions>("/deliveries/options"),
    list = useDeliveryData<DeliveryPage<DeliveryMission>>(
      `/deliveries?${new URLSearchParams({ ...Object.fromEntries(Object.entries(filter).filter(([, v]) => v)), q, page: String(page), ...(history ? { history: "true" } : {}) })}`,
    ),
    queue = useDeliveryData<DeliveryPage<DispatchOrder>>(
      board
        ? `/deliveries/queue?page=${page}&q=${encodeURIComponent(q)}`
        : null,
    ),
    incoming = useDeliveryData<PendingHandover[]>(
      isDriver ? "/driver/handovers" : null,
    ),
    notifications = useDeliveryData<
      Array<{
        id: string;
        sourceEvent: string;
        payload: { publicNumber: string; deliveryId: string; event: string };
        createdAt: string;
      }>
    >(isDriver ? "/deliveries/notifications" : null),
    lock = useRef(false),
    creationKeys = useRef(new Map<string, string>());
  const [agency, setAgency] = useState(context.agencyId ?? ""),
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
        key = crypto.randomUUID();
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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const change = (key: string, value: string) => {
    setPage(1);
    setFilter((f) => ({ ...f, [key]: value }));
  };
  if (selected)
    return (
      <DeliveryDetail
        id={selected}
        context={context}
        options={options.data}
        onBack={() => {
          setSelected(null);
          list.reload();
          queue.reload();
        }}
      />
    );
  return (
    <>
      <div className="stock-heading">
        <div>
          <span className="eyebrow">EXPLOITATION LOGISTIQUE</span>
          <h1>
            {isDriver
              ? history
                ? "Historique de mes missions"
                : "Mes missions"
              : context.scope === "SHOP"
                ? "Suivi de mes colis"
                : board
                  ? "Commandes à organiser"
                  : "Livraisons et colis"}
          </h1>
          <p>
            Une affectation et une remise physique sont deux opérations
            distinctes.
          </p>
        </div>
        {context.permissions.includes("deliveries.assign") && (
          <Button
            variant="secondary"
            onClick={() => {
              setBoard((v) => !v);
              setPage(1);
            }}
          >
            {board ? "Consulter les missions" : "Ouvrir le dispatching"}
          </Button>
        )}
      </div>
      <div className="delivery-sync">
        <span>
          {list.syncing
            ? "Synchronisation…"
            : `Dernière actualisation : ${list.lastSync ? new Date(list.lastSync).toLocaleTimeString("fr-FR") : "en attente"}`}
        </span>
        <span>Actualisation toutes les 30 secondes sur cette page active.</span>
        <Button
          variant="ghost"
          onClick={() => {
            list.reload();
            queue.reload();
            incoming.reload();
            notifications.reload();
          }}
        >
          Actualiser
        </Button>
      </div>
      {list.data?.summary && (
        <div className="stock-metrics">
          {[
            ["En attente / affectées", list.data.summary.waiting],
            ["En cours", list.data.summary.active],
            ["Échecs à traiter", list.data.summary.failures],
            ["Retours en cours", list.data.summary.returns],
          ].map(([label, value]) => (
            <Card key={label}>
              <small>{label}</small>
              <h2>{value}</h2>
            </Card>
          ))}
        </div>
      )}
      {!!error && <ErrorState message={error} />}
      {!!incoming.data?.length && (
        <Card>
          <h2>Remises de garde à accepter</h2>
          {incoming.data.map((h) => (
            <div className="delivery-history-item" key={h.id}>
              <strong>{h.publicNumber}</strong>
              <p>
                {h.fromName} · {h.agencyName}
              </p>
              <Button onClick={() => setHandover(h)}>Examiner la remise</Button>
            </div>
          ))}
        </Card>
      )}
      {moduleId === "notifications" && notifications.data && (
        <Card>
          <h2>Événements de mes missions</h2>
          {notifications.data.map((n) => (
            <p key={n.id}>
              {deliveryEvents[n.payload.event] ?? "Mise à jour"} ·{" "}
              {n.payload.publicNumber} ·{" "}
              {new Date(n.createdAt).toLocaleString("fr-FR")}
            </p>
          ))}
        </Card>
      )}
      <Card>
        <div className="delivery-filters">
          <Field
            label="Référence ou destinataire"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
          {!board && (
            <>
              <Select
                label="État logistique"
                value={filter.phase ?? ""}
                onChange={(e) => change("phase", e.target.value)}
              >
                <option value="">Toutes les étapes</option>
                {Object.entries(deliveryPhases).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </Select>
              <Select
                label="Statut"
                value={filter.status ?? ""}
                onChange={(e) => change("status", e.target.value)}
              >
                <option value="">Tous</option>
                {Object.entries(deliveryStates).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </Select>
              <Select
                label="Agence actuelle"
                value={filter.agencyId ?? ""}
                onChange={(e) => change("agencyId", e.target.value)}
              >
                <option value="">Toutes celles du contexte</option>
                {options.data?.agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
              {context.scope === "SHOP" && (
                <Select
                  label="Agence de livraison"
                  value={filter.companyId ?? ""}
                  onChange={(e) => {
                    change("companyId", e.target.value);
                    change("agencyId", "");
                  }}
                >
                  <option value="">Tous ceux du contexte</option>
                  {options.data?.companies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              )}
              <Field
                label="Du"
                type="date"
                value={filter.from ?? ""}
                onChange={(e) => change("from", e.target.value)}
              />
              <Field
                label="Au"
                type="date"
                value={filter.to ?? ""}
                onChange={(e) => change("to", e.target.value)}
              />
            </>
          )}
        </div>
      </Card>
      {board ? (
        <>
          <Card>
            <h2>Livreurs et charge actuelle</h2>
            <Select
              label="Agence de dispatching"
              value={agency}
              onChange={(e) => setAgency(e.target.value)}
            >
              <option value="">Choisir une agence</option>
              {options.data?.agencies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            {drivers.error && (
              <ErrorState message={drivers.error} retry={drivers.reload} />
            )}
            <div className="delivery-actions">
              {drivers.data?.map((d) => (
                <p key={d.id}>
                  {d.fullName} · {d.eligible ? "Disponible" : "Non éligible"} ·{" "}
                  {d.activeMissions} mission(s)
                </p>
              ))}
            </div>
          </Card>
          {queue.error ? (
            <ErrorState message={queue.error} retry={queue.reload} />
          ) : !queue.data ? (
            <Skeleton />
          ) : queue.data.items.length ? (
            <Card>
              <DataTable
                caption="Commandes sans mission"
                columns={[
                  "Commande",
                  "Boutique / agence",
                  "Type",
                  "Collecte / destination",
                  "",
                ]}
                rows={queue.data.items.map((o) => [
                  <strong className="order-reference">{o.publicNumber}</strong>,
                  `${o.collaboration.shop.name} · ${o.agency.name}`,
                  o.type === "FROM_STOCK" ? "Depuis stock" : "Ponctuelle",
                  <div>
                    {o.pickup?.address ?? "Marchandises en agence"}
                    <small className="admin-block">
                      {o.recipientName} · {o.recipientAddress},{" "}
                      {o.recipientCity}
                    </small>
                  </div>,
                  <Button disabled={busy} busy={busy} onClick={() => create(o)}>
                    Organiser la mission
                  </Button>,
                ])}
              />
            </Card>
          ) : (
            <EmptyState
              title="Aucune commande à organiser"
              description="Toutes les commandes de ce périmètre disposent déjà d’une mission, ou aucune n’est en attente."
            />
          )}
        </>
      ) : list.error && !list.data ? (
        <ErrorState message={list.error} retry={list.reload} />
      ) : !list.data ? (
        <Skeleton />
      ) : list.data.items.length ? (
        <>
          <Card>
            <DataTable
              caption="Missions autorisées"
              columns={[
                "Commande / colis",
                "Agence",
                "Étape",
                "Garde / livreur",
                "Statut",
                "",
              ]}
              rows={list.data.items.map((m) => {
                const historical = m as unknown as { publicNumber?: string };
                return [
                  <strong className="order-reference">
                    {m.order?.publicNumber ?? historical.publicNumber}
                    <small className="admin-block">{m.parcelReference}</small>
                  </strong>,
                  m.agency?.name ?? "Mission passée",
                  deliveryPhases[m.phase ?? ""] ?? "À examiner",
                  m.custody?.type === "RECIPIENT"
                    ? custodyLabelsSafe(m.custody.type)
                    : m.courier?.fullName ?? custodyLabelsSafe(m.custody?.type),
                  <Badge>{deliveryStates[m.status]}</Badge>,
                  history ? (
                    <span>Historique limité aux affectations personnelles</span>
                  ) : (
                    <Button variant="ghost" onClick={() => setSelected(m.id)}>
                      Consulter la mission
                    </Button>
                  ),
                ];
              })}
            />
          </Card>
          {list.error && (
            <ErrorState message={list.error} retry={list.reload} />
          )}
        </>
      ) : (
        <EmptyState
          title="Aucune mission"
          description="Aucune mission ne correspond à votre périmètre et aux filtres actuels."
        />
      )}
      <div className="delivery-actions">
        <Button
          variant="secondary"
          disabled={page === 1}
          onClick={() => setPage((n) => n - 1)}
        >
          Précédent
        </Button>
        <span>
          Page {page} · {(board ? queue.data?.total : list.data?.total) ?? 0}{" "}
          résultat(s)
        </span>
        <Button
          variant="secondary"
          disabled={
            page * 20 >= ((board ? queue.data?.total : list.data?.total) ?? 0)
          }
          onClick={() => setPage((n) => n + 1)}
        >
          Suivant
        </Button>
      </div>
      {handover && (
        <DeliveryActionForm
          key={handover.id}
          code="HANDOVER_ACCEPT"
          handover={handover}
          context={context}
          onClose={() => setHandover(undefined)}
          onDone={() => {
            setHandover(undefined);
            incoming.reload();
            list.reload();
          }}
        />
      )}
    </>
  );
}
function custodyLabelsSafe(type?: string | null) {
  return (
    (
      {
        RECIPIENT: "Destinataire",
        SHOP: "Boutique",
        AGENCY: "Agence",
        COURIER: "Livreur",
        TRANSPORT: "Transport",
      } as Record<string, string>
    )[type ?? ""] ?? "À vérifier"
  );
}
export function OrderDeliveryProgress({
  orderId,
  context,
}: {
  orderId: string;
  context: Workspace;
}) {
  const r = useDeliveryData<DeliveryMission | null>(
    `/deliveries/by-order/${orderId}`,
  );
  return (
    <Card>
      <h2>Suivi logistique</h2>
      {r.error ? (
        <ErrorState message={r.error} retry={r.reload} />
      ) : r.data ? (
        <>
          <Badge>
            {deliveryPhases[r.data.phase ?? ""] ??
              deliveryStates[r.data.status]}
          </Badge>
          <p>
            {r.data.agency.name} · {r.data.parcelReference}
          </p>
          <Link
            className="ds-button ds-secondary"
            to={`/portail/${context.portal}/${context.scope === "SHOP" ? "suivi" : "livraisons"}?mission=${r.data.id}`}
          >
            Consulter l’acheminement et les événements
          </Link>
        </>
      ) : (
        <p>La mission sera visible après organisation par l’agence de livraison.</p>
      )}
    </Card>
  );
}
