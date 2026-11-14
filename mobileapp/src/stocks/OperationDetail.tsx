import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../auth/client";
import type { Workspace } from "../auth/types";
import {
  Badge,
  Button,
  Card,
  ErrorMessage,
  Input,
  ListRow,
  Selector,
  Sheet,
  ui,
} from "../design/ui";
import { date, labels, LoadState, Pager, quantity, useStockData } from "./ui";
import { paths, type Operation, type OperationKind } from "./models";
export function OperationDetail({
  id,
  kind,
  context,
  onBack,
}: {
  id: string;
  kind: OperationKind;
  context: Workspace;
  onBack: () => void;
}) {
  const r = useStockData<Operation>(`${paths[kind]}/${id}`),
    [action, setAction] = useState(""),
    [actionVersion, setActionVersion] = useState(0),
    [reason, setReason] = useState(""),
    [notes, setNotes] = useState(""),
    [counts, setCounts] = useState<Record<string, string>>({}),
    [countReasons, setCountReasons] = useState<Record<string, string>>({}),
    [itemId, setItemId] = useState(""),
    [incidentId, setIncidentId] = useState(""),
    [incidentKind, setIncidentKind] = useState("MISSING"),
    [incidentQty, setIncidentQty] = useState(""),
    [resolution, setResolution] = useState("RECOVER_TO_DESTINATION"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [itemPage, setItemPage] = useState(1),
    lock = useRef(false);
  if (!r.data) return <LoadState error={r.error} retry={r.reload} />;
  const p = r.data,
    items = p.items ?? [],
    editableItems = items.filter(
      (i) =>
        action === "count" ||
        (i.inTransitQuantity ??
          Math.max(0, i.quantity - (i.receivedQuantity ?? 0) -
            (i.lostQuantity ?? 0) - (i.returnedQuantity ?? 0))) > 0,
    ),
    can = (permission: string) =>
      context.scope !== "SHOP" &&
      context.subscriptionAccess?.valid !== false &&
      context.permissions.includes(permission),
    at = (agencyId?: string) =>
      !context.agencyId || context.agencyId === agencyId;
  function begin(value: string) {
    setActionVersion(p.version);
    setItemPage(1);
    setAction(value);
    setError("");
    setReason("");
    setNotes("");
    setItemId("");
    setIncidentId("");
    setIncidentQty("");
    setResolution("RECOVER_TO_DESTINATION");
    if (value === "count") {
      setCountReasons(
        Object.fromEntries(items.map((i) => [i.id, i.reason ?? ""])),
      );
      setCounts(
        Object.fromEntries(
          items.map((i) => [
            i.id,
            i.countedQuantity === null || i.countedQuantity === undefined
              ? ""
              : String(i.countedQuantity),
          ]),
        ),
      );
    } else setCounts({});
  }
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      let url = `${paths[kind]}/${id}/${action}`,
        body: Record<string, unknown> = {
          version: actionVersion,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        };
      if (action === "receive") {
        const received = items
          .filter((i) => (counts[i.id] ?? "").trim() !== "")
          .map((i) => ({
            itemId: i.id,
            quantity: quantity(counts[i.id]!, true),
          }))
          .filter((i) => i.quantity > 0);
        if (!received.length)
          throw new Error("Saisissez au moins une quantité réellement reçue.");
        body = {
          version: actionVersion,
          items: received,
          notes: notes || undefined,
        };
      } else if (action === "count") {
        const counted = items
          .filter((i) => (counts[i.id] ?? "").trim() !== "")
          .map((i) => ({
            itemId: i.id,
            countedQuantity: quantity(counts[i.id]!, true),
            reason: countReasons[i.id] ?? i.reason ?? undefined,
          }));
        if (!counted.length)
          throw new Error("Saisissez les quantités physiquement comptées.");
        body = { version: actionVersion, items: counted };
      } else if (action === "incidents") {
        if (!itemId || !reason.trim())
          throw new Error("Choisissez le produit et décrivez l’incident.");
        body = {
          version: actionVersion,
          itemId,
          quantity: quantity(incidentQty),
          kind: incidentKind,
          description: reason.trim(),
        };
      } else if (action === "resolve") {
        if (!incidentId || !reason.trim())
          throw new Error("Choisissez l’incident et justifiez son traitement.");
        url = `${paths[kind]}/${id}/incidents/${incidentId}/resolve`;
        body = {
          version: actionVersion,
          action: resolution,
          reason: reason.trim(),
        };
      } else if (["reject", "consume"].includes(action) && !reason.trim())
        throw new Error("Un motif est obligatoire pour cette action.");
      await api(url, { method: "POST", body: JSON.stringify(body) });
      setAction("");
      setNotice("Opération enregistrée.");
      r.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const actionTitles: Record<string, string> = {
    confirm: "Confirmer la réception du dépôt",
    cancel: "Annuler la préparation",
    dispatch: "Confirmer le départ",
    receive: "Réception du transfert",
    incidents: "Déclarer un incident",
    resolve: "Traiter un incident",
    count: "Comptage physique",
    submit: "Soumettre l’inventaire",
    approve: "Valider l’ajustement",
    reject: "Rejeter l’inventaire",
    release: "Libérer la réservation",
    consume: "Confirmer la sortie physique",
  };
  const incidentItems = items.map((i) => ({
    id: i.id,
    label: i.product.name,
    description: `${i.inTransitQuantity ?? Math.max(0, i.quantity - (i.receivedQuantity ?? 0) - (i.lostQuantity ?? 0) - (i.returnedQuantity ?? 0))} en transit`,
  }));
  return (
    <>
      <Button secondary title="Retour à la liste" onPress={onBack} />
      <Card>
        <Text role="heading" style={ui.sectionTitle}>
          {p.reference}
        </Text>
        <Badge
          success={["RECEIVED", "APPROVED", "CONFIRMED"].includes(p.status)}
        >
          {kind === "sorties"
            ? "Sortie validée"
            : kind === "transferts-stock" && p.status === "RECEIVED"
              ? "Clôturé"
              : (labels[p.status] ?? p.status)}
        </Badge>
        <Text style={ui.body}>
          {p.company?.name ?? context.companyName}
          {p.agency?.name ? `\nAgence : ${p.agency.name}` : ""}
          {p.originAgency?.name ? `\nDépart : ${p.originAgency.name}` : ""}
          {p.destinationAgency?.name
            ? `\nDestination : ${p.destinationAgency.name}`
            : ""}
          {p.shop?.name ? `\nBoutique : ${p.shop.name}` : ""}
          {"\n"}Créé le {date(p.createdAt)}
          {(p.receivedAt ?? p.confirmedAt)
            ? `\nRéceptionné le ${date(p.receivedAt ?? p.confirmedAt)}`
            : ""}
          {(p.departedAt ?? p.dispatchedAt)
            ? `\nParti le ${date(p.departedAt ?? p.dispatchedAt)}`
            : ""}
        </Text>
        {!!p.notes && <Text style={ui.body}>{p.notes}</Text>}
        {!!p.reason && <Text style={ui.body}>Motif : {p.reason}</Text>}
        {!!p.recipient && (
          <Text style={ui.body}>Destinataire : {p.recipient}</Text>
        )}
        {p.stock && (
          <Text style={ui.body}>
            {p.stock.product.name} · {p.quantity} unité(s){"\n"}
            {p.stock.shop.name} · {p.stock.agency.name}
          </Text>
        )}
        {items.map((i) => (
          <View key={i.id} style={{ gap: 6, paddingVertical: 10 }}>
            <Text style={ui.rowTitle}>{i.product.name}</Text>
            <Text style={ui.body}>
              {kind === "inventaires"
                ? `Théorique : ${i.expectedPhysical ?? 0} · Réservé : ${i.expectedReserved ?? 0}\nCompté : ${i.countedQuantity ?? "Non compté"} · Écart : ${i.variance ?? "—"}`
                : kind === "transferts-stock"
                  ? `Prévu : ${i.quantity} · Reçu : ${i.receivedQuantity ?? 0}\nTransit : ${i.inTransitQuantity ?? Math.max(0, i.quantity - (i.receivedQuantity ?? 0) - (i.lostQuantity ?? 0) - (i.returnedQuantity ?? 0))} · Perte validée : ${i.lostQuantity ?? 0} · Retourné : ${i.returnedQuantity ?? 0}`
                  : `${i.quantity} ${i.product.unit}`}
            </Text>
            {!!i.reason && <Text style={ui.body}>{i.reason}</Text>}
          </View>
        ))}
        {!!notice && (
          <Text role="status" style={ui.body}>
            {notice}
          </Text>
        )}
        {kind === "depots" &&
          p.status === "DRAFT" &&
          can("stocks.deposit") &&
          at(p.agencyId) && (
            <>
              <Button
                title="Confirmer la réception"
                onPress={() => begin("confirm")}
              />
              <Button
                secondary
                title="Annuler le dépôt"
                onPress={() => begin("cancel")}
              />
            </>
          )}
        {kind === "transferts-stock" && (
          <>
            {p.status === "DRAFT" &&
              can("stocks.transfer") &&
              at(p.originAgencyId) && (
                <>
                  <Button
                    title="Confirmer le départ"
                    onPress={() => begin("dispatch")}
                  />
                  <Button
                    secondary
                    title="Annuler le transfert"
                    onPress={() => begin("cancel")}
                  />
                </>
              )}
            {["IN_TRANSIT", "PARTIAL", "PARTIALLY_RECEIVED"].includes(
              p.status,
            ) &&
              can("stocks.transfer") &&
              at(p.destinationAgencyId) && (
                <>
                  <Button
                    title="Enregistrer la réception"
                    onPress={() => begin("receive")}
                  />
                  <Button
                    secondary
                    title="Déclarer un incident"
                    onPress={() => begin("incidents")}
                  />
                </>
              )}
            {!!p.incidents?.some((i) => i.status === "OPEN") &&
              can("stocks.approve") && (
                <Button
                  secondary
                  title="Traiter un incident"
                  onPress={() => begin("resolve")}
                />
              )}
          </>
        )}
        {kind === "inventaires" &&
          p.status === "DRAFT" &&
          can("stocks.inventory") &&
          at(p.agencyId) && (
            <>
              <Button
                title="Saisir le comptage"
                onPress={() => begin("count")}
              />
              <Button
                secondary
                title="Soumettre l’inventaire"
                onPress={() => begin("submit")}
              />
            </>
          )}
        {kind === "inventaires" &&
          p.status === "SUBMITTED" &&
          can("stocks.approve") &&
          at(p.agencyId) && (
            <>
              <Button
                title="Valider les ajustements"
                onPress={() => begin("approve")}
              />
              <Button
                secondary
                title="Rejeter l’inventaire"
                onPress={() => begin("reject")}
              />
            </>
          )}
        {kind === "reservations" &&
          p.status === "ACTIVE" &&
          can("stocks.reserve") && (
            <>
              <Button
                secondary
                title="Libérer la réservation"
                onPress={() => begin("release")}
              />
              {can("stocks.withdraw") && (
                <Button
                  title="Consommer après sortie physique"
                  onPress={() => begin("consume")}
                />
              )}
            </>
          )}
        <Button secondary title="Actualiser" onPress={r.reload} />
      </Card>
      {!!p.incidents?.length && (
        <Card>
          <Text style={ui.sectionTitle}>Incidents du transfert</Text>
          {p.incidents.map((i) => (
            <ListRow
              key={i.id}
              title={`${labels[i.kind] ?? i.kind} · ${i.quantity} unité(s)`}
              description={`${labels[i.status] ?? i.status}\n${i.description}\n${date(i.createdAt)}`}
              icon="alert-circle"
            />
          ))}
        </Card>
      )}
      {!!(p.events ?? p.logs)?.length && (
        <Card>
          <Text style={ui.sectionTitle}>Historique</Text>
          {(p.events ?? p.logs ?? []).map((e) => (
            <ListRow
              key={e.id}
              title={labels[e.status] ?? e.status}
              description={`${date(e.createdAt)}${e.notes ? "\n" + e.notes : ""}`}
              icon="clock"
            />
          ))}
        </Card>
      )}
      <Sheet
        open={!!action}
        onClose={() => {
          if (!busy) setAction("");
        }}
        title={actionTitles[action] ?? "Confirmer l’opération"}
      >
        {["receive", "count"].includes(action) &&
          editableItems
            .slice((itemPage - 1) * 20, itemPage * 20)
            .map((i) => (
              <Card key={i.id}>
                <Text style={ui.rowTitle}>{i.product.name}</Text>
                <Text style={ui.body}>
                  {action === "count"
                    ? `Théorique : ${i.expectedPhysical ?? 0} · Réservé : ${i.expectedReserved ?? 0}`
                    : `Reste en transit : ${i.inTransitQuantity ?? Math.max(0, i.quantity - (i.receivedQuantity ?? 0) - (i.lostQuantity ?? 0) - (i.returnedQuantity ?? 0))}`}
                </Text>
                <Input
                  label={
                    action === "count"
                      ? `Quantité comptée · ${i.product.name}`
                      : `Quantité reçue maintenant · ${i.product.name}`
                  }
                  keyboardType="number-pad"
                  value={counts[i.id] ?? ""}
                  onChangeText={(value) =>
                    setCounts((v) => ({ ...v, [i.id]: value }))
                  }
                />
                {action === "count" && (
                  <Input
                    label="Justification de l’écart"
                    multiline
                    value={countReasons[i.id] ?? i.reason ?? ""}
                    onChangeText={(value) =>
                      setCountReasons((v) => ({ ...v, [i.id]: value }))
                    }
                  />
                )}
              </Card>
            ))}
        {["receive", "count"].includes(action) && editableItems.length > 20 && (
          <Pager
            page={itemPage}
            size={20}
            total={editableItems.length}
            setPage={setItemPage}
          />
        )}
        {action === "receive" && (
          <Input
            label="Observation de réception"
            value={notes}
            multiline
            onChangeText={setNotes}
          />
        )}
        {action === "incidents" && (
          <>
            <Selector
              label="Produit concerné"
              value={itemId}
              options={incidentItems}
              onChange={setItemId}
            />
            <Selector
              label="Nature de l’incident"
              value={incidentKind}
              options={["MISSING", "DAMAGED", "REFUSED", "OTHER"].map(
                (value) => ({ id: value, label: labels[value] ?? value }),
              )}
              onChange={setIncidentKind}
            />
            <Input
              label="Quantité concernée"
              value={incidentQty}
              keyboardType="number-pad"
              onChangeText={setIncidentQty}
            />
          </>
        )}
        {action === "resolve" && (
          <>
            <Selector
              label="Incident à traiter"
              value={incidentId}
              options={(p.incidents ?? [])
                .filter((i) => i.status === "OPEN")
                .map((i) => ({
                  id: i.id,
                  label: `${labels[i.kind] ?? i.kind} · ${i.quantity} unité(s)`,
                  description: i.description,
                }))}
              onChange={setIncidentId}
            />
            <Selector
              label="Traitement autorisé"
              value={resolution}
              options={[
                {
                  id: "RECOVER_TO_DESTINATION",
                  label: "Réceptionner à destination",
                },
                { id: "RETURN_TO_ORIGIN", label: "Retourner à l’origine" },
                { id: "CONFIRM_LOSS", label: "Valider la perte" },
              ]}
              onChange={setResolution}
            />
          </>
        )}
        {!["receive", "count"].includes(action) && (
          <Input
            label={
              ["incidents", "resolve", "reject", "consume"].includes(action)
                ? "Motif ou description obligatoire"
                : "Motif ou observation"
            }
            value={reason}
            multiline
            onChangeText={setReason}
          />
        )}
        <Text style={ui.body}>
          {action === "confirm"
            ? "Confirmez uniquement les marchandises physiquement reçues. Les quantités seront ajoutées une seule fois."
            : action === "dispatch"
              ? "Les quantités quitteront l’agence d’origine et resteront en transit jusqu’à leur réception."
              : action === "approve"
                ? "La validation applique les écarts justifiés et crée des mouvements d’inventaire."
                : action === "consume"
                  ? "Confirmez la sortie physique des quantités réservées. Le stock physique sera diminué."
                  : action === "submit"
                    ? "Vérifiez le comptage et les motifs avant de le soumettre au responsable."
                    : "Le serveur vérifiera les droits, les quantités et la version courante."}
        </Text>
        {!!error && <ErrorMessage message={error} />}
        <Button
          title={action === "count" ? "Enregistrer le comptage" : "Confirmer"}
          busy={busy}
          onPress={() => void submit()}
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
