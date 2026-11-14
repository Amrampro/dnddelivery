import { Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { definition, navigation } from "../../../shared/workspace";
import type { Workspace } from "../auth/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ListRow,
  Summary,
  ui,
} from "../design/ui";
import { tokens } from "../../../shared/tokens";
import { useApiData } from "../auth/useApiData";
import { ErrorMessage, Loading } from "../design/ui";
import type { DeliveryPage } from "../../../shared/deliveries";
import type { OrderPage } from "../../../shared/orders";
import { icons } from "./icons";
import { workspaceStyles as s } from "./styles";
const c = tokens.colors;
export function MobileHome({
  context,
  fullName,
  onNavigate,
  onMenu,
}: {
  context: Workspace;
  fullName: string;
  onNavigate: (id: string) => void;
  onMenu: () => void;
}) {
  const config = definition(context)!;
  const modules = navigation(context).filter(
    (m) => !["accueil", "parametres"].includes(m.id),
  );
  const priorities=context.scope==="AGENCY"?["affectations","commandes","confirmations","incidents","remises","stocks"]:["commandes","livraisons","agences","employes","stocks","abonnement"];
  modules.sort((a,b)=>(priorities.indexOf(a.id)<0?100:priorities.indexOf(a.id))-(priorities.indexOf(b.id)<0?100:priorities.indexOf(b.id)));
  const orders = useApiData<OrderPage<never>>(
    context.permissions.some((p) =>
      ["orders.read", "shop.orders.read"].includes(p),
    )
      ? "/orders?page=1&size=1"
      : null,
    30000,
  );
  const deliveries = useApiData<DeliveryPage<never>>(
    context.permissions.some((p) =>
      [
        "deliveries.supervise.read",
        "deliveries.self.read",
        "shop.deliveries.read",
      ].includes(p),
    )
      ? "/deliveries?page=1&size=1"
      : null,
    30000,
  );
  const metrics = [
    ...(orders.data?.summary
      ? [
          { label: "Commandes en attente", value: orders.data.summary.pending },
          { label: "Brouillons", value: orders.data.summary.drafts },
        ]
      : []),
    ...(deliveries.data?.summary
      ? [
          { label: "Missions en cours", value: deliveries.data.summary.active },
          {
            label: "Échecs à traiter",
            value: deliveries.data.summary.failures,
          },
        ]
      : []),
  ];
  return (
    <>
      <View style={s.pageTitle}>
        <Text style={ui.kicker}>{config.eyebrow}</Text>
        <Text role="heading" style={s.title}>
          Bonjour, {fullName.split(" ")[0]}.
        </Text>
        <Text style={ui.body}>{config.subtitle}</Text>
      </View>
      <View style={s.hero}>
        <View style={s.heroIcon}>
          <Feather
            name={
              context.portal === "stock"
                ? "box"
                : context.portal === "livreur"
                  ? "truck"
                  : "package"
            }
            size={30}
            color={c.navy}
          />
        </View>
        <Text style={s.heroTitle}>{config.title}</Text>
        <Text style={s.heroBody}>
          {context.roleName} · Retrouvez les opérations de votre environnement
          et les actions liées à vos responsabilités.
        </Text>
        <Badge success>Accès vérifié</Badge>
      </View>
      <Text role="heading" style={ui.sectionTitle}>
        Votre activité
      </Text>
      {orders.error && (
        <ErrorMessage message={orders.error} retry={orders.reload} />
      )}
      {deliveries.error && (
        <ErrorMessage message={deliveries.error} retry={deliveries.reload} />
      )}
      {(orders.syncing || deliveries.syncing) && metrics.length === 0 && (
        <Loading />
      )}
      <View style={s.metrics}>
        {metrics.map((metric) => (
          <Summary
            key={metric.label}
            label={metric.label}
            value={String(metric.value)}
            hint="Enregistré par le serveur"
          />
        ))}
      </View>
      <Card>
        <View style={s.sectionHeading}>
          <Text role="heading" style={ui.sectionTitle}>
            Vos outils
          </Text>
          <Badge>Vos accès actuels</Badge>
        </View>
        {modules.slice(0, 6).map((m) => (
          <ListRow
            key={m.id}
            title={m.label}
            description="Ouvrir les données de votre environnement autorisé"
            icon={icons[m.icon]}
            onPress={() => onNavigate(m.id)}
          />
        ))}
        {modules.length > 6 && (
          <Button
            secondary
            title="Voir tous mes outils"
            onPress={() => onMenu()}
          />
        )}
      </Card>
      <Card>
        <EmptyState
          title="Votre prochain point de contrôle."
          description="Consultez les missions, incidents et remises dans vos outils autorisés. Les montants financiers et les statuts logistiques restent distincts."
          icon="bell"
        />
      </Card>
      {context.portal === "super-admin" && (
        <Text style={ui.body}>
          L’administration complète de la plateforme sera principalement
          disponible sur le Web.
        </Text>
      )}
    </>
  );
}
