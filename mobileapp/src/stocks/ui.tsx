import { useApiData } from "../auth/useApiData";
import { Text, View } from "react-native";
import { Button, ErrorMessage, Loading, ui } from "../design/ui";
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}
export function useStockData<T>(url: string | null) {
  return useApiData<T>(url);
}
export function LoadState({
  error,
  retry,
}: {
  error?: string;
  retry: () => void;
}) {
  return error ? <ErrorMessage message={error} retry={retry} /> : <Loading />;
}
export function Pager({
  page,
  total,
  setPage,
  size = 15,
}: {
  page: number;
  total: number;
  setPage: (page: number) => void;
  size?: number;
}) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={ui.body}>
        Page {page} · {total} résultat(s)
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button
          secondary
          title="Précédent"
          disabled={page === 1}
          onPress={() => setPage(page - 1)}
        />
        <Button
          secondary
          title="Suivant"
          disabled={page * size >= total}
          onPress={() => setPage(page + 1)}
        />
      </View>
    </View>
  );
}
export function quantity(value: string, zero = false) {
  if (!/^(0|[1-9][0-9]*)$/.test(value.trim()))
    throw new Error("Saisissez une quantité entière, sans virgule ni point.");
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n > 2147483647 || n < (zero ? 0 : 1))
    throw new Error(
      zero
        ? "La quantité doit être un entier positif ou nul."
        : "La quantité doit être un entier supérieur à zéro.",
    );
  return n;
}
export const localKey = () =>
  `mobile-${Date.now()}-${Math.random().toString(16).slice(2, 14)}`;
export const date = (value?: string | null) =>
  value ? new Date(value).toLocaleString("fr-FR") : "—";
export const labels: Record<string, string> = {
  DRAFT: "Brouillon",
  PENDING: "En attente",
  CONFIRMED: "Réceptionné",
  RECEIVED: "Réceptionné",
  CANCELLED: "Annulé",
  IN_TRANSIT: "En transit",
  PARTIAL: "Réception partielle",
  PARTIALLY_RECEIVED: "Réception partielle",
  SUBMITTED: "À valider",
  APPROVED: "Validé",
  REJECTED: "Rejeté",
  ACTIVE: "Active",
  RELEASED: "Libérée",
  CONSUMED: "Consommée",
  OPEN: "Ouvert",
  RESOLVED: "Traité",
  CLOSED: "Clôturé",
  MISSING: "Article manquant",
  DAMAGED: "Article endommagé",
  REFUSED: "Réception refusée",
  OTHER: "Autre",
  DEPOSIT: "Entrée par dépôt",
  ISSUE: "Sortie",
  RESERVE: "Réservation",
  RELEASE: "Libération",
  RETURN: "Retour",
  TRANSFER_OUT: "Transfert sortant",
  TRANSFER_IN: "Transfert entrant",
  ADJUSTMENT: "Correction d’inventaire",
};
