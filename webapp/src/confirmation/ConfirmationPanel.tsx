import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Workspace } from "../auth/types";
import { OrderFinanceSummary } from "../finance/FinanceWorkspace";
import { api } from "../auth/client";
import { Button, Card, Badge, Field, Select, ErrorState } from "../design/ui";
import { useDeliveryData } from "../deliveries/useDeliveryData";
import {
  confirmationChoice,
  confirmationLabels,
  communicationLabel,
  type ConfirmationInfo,
  type DeliveryCommunication,
} from "../../../shared/confirmation";
import "./confirmation.css";
function ProofImage({ id }: { id: string }) {
  const [source, setSource] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void api<{ mime: string; image: string }>(
      `/delivery-evidence/${id}/preview`,
    )
      .then((r) => {
        if (live) setSource(`data:${r.mime};base64,${r.image}`);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [id]);
  return source ? (
    <img className="proof-photo" src={source} alt="Photo de preuve autorisée" />
  ) : (
    <p role="status">{error || "Chargement sécurisé de la photo…"}</p>
  );
}
type Form = {
  code: "VERIFY" | "RENEW" | "EXCEPTION" | "DECIDE" | "COMPLETE" | "TRACKING";
  version: number;
  exceptionId?: string;
  exceptionVersion?: number;
};
function ConfirmationForm({
  info,
  form,
  onClose,
  onDone,
  summary,
}: {
  info: ConfirmationInfo;
  form: Form;
  onClose: () => void;
  onDone: () => void;
  summary?: ReactNode;
}) {
  const [otp, setOtp] = useState(""),
    [reason, setReason] = useState(""),
    [approve, setApprove] = useState(true),
    [ack, setAck] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [exceptionId, setExceptionId] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID()),
    attempt = useRef(""),
    lock = useRef(false);
  const title = {
    VERIFY: "Vérifier le code du destinataire",
    RENEW: "Envoyer un nouveau code",
    EXCEPTION: "Demander une exception sans OTP",
    DECIDE: "Examiner la demande d’exception",
    COMPLETE: "Confirmer la remise finale",
    TRACKING: "Renouveler l’accès au suivi",
  }[form.code];
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    try {
      if (!ack)
        throw Error("Vérifiez le récapitulatif et confirmez l’opération.");
      if (form.code === "VERIFY" && attempt.current && attempt.current !== otp)
        key.current = crypto.randomUUID();
      attempt.current = otp;
      let path = `/deliveries/${info.id}`,
        body: Record<string, unknown> = {
          version: form.version,
          operationKey: key.current,
        };
      if (form.code === "VERIFY") {
        if (!/^\d{6}$/.test(otp))
          throw Error("Saisissez les six chiffres du destinataire.");
        path += "/otp/verify";
        body.code = otp;
      } else if (form.code === "COMPLETE") {
        path += "/complete";
        body = {
          ...body,
          ...confirmationChoice(info, selected, exceptionId || undefined),
        };
      } else {
        if (reason.trim().length < 5)
          throw Error("Un motif détaillé est requis.");
        body.reason = reason.trim();
        if (form.code === "RENEW") path += "/otp/resend";
        if (form.code === "EXCEPTION") path += "/otp-exceptions";
        if (form.code === "TRACKING") path += "/tracking/renew";
        if (form.code === "DECIDE") {
          path += `/otp-exceptions/${form.exceptionId}/decision`;
          body.approve = approve;
          body.exceptionVersion = form.exceptionVersion;
        }
      }
      lock.current = true;
      setBusy(true);
      setError("");
      await api(path, { method: "POST", body: JSON.stringify(body) });
      onDone();
    } catch (e) {
      setError((e as Error).message + " La saisie est conservée.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Card>
      <div className="confirmation-heading">
        <h3>{title}</h3>
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
          Revenir sans enregistrer
        </Button>
      </div>
      <p>
        La validation du code, les photos et le contrôle financier sont vérifiés
        par le serveur. L’état final apparaît uniquement après sa confirmation.
      </p>
      <form className="confirmation-form" onSubmit={submit}>
        {error && <ErrorState message={error} />}
        {form.code==="TRACKING"&&<p>Les anciens liens et les codes OTP actifs seront invalidés. Un nouveau lien personnel sera envoyé à l’adresse enregistrée du destinataire.</p>}
        {summary}
        <fieldset disabled={busy}>
          {form.code === "VERIFY" && (
            <Field
              label="Code de remise à six chiffres"
              value={otp}
              onChange={(e) =>
                setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
            />
          )}
          {form.code === "DECIDE" && (
            <Select
              label="Décision du responsable"
              value={String(approve)}
              onChange={(e) => setApprove(e.target.value === "true")}
            >
              <option value="true">
                Approuver l’exception avec preuves supplémentaires
              </option>
              <option value="false">Refuser l’exception</option>
            </Select>
          )}
          {!["VERIFY", "COMPLETE"].includes(form.code) && (
            <Field
              label="Motif et constat"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={5}
              maxLength={500}
              required
            />
          )}
          {form.code === "COMPLETE" && (
            <>
              <p>
                Sélectionnez les photos reçues sur cette affectation. La clôture
                sans OTP exige une exception approuvée et deux photos
                différentes.
              </p>
              <Select
                label="Mode de confirmation"
                value={exceptionId}
                onChange={(e) => setExceptionId(e.target.value)}
              >
                <option value="">Code OTP validé</option>
                {info.exceptions
                  .filter(
                    (e) => e.current && !e.expired && e.status === "APPROVED",
                  )
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      Exception approuvée : {e.reason}
                    </option>
                  ))}
              </Select>
              {info.evidence
                .filter(
                  (e) =>
                    e.current && e.status === "READY" && e.kind === "HANDOVER",
                )
                .map((p) => (
                  <label className="confirmation-check" key={p.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(p.id)}
                      onChange={(e) =>
                        setSelected((s) =>
                          e.target.checked
                            ? [...s, p.id]
                            : s.filter((x) => x !== p.id),
                        )
                      }
                    />
                    Photo reçue le{" "}
                    {new Date(p.createdAt).toLocaleString("fr-FR")}
                  </label>
                ))}
            </>
          )}
          <label className="confirmation-check">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            J’ai vérifié le colis, les preuves et l’opération que je déclare.
          </label>
          <Button type="submit" disabled={busy}>
            Confirmer l’enregistrement
          </Button>
        </fieldset>
      </form>
    </Card>
  );
}
function UploadPhoto({
  id,
  failure,
  onDone,
}: {
  id: string;
  failure: boolean;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File>(),
    [preview, setPreview] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    key = useRef(crypto.randomUUID()),
    lock = useRef(false);
  useEffect(() => {
    return () => {if(preview)URL.revokeObjectURL(preview);};
  }, [preview]);
  return (
    <Card>
      <h3>
        {failure
          ? "Photo justificative de la tentative échouée"
          : "Photographier le colis remis"}
      </h3>
      <p>
        Photographiez le colis et sa remise. Évitez les visages, documents
        d’identité et informations privées inutiles. L’heure du serveur fait
        foi.
      </p>
      <label className="ds-field">
        <span>Photo JPEG, PNG ou WebP · 5 Mo maximum</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          disabled={busy}
          onChange={(e) => {
            const next=e.target.files?.[0];setFile(next);setPreview(next?URL.createObjectURL(next):"");
            key.current = crypto.randomUUID();
            setError("");
          }}
        />
      </label>
      {file && (
        <>
          <img
            className="proof-photo"
            src={preview}
            alt="Prévisualisation avant envoi"
          />
          <Button
            disabled={busy}
            onClick={async () => {
              if (lock.current) return;
              lock.current = true;
              setBusy(true);
              try {
                if (file.size > 5 * 1024 * 1024)
                  throw Error("La photo dépasse 5 Mo.");
                await api(
                  `/deliveries/${id}/proofs?kind=${failure ? "FAILURE" : "HANDOVER"}&operationKey=${key.current}`,
                  {
                    method: "POST",
                    body: file,
                    headers: { "Content-Type": file.type },
                  },
                );
                setFile(undefined);
                setPreview("");
                onDone();
              } catch (e) {
                setError(
                  (e as Error).message +
                    " La photo est conservée pour réessayer.",
                );
              } finally {
                lock.current = false;
                setBusy(false);
              }
            }}
          >
            Envoyer cette photo
          </Button>
        </>
      )}
      {error && <ErrorState message={error} />}
    </Card>
  );
}
export function ConfirmationPanel({
  id,
  orderId,
  context,
  onChanged,
}: {
  id: string;
  orderId: string;
  context: Workspace;
  onChanged: () => void;
}) {
  const resource = useDeliveryData<ConfirmationInfo>(
      `/deliveries/${id}/confirmation`,
    ),
    [form, setForm] = useState<Form>(),
    p = resource.data;
  const notices = useDeliveryData<DeliveryCommunication[]>(
    p &&
      p.permissions.some((x) =>
        [
          "delivery.notifications.read",
          "shop.delivery.notifications.read",
        ].includes(x),
      )
      ? `/deliveries/${id}/communications`
      : null,
  );
  if (!p)
    return resource.error ? (
      <ErrorState message={resource.error} />
    ) : (
      <p role="status">Chargement de la confirmation…</p>
    );
  const reload = () => {
      setForm(undefined);
      resource.reload();
      notices.reload();
      onChanged();
    },
    open = (code: Form["code"], extra: Partial<Form> = {}) =>
      setForm({ code, version: p.version, ...extra });
  return (
    <section className="confirmation-panel">
      <Card>
        <div className="confirmation-heading">
          <h2>Confirmation et preuves de remise</h2>
          <Button variant="ghost" onClick={resource.reload}>
            Actualiser les preuves
          </Button>
        </div>
        {resource.error && <ErrorState message={resource.error} />}
        <p>
          {p.proof
            ? p.proof.legacy
              ? "Preuve historique enregistrée, à rapprocher par un responsable."
              : `Remise confirmée le ${new Date(p.proof.createdAt).toLocaleString("fr-FR")} · ${p.proof.method === "OTP" ? "Code OTP validé" : "Exception autorisée avec preuves supplémentaires"}.`
            : "La mission reste ouverte tant que le code ou l’exception, les photos et le contrôle financier ne sont pas validés."}
        </p>
        {p.otp && (
          <p>
            Code :{" "}
            <Badge>
              {p.otp.expired
                ? "Validation expirée"
                : (confirmationLabels[p.otp.status] ?? p.otp.status)}
            </Badge>
            {p.otp.attempts !== undefined &&
              ` · ${p.otp.attempts}/${p.otp.maxAttempts} essai(s)`}
            {p.otp.current
              ? ""
              : " · Ancienne affectation ou validation inactive"}
          </p>
        )}
        <div className="delivery-actions">
          {p.canVerify && (
            <Button onClick={() => open("VERIFY")}>Saisir le code OTP</Button>
          )}
          {p.canRenew && (
            <Button variant="secondary" onClick={() => open("RENEW")}>
              Renouveler et envoyer le code
            </Button>
          )}
          {p.canVerify && (
            <Button variant="secondary" onClick={() => open("EXCEPTION")}>
              Demander une exception sans OTP
            </Button>
          )}
          {p.canVerify && (
            <Button onClick={() => open("COMPLETE")}>
              Vérifier et clôturer la remise
            </Button>
          )}
          {p.canManageTracking && (
            <Button variant="ghost" onClick={() => open("TRACKING")}>
              Renouveler le lien destinataire
            </Button>
          )}
        </div>
      </Card>
      {form && (
        <ConfirmationForm
          key={form.code + form.exceptionId}
          info={p}
          form={form}
          summary={
            form.code === "COMPLETE" &&
            context.permissions.some((code) =>
              [
                "financial.supervise.read",
                "collections.self.read",
                "shop.collections.read",
              ].includes(code),
            ) ? (
              <OrderFinanceSummary orderId={orderId} context={context} />
            ) : undefined
          }
          onClose={() => setForm(undefined)}
          onDone={reload}
        />
      )}
      <div className="proof-gallery">
        {p.evidence.map((e) => (
          <Card key={e.id}>
            <ProofImage id={e.id} />
            <p>
              {e.kind === "FAILURE"
                ? "Justificatif d’échec"
                : "Photo de remise"}{" "}
              · {confirmationLabels[e.status] ?? e.status}
            </p>
            <p>
              Reçue par le serveur le{" "}
              {new Date(e.createdAt).toLocaleString("fr-FR")}
              {e.current ? "" : " · Affectation antérieure"}
            </p>
          </Card>
        ))}
      </div>
      {p.canUpload && (
        <UploadPhoto id={id} failure={p.phase === "FAILED"} onDone={reload} />
      )}{" "}
      {!!p.exceptions.length && (
        <Card>
          <h3>Exceptions sans OTP</h3>
          {p.exceptions.map((e) => (
            <div className="confirmation-exception" key={e.id}>
              <Badge>
                {e.status === "PENDING"
                  ? "En attente d’un responsable distinct"
                  : (confirmationLabels[e.status] ?? e.status)}
              </Badge>
              <p>{e.reason}</p>
              {e.decisionReason && (
                <p>
                  Décision : {e.decisionReason}
                  {e.decidedByName ? ` · ${e.decidedByName}` : ""}
                </p>
              )}
              <p>
                {new Date(e.createdAt).toLocaleString("fr-FR")}
                {e.current ? "" : " · Affectation antérieure"}
              </p>
              {e.canDecide && (
                <Button
                  onClick={() =>
                    open("DECIDE", {
                      exceptionId: e.id,
                      exceptionVersion: e.version,
                    })
                  }
                >
                  Examiner cette exception
                </Button>
              )}
            </div>
          ))}
        </Card>
      )}
      {notices.data && (
        <Card>
          <h3>Notifications au destinataire</h3>
          <p>
            « Accepté par le fournisseur » ne signifie pas « délivré au
            destinataire ».
          </p>
          {notices.data.map((n) => (
            <div className="confirmation-exception" key={n.id}>
              <Badge>{confirmationLabels[n.status] ?? n.status}</Badge>
              <p>
                {communicationLabel(n.event)} ·{" "}
                {new Date(n.createdAt).toLocaleString("fr-FR")} · {n.attempts}/
                {n.maxAttempts} tentative(s)
              </p>
              {n.nextAttemptAt && (
                <p>
                  Reprise prévue :{" "}
                  {new Date(n.nextAttemptAt).toLocaleString("fr-FR")}
                </p>
              )}
            </div>
          ))}
        </Card>
      )}
    </section>
  );
}
