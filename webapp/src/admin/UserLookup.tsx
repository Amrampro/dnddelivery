import { useState } from "react";
import { api } from "../auth/client";
import { Button, Field } from "../design/ui";
export interface SelectedUser {
  id: string;
  fullName: string;
  email: string;
}
export function UserLookup({
  onSelect,
  selected,
}: {
  onSelect: (user: SelectedUser | null) => void;
  selected: SelectedUser | null;
}) {
  const [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function search() {
    setBusy(true);
    setError("");
    try {
      const value = await api<{ user: SelectedUser | null }>(
        `/admin/users/lookup?email=${encodeURIComponent(email.trim())}`,
      );
      onSelect(value.user);
      if (!value.user)
        setError("Aucun compte actif ne correspond à cette adresse.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recherche impossible.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-lookup">
      <Field
        label="Adresse e-mail exacte du compte existant"
        type="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          onSelect(null);
        }}
      />
      <Button
        type="button"
        variant="secondary"
        busy={busy}
        disabled={!email.includes("@")}
        onClick={() => void search()}
      >
        Rechercher le compte
      </Button>
      {error && (
        <p role="alert" className="ds-error-text">
          {error}
        </p>
      )}
      {selected && (
        <p role="status">
          Compte sélectionné : <strong>{selected.fullName}</strong> ·{" "}
          {selected.email}
        </p>
      )}
    </div>
  );
}
