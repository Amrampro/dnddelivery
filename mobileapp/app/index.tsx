import {
  Image,
  Text,
  View,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Screen } from "../src/components/Screen";
import { Action } from "../src/components/Action";
import { colors } from "../src/theme";
import { WelcomeMotion } from "../src/components/WelcomeMotion";
export default function Welcome() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  return (
    <Screen>
      <View style={s.brand}>
        <Image
          source={require("../assets/generated/brand-logo.jpg")}
          style={s.logo}
          resizeMode="contain"
          accessibilityLabel="Logo DND Delivery"
        />
        <Text style={s.name}>DND Delivery</Text>
      </View>
      <View style={s.main}>
        <WelcomeMotion compact={height < 950} />
        <View style={s.actions}>
          <Action
            title="Accéder à mon espace"
            onPress={() => router.push("/connexion")}
          />
          <Action
            title="Créer un compte de boutique"
            secondary
            onPress={() => router.push("/inscription-boutique")}
          />
          <Action
            title="Créer un compte d’utilisateur"
            secondary
            onPress={() => router.push("/inscription-client")}
          />
          <Action
            title="Suivre mon colis"
            secondary
            onPress={() => router.push("/suivi")}
          />
        </View>
        <Text style={s.description}>
          Votre activité et vos colis, à portée de main.
        </Text>
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
  brand: { alignItems: "center", gap: 8, paddingTop: 12 },
  logo: { width: 160, height: 90 },
  name: { fontSize: 24, fontWeight: "700", color: colors.navy },
  main: { flex: 1, justifyContent: "center", gap: 20, paddingVertical: 12 },
  actions: { gap: 16 },
  description: {
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
    color: colors.muted,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingBottom: 8,
  },
  footerText: {
    fontSize: 11,
    lineHeight: 17,
    color: colors.muted,
    flexShrink: 1,
    textAlign: "center",
  },
});
