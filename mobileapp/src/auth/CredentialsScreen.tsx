import { useState, useEffect } from "react";
import { Text, ActivityIndicator } from "react-native";
import { Link, Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "../components/Screen";
import { Action } from "../components/Action";
import { useAuth } from "./AuthProvider";
import { api } from "./client";
import { Field, form } from "./FormFields";
export function CredentialsScreen({
  mode,
}: {
  mode: "login" | "forgot" | "reset";
}) {
  const auth = useAuth(),
    params = useLocalSearchParams<{ token?: string }>(),
    router = useRouter();
  const [fromLink, setFromLink] = useState(typeof params.token === "string");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [token, setToken] = useState(
      typeof params.token === "string" ? params.token : "",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (mode === "reset" && typeof params.token === "string") {
      setToken(params.token);
      setFromLink(true);
      router.setParams({ token: undefined });
    }
  }, [mode, params.token, router]);
  if (mode === "login" && auth.state === "loading")
    return (
      <Screen>
        <ActivityIndicator accessibilityLabel="Restauration de la session" />
      </Screen>
    );
  if (mode === "login" && auth.state === "authenticated")
    return (
      <Redirect
        href={
          auth.profile?.activeContext
            ? "/espace"
            : auth.profile?.user.customerEnabled
              ? "/mes-commandes"
              : "/organisations"
        }
      />
    );
  async function submit() {
    setError("");
    setMessage("");
    if (mode !== "reset" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Indiquez une adresse e-mail valide.");
      return;
    }
    if (
      mode !== "forgot" &&
      (!password ||
        password.length > 128 ||
        (mode === "reset" && password.length < 12))
    ) {
      setError(
        mode === "reset"
          ? "Utilisez entre 12 et 128 caractères."
          : "Indiquez votre mot de passe.",
      );
      return;
    }
    if (mode === "reset" && password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login")
        await auth.login(email.trim().toLowerCase(), password);
      else if (mode === "forgot") {
        const value = await api<{ message: string }>("/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email: email.trim().toLowerCase() }),
        });
        setMessage(value.message);
      } else {
        const value = await api<{ message: string }>("/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({ token, password }),
        });
        setMessage(value.message);
        setPassword("");
        setConfirm("");
        setToken("");
        await auth.reload();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "La demande a échoué.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Text style={form.title}>
        {mode === "login"
          ? "Votre prochain point de départ."
          : mode === "forgot"
            ? "Retrouvez votre accès."
            : "Un nouveau départ."}
      </Text>
      <Text style={form.text}>
        {mode === "login"
          ? "Retrouvez vos commandes ou votre espace professionnel."
          : mode === "forgot"
            ? "Recevez un lien personnel pour retrouver votre compte."
            : "Choisissez un mot de passe d’au moins 12 caractères."}
      </Text>
      {mode !== "reset" && (
        <Field
          label="Adresse e-mail"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          textContentType="username"
          maxLength={254}
        />
      )}
      {mode === "reset" && !fromLink && (
        <Field
          label="Jeton du lien de récupération"
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          autoCorrect={false}
        />
      )}
      {mode !== "forgot" && (
        <Field
          label={mode === "reset" ? "Nouveau mot de passe" : "Mot de passe"}
          password
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={mode === "reset" ? "new-password" : "current-password"}
          textContentType={mode === "reset" ? "newPassword" : "password"}
          maxLength={128}
        />
      )}
      {mode === "reset" && (
        <Field
          label="Confirmer le mot de passe"
          password
          value={confirm}
          onChangeText={setConfirm}
          maxLength={128}
          autoCapitalize="none"
        />
      )}
      {!!(error || (auth.state === "error" ? auth.error : "")) && (
        <Text role="alert" style={form.error}>
          {error || (auth.state === "error" ? auth.error : "")}
        </Text>
      )}
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={form.success}>
          {message}
        </Text>
      )}
      <Action
        title={
          busy
            ? "Veuillez patienter…"
            : mode === "login"
              ? "Se connecter"
              : mode === "forgot"
                ? "Demander un lien"
                : "Modifier le mot de passe"
        }
        disabled={busy}
        onPress={() => void submit()}
      />
      {mode === "login" ? (
        <Link href="/mot-de-passe-oublie" style={form.link}>
          Mot de passe oublié ?
        </Link>
      ) : (
        <Link href="/connexion" style={form.link}>
          Revenir à la connexion
        </Link>
      )}
      <Link href="/" style={form.link}>
        Retour à l’accueil
      </Link>
      {mode === "login" && (
        <>
          <Link href="/inscription-client" style={form.link}>
            Créer un compte utilisateur
          </Link>
          <Link href="/inscription-boutique" style={form.link}>
            Créer un compte de boutique
          </Link>
        </>
      )}
    </Screen>
  );
}
