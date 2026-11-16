import { useRef, useState } from "react";
import {
  Button,
  Choice,
  Dialog,
  ErrorState,
  Field,
  Select,
} from "../design/ui";
import { api } from "../auth/client";
import { useFinanceData } from "./useFinanceData";
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
}: {
  target: FinanceFormTarget;
  onDone: () => void;
  onClose: () => void;
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
      ? `/collections?status=AVAILABLE&size=20&page=${sourcePage}&currency=${values.currency}${values.agencyId || t.agencyId ? `&agencyId=${values.agencyId || t.agencyId}` : ""}&q=${encodeURIComponent(sourceQ)}`
      : null,
  );
  const key = useRef(crypto.randomUUID()),
    lock = useRef(false),
    set = <K extends keyof FinanceValues>(field: K, value: FinanceValues[K]) =>
      setValues((v) => ({ ...v, [field]: value }));
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
  const line = (id: string, value: string) =>
    setValues((v) => ({ ...v, lines: { ...v.lines, [id]: value } }));
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
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  let total = "";
  try {
    total = selectedRemittanceTotal(values);
  } catch {
    /* An incomplete input stays editable. */
  }
  return (
    <Dialog
      open
      title={financeActionTitles[t.code]}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="finance-form"
      >
        <p>{financeActionCopy[t.code]}</p>
        {reference && (
          <strong className="finance-reference">{reference}</strong>
        )}
        {error && <ErrorState message={error} />}
        {t.obligation && (
          <div className="finance-notice">
            <p>
              Attendu :{" "}
              <strong>
                {financialMoney(t.obligation.expected, t.obligation.currency)}
              </strong>
            </p>
            <p>
              Déclaré reçu :{" "}
              {financialMoney(t.obligation.declared, t.obligation.currency)} ·
              Reste auprès du destinataire :{" "}
              {financialMoney(t.obligation.remaining, t.obligation.currency)}
            </p>
          </div>
        )}
        {t.correction && (
          <div className="finance-notice">
            <strong>{correctionKinds[t.correction.kind]}</strong>
            <p>{correctionSummary(t.correction)}</p>
            <p>{t.correction.reason}</p>
            {t.correction.externalReference && (
              <p>Constat externe : {t.correction.externalReference}</p>
            )}
          </div>
        )}
        <fieldset disabled={busy}>
          {t.code === "CORRECT" && (
            <Select
              label="Nature de la régularisation"
              value={values.kind}
              onChange={(e) => {
                set("kind", e.target.value);
                set(
                  "amount",
                  e.target.value.endsWith("REFUND")
                    ? ""
                    : (t.entry?.gross ?? ""),
                );
              }}
            >
              <option value="COLLECTION">
                Corriger la déclaration d’origine
              </option>
              <option value="REFUND">Remboursement externe déjà réalisé</option>
              {t.allowAgencyRefund && (
                <option value="AGENCY_REFUND">
                  Remboursement externe effectué par l’agence
                </option>
              )}
            </Select>
          )}
          {["DECLARE", "CORRECT", "EXPECTED", "RECEIPT", "REPORT"].includes(
            t.code,
          ) && (
            <Field
              label={`${t.code === "REPORT" ? "Montant de l’écart" : t.code === "CORRECT" && values.kind.endsWith("REFUND") ? "Montant déjà remboursé hors plateforme" : t.code === "RECEIPT" ? "Montant reçu corrigé pour cette ligne" : t.code === "CORRECT" ? "Montant total corrigé" : "Montant"} (${currency})`}
              inputMode="decimal"
              value={values.amount}
              onChange={(e) => set("amount", e.target.value)}
              required
              hint="Utilisez un point pour les décimales. Aucun arrondi ni paiement automatique."
            />
          )}
          {t.code === "DECLARE" && (
            <Select
              label="Moyen de paiement externe déclaré"
              value={values.method}
              onChange={(e) => set("method", e.target.value)}
            >
              {paymentMethods.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          )}
          {t.code === "CORRECT" && values.kind.endsWith("REFUND") && (
            <Field
              label="Référence ou constat de restitution physique"
              value={values.externalReference}
              onChange={(e) => set("externalReference", e.target.value)}
              required
              maxLength={160}
            />
          )}
          {t.code === "REMIT" && (
            <>
              <Select
                label="Agence destinataire des fonds"
                value={values.agencyId}
                onChange={(e) => {
                  set("agencyId", e.target.value);
                  set("lines", {});
                  setSourcePage(1);
                }}
                disabled={!!t.agencyId}
              >
                <option value="">Choisir une agence</option>
                {(t.agencies ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
              <Select
                label="Devise de la remise"
                value={values.currency}
                onChange={(e) => {
                  set("currency", e.target.value);
                  set("lines", {});
                  setSourcePage(1);
                }}
              >
                <option value="">Choisir une devise</option>
                {[
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
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
              <Field
                label="Rechercher un encaissement disponible"
                value={sourceQ}
                onChange={(e) => {
                  setSourceQ(e.target.value);
                  setSourcePage(1);
                }}
              />
              {available.error && (
                <ErrorState
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
                  <div className="finance-allocation" key={e.id}>
                    <Choice
                      type="checkbox"
                      label={`${e.publicNumber} · disponible ${financialMoney(e.available, e.currency)}`}
                      checked={Object.hasOwn(values.lines, e.id)}
                      onChange={(event) => {
                        if (event.target.checked) {
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
                      <Field
                        label={`Montant remis pour ${e.reference ?? e.publicNumber}`}
                        inputMode="decimal"
                        value={values.lines[e.id] ?? ""}
                        onChange={(event) => line(e.id, event.target.value)}
                        required
                      />
                    )}
                  </div>
                ))}
              <p>
                Total déclaré remis :{" "}
                <strong>
                  {total
                    ? financialMoney(total, values.currency)
                    : "À compléter"}
                </strong>
              </p>
              <div className="ds-actions">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={sourcePage === 1}
                  onClick={() => setSourcePage((p) => p - 1)}
                >
                  Encaissements précédents
                </Button>
                <span>
                  Page {sourcePage} · {available.data?.total ?? 0}{" "}
                  encaissement(s) disponible(s)
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={sourcePage * 20 >= (available.data?.total ?? 0)}
                  onClick={() => setSourcePage((p) => p + 1)}
                >
                  Encaissements suivants
                </Button>
              </div>
              <p>
                {Object.keys(values.lines).length} encaissement(s)
                sélectionné(s), conservés entre les pages.
              </p>
            </>
          )}
          {t.code === "DECIDE" && (
            <>
              <Select
                label="Décision sur la remise"
                value={values.decision}
                onChange={(e) => set("decision", e.target.value)}
              >
                <option value="CONFIRM">
                  Confirmer une réception conforme
                </option>
                <option value="DISPUTE">
                  Constater les fonds reçus avec un écart
                </option>
                <option value="REJECT">Rejeter sans réception de fonds</option>
                <option value="REQUEST_CORRECTION">
                  Demander une nouvelle déclaration corrigée
                </option>
              </Select>
              {["CONFIRM", "DISPUTE"].includes(values.decision) &&
                (t.remittance?.items ?? []).map((i) => (
                  <Field
                    key={i.id}
                    label={`Réellement reçu pour ${i.reference ?? i.publicNumber} (${currency})`}
                    inputMode="decimal"
                    value={values.lines[i.id] ?? ""}
                    onChange={(e) => line(i.id, e.target.value)}
                    hint={`Déclaré remis : ${financialMoney(i.declaredAmount ?? "0", currency)}`}
                    required
                  />
                ))}
              {["CONFIRM", "DISPUTE"].includes(values.decision) && (
                <p>
                  Total réellement constaté :{" "}
                  <strong>
                    {total ? financialMoney(total, currency) : "À compléter"}
                  </strong>
                </p>
              )}
            </>
          )}
          {t.code === "APPROVE" && (
            <Select
              label="Décision de validation"
              value={values.approve ? "approve" : "reject"}
              onChange={(e) => set("approve", e.target.value === "approve")}
            >
              <option value="approve">Approuver la régularisation</option>
              <option value="reject">Refuser la demande</option>
            </Select>
          )}
          {t.code === "REPORT" && (
            <Select
              label="Nature de l’écart"
              value={values.kind}
              onChange={(e) => set("kind", e.target.value)}
            >
              {discrepancyKinds.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          )}
          {t.code === "RESOLVE" && (
            <Select
              label="Nouvel état de l’écart"
              value={values.status}
              onChange={(e) => set("status", e.target.value)}
            >
              {t.discrepancy?.status !== "RESOLVED" && (
                <>
                  <option value="REVIEW">En cours d’examen</option>
                  <option value="RESOLVED">Résolu</option>
                </>
              )}
              {t.discrepancy?.status === "RESOLVED" && (
                <option value="CLOSED">Clôturé</option>
              )}
            </Select>
          )}
          {t.code !== "REMIT" && (
            <Field
              label={
                t.code === "DECLARE"
                  ? "Motif si montant nul ou excédentaire"
                  : "Motif et constat"
              }
              value={values.reason}
              onChange={(e) => set("reason", e.target.value)}
              maxLength={1000}
              required={!["DECLARE", "REMIT"].includes(t.code)}
            />
          )}
          {["DECLARE", "REMIT"].includes(t.code) && (
            <Field
              label="Observation facultative"
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
              maxLength={1000}
            />
          )}
          <Choice
            type="checkbox"
            label="J’ai vérifié les montants, la devise et l’opération physique déclarée ou constatée."
            checked={values.acknowledged}
            onChange={(e) => set("acknowledged", e.target.checked)}
          />
        </fieldset>
        <div className="ds-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={onClose}
          >
            Revenir sans enregistrer
          </Button>
          <Button type="submit" disabled={busy} busy={busy}>
            Confirmer l’enregistrement
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
