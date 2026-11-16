import { useState } from "react";
import { Text, View, Switch } from "react-native";
import { Link } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { Input, Button, Card, ErrorMessage, ui } from "../design/ui";
import { api } from "../auth/client";
export function RegistrationScreen({ shop = false }: { shop?: boolean }) {
  const [form, setForm] = useState({
      fullName: "",
      email: "",
      phone: "",
      name: "",
      address: "",
      city: "",
      countryCode: "CM",
      district: "",
    }),
    [terms, setTerms] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const field = (
    key: keyof typeof form,
    label: string,
    keyboardType: "default" | "email-address" | "phone-pad" = "default",
  ) => (
    <Input
      key={key}
      label={label}
      value={form[key]}
      onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
      keyboardType={keyboardType}
      autoCorrect={key !== "email" && key !== "countryCode"}
      autoCapitalize={
        key === "email"
          ? "none"
          : key === "countryCode"
            ? "characters"
            : "sentences"
      }
      maxLength={
        key === "countryCode"
          ? 2
          : key === "phone"
            ? 32
            : key === "address"
              ? 500
              : key === "email"
                ? 254
                : 160
      }
    />
  );
  async function submit() {
    setError("");
    if (
      shop &&
      (form.name.trim().length < 2 ||
        form.address.trim().length < 3 ||
        form.city.trim().length < 2 ||
        !/^[A-Z]{2}$/i.test(form.countryCode))
    ) {
      setError(
        "Renseignez le nom, l'adresse, la ville et le code pays de votre boutique.",
      );
      return;
    }
    if (!terms) {
      setError("Veuillez accepter la création de votre compte.");
      return;
    }
    if (
      !form.fullName.trim() ||
      !form.phone.trim() ||
      !/^\S+@\S+\.\S+$/.test(form.email.trim())
    ) {
      setError(
        "Renseignez votre nom, votre téléphone et une adresse e-mail valide.",
      );
      return;
    }
    setBusy(true);
    try {
      const payload = shop
        ? {
            ...form,
            countryCode: form.countryCode.toUpperCase(),
            email: form.email.trim().toLowerCase(),
            termsAccepted: true,
            website: "",
          }
        : {
            fullName: form.fullName,
            email: form.email.trim().toLowerCase(),
            phone: form.phone,
            termsAccepted: true,
          };
      const r = await api<{ message: string }>(
        shop ? "/partner-registration" : "/customers/register",
        { method: "POST", body: JSON.stringify(payload) },
      );
      setMessage(r.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <View style={ui.stack}>
        <Feather
          name={shop ? "shopping-bag" : "user"}
          size={34}
          color="#087d49"
        />
        <Text style={ui.sectionTitle}>
          {shop ? "Ma boutique, connectée." : "Mes colis, à portée de main."}
        </Text>
        <Text style={ui.body}>
          {shop
            ? "Créez votre compte de boutique pour préparer vos commandes et collaborer avec des entreprises de livraison."
            : "Un compte utilisateur pour retrouver vos commandes, suivre leur parcours et consulter votre code de remise."}
        </Text>
      </View>
      {message ? (
        <Card>
          <Feather name="mail" size={30} color="#087d49" />
          <Text style={ui.sectionTitle}>Vérifiez votre messagerie</Text>
          <Text style={ui.body}>{message}</Text>
          <Text style={ui.body}>
            Ouvrez le lien reçu pour finaliser l'inscription, puis revenez vous
            connecter ici.
          </Text>
          <Link href="/connexion" style={ui.body}>
            Me connecter →
          </Link>
        </Card>
      ) : (
        <Card>
          <View style={ui.stack}>
            {field("fullName", shop ? "Nom du propriétaire" : "Nom complet")}
            {field("email", "Adresse e-mail", "email-address")}
            {field("phone", "Téléphone", "phone-pad")}
            {shop && (
              <>
                {field("name", "Nom de la boutique")}
                {field("address", "Adresse de la boutique")}
                {field("city", "Ville")}
                {field("district", "Quartier (facultatif)")}
                {field("countryCode", "Code pays (CM, BE, FR…)")}
              </>
            )}
            <Text style={ui.body}>
              {shop
                ? "J'accepte la création de ma boutique et les conditions d'inscription."
                : "J'accepte la création de mon compte et le rattachement des commandes envoyées à mon adresse e-mail vérifiée."}
            </Text>
            <Switch
              accessibilityLabel="Accepter la création du compte"
              value={terms}
              onValueChange={setTerms}
            />
            {!!error && <ErrorMessage message={error} />}
            <Button
              title="Recevoir mon e-mail de vérification"
              busy={busy}
              onPress={() => void submit()}
            />
          </View>
        </Card>
      )}
      <Link href="/connexion" style={ui.body}>
        J'ai déjà un compte
      </Link>
      <Link
        href={shop ? "/inscription-client" : "/inscription-boutique"}
        style={ui.body}
      >
        {shop ? "Je suis un destinataire" : "Je suis une boutique"}
      </Link>
      <Link href="/" style={ui.body}>
        Retour à l'accueil
      </Link>
    </Screen>
  );
}
