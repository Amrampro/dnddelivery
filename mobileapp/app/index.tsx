import { Image, Text, View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { Screen } from "../src/components/Screen";
import { Action } from "../src/components/Action";
import { colors } from "../src/theme";
export default function Welcome() {
  const router = useRouter();
  return (
    <Screen>
      <View style={s.brand}>
        <Image
          source={require("../assets/generated/brand-logo.jpg")}
          style={s.logo}
          resizeMode="contain"
          accessibilityLabel="Logo officiel DND Delivery"
        />
        <Text style={s.tag}>PLUS PROCHES{"\n"}DE VOS CLIENTS.</Text>
      </View>
      <Animated.View
        entering={FadeInDown.duration(450).reduceMotion(ReduceMotion.System)}
      >
        <Text style={s.eyebrow}>VOTRE LOGISTIQUE EN MOUVEMENT</Text>
        <Text style={s.title}>
          Le terrain avance.{"\n"}
          <Text style={{ color: colors.green }}>Vous aussi.</Text>
        </Text>
        <Text style={s.description}>
          Un point de départ commun pour vos équipes. Une nouvelle façon de
          connecter votre activité, partout avec vous.
        </Text>
      </Animated.View>
      <LinearGradient colors={["#033173", "#064588"]} style={s.card}>
        <View style={s.cardTop}>
          <Feather name="navigation" size={28} color="#6FE5A8" />
          <Text style={s.badge}>L’EXPÉRIENCE DND</Text>
        </View>
        <Text style={s.cardTitle}>
          Du premier départ{"\n"}au dernier kilomètre.
        </Text>
        <View style={s.route}>
          {["Votre agence", "Sur le terrain", "À destination"].map((v, i) => (
            <View key={v} style={s.routeItem}>
              <View
                style={[s.dot, i === 2 && { backgroundColor: "#6FE5A8" }]}
              />
              <Text style={s.routeLabel}>{v}</Text>
            </View>
          ))}
        </View>
        <Text style={s.cardNote}>
            De la prise en charge à la remise confirmée.
        </Text>
      </LinearGradient>
      <View style={{ gap: 12 }}>
        <Action
          title="Accéder à mon espace"
          onPress={() => router.push("/connexion")}
        />
        <Action
          title="Suivre un colis"
          secondary
          onPress={() => router.push("/suivi")}
        />
      </View>
      <View style={s.footer}>
        <Feather name="shield" size={15} color={colors.muted} />
        <Text style={s.footerText}>
            Vos équipes connectées · Accès professionnel sécurisé.
        </Text>
      </View>
    </Screen>
  );
}
const s = StyleSheet.create({
  brand: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  logo: { width: 75, height: 75, borderRadius: 15 },
  tag: {
    fontSize: 10,
    lineHeight: 17,
    letterSpacing: 1.2,
    color: colors.muted,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: colors.muted,
    marginBottom: 17,
  },
  title: {
    fontSize: 42,
    lineHeight: 47,
    fontWeight: "700",
    letterSpacing: -1.8,
    color: colors.navy,
  },
  description: {
    fontSize: 15,
    lineHeight: 25,
    color: colors.muted,
    marginTop: 18,
  },
  card: { padding: 24, borderRadius: 20, minHeight: 235 },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badge: { fontSize: 8, letterSpacing: 1.4, color: "#C6D9EE" },
  cardTitle: {
    fontSize: 24,
    lineHeight: 31,
    fontWeight: "600",
    color: "white",
    letterSpacing: -0.6,
    marginVertical: 23,
  },
  route: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#55799F",
  },
  routeItem: { alignItems: "flex-start", marginTop: -5 },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#9EBADA",
    marginBottom: 12,
  },
  routeLabel: { fontSize: 9, color: "#D3E3F2" },
  cardNote: { fontSize: 10, color: "#C6D9EE", marginTop: 18 },
  footer: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  footerText: { fontSize: 10, lineHeight: 17, color: colors.muted, flex: 1 },
});
