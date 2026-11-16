import { useRef, useState } from "react";
import { Text, View } from "react-native";
import type { Workspace } from "../auth/types";
import { api } from "../auth/client";
import { DateField } from "../design/DateField";
import {
  Button,
  Card,
  Input,
  CurrencyInput,
  Selector,
  ListRow,
  ErrorMessage,
  ui,
} from "../design/ui";
import { useStockData, LoadState, Pager, localKey } from "../stocks/ui";
import {
  blankOrder,
  orderForm,
  orderValidation,
  orderPayload,
  type OrderContent,
  type OrderDTO,
  type OrderOptions,
  type OrderPage,
  type OrderProduct,
  type RecipientDTO,
} from "../../../shared/orders";
export function OrderForm({
  context,
  options,
  initial,
  onDone,
  onBack,
  scrollToTop,
}: {
  context: Workspace;
  options: OrderOptions;
  initial?: OrderDTO;
  onDone: (p: OrderDTO) => void;
  onBack: () => void;
  scrollToTop: () => void;
}) {
  const [x, setX] = useState<OrderContent>(() =>
      initial
        ? orderForm(initial)
        : blankOrder(context.companyId, context.shopId, context.agencyId),
    ),
    [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [recipientSearch, setRecipientSearch] = useState(""),
    [recipientPage, setRecipientPage] = useState(1),
    key = useRef(localKey()),
    lock = useRef(false);
  const set = (patch: Partial<OrderContent>) =>
      setX((v) => ({ ...v, ...patch })),
    rec = (
      k: keyof OrderContent["recipient"],
      value: string | number | undefined,
    ) =>
      set({
        recipient: {
          ...x.recipient,
          [k]:
            value === "" &&
            !["name", "email", "phone", "country", "city", "address"].includes(
              k,
            )
              ? undefined
              : value,
        },
      });
  const pairs = options.pairs.filter(
      (p) =>
        (!x.companyId || p.companyId === x.companyId) &&
        (!context.shopId || p.shopId === context.shopId),
    ),
    pair = pairs.find(
      (p) => p.companyId === x.companyId && p.shopId === x.shopId,
    ),
    agencies = options.agencies.filter(
      (a) =>
        a.companyId === x.companyId && pair?.allowedAgencyIds.includes(a.id),
    );
  const catalogue = useStockData<OrderPage<OrderProduct>>(
      x.companyId && x.shopId && x.agencyId
        ? `/orders/catalogue?${new URLSearchParams({ companyId: x.companyId, shopId: x.shopId, agencyId: x.agencyId, q: search, page: String(page), size: "10" })}`
        : null,
    ),
    recipients = useStockData<OrderPage<RecipientDTO>>(
      x.companyId && x.shopId
        ? `/recipients?${new URLSearchParams({ companyId: x.companyId, shopId: x.shopId, q: recipientSearch, page: String(recipientPage), size: "10" })}`
        : null,
    );
  const field = (
    label: string,
    k: keyof OrderContent["recipient"],
    keyboardType: "default" | "email-address" | "phone-pad" = "default",
  ) => (
    <Input
      key={k}
      label={label}
      value={String(x.recipient[k] ?? "")}
      editable={!initial || initial.isDraft}
      keyboardType={keyboardType}
      autoCapitalize={k === "email" ? "none" : "sentences"}
      placeholder={
        k === "desiredDeliveryAt"
          ? "Ex. 2026-10-30 14:00 (heure locale)"
          : undefined
      }
      onChangeText={(value) => rec(k, value)}
    />
  );
  async function save(draft: boolean) {
    if (lock.current) return;
    const message = orderValidation(x);
    if (message) {
      setError(message);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const p = await api<OrderDTO>(
        initial ? `/orders/${initial.id}` : "/orders",
        {
          method: initial ? "PATCH" : "POST",
          body: JSON.stringify({
            ...orderPayload(x),
            ...(initial
              ? { version: initial.version }
              : { clientKey: key.current, draft }),
          }),
        },
      );
      onDone(p);
    } catch (e) {
      setError(
        `${(e as Error).message} Le formulaire est conservé. Réessayez la même validation ou retrouvez la demande dans Mes commandes.`,
      );
      scrollToTop();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <View style={ui.stack}>
      <Button secondary title="Retour aux commandes" onPress={onBack} />
      <Text style={ui.kicker}>ÉTAPE {step + 1} SUR 4</Text>
      <Text role="heading" style={ui.sectionTitle}>
        {
          [
            "Prise en charge",
            "Destinataire",
            "Colis et montant",
            "Récapitulatif",
          ][step]
        }
      </Text>
      {!!error && <ErrorMessage message={error} />}
      {step === 0 && (
        <Card>
          <View style={ui.stack}>
            <Selector
              label="Agence de livraison"
              value={x.companyId}
              disabled={!!initial || !!context.companyId}
              options={Array.from(
                new Map(
                  options.pairs.map((p) => [
                    p.companyId,
                    { id: p.companyId, label: p.company.name },
                  ]),
                ).values(),
              )}
              onChange={(companyId) =>
                set({
                  companyId,
                  agencyId: "",
                  items: [],
                  ...(context.scope !== "SHOP" ? { shopId: "" } : {}),
                })
              }
            />
            <Selector
              label="Boutique partenaire"
              value={x.shopId}
              disabled={!!initial || !!context.shopId}
              options={pairs.map((p) => ({ id: p.shopId, label: p.shop.name }))}
              onChange={(shopId) =>
                set({
                  shopId,
                  agencyId: context.agencyId ?? "",
                  items: [],
                  recipientId: undefined,
                })
              }
            />
            <Selector
              label="Agence responsable"
              value={x.agencyId}
              disabled={context.scope === "AGENCY"}
              options={agencies.map((a) => ({ id: a.id, label: a.name }))}
              onChange={(agencyId) => set({ agencyId })}
            />
            <Selector
              label="Type de commande"
              value={x.type}
              options={[
                { id: "ONE_OFF", label: "Ponctuelle · collecte en boutique" },
                { id: "FROM_STOCK", label: "Depuis le stock de l’agence" },
              ]}
              onChange={(type) =>
                set({ type: type as OrderContent["type"], items: [] })
              }
            />
            <Text style={ui.body}>
              {x.type === "FROM_STOCK"
                ? "Le stock sera réservé à la soumission, sans sortie physique."
                : "Votre colis sera à collecter dans la boutique."}
            </Text>
          </View>
        </Card>
      )}
      {step === 1 && (
        <>
          <Card>
            <View style={ui.stack}>
              {field("Nom du destinataire", "name")}
              {field("Adresse e-mail", "email", "email-address")}
              {field("Téléphone international", "phone", "phone-pad")}
              {field("Pays", "country")}
              {field("Ville", "city")}
              {field("Adresse de livraison", "address")}
              {field("Quartier", "district")}
              {field("Point de repère", "landmark")}
              {field("Instructions d’accès", "accessInstructions")}
              <DateField
                label="Date et heure souhaitées"
                value={x.recipient.desiredDeliveryAt ?? ""}
                onChange={(value) => rec("desiredDeliveryAt", value)}
              />
              {field("Observations destinataire", "observations")}
              {(["latitude", "longitude"] as const).map((k) => (
                <Input
                  key={k}
                  label={
                    k === "latitude"
                      ? "Latitude facultative"
                      : "Longitude facultative"
                  }
                  value={String(x.recipient[k] ?? "")}
                  editable={!initial || initial.isDraft}
                  keyboardType="numbers-and-punctuation"
                  onChangeText={(value) =>
                    rec(k, value ? Number(value) : undefined)
                  }
                />
              ))}
              {(!initial || initial.isDraft) && (
                <Selector
                  label="Conserver la fiche destinataire"
                  value={String(x.saveRecipient)}
                  options={[
                    { id: "false", label: "Cette commande uniquement" },
                    { id: "true", label: "Ajouter à mon répertoire" },
                  ]}
                  onChange={(v) => set({ saveRecipient: v === "true" })}
                />
              )}
            </View>
          </Card>
          {(!initial || initial.isDraft) && (
            <Card>
              <View style={ui.stack}>
                <Text style={ui.sectionTitle}>Réutiliser un destinataire</Text>
                <Input
                  label="Rechercher dans mon répertoire"
                  value={recipientSearch}
                  onChangeText={(v) => {
                    setRecipientSearch(v);
                    setRecipientPage(1);
                  }}
                />
                {recipients.error && (
                  <ErrorMessage
                    message={recipients.error}
                    retry={recipients.reload}
                  />
                )}
                {recipients.data?.items.map((r) => (
                  <ListRow
                    key={r.id}
                    title={r.name}
                    description={`${r.phone} · ${r.city}`}
                    onPress={() =>
                      set({
                        recipient: r.details ?? {
                          name: r.name,
                          email: r.email,
                          phone: r.phone,
                          country: r.country,
                          city: r.city,
                          address: r.address,
                        },
                        recipientId: r.id,
                      })
                    }
                  />
                ))}
                <Pager
                  page={recipientPage}
                  total={recipients.data?.total ?? 0}
                  size={10}
                  setPage={setRecipientPage}
                />
              </View>
            </Card>
          )}
        </>
      )}
      {step === 2 && (
        <>
          {x.type === "ONE_OFF" && (
            <Card>
              <View style={ui.stack}>
                <Text style={ui.sectionTitle}>Collecte</Text>
                {(["address", "contact", "phone", "instructions"] as const).map(
                  (k) => (
                    <Input
                      key={k}
                      label={
                        {
                          address: "Adresse de collecte",
                          contact: "Contact de collecte",
                          phone: "Téléphone de collecte",
                          instructions: "Instructions de récupération",
                        }[k]
                      }
                      value={x.pickup?.[k] ?? ""}
                      keyboardType={k === "phone" ? "phone-pad" : "default"}
                      onChangeText={(v) =>
                        set({
                          pickup: {
                            address: x.pickup?.address ?? "",
                            contact: x.pickup?.contact ?? "",
                            phone: x.pickup?.phone ?? "",
                            instructions: x.pickup?.instructions,
                            [k]: v,
                          },
                        })
                      }
                    />
                  ),
                )}
              </View>
            </Card>
          )}
          <Card>
            <View style={ui.stack}>
              <Text style={ui.sectionTitle}>Ajouter des articles</Text>
              <Input
                label="Rechercher un produit"
                value={search}
                onChangeText={(v) => {
                  setSearch(v);
                  setPage(1);
                }}
              />
              {!catalogue.data ? (
                <LoadState error={catalogue.error} retry={catalogue.reload} />
              ) : (
                catalogue.data.items.map((p) => (
                  <Button
                    key={p.id}
                    secondary
                    title={`${p.name} · ${p.availableQuantity} disponible(s)`}
                    disabled={x.items.some((i) => i.productId === p.id)}
                    onPress={() =>
                      set({
                        items: [
                          ...x.items,
                          {
                            productId: p.id,
                            name: p.name,
                            sku: p.sku ?? undefined,
                            quantity: 1,
                          },
                        ],
                      })
                    }
                  />
                ))
              )}
              <Pager
                page={page}
                size={10}
                total={catalogue.data?.total ?? 0}
                setPage={setPage}
              />
              {x.type === "ONE_OFF" && (
                <Button
                  secondary
                  title="Ajouter un article libre"
                  onPress={() =>
                    set({ items: [...x.items, { name: "", quantity: 1 }] })
                  }
                />
              )}
            </View>
          </Card>
          {x.items.map((i, index) => (
            <Card key={index}>
              <View style={ui.stack}>
                <Text style={ui.sectionTitle}>Article {index + 1}</Text>
                <Input
                  label={`Article ${index + 1} · désignation`}
                  value={i.name}
                  editable={!i.productId}
                  onChangeText={(name) =>
                    set({
                      items: x.items.map((v, j) =>
                        j === index ? { ...v, name } : v,
                      ),
                    })
                  }
                />
                <Input
                  label={`Article ${index + 1} · quantité`}
                  keyboardType="number-pad"
                  value={i.quantity ? String(i.quantity) : ""}
                  onChangeText={(value) =>
                    set({
                      items: x.items.map((v, j) =>
                        j === index ? { ...v, quantity: Number(value) } : v,
                      ),
                    })
                  }
                />
                {(
                  [
                    "sku",
                    "description",
                    "instructions",
                    "declaredValue",
                  ] as const
                ).map((k) => (
                  <Input
                    key={k}
                    label={`Article ${index + 1} · ${{ sku: "référence", description: "description", instructions: "instructions", declaredValue: "valeur déclarée" }[k]}`}
                    value={i[k] ?? ""}
                    onChangeText={(value) =>
                      set({
                        items: x.items.map((v, j) =>
                          j === index ? { ...v, [k]: value || undefined } : v,
                        ),
                      })
                    }
                  />
                ))}
                <Button
                  secondary
                  title="Retirer cet article"
                  onPress={() =>
                    set({ items: x.items.filter((_, j) => j !== index) })
                  }
                />
              </View>
            </Card>
          ))}
          <Card>
            <View style={ui.stack}>
              <Input
                label="Description du colis"
                maxLength={2000}
                value={x.parcelDescription}
                onChangeText={(parcelDescription) => set({ parcelDescription })}
              />
              <Selector
                label="Encaissement requis"
                value={String(x.collectionRequired)}
                options={[
                  { id: "false", label: "Aucun encaissement" },
                  { id: "true", label: "Montant à récupérer à la livraison" },
                ]}
                onChange={(v) =>
                  set({
                    collectionRequired: v === "true",
                    amountToCollect: v === "false" ? "0" : x.amountToCollect,
                  })
                }
              />
              <CurrencyInput
                label="Montant attendu"
                currency={x.currency}
                value={x.amountToCollect}
                editable={x.collectionRequired}
                keyboardType="decimal-pad"
                onChangeText={(amountToCollect) => set({ amountToCollect })}
              />
              <Input
                label="Devise"
                maxLength={3}
                autoCapitalize="characters"
                value={x.currency}
                onChangeText={(currency) =>
                  set({ currency: currency.toUpperCase() })
                }
              />
              <Input
                label="Observations financières"
                value={x.financialNotes ?? ""}
                onChangeText={(financialNotes) => set({ financialNotes })}
              />
              <Input
                label="Instructions générales"
                value={x.notes ?? ""}
                onChangeText={(notes) => set({ notes })}
              />
              <Text style={ui.body}>
                Cette instruction ne déclenche aucun paiement.
              </Text>
            </View>
          </Card>
        </>
      )}
      {step === 3 && (
        <Card>
          <View style={ui.stack}>
            <Text style={ui.sectionTitle}>
              {pair?.shop.name} → {x.recipient.name}
            </Text>
            <Text style={ui.body}>
              {pair?.company.name} ·{" "}
              {agencies.find((a) => a.id === x.agencyId)?.name}
            </Text>
            <Text style={ui.body}>
              {x.recipient.email}
              {"\n"}
              {x.recipient.phone}
            </Text>
            <Text style={ui.body}>
              {x.recipient.address}, {x.recipient.city}, {x.recipient.country}
            </Text>
            <Text style={ui.kicker}>
              {x.type === "FROM_STOCK"
                ? "MARCHANDISES À RÉSERVER"
                : "COLIS À COLLECTER"}
            </Text>
            {x.items.map((i, j) => (
              <Text key={j} style={ui.sectionTitle}>
                {i.quantity} × {i.name}
              </Text>
            ))}
            <Text style={ui.body}>{x.parcelDescription}</Text>
            <Text style={ui.sectionTitle}>
              Encaissement :{" "}
              {x.collectionRequired
                ? `${x.amountToCollect} ${x.currency}`
                : "Aucun"}
            </Text>
            {x.type === "ONE_OFF" && (
              <Text style={ui.body}>
                Collecte : {x.pickup?.address} · {x.pickup?.contact} ·{" "}
                {x.pickup?.phone}
              </Text>
            )}
            <Text style={ui.body}>{x.notes}</Text>
            {!initial && (
              <Button
                secondary
                busy={busy}
                title="Enregistrer le brouillon"
                onPress={() => save(true)}
              />
            )}
            <Button
              busy={busy}
              title={
                initial
                  ? "Enregistrer les modifications"
                  : "Confirmer la commande"
              }
              onPress={() => save(false)}
            />
          </View>
        </Card>
      )}
      <Button
        secondary
        title="Étape précédente"
        disabled={step === 0 || busy}
        onPress={() => {
          setError("");
          setStep((n) => n - 1);
          scrollToTop();
        }}
      />
      {step < 3 && (
        <Button
          title="Continuer"
          disabled={busy}
          onPress={() => {
            const message = orderValidation(x, step);
            setError(message);
            if (!message) setStep((n) => n + 1);
            scrollToTop();
          }}
        />
      )}
    </View>
  );
}
