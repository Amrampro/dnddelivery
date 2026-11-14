import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Link } from "expo-router";
import { Guard } from "../src/auth/Guard";
import { useAuth } from "../src/auth/AuthProvider";
import { api } from "../src/auth/client";
import type { DeviceSession } from "../src/auth/types";
import { Field, form } from "../src/auth/FormFields";
import { Screen } from "../src/components/Screen";
import { Action } from "../src/components/Action";
import { Confirm } from "../src/design/ui";
import { PushSettings } from "../src/confirmation/PushSettings";
export default function Profile() {
  return (
    <Guard>
      <Content />
    </Guard>
  );
}
function Content() {
  const auth = useAuth();
  const [confirmAll, setConfirmAll] = useState(false);
  const [fullName, setFullName] = useState(auth.profile?.user.fullName ?? ""),
    [phone, setPhone] = useState(auth.profile?.user.phone ?? ""),
    [sessions, setSessions] = useState<DeviceSession[]>([]),
    [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const load = () =>
    api<{ sessions: DeviceSession[] }>("/auth/sessions").then((v) =>
      setSessions(v.sessions),
    );
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "La demande a échoué.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Text style={form.title}>Votre profil.</Text>
      <Text style={form.text}>{auth.profile?.user.email}</Text>
      <PushSettings />
      {!!error && (
        <Text role="alert" style={form.error}>
          {error}
        </Text>
      )}
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={form.success}>
          {message}
        </Text>
      )}
      <Field
        label="Nom complet"
        value={fullName}
        onChangeText={setFullName}
        maxLength={160}
        autoComplete="name"
      />
      <Field
        label="Téléphone"
        value={phone}
        onChangeText={setPhone}
        maxLength={32}
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <Action
        title="Enregistrer"
        disabled={busy}
        onPress={() =>
          void act(async () => {
            if (fullName.trim().length < 2)
              throw new Error("Indiquez un nom complet.");
            await api("/auth/me", {
              method: "PATCH",
              body: JSON.stringify({ fullName, phone: phone || null }),
            });
            await auth.reload();
            setMessage("Informations mises à jour.");
          })
        }
      />
      <Text style={[form.title, { fontSize: 25 }]}>Mot de passe</Text>
      <Field
        label="Mot de passe actuel"
        password
        value={current}
        onChangeText={setCurrent}
        maxLength={128}
      />
      <Field
        label="Nouveau mot de passe — 12 caractères minimum"
        password
        value={next}
        onChangeText={setNext}
        maxLength={128}
      />
      <Field
        label="Confirmer le mot de passe"
        password
        value={confirm}
        onChangeText={setConfirm}
        maxLength={128}
      />
      <Action
        title="Modifier et fermer les sessions"
        disabled={busy}
        onPress={() =>
          void act(async () => {
            if (next.length < 12 || next !== confirm)
              throw new Error(
                "Vérifiez les nouveaux mots de passe (12 caractères minimum).",
              );
            await api("/auth/change-password", {
              method: "POST",
              body: JSON.stringify({
                currentPassword: current,
                newPassword: next,
              }),
            });
            await auth.reload();
          })
        }
      />
      <Text style={[form.title, { fontSize: 25 }]}>Appareils connectés</Text>
      {sessions.map((s) => (
        <View key={s.id} style={form.card}>
          <Text style={form.text}>
            {s.deviceName}
            {s.current ? " · Cet appareil" : ""}
          </Text>
          <Text style={form.small}>
            Expire le {new Date(s.expiresAt).toLocaleDateString("fr-FR")}
          </Text>
          <Action
            title="Révoquer cette session"
            secondary
            disabled={busy}
            onPress={() =>
              void act(async () => {
                await api(`/auth/sessions/${s.id}`, { method: "DELETE" });
                if (s.current) await auth.reload();
                else await load();
              })
            }
          />
        </View>
      ))}
      <Action
        title="Déconnecter tous les appareils"
        secondary
        disabled={busy}
        onPress={() => setConfirmAll(true)}
      />
      <Confirm
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        title="Déconnecter tous les appareils ?"
        description="Toutes vos sessions seront fermées, y compris celle de cet appareil."
        busy={busy}
        onConfirm={() =>
          void act(async () => {
            await api("/auth/logout-all", { method: "POST", body: "{}" });
            setConfirmAll(false);
            await auth.reload();
          })
        }
      />
      <Link href="/organisations" style={form.link}>
        Choisir mon environnement
      </Link>
      <Link href="/espace" style={form.link}>
        Mon espace professionnel
      </Link>
      <Link href="/parametres" style={form.link}>
        Paramètres personnels
      </Link>
      <Action
        title="Se déconnecter"
        secondary
        disabled={busy}
        onPress={() => void act(auth.logout)}
      />
    </Screen>
  );
}
