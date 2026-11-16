import { useCallback, useEffect, useState } from "react";
import { AppState, Text, View, StyleSheet } from "react-native";
import { Link, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Screen } from "../src/components/Screen";
import { Button, Card, ErrorMessage, Input, ui } from "../src/design/ui";
import { api } from "../src/auth/client";
import { Guard } from "../src/auth/Guard";
import { orderStatus } from "../../shared/orders";
import type { TrackingSummary, HandoverCode } from "../../shared/customer";
export default function TrackingEntry() {
  const { customer } = useLocalSearchParams<{ customer?: string }>();
  return customer === "1" ? (
    <Guard>
      <Tracking customer />
    </Guard>
  ) : (
    <Tracking />
  );
}
function Tracking({ customer = false }: { customer?: boolean }) {
  const params = useLocalSearchParams<{ reference?: string }>();
  const [reference, setReference] = useState(params.reference ?? ""),
    [email, setEmail] = useState(""),
    [input, setInput] = useState<{ reference: string; email: string }>(),
    [data, setData] = useState<TrackingSummary>(),
    [code, setCode] = useState<HandoverCode>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const path = (ref: string) => `/customers/orders/${encodeURIComponent(ref)}`;
  useFocusEffect(
    useCallback(() => {
      if (!customer || !params.reference) return;
      let live = true;
      const refresh = async () => {
        if (AppState.currentState !== "active") return;
        try {
          const r = await api<TrackingSummary>(path(params.reference!));
          if (live) {
            setData(r);
            setError("");
            if (!r.otpAvailable) setCode(undefined);
          }
        } catch (e) {
          if (live) {
            setError((e as Error).message);
            setCode(undefined);
          }
        }
      };
      void refresh();
      const timer = setInterval(() => void refresh(), 30000),
        listener = AppState.addEventListener("change", (state) => {
          setCode(undefined);
          if (state === "active") void refresh();
        });
      return () => {
        live = false;
        clearInterval(timer);
        listener.remove();
        setCode(undefined);
      };
    }, [customer, params.reference]),
  );
  useEffect(() => {
    if (!code) return;
    const timer = setTimeout(
      () => setCode(undefined),
      Math.max(0, Date.parse(code.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [code]);
  async function lookup() {
    setBusy(true);
    setError("");
    setMessage("");
    setCode(undefined);
    try {
      const value = {
        reference: reference.trim().toUpperCase(),
        email: email.trim().toLowerCase(),
      };
      const r = await api<TrackingSummary>("/tracking/status", {
        method: "POST",
        body: JSON.stringify(value),
      });
      setData(r);
      setInput(value);
    } catch (e) {
      setData(undefined);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <View style={s.hero}>
        <View style={s.symbols}>
          <Feather name="map-pin" size={24} color="#087d49" />
          <View style={s.line} />
          <Feather name="package" size={44} color="#087d49" />
          <View style={s.line} />
          <Feather name="truck" size={26} color="#087d49" />
        </View>
        <Text style={s.eyebrow}>DU DÉPART À LA REMISE</Text>
        <Text style={s.title}>Gardez le fil de votre colis.</Text>
        <Text style={ui.body}>
          {customer
            ? "Les étapes de votre livraison et votre code personnel."
            : "Une référence, votre e-mail, et le parcours de votre livraison."}
        </Text>
      </View>
      {!!error && <ErrorMessage message={error} />}
      {!customer && !data && (
        <Card>
          <View style={ui.stack}>
            <Text style={ui.sectionTitle}>Retrouver mon colis</Text>
            <Input
              label="Référence de commande"
              value={reference}
              onChangeText={setReference}
              autoCapitalize="characters"
              maxLength={80}
            />
            <Input
              label="E-mail du destinataire"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              maxLength={254}
            />
            <Button
              title="Suivre mon colis"
              busy={busy}
              disabled={!reference.trim() || !email.trim()}
              onPress={() => void lookup()}
            />
            <Text style={s.note}>
              Le suivi public affiche uniquement l'avancement. Votre code de
              remise reste privé.
            </Text>
          </View>
        </Card>
      )}
      {customer && !data && !error && (
        <Text style={ui.body}>Chargement du suivi…</Text>
      )}
      {data && (
        <>
          <Card>
            <View style={ui.stack}>
              <Text style={s.eyebrow}>{data.reference}</Text>
              <Text style={ui.sectionTitle}>
                {orderStatus[data.status] ?? data.status}
              </Text>
              {!!data.shop && (
                <Text style={ui.body}>
                  {data.shop} · {data.company}
                </Text>
              )}
              <Text style={s.note}>
                Consulté le {new Date(data.refreshedAt).toLocaleString("fr-FR")}
              </Text>
              <Button
                title="Actualiser"
                secondary
                busy={busy}
                onPress={async () => {
                  if (!customer) {
                    await lookup();
                    return;
                  }
                  setBusy(true);
                  setCode(undefined);
                  try {
                    setData(await api<TrackingSummary>(path(data.reference)));
                    setError("");
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </View>
          </Card>
          {!!data.failure && (
            <Card>
              <Text style={ui.body}>{data.failure}</Text>
            </Card>
          )}
          {customer && data.otpAvailable && (
            <Card>
              <View style={ui.stack}>
                <Feather name="shield" size={28} color="#087d49" />
                <Text style={ui.sectionTitle}>Votre code de remise</Text>
                <Text style={ui.body}>
                  À communiquer uniquement lorsque le livreur vous présente
                  votre colis.
                </Text>
                {code ? (
                  <>
                    <Text selectable style={s.code}>
                      {code.code}
                    </Text>
                    <Text style={s.note}>
                      Valable jusqu'à{" "}
                      {new Date(code.expiresAt).toLocaleTimeString("fr-FR")}
                    </Text>
                  </>
                ) : (
                  <Button
                    title="Afficher mon code"
                    busy={busy}
                    onPress={async () => {
                      setBusy(true);
                      try {
                        setCode(
                          await api<HandoverCode>(
                            path(data.reference) + "/code",
                            { method: "POST", body: "{}" },
                          ),
                        );
                        setError("");
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                )}
                <Text style={s.note}>
                  Ce code n'est pas votre référence de commande et ne confirme
                  aucun paiement.
                </Text>
              </View>
            </Card>
          )}
          <Card>
            <Text style={ui.sectionTitle}>Le parcours de votre colis</Text>
            <View style={s.timeline}>
              {data.events.map((e, i) => (
                <View style={s.event} key={e.id}>
                  <View
                    style={[
                      s.dot,
                      i === data.events.length - 1 && {
                        backgroundColor: "#087d49",
                      },
                    ]}
                  />
                  <Text style={s.eventTitle}>{e.label}</Text>
                  <Text style={s.note}>
                    {new Date(e.createdAt).toLocaleString("fr-FR")}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
          {!customer && (
            <Card>
              <View style={ui.stack}>
                <Text style={ui.sectionTitle}>Recevoir mon colis</Text>
                <Text style={ui.body}>
                  Votre code est disponible dans votre compte ou via votre accès
                  personnel par e-mail.
                </Text>
                <Link href="/mes-commandes" style={ui.body}>
                  Ouvrir mon espace client →
                </Link>
                <Button
                  title="Recevoir mon accès par e-mail"
                  secondary
                  busy={busy}
                  onPress={async () => {
                    setBusy(true);
                    try {
                      const r = await api<{ message: string }>(
                        "/tracking/lookup",
                        { method: "POST", body: JSON.stringify(input) },
                      );
                      setMessage(r.message);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
                {!!message && <Text style={ui.body}>{message}</Text>}
                <Button
                  title="Rechercher un autre colis"
                  secondary
                  onPress={() => {
                    setData(undefined);
                    setMessage("");
                    setError("");
                  }}
                />
              </View>
            </Card>
          )}
        </>
      )}
      {!customer && (
        <Link href="/inscription-client" style={ui.body}>
          Créer mon compte pour retrouver tous mes colis →
        </Link>
      )}
      <Link href={customer ? "/mes-commandes" : "/"} style={ui.body}>
        {customer ? "Retour à mes commandes" : "Retour à l'accueil"}
      </Link>
    </Screen>
  );
}
const s = StyleSheet.create({
  hero: { padding: 22, borderRadius: 26, backgroundColor: "#e9f4ef", gap: 14 },
  symbols: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 14,
  },
  line: { height: 2, width: 30, backgroundColor: "#acd8c3" },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.2,
    color: "#087d49",
    fontWeight: "700",
  },
  title: { fontSize: 30, lineHeight: 36, fontWeight: "700", color: "#033173" },
  note: { fontSize: 13, lineHeight: 20, color: "#576b81" },
  timeline: {
    marginTop: 24,
    marginLeft: 6,
    borderLeftWidth: 2,
    borderLeftColor: "#d9e9e1",
  },
  event: { paddingLeft: 24, paddingBottom: 26, gap: 7 },
  dot: {
    position: "absolute",
    left: -7,
    top: 4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#afd5c1",
    borderWidth: 2,
    borderColor: "white",
  },
  eventTitle: { fontSize: 16, fontWeight: "600", color: "#033173" },
  code: {
    fontSize: 38,
    fontWeight: "700",
    letterSpacing: 7,
    color: "#033173",
    textAlign: "center",
  },
});
