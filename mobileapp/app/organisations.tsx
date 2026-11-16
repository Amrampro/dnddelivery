import { useState } from "react";
import { Text, Pressable, View } from "react-native";
import { useRouter, Link } from "expo-router";
import { Guard } from "../src/auth/Guard";
import { useAuth } from "../src/auth/AuthProvider";
import { Screen } from "../src/components/Screen";
import { Action } from "../src/components/Action";
import { form } from "../src/auth/FormFields";
import { Selector } from "../src/design/ui";
const environmentKey = (w: {
  scope: string;
  shopId?: string;
  companyId?: string;
}) =>
  w.scope === "SHOP"
    ? `shop:${w.shopId}`
    : w.companyId
      ? `company:${w.companyId}`
      : "global";
export default function Organizations() {
  return (
    <Guard>
      <Content />
    </Guard>
  );
}
function Content() {
  const auth = useAuth(),
    router = useRouter();
  const [company, setCompany] = useState("all");
  const organizations = auth.profile?.organizations ?? [];
  const companies = organizations.filter(
    (c, i) =>
      organizations.findIndex(
        (v) => environmentKey(v) === environmentKey(c),
      ) === i,
  );
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  async function choose(key: string) {
    setBusy(key);
    setError("");
    try {
      await auth.select(key);
      router.replace("/espace");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Accès indisponible.");
    } finally {
      setBusy("");
    }
  }
  return (
    <Screen>
      {auth.profile?.user.customerEnabled && (
        <Action
          title="Mon espace client · Mes commandes"
          onPress={() => router.push("/mes-commandes")}
        />
      )}
      <Text style={form.title}>Votre environnement de travail.</Text>
      <Text style={form.text}>Choisissez parmi vos accès autorisés.</Text>
      {!!error && (
        <Text role="alert" style={form.error}>
          {error}
        </Text>
      )}
      <Selector
        label="Entreprise ou boutique"
        value={company}
        disabled={!!busy}
        onChange={setCompany}
        options={[
          { id: "all", label: "Tous mes environnements" },
          ...companies.map((c) => ({
            id: environmentKey(c),
            label:
              c.scope === "SHOP"
                ? (c.shopName ?? "Ma boutique")
                : c.companyName,
          })),
        ]}
      />
      {organizations
        .filter((c) => company === "all" || environmentKey(c) === company)
        .map((context) => (
          <Pressable
            key={context.key}
            disabled={!!busy}
            accessibilityRole="button"
            accessibilityLabel={`${context.scope === "SHOP" && !context.companyId ? context.shopName : context.companyName}, ${context.agencyName ?? context.shopName ?? context.roleName}`}
            onPress={() => void choose(context.key)}
            style={[form.card, busy === context.key && { opacity: 0.6 }]}
          >
            <Text style={{ fontSize: 17, fontWeight: "600", color: "#033173" }}>
              {context.scope === "SHOP" && !context.companyId
                ? context.shopName
                : context.companyName}
            </Text>
            <Text style={form.text}>
              {context.agencyName ?? context.shopName ?? context.roleName}
            </Text>
            <Text style={form.small}>
              {context.roleName}
              {busy === context.key ? " · Ouverture…" : ""}
            </Text>
          </Pressable>
        ))}
      {!auth.profile?.organizations.length && (
        <View style={form.card}>
          <Text style={form.text}>
            Aucun accès professionnel actif. Contactez votre administrateur.
          </Text>
        </View>
      )}
      <Link href="/profil" style={form.link}>
        Mon profil et mes sessions
      </Link>
      <Action
        title="Se déconnecter"
        secondary
        onPress={() => void auth.logout().catch((e) => setError(e.message))}
      />
    </Screen>
  );
}
