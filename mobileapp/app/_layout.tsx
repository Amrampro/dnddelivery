import "react-native-reanimated";
import { AuthProvider } from "../src/auth/AuthProvider";
import { PushNavigation } from "../src/confirmation/PushNavigation";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
export default function Layout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: "#F5F8F7" },
            headerTransparent: false,
            headerTintColor: "#033173",
            headerShadowVisible: false,
            headerBackTitle: "Retour",
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen
            name="organisations"
            options={{ title: "Mes environnements" }}
          />
          <Stack.Screen name="profil" options={{ title: "Mon compte" }} />
          <Stack.Screen
            name="mot-de-passe-oublie"
            options={{ title: "Retrouver mon acc�s" }}
          />
          <Stack.Screen
            name="reinitialisation"
            options={{ title: "Nouveau mot de passe" }}
          />
          <Stack.Screen name="connexion" options={{ title: "Votre espace" }} />
          <Stack.Screen name="suivi" options={{ title: "Suivre un colis" }} />
          <Stack.Screen name="espace" options={{ headerShown: false }} />
          <Stack.Screen
            name="espace/[module]"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="parametres"
            options={{ title: "Paramètres personnels" }}
          />
        </Stack>
        <PushNavigation />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
