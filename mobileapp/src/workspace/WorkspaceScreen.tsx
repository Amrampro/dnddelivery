import { MobileHome } from "./MobileHome";
import { SubscriptionScreen } from "../subscriptions/SubscriptionScreen";
import { NotificationsScreen } from "../confirmation/NotificationsScreen";
import { ReportsScreen } from "../reports/ReportsScreen";
import { availableReports } from "../../../shared/reports";
import { OrdersScreen } from "../orders/OrdersScreen";
import { DeliveriesScreen } from "../deliveries/DeliveriesScreen";
import { deliveryModuleIds } from "../../../shared/deliveries";
import { financeModuleIds } from "../../../shared/finance";
import { FinanceScreen } from "../finance/FinanceScreen";
import { orderModuleIds } from "../../../shared/orders";
import { StocksScreen, stockMobileModuleIds } from "../stocks/StocksScreen";
import {
  PartnersScreen,
  partnerMobileModuleIds,
} from "../partners/PartnersScreen";
import { OrganizationScreen } from "../organization/OrganizationScreen";
import { organizationModuleIds } from "../../../shared/organization";
import { icons } from "./icons";
import { workspaceStyles as s } from "./styles";
import { useEffect, useState, useRef } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Redirect, useRouter, useLocalSearchParams } from "expo-router";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import {
  definition,
  mobileModuleAccess,
  mobileNavigation,
  navigation,
} from "../../../shared/workspace";
import { tokens } from "../../../shared/tokens";
import { Guard } from "../auth/Guard";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../auth/client";
import type { Workspace } from "../auth/types";
import { parseWorkspace } from "../auth/contracts";
import {
  Badge,
  Button,
  Card,
  Confirm,
  EmptyState,
  ErrorMessage,
  ListRow,
  Loading,
  Sheet,
  ui,
} from "../design/ui";
const c = tokens.colors;
export function WorkspaceScreen({
  moduleId = "accueil",
}: {
  moduleId?: string;
}) {
  return (
    <Guard>
      <Content moduleId={moduleId} />
    </Guard>
  );
}
function Content({ moduleId }: { moduleId: string }) {
  const {mission} = useLocalSearchParams<{mission?:string}>();
  const scrollRef = useRef<ScrollView>(null);
  const auth = useAuth(),
    router = useRouter(),
    reduced = useReducedMotion(),
    key = auth.profile?.activeContext?.key;
  const [result, setResult] = useState<{
      request: string;
      context?: Workspace;
      error?: string;
    } | null>(null),
    [retry, setRetry] = useState(0),
    [menu, setMenu] = useState(false),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = `${key}:${moduleId}:${retry}:${JSON.stringify(auth.profile?.activeContext)}`,
    initial = auth.profile?.activeContext,
    permission = initial && mobileModuleAccess(initial, moduleId)?.permission;
  useEffect(() => {
    let disposed = false;
    if (key)
      api<{ context: Workspace }>(
        `/auth/workspace${permission ? `?permission=${encodeURIComponent(permission)}` : ""}`,
      )
        .then((v) => {
          if (!disposed)
            setResult({ request, context: parseWorkspace(v.context) });
        })
        .catch((e) => {
          if (!disposed) setResult({ request, error: e.message });
        });
    return () => {
      disposed = true;
    };
  }, [key, request, permission]);
  if (!key) return <Redirect href="/organisations" />;
  if (result?.request === request && result.error)
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.content}>
          <ErrorMessage
            message={result.error}
            retry={() => setRetry((v) => v + 1)}
          />
          <Button
            secondary
            title="Vérifier mes affiliations"
            busy={busy}
            onPress={() => {
              setBusy(true);
              void auth
                .reload()
                .then(() => router.push("/organisations"))
                .finally(() => setBusy(false));
            }}
          />
        </View>
      </SafeAreaView>
    );
  if (result?.request !== request || !result.context)
    return (
      <SafeAreaView style={s.safe}>
        <Loading />
      </SafeAreaView>
    );
  const context = result.context,
    config = definition(context),
    selected = mobileModuleAccess(context, moduleId),
    tabs = mobileNavigation(context),
    modules = navigation(context).filter(
      (m) => !["accueil", "parametres"].includes(m.id),
    );
  if (
    context.companyId &&
    context.subscriptionAccess &&
    !context.subscriptionAccess.valid &&
    moduleId !== "abonnement" &&
    moduleId !== "notifications" &&
    !organizationModuleIds.includes(moduleId) &&
    !stockMobileModuleIds.includes(moduleId) &&
    !orderModuleIds.includes(moduleId) &&
    !deliveryModuleIds.includes(moduleId) &&
    !financeModuleIds.includes(moduleId) &&
    !(
      context.portal === "livreur" &&
      ["accueil", "historique", "notifications"].includes(moduleId)
    ) &&
    !(moduleId === "accueil" && context.portal === "stock") &&
    !partnerMobileModuleIds.includes(moduleId) &&
    !(context.scope === "SHOP" && ["accueil", "parametres"].includes(moduleId))
  )
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView ref={scrollRef} contentContainerStyle={s.content}>
          <Card>
            <Text role="heading" style={ui.sectionTitle}>
              Accès limité à cette entreprise
            </Text>
            <Text style={ui.body}>
              {context.companyName} ·{" "}
              {context.subscriptionAccess.status === "EXPIRED"
                ? "Abonnement expiré"
                : "Abonnement non valide"}
            </Text>
            <Text style={ui.body}>
              Les nouvelles opérations sont bloquées. Vos données sont
              conservées. Votre administrateur peut consulter Mon abonnement et
              déclarer un règlement externe depuis le portail Web. Les colis
              déjà pris en charge conservent leurs informations.
            </Text>
            <Button
              title="Vérifier après renouvellement"
              onPress={() => setRetry((v) => v + 1)}
            />
            {context.permissions.includes("subscriptions.read") && (
              <Button
                title="Consulter mon abonnement"
                onPress={() =>
                  router.push({
                    pathname: "/espace/[module]",
                    params: { module: "abonnement" },
                  })
                }
              />
            )}
            <Button
              secondary
              title="Changer d’entreprise"
              onPress={() => router.push("/organisations")}
            />
            <Button
              secondary
              title="Mon compte"
              onPress={() => router.push("/profil")}
            />
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  function go(id: string) {
    setMenu(false);
    if (id === "profil") router.push("/profil");
    else if (id === "parametres" && context.scope !== "SHOP")
      router.push("/parametres");
    else if (id === "accueil") router.replace("/espace");
    else router.push({ pathname: "/espace/[module]", params: { module: id } });
  }
  async function signOut() {
    setBusy(true);
    try {
      await auth.logout();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Déconnexion impossible.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={s.header}>
          <Image
            source={require("../../assets/generated/brand-logo.jpg")}
            style={s.logo}
            resizeMode="contain"
            accessibilityLabel="DND Delivery"
          />
          <View style={s.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choisir une entreprise ou une agence"
              onPress={() => router.push("/organisations")}
              style={ui.iconButton}
            >
              <Feather name="home" size={21} color={c.navy} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ouvrir le menu"
              onPress={() => setMenu(true)}
              style={ui.iconButton}
            >
              <Feather name="menu" size={23} color={c.navy} />
            </Pressable>
          </View>
        </View>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Environnement actif : ${context.companyName}, ${context.agencyName ?? context.shopName ?? context.roleName}. Changer d’environnement.`}
            onPress={() => router.push("/organisations")}
            style={s.context}
          >
            <View style={ui.rowCopy}>
              <Text style={ui.kicker}>
                {context.scope === "SHOP"
                  ? context.companyId
                    ? "TRANSPORTEUR ACTIF"
                    : "MA BOUTIQUE"
                  : "ENVIRONNEMENT ACTIF"}
              </Text>
              <Text style={ui.rowTitle}>{context.companyName}</Text>
              {!!(context.agencyName ?? context.shopName) && (
                <Text style={ui.rowDescription}>
                  {context.agencyName ?? context.shopName}
                </Text>
              )}
            </View>
            <Feather name="chevron-down" size={18} color={c.navy} />
          </Pressable>
          <Animated.View
          key={`${request}:${typeof mission==="string"?mission:""}`}
            entering={reduced ? undefined : FadeIn.duration(180)}
            style={s.sections}
          >
            {!!auth.error && (
              <ErrorMessage
                message={auth.error}
                retry={() => void auth.reload()}
              />
            )}
            {!config || !selected ? (
              <Card>
                <EmptyState
                  title="Cet accès n’est pas autorisé."
                  description="Utilisez un module correspondant à vos permissions actuelles."
                  icon="lock"
                />
              </Card>
            ) : ["rapports","accueil","activite"].includes(moduleId) && availableReports(context).length > 0 ? (
              <ReportsScreen context={context} onNavigate={go} defaultKind={moduleId === "activite" && context.scope === "GLOBAL" ? "audit" : "overview"}/>
            ) : moduleId === "notifications" ? (
              <NotificationsScreen context={context} />
            ) : moduleId === "abonnement" ? (
              <SubscriptionScreen />
            ) : financeModuleIds.includes(moduleId) ? (
              <FinanceScreen
                moduleId={moduleId}
                context={context}
                scrollToTop={() =>
                  scrollRef.current?.scrollTo({ y: 0, animated: false })
                }
              />
            ) : deliveryModuleIds.includes(moduleId) ||
              (context.portal === "livreur" &&
                ["accueil", "historique", "notifications"].includes(
                  moduleId,
                )) ? (
              <DeliveriesScreen
                context={context}
                moduleId={moduleId}
                scrollToTop={() =>
                  scrollRef.current?.scrollTo({ y: 0, animated: false })
                }
              />
            ) : orderModuleIds.includes(moduleId) ? (
              <OrdersScreen
                moduleId={moduleId}
                context={context}
                scrollToTop={() =>
                  scrollRef.current?.scrollTo({ y: 0, animated: false })
                }
              />
            ) : stockMobileModuleIds.includes(moduleId) ||
              (moduleId === "accueil" && context.portal === "stock") ? (
              <StocksScreen
                moduleId={moduleId === "accueil" ? "stocks" : moduleId}
                context={context}
              />
            ) : partnerMobileModuleIds.includes(moduleId) ||
              (context.scope === "SHOP" &&
                ["accueil", "parametres"].includes(moduleId)) ? (
              <PartnersScreen moduleId={moduleId} context={context} />
            ) : organizationModuleIds.includes(moduleId) ||
              (moduleId === "accueil" && context.portal === "livreur") ? (
              <OrganizationScreen
                moduleId={moduleId === "accueil" ? "profil-livreur" : moduleId}
                context={context}
              />
            ) : moduleId === "accueil" ? (
              <MobileHome
                context={context}
                fullName={auth.profile?.user.fullName ?? ""}
                onNavigate={go}
                onMenu={() => setMenu(true)}
              />
            ) : (
              <>
                <View style={s.pageTitle}>
                  <Text style={ui.kicker}>{context.roleName}</Text>
                  <Text role="heading" style={s.title}>
                    {selected.label}
                  </Text>
                  <Text style={ui.body}>{selected.description}</Text>
                </View>
                <Card>
                  <Badge>Prochainement</Badge>
                  <EmptyState
                    title="Cet espace se prépare pour vous."
                    description="Aucune donnée métier n’est encore disponible. Le module sera activé lors d’une prochaine étape."
                    icon={icons[selected.icon] ?? "inbox"}
                  />
                  {selected.columns && (
                    <View style={s.columnPreview}>
                      {selected.columns.map((column) => (
                        <Text key={column} style={ui.kicker}>
                          {column}
                        </Text>
                      ))}
                    </View>
                  )}
                  {moduleId === "transporteurs" && (
                    <Button
                      secondary
                      title="Choisir un transporteur autorisé"
                      onPress={() => router.push("/organisations")}
                    />
                  )}
                </Card>
                <Button
                  secondary
                  title="Retour à mon accueil"
                  onPress={() => go("accueil")}
                />
              </>
            )}
            <View style={s.securityNote}>
              <Feather name="shield" size={15} color={c.muted} />
              <Text style={s.securityText}>
                {financeModuleIds.includes(moduleId)
                  ? "Les montants déclarés et les fonds réellement reçus sont suivis séparément. Aucun paiement n’est exécuté par l’application."
                  : deliveryModuleIds.includes(moduleId) ||
                      (context.portal === "livreur" &&
                        ["accueil", "historique", "notifications"].includes(
                          moduleId,
                        ))
                    ? "La garde du colis et les étapes sont confirmées par des opérations enregistrées."
                    : orderModuleIds.includes(moduleId)
                      ? "Vos commandes et leurs réservations sont enregistrées après validation."
                      : stockMobileModuleIds.includes(moduleId) ||
                          (moduleId === "accueil" && context.portal === "stock")
                        ? "Les quantités sont mises à jour après validation des opérations."
                        : "Vos accès et les données affichées sont vérifiés par le serveur."}
              </Text>
            </View>
          </Animated.View>
          {!!error && <ErrorMessage message={error} />}
        </ScrollView>
        <View style={s.tabBar} accessibilityRole="tablist">
          {tabs.map((tab) => {
            const active = moduleId === tab.id;
            return (
              <Pressable
                key={tab.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={tab.label}
                onPress={() => go(tab.id)}
                style={({ pressed }) => [s.tab, pressed && { opacity: 0.6 }]}
              >
                <View style={[s.tabIcon, active && s.tabIconActive]}>
                  <Feather
                    name={icons[tab.icon] ?? "grid"}
                    size={20}
                    color={active ? c.navy : c.muted}
                  />
                </View>
                <Text
                  style={[
                    s.tabLabel,
                    active && { color: c.navy, fontWeight: "700" },
                  ]}
                numberOfLines={2}
                >
                  {tab.id === "accueil"
                    ? "Accueil"
                    : tab.id === "livreurs"
                      ? "Équipe"
                      : tab.id === "nouvelle-commande"
                        ? "Créer"
                        : tab.id === "commandes"
                          ? "Commandes"
                          : tab.id === "suivi"
                            ? "Suivi"
                            : tab.id === "courses"
                              ? "Courses"
                              : tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Sheet open={menu} onClose={() => setMenu(false)} title="Votre espace">
          <Text style={ui.body}>
            {context.roleName} · {context.agencyName ?? context.companyName}
          </Text>
          {modules.map((m) => (
            <ListRow
              key={m.id}
              title={m.label}
              icon={icons[m.icon]}
              onPress={() => go(m.id)}
            />
          ))}
          <ListRow
            title="Mon profil et mes sessions"
            icon="user"
            onPress={() => go("profil")}
          />
          <ListRow
            title="Paramètres personnels"
            icon="settings"
            onPress={() => go("parametres")}
          />
          <ListRow
            title="Changer d’environnement"
            icon="repeat"
            onPress={() => {
              setMenu(false);
              router.push("/organisations");
            }}
          />
          <ListRow
            title="Se déconnecter"
            icon="log-out"
            onPress={() => {
              setMenu(false);
              setConfirm(true);
            }}
          />
        </Sheet>
        <Confirm
          open={confirm}
          onClose={() => setConfirm(false)}
          onConfirm={() => void signOut()}
          busy={busy}
          title="Fermer votre session ?"
          description="Vous devrez vous reconnecter pour retrouver votre espace professionnel."
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
