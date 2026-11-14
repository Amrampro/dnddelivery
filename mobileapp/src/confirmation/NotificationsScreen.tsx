import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { Workspace } from "../auth/types";
import { useApiData } from "../auth/useApiData";
import {
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  ListRow,
  Loading,
  ui,
} from "../design/ui";
import { deliveryEvents } from "../../../shared/deliveries";
import { financeEvents } from "../../../shared/finance";
import { deliveryModule, notificationDelivery } from "./notification-target";
type Notice = {
  id: string;
  createdAt: string;
  sourceEvent: string;
  payload: {
    publicNumber?: string;
    deliveryId?: string;
    event?: string;
    action?: string;
  };
};
export function NotificationsScreen({ context }: { context: Workspace }) {
  const router = useRouter(),
    moduleId = deliveryModule(context);
  const logistics = useApiData<Notice[]>(
    moduleId ? "/deliveries/notifications" : null,
    30000,
  );
  const financial = useApiData<Notice[]>(
    context.permissions.some((p) =>
      ["financial.supervise.read", "collections.self.read"].includes(p),
    )
      ? "/financial-notifications"
      : null,
    30000,
  );
  const rows = [
    ...(logistics.data ?? []).map((n) => ({ ...n, kind: "delivery" })),
    ...(financial.data ?? []).map((n) => ({ ...n, kind: "finance" })),
  ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return (
    <View style={ui.stack}>
      <Text style={ui.kicker}>VOS AVIS OPÉRATIONNELS</Text>
      <Text role="heading" style={ui.sectionTitle}>
        Votre attention, au bon endroit.
      </Text>
      <Text style={ui.body}>
        Les avis sont limités à vos accès actuels dans cet environnement. Les
        e-mails et les alertes push restent des moyens de notification
        distincts.
      </Text>
      <Button
        secondary
        title="Actualiser les avis"
        onPress={() => {
          logistics.reload();
          financial.reload();
        }}
      />
      {logistics.error && (
        <ErrorMessage message={logistics.error} retry={logistics.reload} />
      )}
      {financial.error && (
        <ErrorMessage message={financial.error} retry={financial.reload} />
      )}
      {(logistics.syncing || financial.syncing) && rows.length === 0 && (
        <Loading />
      )}
      {rows.map((n) => (
        <Card key={n.id}>
          <ListRow
            title={
              (n.kind === "finance" ? financeEvents : deliveryEvents)[
                n.payload.event ?? n.payload.action ?? ""
              ] ?? "Mise à jour de votre opération"
            }
            description={`${n.payload.publicNumber ?? ""}\n${new Date(n.createdAt).toLocaleString("fr-FR")}`}
            onPress={() => {
              const id = notificationDelivery(n.payload);
              if (n.kind === "delivery" && id && moduleId)
                router.push({
                  pathname: "/espace/[module]",
                  params: { module: moduleId, mission: id },
                });
              else
                router.push({
                  pathname: "/espace/[module]",
                  params: { module: "remises" },
                });
            }}
          />
        </Card>
      ))}
      {rows.length === 0 && !logistics.syncing && !financial.syncing && (
        <EmptyState
          title="Aucun avis dans cet environnement"
          description="Les prochaines opérations vous concernant apparaîtront ici. Les avis de collaboration restent disponibles dans le module partenaires."
          icon="bell"
        />
      )}
    </View>
  );
}
