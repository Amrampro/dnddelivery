import type { PropsWithChildren } from "react";
import { ActivityIndicator, Text } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "./AuthProvider";
import { Screen } from "../components/Screen";
import { Action } from "../components/Action";
export function Guard({ children }: PropsWithChildren) {
  const auth = useAuth();
  if (auth.state === "loading")
    return (
      <Screen>
        <ActivityIndicator accessibilityLabel="Restauration de la session" />
      </Screen>
    );
  if (auth.state === "error")
    return (
      <Screen>
        <Text accessibilityRole="alert">{auth.error}</Text>
        <Action title="Réessayer" onPress={() => void auth.reload()} />
      </Screen>
    );
  if (auth.state === "anonymous") return <Redirect href="/connexion" />;
  return children;
}
