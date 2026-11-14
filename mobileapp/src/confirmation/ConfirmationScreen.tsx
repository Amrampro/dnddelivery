import { Checkbox as Check } from "../design/ui";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Image, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { api } from "../auth/client";
import {
  Button,
  Card,
  Badge,
  Input,
  OtpInput,
  Selector,
  ErrorMessage,
  Loading,
  ui,
} from "../design/ui";
import { useDeliveryData } from "../deliveries/useDeliveryData";
import type { Workspace } from "../auth/types";
import { OrderFinanceSummary } from "../finance/FinanceScreen";
import {
  confirmationChoice,
  confirmationLabels,
  communicationLabel,
  type ConfirmationInfo,
  type DeliveryCommunication,
} from "../../../shared/confirmation";
type Form = {
  code: "VERIFY" | "RENEW" | "EXCEPTION" | "DECIDE" | "COMPLETE" | "TRACKING";
  version: number;
  exceptionId?: string;
  exceptionVersion?: number;
};
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
    <Image
      source={{ uri: source }}
      accessibilityLabel="Photo de preuve autorisée"
      style={{ width: "100%", height: 240, borderRadius: 12 }}
      resizeMode="contain"
    />
  ) : (
    <Text style={ui.body}>{error || "Chargement sécurisé de la photo…"}</Text>
  );
}
function ConfirmationForm({
  info,
  form,
  onClose,
  onDone,
  scrollToTop,
  summary,
}: {
  info: ConfirmationInfo;
  form: Form;
  onClose: () => void;
  onDone: () => void;
  scrollToTop: () => void;
  summary?: ReactNode;
}) {
  const [p] = useState(info),
    [otp, setOtp] = useState(""),
    [reason, setReason] = useState(""),
    [approve, setApprove] = useState("true"),
    [ack, setAck] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [exceptionId, setExceptionId] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    key = useRef(
      `confirmation-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ),
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
  async function submit() {
    if (lock.current) return;
    try {
      if (!ack)
        throw Error("Vérifiez le récapitulatif et confirmez l’opération.");
      if (form.code === "VERIFY" && attempt.current && attempt.current !== otp)
        key.current = `confirmation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      attempt.current = otp;
      let path = `/deliveries/${p.id}`,
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
          ...confirmationChoice(p, selected, exceptionId || undefined),
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
          body.approve = approve === "true";
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
      scrollToTop();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <View style={ui.stack}>
      <Button
        title="Revenir sans enregistrer"
        secondary
        disabled={busy}
        onPress={onClose}
      />
      <Text style={ui.kicker}>CONFIRMATION ET PREUVES</Text>
      <Text role="heading" style={ui.sectionTitle}>
        {title}
      </Text>
      <Text style={ui.body}>
        La validation du code, les photos et le contrôle financier sont vérifiés
        par le serveur. La remise reste ouverte jusqu’à sa confirmation.
      </Text>
      {!!error && <ErrorMessage message={error} />}
      {form.code === "TRACKING" && (
        <Text style={ui.body}>
          Les anciens liens et les codes OTP actifs seront invalidés. Un nouveau
          lien personnel sera envoyé à l’adresse enregistrée du destinataire.
        </Text>
      )}
      {summary}
      <Card>
        <View style={ui.stack}>
          {form.code === "VERIFY" && (
            <OtpInput
              label="Code de remise à six chiffres"
              value={otp}
              onChangeText={(s) => setOtp(s.replace(/\D/g, "").slice(0, 6))}
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              editable={!busy}
            />
          )}
          {form.code === "DECIDE" && (
            <Selector
              label="Décision du responsable"
              value={approve}
              onChange={setApprove}
              disabled={busy}
              options={[
                { id: "true", label: "Approuver avec preuves supplémentaires" },
                { id: "false", label: "Refuser l’exception" },
              ]}
            />
          )}
          {!["VERIFY", "COMPLETE"].includes(form.code) && (
            <Input
              label="Motif et constat"
              value={reason}
              onChangeText={setReason}
              multiline
              maxLength={500}
              editable={!busy}
            />
          )}
          {form.code === "COMPLETE" && (
            <>
              <Text style={ui.body}>
                Sélectionnez les photos reçues sur cette affectation.
                L’exception sans OTP exige deux photos différentes et un
                responsable distinct.
              </Text>
              <Selector
                label="Mode de confirmation"
                value={exceptionId}
                onChange={setExceptionId}
                disabled={busy}
                options={[
                  { id: "", label: "Code OTP validé" },
                  ...p.exceptions
                    .filter(
                      (e) => e.current && !e.expired && e.status === "APPROVED",
                    )
                    .map((e) => ({
                      id: e.id,
                      label: "Exception approuvée : " + e.reason,
                    })),
                ]}
              />
              {p.evidence
                .filter(
                  (e) =>
                    e.current && e.status === "READY" && e.kind === "HANDOVER",
                )
                .map((e) => (
                  <Check
                    key={e.id}
                    label={`Photo reçue le ${new Date(e.createdAt).toLocaleString("fr-FR")}`}
                    checked={selected.includes(e.id)}
                    disabled={busy}
                    onPress={() =>
                      setSelected((s) =>
                        s.includes(e.id)
                          ? s.filter((x) => x !== e.id)
                          : [...s, e.id],
                      )
                    }
                  />
                ))}
            </>
          )}
          <Check
            label="J’ai vérifié le colis, les preuves et l’opération que je déclare."
            checked={ack}
            disabled={busy}
            onPress={() => setAck((x) => !x)}
          />
          <Button
            title="Confirmer l’enregistrement"
            onPress={() => void submit()}
            busy={busy}
          />
        </View>
      </Card>
    </View>
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
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    key = useRef(""),
    lock = useRef(false);
  async function choose(camera: boolean) {
    setError("");
    try {
      if (
        camera &&
        !(await ImagePicker.requestCameraPermissionsAsync()).granted
      )
        throw Error(
          "Autorisez la caméra pour photographier le colis. Vous pouvez aussi choisir une photo déjà prise.",
        );
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        quality: 0.8,
        exif: false,
        allowsEditing: false,
      };
      const result = await (camera
        ? ImagePicker.launchCameraAsync(options)
        : ImagePicker.launchImageLibraryAsync(options));
      if (!result.canceled && result.assets[0]) {
        setPhoto(result.assets[0]);
        key.current = `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function upload() {
    if (!photo || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const blob = photo.file ?? (await (await fetch(photo.uri)).blob());
      if (blob.size > 5 * 1024 * 1024) throw Error("La photo dépasse 5 Mo.");
      const mime = photo.mimeType || blob.type || "image/jpeg";
      await api(
        `/deliveries/${id}/proofs?kind=${failure ? "FAILURE" : "HANDOVER"}&operationKey=${key.current}`,
        { method: "POST", body: blob, headers: { "Content-Type": mime } },
      );
      setPhoto(undefined);
      onDone();
    } catch (e) {
      setError(
        (e as Error).message + " La photo reste disponible pour réessayer.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Card>
      <View style={ui.stack}>
        <Text style={ui.sectionTitle}>
          {failure
            ? "Justificatif de la tentative échouée"
            : "Photos de la remise"}
        </Text>
        <Text style={ui.body}>
          Photographiez le colis et sa remise. Évitez les visages, pièces
          d’identité et informations privées inutiles. L’heure serveur fait foi.
          JPEG, PNG ou WebP, 5 Mo maximum.
        </Text>
        <Button
          title="Prendre une photo"
          onPress={() => void choose(true)}
          disabled={busy}
        />
        <Button
          title="Choisir une photo déjà prise"
          secondary
          onPress={() => void choose(false)}
          disabled={busy}
        />
        {photo && (
          <>
            <Image
              source={{ uri: photo.uri }}
              accessibilityLabel="Prévisualisation de la photo avant envoi"
              style={{ width: "100%", height: 260, borderRadius: 12 }}
              resizeMode="contain"
            />
            <Button
              title="Envoyer cette photo"
              onPress={() => void upload()}
              busy={busy}
            />
            <Button
              title="Retirer cette sélection"
              secondary
              disabled={busy}
              onPress={() => setPhoto(undefined)}
            />
          </>
        )}
        {!!error && <ErrorMessage message={error} />}
      </View>
    </Card>
  );
}
export function ConfirmationScreen({
  id,
  orderId,
  context,
  onBack,
  onChanged,
  scrollToTop,
}: {
  id: string;
  orderId: string;
  context: Workspace;
  onBack: () => void;
  onChanged: () => void;
  scrollToTop: () => void;
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
      <ErrorMessage message={resource.error} />
    ) : (
      <Loading />
    );
  const reload = () => {
      setForm(undefined);
      resource.reload();
      notices.reload();
      onChanged();
      scrollToTop();
    },
    open = (code: Form["code"], extra: Partial<Form> = {}) => {
      setForm({ code, version: p.version, ...extra });
      scrollToTop();
    };
  if (form)
    return (
      <View style={ui.stack}>
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
          onClose={() => {
            setForm(undefined);
            scrollToTop();
          }}
          onDone={reload}
          scrollToTop={scrollToTop}
        />
      </View>
    );
  return (
    <View style={ui.stack}>
      <Button title="Revenir à la mission" secondary onPress={onBack} />
      <Text style={ui.kicker}>CONFIRMATION ET PREUVES</Text>
      <Text role="heading" style={ui.sectionTitle}>
        La remise, en confiance.
      </Text>
      <Card>
        <View style={ui.stack}>
          <Text style={ui.body}>
            {p.proof
              ? p.proof.legacy
                ? "Preuve historique enregistrée, à rapprocher par un responsable."
                : `Remise confirmée le ${new Date(p.proof.createdAt).toLocaleString("fr-FR")} · ${p.proof.method === "OTP" ? "Code OTP validé" : "Exception autorisée avec preuves supplémentaires"}.`
              : "Le code ou l’exception, les photos et le contrôle financier sont nécessaires à la clôture."}
          </Text>
          {p.otp && (
            <>
              <Badge>
                {p.otp.expired
                  ? "Validation expirée"
                  : (confirmationLabels[p.otp.status] ?? p.otp.status)}
              </Badge>
              <Text style={ui.body}>
                {p.otp.attempts !== undefined
                  ? `${p.otp.attempts}/${p.otp.maxAttempts} essai(s) · `
                  : ""}
                {p.otp.current
                  ? "Validation de l’affectation actuelle"
                  : "Validation inactive ou affectation antérieure"}
              </Text>
            </>
          )}
          <Button
            title="Actualiser les preuves"
            secondary
            onPress={resource.reload}
          />
          {p.canVerify && (
            <Button title="Saisir le code OTP" onPress={() => open("VERIFY")} />
          )}
          {p.canRenew && (
            <Button
              title="Renouveler et envoyer le code"
              secondary
              onPress={() => open("RENEW")}
            />
          )}
          {p.canVerify && (
            <Button
              title="Demander une exception sans OTP"
              secondary
              onPress={() => open("EXCEPTION")}
            />
          )}
          {p.canVerify && (
            <Button
              title="Vérifier et clôturer la remise"
              onPress={() => open("COMPLETE")}
            />
          )}
          {p.canManageTracking && (
            <Button
              title="Renouveler le lien destinataire"
              secondary
              onPress={() => open("TRACKING")}
            />
          )}
        </View>
      </Card>
      {!!resource.error && <ErrorMessage message={resource.error} />}
      {p.evidence.map((e) => (
        <Card key={e.id}>
          <View style={ui.stack}>
            <ProofImage id={e.id} />
            <Text style={ui.body}>
              {e.kind === "FAILURE"
                ? "Justificatif d’échec"
                : "Photo de remise"}{" "}
              · {confirmationLabels[e.status] ?? e.status}
            </Text>
            <Text style={ui.body}>
              Reçue par le serveur le{" "}
              {new Date(e.createdAt).toLocaleString("fr-FR")}
              {e.current ? "" : " · Affectation antérieure"}
            </Text>
          </View>
        </Card>
      ))}
      {p.canUpload && (
        <UploadPhoto id={id} failure={p.phase === "FAILED"} onDone={reload} />
      )}
      {p.exceptions.map((e) => (
        <Card key={e.id}>
          <View style={ui.stack}>
            <Badge>
              {e.status === "PENDING"
                ? "En attente d’un responsable distinct"
                : (confirmationLabels[e.status] ?? e.status)}
            </Badge>
            <Text style={ui.body}>{e.reason}</Text>
            {!!e.decisionReason && (
              <Text style={ui.body}>
                Décision : {e.decisionReason}
                {e.decidedByName ? ` · ${e.decidedByName}` : ""}
              </Text>
            )}
            <Text style={ui.body}>
              {new Date(e.createdAt).toLocaleString("fr-FR")}
              {e.current ? "" : " · Affectation antérieure"}
            </Text>
            {e.canDecide && (
              <Button
                title="Examiner cette exception"
                onPress={() =>
                  open("DECIDE", {
                    exceptionId: e.id,
                    exceptionVersion: e.version,
                  })
                }
              />
            )}
          </View>
        </Card>
      ))}
      {notices.data && (
        <Card>
          <View style={ui.stack}>
            <Text style={ui.sectionTitle}>Notifications au destinataire</Text>
            <Text style={ui.body}>
              Accepté par le fournisseur ne signifie pas délivré au
              destinataire.
            </Text>
            {notices.data.map((n) => (
              <View key={n.id} style={ui.stack}>
                <Badge>{confirmationLabels[n.status] ?? n.status}</Badge>
                <Text style={ui.body}>
                  {communicationLabel(n.event)} ·{" "}
                  {new Date(n.createdAt).toLocaleString("fr-FR")} · {n.attempts}
                  /{n.maxAttempts} tentative(s)
                </Text>
              </View>
            ))}
          </View>
        </Card>
      )}
    </View>
  );
}
