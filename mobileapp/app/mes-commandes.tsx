import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { Link, useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Guard } from "../src/auth/Guard";
import { useAuth } from "../src/auth/AuthProvider";
import { api } from "../src/auth/client";
import { Screen } from "../src/components/Screen";
import { Button, Card, ErrorMessage, ui } from "../src/design/ui";
import type { CustomerOrders } from "../../shared/customer";
import { orderStatus } from "../../shared/orders";
export default function CustomerOrdersPage() {
  return (
    <Guard>
      <Content />
    </Guard>
  );
}
function Content() {
  const auth = useAuth(),
    router = useRouter();
  const [page, setPage] = useState(1),
    [data, setData] = useState<CustomerOrders>(),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      setData(undefined);
      setError("");
      if (auth.profile?.user.customerEnabled)
        api<CustomerOrders>(`/customers/orders?page=${page}`)
          .then((v) => {
            if (live) setData(v);
          })
          .catch((e) => {
            if (live) setError(e.message);
          });
      return () => {
        live = false;
      };
    }, [
      page,
      retry,
      auth.profile?.user.id,
      auth.profile?.user.customerEnabled,
    ]),
  );
  return (
    <Screen>
      <Feather name="package" size={34} color="#087d49" />
      <Text style={ui.sectionTitle}>Mes commandes</Text>
      <Text style={ui.body}>
        Bonjour {auth.profile?.user.fullName}. Retrouvez ici vos colis et leurs
        étapes de livraison.
      </Text>
      {!auth.profile?.user.customerEnabled ? (
        <>
          <Text style={ui.body}>
            Vérifiez votre adresse e-mail pour activer votre espace client.
          </Text>
          <Link href="/inscription-client">Activer mon espace client</Link>
        </>
      ) : (
        <>
          {!!error && <ErrorMessage message={error} />}
          <Button
            title="Actualiser"
            secondary
            onPress={() => setRetry((v) => v + 1)}
          />
          {!data && !error && <Text style={ui.body}>Chargement…</Text>}
          {data && !data.items.length && (
            <Card>
              <Text style={ui.sectionTitle}>
                Vos prochaines livraisons vous attendent ici.
              </Text>
              <Text style={ui.body}>
                Donnez cet e-mail à votre boutique : {auth.profile?.user.email}.
                Les commandes soumises à cette adresse apparaîtront dans votre
                compte.
              </Text>
            </Card>
          )}
          {data?.items.map((o) => (
            <Card key={o.reference}>
              <View style={ui.stack}>
                <Text style={ui.body}>{o.reference}</Text>
                <Text style={ui.sectionTitle}>
                  {orderStatus[o.status] ?? o.status}
                </Text>
                <Text style={ui.body}>
                  {o.shop} · {o.company}
                </Text>
                <Text style={ui.body}>
                  {new Date(o.createdAt).toLocaleDateString("fr-FR")}
                </Text>
                <Button
                  title="Suivre mon colis"
                  onPress={() =>
                    router.push({
                      pathname: "/suivi",
                      params: { reference: o.reference, customer: "1" },
                    })
                  }
                />
              </View>
            </Card>
          ))}
          {data && (
            <>
              <Text style={ui.body}>
                {data.total} commande(s) · Page {page}
              </Text>
              <Button
                title="Précédent"
                secondary
                disabled={page === 1}
                onPress={() => setPage((v) => v - 1)}
              />
              <Button
                title="Suivant"
                secondary
                disabled={page * 20 >= data.total}
                onPress={() => setPage((v) => v + 1)}
              />
            </>
          )}
        </>
      )}
      <Link href="/profil" style={ui.body}>
        Mes informations personnelles
      </Link>
      {!!auth.profile?.organizations.length && (
        <Link href="/organisations" style={ui.body}>
          Mes espaces professionnels
        </Link>
      )}
      <Button
        title="Se déconnecter"
        secondary
        onPress={() => void auth.logout()}
      />
    </Screen>
  );
}
