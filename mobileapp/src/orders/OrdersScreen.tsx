import { useState, useRef } from "react";
import { Text, View } from "react-native";
import {
  Button,
  Card,
  Input,
  Selector,
  ListRow,
  Badge,
  ErrorMessage,
  EmptyState,
  Sheet,
  ui,
} from "../design/ui";
import { useStockData, LoadState, Pager, date } from "../stocks/ui";
import { api } from "../auth/client";
import { OrderDeliveryProgress } from "../deliveries/DeliveriesScreen";
import {OrderFinanceSummary} from "../finance/FinanceScreen";
import { deliveryEvents } from "../../../shared/deliveries";
import type { Workspace } from "../auth/types";
import {
  orderCan,
  orderStatus,
  orderEventLabel,
  orderChanges,
  type OrderDTO,
  type OrderPage,
  type OrderOptions,
  type OrderEvent,
} from "../../../shared/orders";
import { OrderForm } from "./OrderForm";
export function OrdersScreen({
  context,
  moduleId,
  scrollToTop,
}: {
  context: Workspace;
  moduleId: string;
  scrollToTop: () => void;
}) {
  const [mode, setMode] = useState<"list" | "detail" | "form">(
      moduleId === "nouvelle-commande" ? "form" : "list",
    ),
    [selected, setSelected] = useState<OrderDTO>(),
    [page, setPage] = useState(1),
    [filter, setFilter] = useState<Record<string, string>>({
      draft: moduleId === "brouillons" ? "true" : "false",
    }),
    [q, setQ] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [cancel, setCancel] = useState(false),
    [reason, setReason] = useState(""),
    lock = useRef(false);
  const options = useStockData<OrderOptions>("/orders/options"),
    list = useStockData<OrderPage<OrderDTO>>(
      `/orders?${new URLSearchParams({ ...Object.fromEntries(Object.entries(filter).filter(([, v]) => v)), q, page: String(page), size: "10" })}`,
    ),
    detail = useStockData<OrderDTO>(selected ? `/orders/${selected.id}` : null),
    history = useStockData<OrderEvent[]>(
      selected ? `/orders/${selected.id}/history` : null,
    ),
    p = detail.data ?? selected;
  const change = (k: string, value: string) => {
    setPage(1);
    setFilter((v) => ({ ...v, [k]: value }));
  };
  const open = (row: OrderDTO) => {
    setSelected(row);
    setMode("detail");
    setError("");
    detail.reload();
    history.reload();
    scrollToTop();
  };
  async function action(kind: "submit" | "cancel") {
    if (!p || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const updated = await api<OrderDTO>(`/orders/${p.id}/${kind}`, {
        method: "POST",
        body: JSON.stringify({
          version: p.version,
          ...(kind === "cancel" ? { reason } : {}),
        }),
      });
      setSelected(updated);
      setCancel(false);
      detail.reload();
      history.reload();
      list.reload();
    } catch (e) {
      setError(
        `${(e as Error).message} Actualisez la fiche pour vérifier son état avant de réessayer.`,
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (mode === "form")
    return options.data ? (
      <OrderForm
        context={context}
        options={options.data}
        initial={selected}
        scrollToTop={scrollToTop}
        onBack={() => setMode("list")}
        onDone={(row) => {
          open(row);
          list.reload();
        }}
      />
    ) : (
      <LoadState error={options.error} retry={options.reload} />
    );
  if (mode === "detail" && p)
    return (
      <View style={ui.stack}>
        <Button
          secondary
          title="Retour aux commandes"
          onPress={() => setMode("list")}
        />
        <Text style={ui.kicker}>DEMANDE DE LIVRAISON</Text>
        <Text role="heading" style={ui.sectionTitle}>
          {p.publicNumber}
        </Text>
        <Badge>
          {p.isDraft && p.status !== "CANCELLED"
            ? "Brouillon"
            : (orderStatus[p.status] ?? p.status)}
        </Badge>
        <Text style={ui.body}>
          {p.company.name}
          {"\n"}
          {p.collaboration.shop.name} · {p.agency.name}
        </Text>
        {!!error && <ErrorMessage message={error} />}
        <Card>
          <View style={ui.stack}>
            <Text style={ui.sectionTitle}>Destinataire</Text>
            <Text style={ui.sectionTitle}>{p.recipientName}</Text>
            <Text style={ui.body}>
              {p.recipientEmail}
              {"\n"}
              {p.recipientPhone}
            </Text>
            <Text style={ui.body}>
              {p.recipientAddress}, {p.recipientCity}, {p.recipientCountry}
            </Text>
            {p.recipientDetails &&
              Object.entries(p.recipientDetails)
                .filter(
                  ([k, v]) =>
                    v !== undefined &&
                    ![
                      "name",
                      "email",
                      "phone",
                      "address",
                      "city",
                      "country",
                    ].includes(k),
                )
                .map(([k, v]) => (
                  <Text key={k} style={ui.body}>
                    {(
                      {
                        district: "Quartier",
                        landmark: "Repère",
                        accessInstructions: "Accès",
                        desiredDeliveryAt: "Date souhaitée",
                        observations: "Observations",
                        latitude: "Latitude",
                        longitude: "Longitude",
                      } as Record<string, string>
                    )[k] ?? k}{" "}
                    : {String(v)}
                  </Text>
                ))}
          </View>
        </Card>
        <Card>
          <View style={ui.stack}>
            <Text style={ui.sectionTitle}>
              {p.type === "FROM_STOCK"
                ? "Depuis le stock"
                : "Commande ponctuelle"}
            </Text>
            <Text style={ui.body}>{p.parcelDescription}</Text>
            {p.pickup && (
              <Text style={ui.body}>
                Collecte : {p.pickup.address}
                {"\n"}
                {p.pickup.contact} · {p.pickup.phone}
                {"\n"}
                {p.pickup.instructions}
              </Text>
            )}
            <Text style={ui.body}>
              Créée le {date(p.createdAt)} par {p.creator.fullName}
            </Text>
            <Text style={ui.sectionTitle}>
              Encaissement :{" "}
              {p.collectionRequired
                ? `${p.amountToCollect} ${p.currency}`
                : "Aucun · 0"}
            </Text>
            {!!p.financialNotes && (
              <Text style={ui.body}>{p.financialNotes}</Text>
            )}
            {!!p.notes && <Text style={ui.body}>{p.notes}</Text>}
            {!!p.cancellationReason && (
              <Text style={ui.body}>Annulation : {p.cancellationReason}</Text>
            )}
          </View>
        </Card>
        <Card>
          <View style={ui.stack}>
            <Text style={ui.sectionTitle}>Articles et réservations</Text>
            {p.orderItem_orderRecords.map((i) => (
              <View key={i.id} style={ui.stack}>
                <Text style={ui.sectionTitle}>
                  {i.quantity} × {i.name}
                </Text>
                {!!i.sku && <Text style={ui.body}>{i.sku}</Text>}
                {!!i.description && (
                  <Text style={ui.body}>{i.description}</Text>
                )}
                {!!i.instructions && (
                  <Text style={ui.body}>{i.instructions}</Text>
                )}
                {!!i.declaredValue && (
                  <Text style={ui.body}>Valeur : {i.declaredValue}</Text>
                )}
                {i.stockReservation_orderItemRecords.map((r) => (
                  <Text key={r.id} style={ui.body}>
                    {r.quantity} ·{" "}
                    {r.status === "ACTIVE"
                      ? "Réservée"
                      : r.status === "RELEASED"
                        ? "Libérée"
                        : "Consommée"}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </Card>
        {p.status === "PENDING" && orderCan(context, "edit") && (
          <Button
            secondary
            title="Modifier la commande"
            onPress={() => {
              setSelected(p);
              setMode("form");
            }}
          />
        )}
        {p.isDraft && p.status === "PENDING" && orderCan(context, "create") && (
          <Button
            busy={busy}
            title="Soumettre le brouillon"
            onPress={() => action("submit")}
          />
        )}
        {p.status === "PENDING" && orderCan(context, "cancel") && (
          <Button
            danger
            title="Annuler la commande"
            onPress={() => {
              setReason("");
              setCancel(true);
            }}
          />
        )}
        <Button
          secondary
          title="Actualiser la fiche"
          onPress={() => {
            detail.reload();
            history.reload();
          }}
        />
        {context.permissions.some((code) =>
          [
            "shop.deliveries.read",
            "deliveries.supervise.read",
            "deliveries.self.read",
          ].includes(code),
        ) && <OrderDeliveryProgress orderId={p.id} context={context} />}
        {context.permissions.some(code=>["financial.supervise.read","collections.self.read","shop.collections.read"].includes(code))&&<OrderFinanceSummary orderId={p.id} context={context}/>}
        <Card>
          <View style={ui.stack}>
            <Text style={ui.sectionTitle}>Historique conservé</Text>
            {history.error && (
              <ErrorMessage message={history.error} retry={history.reload} />
            )}
            {history.data?.map((e) => (
              <View key={e.id} style={ui.stack}>
                <Text style={ui.label}>
                  {orderEventLabel[e.action] ??
                    deliveryEvents[e.action.replace(/^DELIVERY_/, "")] ??
                    e.action}
                </Text>
                <Text style={ui.body}>
                  {date(e.createdAt)} · {e.actor.fullName}
                </Text>
                {!!e.previousStatus && e.previousStatus !== e.status && (
                  <Text style={ui.body}>
                    {orderStatus[e.previousStatus]} → {orderStatus[e.status]}
                  </Text>
                )}
                {!!e.metadata?.reason && (
                  <Text style={ui.body}>{String(e.metadata.reason)}</Text>
                )}
                {e.action === "UPDATED" && (
                  <Text style={ui.body}>
                    {orderChanges(e.metadata).join("\n")}
                  </Text>
                )}
              </View>
            ))}
          </View>
        </Card>
        <Sheet
          open={cancel}
          onClose={() => {
            if (!busy) setCancel(false);
          }}
          title="Confirmer l’annulation"
        >
          <Text style={ui.body}>
            Les réservations actives seront libérées. La commande restera dans
            l’historique.
          </Text>
          <Input
            label="Motif d’annulation"
            value={reason}
            maxLength={1000}
            onChangeText={setReason}
          />
          {!!error && <ErrorMessage message={error} />}
          <Button
            danger
            title="Confirmer l’annulation"
            disabled={!reason.trim()}
            busy={busy}
            onPress={() => action("cancel")}
          />
        </Sheet>
      </View>
    );
  const unique = <T extends { id: string }>(rows: T[]) =>
    Array.from(new Map(rows.map((p) => [p.id, p])).values());
  return (
    <View style={ui.stack}>
      <Text style={ui.kicker}>DEMANDES DE LIVRAISON</Text>
      <Text role="heading" style={ui.sectionTitle}>
        {context.scope === "SHOP" ? "Mes commandes" : "Commandes reçues"}
      </Text>
      {orderCan(context, "create") && (
        <Button
          title="Nouvelle commande"
          onPress={() => {
            setSelected(undefined);
            setMode("form");
          }}
        />
      )}
      {list.data?.summary && (
        <Card>
          <View style={ui.stack}>
            <Text style={ui.sectionTitle}>
              {list.data.summary.pending} en attente
            </Text>
            <Text style={ui.body}>
              {list.data.summary.drafts} brouillon(s) ·{" "}
              {list.data.summary.cancelled} annulée(s)
            </Text>
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
      <Selector
        label="Demandes"
        value={filter.draft ?? "false"}
        options={[
          { id: "false", label: "Soumises" },
          { id: "true", label: "Brouillons" },
          { id: "", label: "Toutes" },
        ]}
        onChange={(v) => change("draft", v)}
      />
      <Selector
        label="Statut"
        value={filter.status ?? ""}
        options={[
          { id: "", label: "Tous" },
          ...Object.entries(orderStatus).map(([id, label]) => ({ id, label })),
        ]}
        onChange={(v) => change("status", v)}
      />
      <Selector
        label="Type"
        value={filter.type ?? ""}
        options={[
          { id: "", label: "Tous" },
          { id: "ONE_OFF", label: "Ponctuelle" },
          { id: "FROM_STOCK", label: "Depuis stock" },
        ]}
        onChange={(v) => change("type", v)}
      />
      <Selector
        label="Agence de livraison"
        value={filter.companyId ?? ""}
        options={[
          { id: "", label: "Tous ceux du contexte" },
          ...unique(options.data?.pairs.map((p) => p.company) ?? []).map(
            (p) => ({ id: p.id, label: p.name }),
          ),
        ]}
        onChange={(v) => {
          change("companyId", v);
          change("agencyId", "");
        }}
      />
      <Selector
        label="Boutique"
        value={filter.shopId ?? ""}
        options={[
          { id: "", label: "Toutes celles du contexte" },
          ...unique(options.data?.pairs.map((p) => p.shop) ?? []).map((p) => ({
            id: p.id,
            label: p.name,
          })),
        ]}
        onChange={(v) => change("shopId", v)}
      />
      <Selector
        label="Agence"
        value={filter.agencyId ?? ""}
        options={[
          { id: "", label: "Toutes celles du contexte" },
          ...(options.data?.agencies ?? [])
            .filter(
              (a) => !filter.companyId || a.companyId === filter.companyId,
            )
            .map((a) => ({ id: a.id, label: a.name })),
        ]}
        onChange={(v) => change("agencyId", v)}
      />
      <Selector
        label="Encaissement requis"
        value={filter.collectionRequired ?? ""}
        options={[
          { id: "", label: "Tous" },
          { id: "true", label: "Oui" },
          { id: "false", label: "Non" },
        ]}
        onChange={(v) => change("collectionRequired", v)}
      />
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
      <Selector
        label="Tri"
        value={filter.sort ?? "newest"}
        options={[
          { id: "newest", label: "Plus récentes" },
          { id: "oldest", label: "Plus anciennes" },
        ]}
        onChange={(v) => change("sort", v)}
      />
      {!list.data ? (
        <LoadState error={list.error} retry={list.reload} />
      ) : list.data.items.length ? (
        list.data.items.map((row) => (
          <Card key={row.id}>
            <ListRow
              title={row.recipientName}
              description={`${row.publicNumber}\n${row.company.name} · ${row.agency.name}\n${row.isDraft && row.status !== "CANCELLED" ? "Brouillon" : orderStatus[row.status]} · ${date(row.createdAt)}`}
              onPress={() => open(row)}
            />
          </Card>
        ))
      ) : (
        <EmptyState
          title="Aucune commande"
          description="Aucun résultat dans votre périmètre avec ces filtres."
        />
      )}
      <Pager
        page={page}
        size={10}
        total={list.data?.total ?? 0}
        setPage={setPage}
      />
      <Button
        secondary
        title="Actualiser les commandes"
        onPress={list.reload}
      />
    </View>
  );
}
