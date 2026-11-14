import { useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";
import { useAuth } from "../auth/AuthProvider";
import { Button, Card, ErrorMessage, ui } from "../design/ui";
import {
  disablePushDevice,
  pushPreference,
  synchronizePushDevice,
} from "./push-device";
export function PushSettings() {
  const { profile } = useAuth(),
    userId = profile?.user.id;
  const [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    let live = true;
    void pushPreference().then((p) => {
      if (live) setEnabled(!!p?.enabled && p.userId === userId);
    });
    return () => {
      live = false;
    };
  }, [userId]);
  if (Platform.OS === "web" || !userId) return null;
  return (
    <Card>
      <View style={ui.stack}>
        <Text style={ui.sectionTitle}>Alertes sur cet appareil</Text>
        <Text style={ui.body}>
          Chaque appareil est associé à sa propre session. Vos e-mails et les
          avis de votre espace restent disponibles sans push.
        </Text>
        {!!error && <ErrorMessage message={error} />}
        {!!message && <Text style={ui.body}>{message}</Text>}
        <Button
          title={
            enabled
              ? "Actualiser les alertes de cet appareil"
              : "Activer les alertes de cet appareil"
          }
          busy={busy}
          onPress={async () => {
            setBusy(true);
            setError("");
            try {
              const p = await synchronizePushDevice(userId, true);
              setEnabled(!!p?.enabled);
              setMessage(
                "Cet appareil est enregistré pour les alertes de votre session.",
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
        {enabled && (
          <Button
            title="Désactiver les alertes de cet appareil"
            secondary
            busy={busy}
            onPress={async () => {
              setBusy(true);
              setError("");
              try {
                await disablePushDevice(userId);
                setEnabled(false);
                setMessage("Les alertes de cet appareil sont désactivées.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        )}
      </View>
    </Card>
  );
}
