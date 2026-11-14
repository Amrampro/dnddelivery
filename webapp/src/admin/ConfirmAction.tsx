import { useState, type FormEvent } from "react";
import { Button, Dialog, Textarea } from "../design/ui";
export interface AdminAction {
  title: string;
  description: string;
  reason?: boolean;
  submit: (reason: string) => Promise<unknown>;
}
export function ConfirmAction({
  action,
  close,
  done,
}: {
  action: AdminAction;
  close: () => void;
  done: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await action.submit(reason);
      const warning =
        typeof result === "object" &&
        result !== null &&
        "invitationDelivery" in result &&
        result.invitationDelivery === "FAILED";
      done(
        warning
          ? "Action enregistrée. L’e-mail n’a pas été envoyé ; l’invitation est conservée pour une nouvelle tentative."
          : "Action enregistrée.",
      );
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onClose={() => {
        if (!busy) close();
      }}
      title={action.title}
    >
      <form onSubmit={submit}>
        <p>{action.description}</p>
        {action.reason && (
          <Textarea
            label="Motif administratif"
            required
            minLength={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
        {error && (
          <p role="alert" className="ds-error-text">
            {error}
          </p>
        )}
        <div className="ds-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={close}
          >
            Annuler
          </Button>
          <Button type="submit" variant="danger" busy={busy}>
            Confirmer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
