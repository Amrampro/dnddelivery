import { useRef, useState } from "react";
import { api } from "../auth/client";
import type { Workspace } from "../auth/types";
import { useResource } from "../admin/useResource";
import {
  Button,
  Card,
  Field,
  Select,
  Choice,
  Textarea,
  ErrorState,
} from "../design/ui";
import {
  blankOrder,
  orderForm,
  orderValidation,
  orderPayload,
  localDeliveryTime,
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
}: {
  context: Workspace;
  options: OrderOptions;
  initial?: OrderDTO;
  onDone: (p: OrderDTO) => void;
  onBack: () => void;
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
    [productPage, setProductPage] = useState(1),
    [recipientSearch, setRecipientSearch] = useState(""),
    [recipientPage, setRecipientPage] = useState(1);
  const key = useRef(crypto.randomUUID()),
    pending = useRef(false);
  const [customerMessage, setCustomerMessage] = useState("");
  async function findCustomer() {
    setBusy(true);
    setCustomerMessage("");
    try {
      const r = await api<{
        customer: {
          fullName: string;
          email: string;
          phone: string | null;
        } | null;
      }>("/orders/customer-lookup", {
        method: "POST",
        body: JSON.stringify({ email: x.recipient.email.trim().toLowerCase() }),
      });
      if (r.customer) {
        setX((old) => ({
          ...old,
          recipient: {
            ...old.recipient,
            name: r.customer!.fullName,
            email: r.customer!.email,
            phone: r.customer!.phone ?? old.recipient.phone,
          },
        }));
        setCustomerMessage(
          "Compte client sélectionné. Complétez l'adresse de cette livraison.",
        );
      } else
        setCustomerMessage(
          "Aucun compte client vérifié. Vous pouvez continuer avec un destinataire sans compte.",
        );
    } catch (e) {
      setCustomerMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const set = (patch: Partial<OrderContent>) =>
    setX((old) => ({ ...old, ...patch }));
  const pairs = options.pairs.filter(
    (p) =>
      (!x.companyId || p.companyId === x.companyId) &&
      (!context.shopId || p.shopId === context.shopId),
  );
  const pair = pairs.find(
      (p) => p.companyId === x.companyId && p.shopId === x.shopId,
    ),
    agencies = options.agencies.filter(
      (a) =>
        a.companyId === x.companyId && pair?.allowedAgencyIds.includes(a.id),
    );
  const catalogue = useResource<OrderPage<OrderProduct>>(
    x.companyId && x.shopId && x.agencyId
      ? `/orders/catalogue?${new URLSearchParams({ companyId: x.companyId, shopId: x.shopId, agencyId: x.agencyId, q: search, page: String(productPage) })}`
      : null,
  );
  const recipients = useResource<OrderPage<RecipientDTO>>(
    x.companyId && x.shopId
      ? `/recipients?${new URLSearchParams({ ...(x.companyId ? { companyId: x.companyId } : {}), ...(x.shopId ? { shopId: x.shopId } : {}), q: recipientSearch, page: String(recipientPage) })}`
      : null,
  );
  const rec = (
    k: keyof OrderContent["recipient"],
    value: string | number | undefined,
  ) =>
    set({
      recipient: {
        ...x.recipient,
        [k]:
          value === "" &&
          !["name", "email", "phone", "country", "city", "address"].includes(k)
            ? undefined
            : value,
      },
    });
  const field = (
    label: string,
    k: keyof OrderContent["recipient"],
    type = "text",
    required = false,
  ) => (
    <Field
      key={k}
      label={label}
      value={
        k === "desiredDeliveryAt"
          ? localDeliveryTime(x.recipient.desiredDeliveryAt)
          : String(x.recipient[k] ?? "")
      }
      type={type}
      required={required}
      disabled={!!initial && !initial.isDraft}
      onChange={(e) => rec(k, e.target.value)}
      maxLength={
        k === "address"
          ? 500
          : k === "accessInstructions" || k === "observations"
            ? 1000
            : 254
      }
    />
  );
  async function save(draft: boolean) {
    if (pending.current) return;
    const message = orderValidation(x);
    if (message) {
      setError(message);
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const payload = orderPayload(x);
      const p = await api<OrderDTO>(
        initial ? `/orders/${initial.id}` : "/orders",
        {
          method: initial ? "PATCH" : "POST",
          body: JSON.stringify({
            ...payload,
            ...(initial
              ? { version: initial.version }
              : { clientKey: key.current, draft }),
          }),
        },
      );
      onDone(p);
    } catch (e) {
      setError(
        `${(e as Error).message} Vos informations sont conservées. En cas de coupure, réessayez la même validation ou consultez Mes commandes.`,
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="order-form">
      <div className="stock-heading">
        <div>
          <span className="eyebrow">
            {initial ? "MODIFIER LA COMMANDE" : "NOUVELLE DEMANDE"}
          </span>
          <h1>
            {
              [
                "Agence de livraison et prise en charge",
                "Destinataire",
                "Colis et encaissement",
                "Vérifier la commande",
              ][step]
            }
          </h1>
          <p>
            Étape {step + 1} sur 4 ·{" "}
            {initial?.publicNumber ?? "Une validation crée une seule demande."}
          </p>
        </div>
        <Button variant="ghost" onClick={onBack}>
          Retour aux commandes
        </Button>
      </div>
      <div className="order-steps">
        {["Prise en charge", "Destinataire", "Articles", "Récapitulatif"].map(
          (label, i) => (
            <span key={label} className={i === step ? "active" : ""}>
              {i + 1}. {label}
            </span>
          ),
        )}
      </div>
      {!!error && <ErrorState message={error} />}
      <Card>
        {step === 0 && (
          <div className="order-grid">
            <Select
              label="Agence de livraison"
              value={x.companyId}
              disabled={!!initial || !!context.companyId}
              onChange={(e) =>
                set({
                  companyId: e.target.value,
                  agencyId: "",
                  items: [],
                  ...(context.scope !== "SHOP" ? { shopId: "" } : {}),
                })
              }
            >
              <option value="">Choisir une agence de livraison</option>
              {Array.from(
                new Map(
                  options.pairs.map((p) => [p.companyId, p.company]),
                ).values(),
              ).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Select
              label="Boutique partenaire"
              value={x.shopId}
              disabled={!!initial || !!context.shopId}
              onChange={(e) =>
                set({
                  shopId: e.target.value,
                  agencyId: context.agencyId ?? "",
                  items: [],
                  recipientId: undefined,
                })
              }
            >
              <option value="">Choisir une boutique</option>
              {pairs.map((p) => (
                <option key={p.shopId} value={p.shopId}>
                  {p.shop.name}
                </option>
              ))}
            </Select>
            <Select
              label="Agence responsable"
              value={x.agencyId}
              disabled={context.scope === "AGENCY"}
              onChange={(e) => set({ agencyId: e.target.value })}
            >
              <option value="">Choisir une agence partagée</option>
              {agencies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <Select
              label="Type de commande"
              value={x.type}
              onChange={(e) =>
                set({ type: e.target.value as OrderContent["type"], items: [] })
              }
            >
              <option value="ONE_OFF">Ponctuelle · collecte en boutique</option>
              <option value="FROM_STOCK">Depuis le stock de l’agence</option>
            </Select>
            <p className="order-wide">
              {x.type === "FROM_STOCK"
                ? "Les articles seront réservés à la soumission. Le stock physique reste inchangé."
                : "La collecte physique sera organisée lors de la prise en charge logistique."}
            </p>
          </div>
        )}
        {step === 1 && (
          <>
            <div className="order-grid">
              {field("Nom du destinataire", "name", "text", true)}
              {field("Adresse e-mail", "email", "email", true)}
              <div className="order-wide">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || !x.recipient.email}
                  onClick={() => void findCustomer()}
                >
                  Rechercher le compte client par e-mail
                </Button>
                <p role="status">
                  {customerMessage ||
                    "Le compte client est facultatif. Une commande sera rattachée au compte dont l'e-mail est vérifié."}
                </p>
              </div>
              {field("Téléphone international", "phone", "tel", true)}
              {field("Pays", "country", "text", true)}
              {field("Ville", "city", "text", true)}
              {field("Adresse de livraison", "address", "text", true)}
              {field("Quartier", "district")}
              {field("Point de repère", "landmark")}
              {field("Instructions d’accès", "accessInstructions")}
              {field(
                "Date et heure souhaitées",
                "desiredDeliveryAt",
                "datetime-local",
              )}
              {field("Observations destinataire", "observations")}
              {(["latitude", "longitude"] as const).map((k) => (
                <Field
                  key={k}
                  label={
                    k === "latitude"
                      ? "Latitude facultative"
                      : "Longitude facultative"
                  }
                  value={x.recipient[k] ?? ""}
                  type="number"
                  step="any"
                  disabled={!!initial && !initial.isDraft}
                  onChange={(e) =>
                    rec(k, e.target.value ? Number(e.target.value) : undefined)
                  }
                />
              ))}
            </div>
            {(!initial || initial.isDraft) && (
              <>
                <Choice
                  label="Conserver cette fiche dans le répertoire de la boutique"
                  checked={x.saveRecipient}
                  onChange={(e) => set({ saveRecipient: e.target.checked })}
                />
                <div className="order-directory">
                  <h3>Réutiliser un destinataire</h3>
                  <Field
                    label="Rechercher dans mon répertoire"
                    value={recipientSearch}
                    onChange={(e) => {
                      setRecipientSearch(e.target.value);
                      setRecipientPage(1);
                    }}
                  />
                  {recipients.error && (
                    <ErrorState message={recipients.error} />
                  )}
                  <div className="order-actions">
                    {recipients.data?.items.map((r) => (
                      <Button
                        key={r.id}
                        variant="secondary"
                        onClick={() =>
                          set({
                            recipient: r.details ?? {
                              name: r.name,
                              email: r.email,
                              phone: r.phone,
                              address: r.address,
                              city: r.city,
                              country: r.country,
                            },
                            recipientId: r.id,
                          })
                        }
                      >
                        {r.name} · {r.phone}
                      </Button>
                    ))}
                  </div>
                  <div className="order-actions">
                    <Button
                      variant="ghost"
                      disabled={recipientPage === 1}
                      onClick={() => setRecipientPage((n) => n - 1)}
                    >
                      Précédents
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={
                        recipientPage * 20 >= (recipients.data?.total ?? 0)
                      }
                      onClick={() => setRecipientPage((n) => n + 1)}
                    >
                      Suivants
                    </Button>
                  </div>
                </div>
              </>
            )}
            {!!initial && !initial.isDraft && (
              <p>
                Les coordonnées soumises sont conservées dans l’historique. Pour
                changer le destinataire, annulez et recréez la commande.
              </p>
            )}
          </>
        )}
        {step === 2 && (
          <>
            {x.type === "ONE_OFF" && (
              <div className="order-grid">
                <Field
                  label="Adresse de collecte"
                  value={x.pickup?.address ?? ""}
                  onChange={(e) =>
                    set({
                      pickup: {
                        address: e.target.value,
                        contact: x.pickup?.contact ?? "",
                        phone: x.pickup?.phone ?? "",
                        instructions: x.pickup?.instructions,
                      },
                    })
                  }
                />
                <Field
                  label="Contact de collecte"
                  value={x.pickup?.contact ?? ""}
                  onChange={(e) =>
                    set({
                      pickup: {
                        address: x.pickup?.address ?? "",
                        contact: e.target.value,
                        phone: x.pickup?.phone ?? "",
                        instructions: x.pickup?.instructions,
                      },
                    })
                  }
                />
                <Field
                  label="Téléphone de collecte"
                  value={x.pickup?.phone ?? ""}
                  onChange={(e) =>
                    set({
                      pickup: {
                        address: x.pickup?.address ?? "",
                        contact: x.pickup?.contact ?? "",
                        phone: e.target.value,
                        instructions: x.pickup?.instructions,
                      },
                    })
                  }
                />
                <Field
                  label="Instructions de récupération"
                  value={x.pickup?.instructions ?? ""}
                  onChange={(e) =>
                    set({
                      pickup: {
                        address: x.pickup?.address ?? "",
                        contact: x.pickup?.contact ?? "",
                        phone: x.pickup?.phone ?? "",
                        instructions: e.target.value,
                      },
                    })
                  }
                />
              </div>
            )}
            <h3>Articles du colis</h3>
            <Field
              label="Rechercher un produit du catalogue"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setProductPage(1);
              }}
            />
            {catalogue.error && (
              <ErrorState message={catalogue.error} retry={catalogue.reload} />
            )}
            <div className="order-actions">
              {catalogue.data?.items.map((p) => (
                <Button
                  key={p.id}
                  variant="secondary"
                  disabled={x.items.some((i) => i.productId === p.id)}
                  onClick={() =>
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
                >
                  {p.name} · {p.availableQuantity} disponible(s)
                </Button>
              ))}
            </div>
            <div className="order-actions">
              <Button
                variant="ghost"
                disabled={productPage === 1}
                onClick={() => setProductPage((n) => n - 1)}
              >
                Produits précédents
              </Button>
              <Button
                variant="ghost"
                disabled={productPage * 20 >= (catalogue.data?.total ?? 0)}
                onClick={() => setProductPage((n) => n + 1)}
              >
                Produits suivants
              </Button>
              {x.type === "ONE_OFF" && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    set({ items: [...x.items, { name: "", quantity: 1 }] })
                  }
                >
                  Ajouter un article libre
                </Button>
              )}
            </div>
            {x.items.map((i, index) => (
              <div key={index} className="order-item">
                <div className="order-grid">
                  <Field
                    label={`Article ${index + 1} · désignation`}
                    value={i.name}
                    disabled={!!i.productId}
                    onChange={(e) =>
                      set({
                        items: x.items.map((v, j) =>
                          j === index ? { ...v, name: e.target.value } : v,
                        ),
                      })
                    }
                  />
                  <Field
                    label={`Article ${index + 1} · quantité`}
                    type="number"
                    min="1"
                    step="1"
                    value={i.quantity || ""}
                    onChange={(e) =>
                      set({
                        items: x.items.map((v, j) =>
                          j === index
                            ? { ...v, quantity: Number(e.target.value) }
                            : v,
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
                    <Field
                      key={k}
                      label={`Article ${index + 1} · ${{ sku: "référence", description: "description", instructions: "instructions", declaredValue: "valeur déclarée" }[k]}`}
                      value={i[k] ?? ""}
                      onChange={(e) =>
                        set({
                          items: x.items.map((v, j) =>
                            j === index
                              ? { ...v, [k]: e.target.value || undefined }
                              : v,
                          ),
                        })
                      }
                    />
                  ))}
                </div>
                <Button
                  variant="ghost"
                  onClick={() =>
                    set({ items: x.items.filter((_, j) => j !== index) })
                  }
                >
                  Retirer cet article
                </Button>
              </div>
            ))}
            <Textarea
              label="Description du colis"
              maxLength={2000}
              value={x.parcelDescription}
              onChange={(e) => set({ parcelDescription: e.target.value })}
            />
            <Choice
              label="Encaissement requis à la livraison"
              checked={x.collectionRequired}
              onChange={(e) =>
                set({
                  collectionRequired: e.target.checked,
                  amountToCollect: e.target.checked ? x.amountToCollect : "0",
                })
              }
            />
            <div className="order-grid">
              <Field
                label="Montant attendu"
                inputMode="decimal"
                value={x.amountToCollect}
                disabled={!x.collectionRequired}
                onChange={(e) => set({ amountToCollect: e.target.value })}
              />
              <Field
                label="Devise"
                maxLength={3}
                value={x.currency}
                onChange={(e) =>
                  set({ currency: e.target.value.toUpperCase() })
                }
              />
              <Field
                label="Observations financières"
                maxLength={1000}
                value={x.financialNotes ?? ""}
                onChange={(e) => set({ financialNotes: e.target.value })}
              />
              <Field
                label="Instructions générales"
                maxLength={2000}
                value={x.notes ?? ""}
                onChange={(e) => set({ notes: e.target.value })}
              />
            </div>
            <p>
              Le montant est une instruction de livraison. Aucun paiement n’est
              déclenché.
            </p>
          </>
        )}
        {step === 3 && (
          <div className="order-review">
            <h2>
              {pair?.shop.name} → {x.recipient.name}
            </h2>
            <p>
              {pair?.company.name} ·{" "}
              {agencies.find((a) => a.id === x.agencyId)?.name}
            </p>
            <p>
              {x.recipient.email} · {x.recipient.phone}
            </p>
            <p>
              {x.recipient.address}, {x.recipient.city}, {x.recipient.country}
            </p>
            <h3>
              {x.type === "FROM_STOCK"
                ? "Marchandises à réserver"
                : "Colis à collecter"}
            </h3>
            {x.items.map((i, j) => (
              <p key={j}>
                <strong>
                  {i.quantity} × {i.name}
                </strong>
              </p>
            ))}
            <p>{x.parcelDescription}</p>
            <p>
              Encaissement :{" "}
              <strong>
                {x.collectionRequired
                  ? `${x.amountToCollect} ${x.currency}`
                  : "Aucun"}
              </strong>
            </p>
            {x.type === "ONE_OFF" && (
              <p>
                Collecte : {x.pickup?.address} · {x.pickup?.contact} ·{" "}
                {x.pickup?.phone}
              </p>
            )}
            <p>{x.notes}</p>
            <div className="order-actions">
              {!initial && (
                <Button
                  variant="secondary"
                  busy={busy}
                  onClick={() => save(true)}
                >
                  Enregistrer le brouillon
                </Button>
              )}
              <Button busy={busy} onClick={() => save(false)}>
                {initial
                  ? "Enregistrer les modifications"
                  : "Confirmer la commande"}
              </Button>
            </div>
          </div>
        )}
      </Card>
      <div className="order-actions">
        <Button
          variant="secondary"
          disabled={step === 0 || busy}
          onClick={() => {
            setError("");
            setStep((n) => n - 1);
          }}
        >
          Étape précédente
        </Button>
        {step < 3 && (
          <Button
            disabled={busy}
            onClick={() => {
              const message = orderValidation(x, step);
              setError(message);
              if (!message) setStep((n) => n + 1);
            }}
          >
            Continuer
          </Button>
        )}
      </div>
    </div>
  );
}
