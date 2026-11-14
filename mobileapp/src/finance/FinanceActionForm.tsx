import { Checkbox as Check } from "../design/ui";
import { useRef, useState } from "react";
import { Text, View } from "react-native";
import {
  Button,
  Card,
  Input,
  CurrencyInput,
  Selector,
  ErrorMessage,
  ui,
} from "../design/ui";
import { api } from "../auth/client";
import { useFinanceData } from "./useFinanceData";
import { localKey } from "../stocks/ui";
import {
  financeActionTitles,
  financeActionCopy,
  initialFinanceValues,
  financeRequest,
  selectedRemittanceTotal,
  type FinanceValues,
} from "../../../shared/finance-actions";
import {
  financialMoney,
  exactUnits,
  paymentMethods,
  discrepancyKinds,
  correctionKinds,
  correctionSummary,
  type FinanceFormTarget,
  type FinanceEntry,
  type FinancePage,
} from "../../../shared/finance";
export function FinanceActionForm({
  target,
  onDone,
  onClose,
  scrollToTop,
}: {
  target: FinanceFormTarget;
  onDone: () => void;
  onClose: () => void;
  scrollToTop: () => void;
}) {
  const [t] = useState(() => target),
    [values, setValues] = useState(() => initialFinanceValues(t)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sourcePage, setSourcePage] = useState(1),
    [sourceQ, setSourceQ] = useState(""),
    [entryCache, setEntryCache] = useState(() =>
      Object.fromEntries((t.entries ?? []).map((e) => [e.id, e])),
    );
  const available = useFinanceData<FinancePage<FinanceEntry>>(
    t.code === "REMIT" && values.currency
      ? `/collections?status=AVAILABLE&size=10&page=${sourcePage}&currency=${values.currency}&q=${encodeURIComponent(sourceQ)}`
      : null,
  );
  const key = useRef(localKey()),
    lock = useRef(false),
    set = <K extends keyof FinanceValues>(field: K, value: FinanceValues[K]) =>
      setValues((v) => ({ ...v, [field]: value })),
    line = (id: string, value: string) =>
      setValues((v) => ({ ...v, lines: { ...v.lines, [id]: value } }));
  const receiptLine = t.remittance?.items?.find(
    (i) => i.id === t.receiptItemId,
  );
  const currency = values.currency || t.correction?.currency || "",
    reference =
      (t.code === "RECEIPT"
        ? (receiptLine?.reference ?? receiptLine?.publicNumber)
        : undefined) ??
      t.obligation?.publicNumber ??
      t.entry?.publicNumber ??
      t.remittance?.reference ??
      t.discrepancy?.reference;
  async function submit() {
    if (lock.current) return;
    try {
      const request = financeRequest(
        { ...t, entries: Object.values(entryCache) },
        values,
        key.current,
      );
      lock.current = true;
      setBusy(true);
      setError("");
      await api(request.path, {
        method: "POST",
        body: JSON.stringify(request.body),
      });
      onDone();
    } catch (e) {
      setError(
        `${(e as Error).message} La saisie est conservée. Après une coupure, consultez l’historique avant de recommencer.`,
      );
      scrollToTop();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  let total = "";
  try {
    total = selectedRemittanceTotal(values);
  } catch {
    /* Keep incomplete monetary input editable. */
  }
  return (
    <View style={ui.stack}>
      <Button
        secondary
        title="Revenir sans enregistrer"
        disabled={busy}
        onPress={onClose}
      />
      <Text style={ui.kicker}>CONFIRMATION FINANCIÈRE DOCUMENTAIRE</Text>
      <Text role="heading" style={ui.sectionTitle}>
        {financeActionTitles[t.code]}
      </Text>
      {!!error && <ErrorMessage message={error} />}
      <Card>
        <Text style={ui.body}>{financeActionCopy[t.code]}</Text>
        {!!reference && <Text style={ui.sectionTitle}>{reference}</Text>}
      </Card>
      {t.obligation && (
        <Card>
          <Text style={ui.body}>
            Attendu :{" "}
            {financialMoney(t.obligation.expected, t.obligation.currency)}
          </Text>
          <Text style={ui.body}>
            Déclaré reçu :{" "}
            {financialMoney(t.obligation.declared, t.obligation.currency)}
          </Text>
          <Text style={ui.body}>
            Reste auprès du destinataire :{" "}
            {financialMoney(t.obligation.remaining, t.obligation.currency)}
          </Text>
        </Card>
      )}
      {t.correction && (
        <Card>
          <Text style={ui.sectionTitle}>
            {correctionKinds[t.correction.kind]}
          </Text>
          <Text style={ui.body}>{correctionSummary(t.correction)}</Text>
          <Text style={ui.body}>{t.correction.reason}</Text>
          {!!t.correction.externalReference && (
            <Text style={ui.body}>
              Constat externe : {t.correction.externalReference}
            </Text>
          )}
        </Card>
      )}
      <Card>
        {t.code === "CORRECT" && (
          <Selector
            label="Nature de la régularisation"
            value={values.kind}
            options={[
              { id: "COLLECTION", label: "Corriger la déclaration d’origine" },
              { id: "REFUND", label: "Remboursement externe déjà réalisé" },
              ...(t.allowAgencyRefund
                ? [
                    {
                      id: "AGENCY_REFUND",
                      label: "Remboursement externe effectué par l’agence",
                    },
                  ]
                : []),
            ]}
            disabled={busy}
            onChange={(value) => {
              set("kind", value);
              set(
                "amount",
                value.endsWith("REFUND") ? "" : (t.entry?.gross ?? ""),
              );
            }}
          />
        )}
        {["DECLARE", "CORRECT", "EXPECTED", "RECEIPT", "REPORT"].includes(
          t.code,
        ) && (
          <CurrencyInput
            label={`${t.code === "REPORT" ? "Montant de l’écart" : t.code === "CORRECT" && values.kind.endsWith("REFUND") ? "Montant déjà remboursé hors plateforme" : t.code === "RECEIPT" ? "Montant reçu corrigé pour cette ligne" : t.code === "CORRECT" ? "Montant total corrigé" : "Montant"} (${currency})`}
            keyboardType="decimal-pad"
            value={values.amount}
            onChangeText={(value) => set("amount", value)}
            editable={!busy}
          />
        )}
        {t.code === "DECLARE" && (
          <Selector
            label="Moyen de paiement externe déclaré"
            value={values.method}
            options={paymentMethods.map((x) => ({
              id: x.value,
              label: x.label,
            }))}
            onChange={(value) => set("method", value)}
            disabled={busy}
          />
        )}
        {t.code === "CORRECT" && values.kind.endsWith("REFUND") && (
          <Input
            label="Référence ou constat de restitution physique"
            value={values.externalReference}
            onChangeText={(value) => set("externalReference", value)}
            maxLength={160}
            editable={!busy}
          />
        )}
        {t.code === "REMIT" && (
          <>
            <Selector
              label="Devise de la remise"
              value={values.currency}
              options={[
                ...new Set(
                  t.currencies ??
                    (t.entries ?? [])
                      .filter(
                        (e) =>
                          !e.legacy &&
                          !e.blocked &&
                          exactUnits(e.available ?? "0") > 0n,
                      )
                      .map((e) => e.currency),
                ),
              ].map((id) => ({ id, label: id }))}
              onChange={(value) => {
                set("currency", value);
                set("lines", {});
                setSourcePage(1);
              }}
              disabled={busy}
            />
            <Input
              label="Rechercher un encaissement disponible"
              value={sourceQ}
              onChangeText={(value) => {
                setSourceQ(value);
                setSourcePage(1);
              }}
              editable={!busy}
            />
            {!!available.error && (
              <ErrorMessage
                message={available.error}
                retry={available.reload}
              />
            )}
            {(available.data?.items ?? [])
              .filter(
                (e) =>
                  !e.legacy &&
                  !e.blocked &&
                  e.currency === values.currency &&
                  exactUnits(e.available ?? "0") > 0n,
              )
              .map((e) => (
                <View key={e.id} style={ui.stack}>
                  <Check
                    label={`${e.publicNumber} · disponible ${financialMoney(e.available, e.currency)}`}
                    checked={Object.hasOwn(values.lines, e.id)}
                    disabled={busy}
                    onChange={(checked) => {
                      if (checked) {
                        setEntryCache((cache) => ({ ...cache, [e.id]: e }));
                        line(e.id, e.available ?? "");
                      } else
                        setValues((v) => {
                          const lines = { ...v.lines };
                          delete lines[e.id];
                          return { ...v, lines };
                        });
                    }}
                  />
                  {Object.hasOwn(values.lines, e.id) && (
                    <Input
                      label={`Montant remis pour ${e.reference ?? e.publicNumber}`}
                      keyboardType="decimal-pad"
                      value={values.lines[e.id] ?? ""}
                      onChangeText={(value) => line(e.id, value)}
                      editable={!busy}
                    />
                  )}
                </View>
              ))}
            <Text style={ui.sectionTitle}>
              Total déclaré remis :{" "}
              {total ? financialMoney(total, values.currency) : "À compléter"}
            </Text>
            <Text style={ui.body}>
              Page {sourcePage} · {available.data?.total ?? 0} encaissement(s)
              disponible(s)
            </Text>
            <Button
              secondary
              title="Encaissements précédents"
              disabled={busy || sourcePage === 1}
              onPress={() => setSourcePage((p) => p - 1)}
            />
            <Button
              secondary
              title="Encaissements suivants"
              disabled={busy || sourcePage * 10 >= (available.data?.total ?? 0)}
              onPress={() => setSourcePage((p) => p + 1)}
            />
            <Text style={ui.body}>
              {Object.keys(values.lines).length} encaissement(s) sélectionné(s),
              conservés entre les pages.
            </Text>
          </>
        )}
        {t.code === "DECIDE" && (
          <>
            <Selector
              label="Décision sur la remise"
              value={values.decision}
              options={[
                { id: "CONFIRM", label: "Confirmer une réception conforme" },
                {
                  id: "DISPUTE",
                  label: "Constater les fonds reçus avec un écart",
                },
                { id: "REJECT", label: "Rejeter sans réception de fonds" },
                {
                  id: "REQUEST_CORRECTION",
                  label: "Demander une nouvelle déclaration corrigée",
                },
              ]}
              onChange={(value) => set("decision", value)}
              disabled={busy}
            />
            {["CONFIRM", "DISPUTE"].includes(values.decision) &&
              (t.remittance?.items ?? []).map((i) => (
                <View key={i.id} style={ui.stack}>
                  <Text style={ui.body}>
                    Déclaré remis :{" "}
                    {financialMoney(i.declaredAmount ?? "0", currency)}
                  </Text>
                  <Input
                    label={`Réellement reçu pour ${i.reference ?? i.publicNumber} (${currency})`}
                    keyboardType="decimal-pad"
                    value={values.lines[i.id] ?? ""}
                    onChangeText={(value) => line(i.id, value)}
                    editable={!busy}
                  />
                </View>
              ))}
            {["CONFIRM", "DISPUTE"].includes(values.decision) && (
              <Text style={ui.sectionTitle}>
                Total réellement constaté :{" "}
                {total ? financialMoney(total, currency) : "À compléter"}
              </Text>
            )}
          </>
        )}
        {t.code === "APPROVE" && (
          <Selector
            label="Décision de validation"
            value={values.approve ? "approve" : "reject"}
            options={[
              { id: "approve", label: "Approuver la régularisation" },
              { id: "reject", label: "Refuser la demande" },
            ]}
            onChange={(value) => set("approve", value === "approve")}
            disabled={busy}
          />
        )}
        {t.code === "REPORT" && (
          <Selector
            label="Nature de l’écart"
            value={values.kind}
            options={discrepancyKinds.map((x) => ({
              id: x.value,
              label: x.label,
            }))}
            onChange={(value) => set("kind", value)}
            disabled={busy}
          />
        )}
        {t.code === "RESOLVE" && (
          <Selector
            label="Nouvel état de l’écart"
            value={values.status}
            options={
              t.discrepancy?.status === "RESOLVED"
                ? [{ id: "CLOSED", label: "Clôturé" }]
                : [
                    { id: "REVIEW", label: "En cours d’examen" },
                    { id: "RESOLVED", label: "Résolu" },
                  ]
            }
            onChange={(value) => set("status", value)}
            disabled={busy}
          />
        )}
        {t.code !== "REMIT" && (
          <Input
            label={
              t.code === "DECLARE"
                ? "Motif si montant nul ou excédentaire"
                : "Motif et constat"
            }
            value={values.reason}
            onChangeText={(value) => set("reason", value)}
            maxLength={1000}
            multiline
            editable={!busy}
          />
        )}
        {["DECLARE", "REMIT"].includes(t.code) && (
          <Input
            label="Observation facultative"
            value={values.notes}
            onChangeText={(value) => set("notes", value)}
            maxLength={1000}
            multiline
            editable={!busy}
          />
        )}
        <Check
          label="J’ai vérifié les montants, la devise et l’opération physique déclarée ou constatée."
          checked={values.acknowledged}
          onChange={(value) => set("acknowledged", value)}
          disabled={busy}
        />
      </Card>
      <Button
        title="Confirmer l’enregistrement"
        busy={busy}
        disabled={busy}
        onPress={() => void submit()}
      />
    </View>
  );
}
