import { Text } from "react-native";
import { useRouter } from "expo-router";
import { Guard } from "../src/auth/Guard";
import { Screen } from "../src/components/Screen";
import { Card, Detail, ListRow, ui } from "../src/design/ui";
export default function Settings() {
  const router = useRouter();
  return (
    <Guard>
      <Screen>
        <Text role="heading" style={ui.sectionTitle}>
          Vos repères personnels.
        </Text>
        <Text style={ui.body}>
          Gérez votre compte et retrouvez votre environnement de travail.
        </Text>
        <Card>
          <ListRow
            title="Profil et sécurité"
            description="Informations, mot de passe et sessions"
            icon="shield"
            onPress={() => router.push("/profil")}
          />
          <ListRow
            title="Entreprise et agence"
            description="Choisir parmi vos accès autorisés"
            icon="home"
            onPress={() => router.push("/organisations")}
          />
          <ListRow
            title="Mon espace professionnel"
            icon="grid"
            onPress={() => router.replace("/espace")}
          />
        </Card>
        <Detail
          entries={[
            { label: "Application", value: "DND Delivery" },
            { label: "Langue de l’interface", value: "Français" },
          ]}
        />
      </Screen>
    </Guard>
  );
}
