import { useState } from "react";
import { Linking, Text, View } from "react-native";
import { Screen } from "../src/components/Screen";
import { Button, Card, ErrorMessage, Input, ui } from "../src/design/ui";
export default function TrackingEntry() {
  const [reference, setReference] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const website = process.env.EXPO_PUBLIC_WEB_APP_URL;
  return (
    <Screen>
      <Text role="heading" style={ui.sectionTitle}>
        Gardez le fil de votre colis.
      </Text>
      <Text style={ui.body}>
        Le suivi personnel s’ouvre dans votre navigateur, sans compte ni
        installation. Votre référence et l’adresse e-mail enregistrée permettent
        de demander votre lien sécurisé.
      </Text>
      <Card>
        <View style={ui.stack}>
          <Input
            label="Référence du colis"
            value={reference}
            onChangeText={setReference}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={80}
          />
          {error && <ErrorMessage message={error} />}
          <Button
            title="Ouvrir le suivi sécurisé"
            busy={busy}
            disabled={!website || reference.trim().length < 3}
            onPress={async () => {
              setBusy(true);
              setError("");
              try {
                const url = new URL("/suivi", website);
                url.searchParams.set("reference", reference.trim());
                await Linking.openURL(url.toString());
              } catch {
                setError(
                  "Le navigateur n’a pas pu ouvrir le suivi. Utilisez votre lien personnel reçu par e-mail.",
                );
              } finally {
                setBusy(false);
              }
            }}
          />
        </View>
      </Card>
      <Text style={ui.body}>
        {website
          ? "La référence seule ne donne pas accès aux informations du colis."
          : "Ouvrez le lien personnel reçu par e-mail pour suivre votre colis. Vous pouvez aussi le demander à votre boutique."}
      </Text>
    </Screen>
  );
}
