import { useCallback, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Choice,
  Confirm,
  DataTable,
  DemoDialog,
  Dialog,
  Field,
  ImportExport,
  Pagination,
  Popover,
  SearchInput,
  Select,
  Skeleton,
  Tabs,
  Textarea,
  Toast,
} from "../design/ui";
export function DesignLibrary() {
  const [query, setQuery] = useState(""),
    [tab, setTab] = useState("form"),
    [page, setPage] = useState(1),
    [toast, setToast] = useState(""),
    [drawer, setDrawer] = useState(false),
    [confirm, setConfirm] = useState(false);
  const dismiss = useCallback(() => setToast(""), []);
  return (
    <>
      <header className="ws-page-title">
        <div>
          <span className="ws-eyebrow">BIBLIOTHÈQUE D’INTERFACE</span>
          <h1>Les mêmes repères, partout.</h1>
          <p>
            Exemples interactifs de composants, sans données métier ni
            enregistrement.
          </p>
        </div>
        <Badge>Démonstration UI</Badge>
      </header>
      <Card title="Actions et feedback">
        <div className="ds-actions">
          <Button
            onClick={() =>
              setToast("Exemple de notification : aucune donnée enregistrée.")
            }
          >
            Action principale
          </Button>
          <Button variant="secondary">Secondaire</Button>
          <Button variant="ghost">Discrète</Button>
          <Button disabled>Indisponible</Button>
          <Button busy>Chargement</Button>
        </div>
        <div className="ds-actions">
          <Badge tone="success">Confirmé</Badge>
          <Badge tone="warning">À vérifier</Badge>
          <Badge tone="danger">Erreur</Badge>
          <Badge>En attente</Badge>
        </div>
      </Card>
      <Card title="Champs et sélection">
        <Tabs
          selected={tab}
          onChange={setTab}
          items={[
            { id: "form", label: "Formulaire" },
            { id: "state", label: "Chargement" },
          ]}
        />
        {tab === "form" ? (
          <form
            className="ds-form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              setToast("Formulaire de démonstration validé localement.");
            }}
          >
            <Field
              label="Nom du modèle"
              placeholder="Exemple de présentation"
              required
            />
            <Select label="Filtre de présentation">
              <option>Tous les états</option>
              <option>En préparation</option>
            </Select>
            <Field
              label="Champ avec erreur"
              error="Exemple de message de validation."
              defaultValue="À compléter"
            />
            <Textarea label="Description" placeholder="Ajoutez du contexte…" />
            <Choice label="Recevoir un exemple de confirmation" />
            <fieldset>
              <legend>Présentation</legend>
              <Choice
                label="Compacte"
                name="density"
                type="radio"
                defaultChecked
              />
              <Choice label="Confortable" name="density" type="radio" />
            </fieldset>
            <Button type="submit">Valider l’exemple</Button>
          </form>
        ) : (
          <Skeleton rows={4} />
        )}
      </Card>
      <Card title="Panneaux et confirmations">
        <div className="ds-actions">
          <DemoDialog />
          <Button variant="secondary" onClick={() => setDrawer(true)}>
            Ouvrir un panneau
          </Button>
          <Button variant="danger" onClick={() => setConfirm(true)}>
            Confirmation sensible
          </Button>
          <Popover label="Options">
            <button
              onClick={() => setToast("Option de présentation sélectionnée.")}
            >
              Option d’exemple
            </button>
          </Popover>
        </div>
      </Card>
      <Card title="Tableau responsive" action={<ImportExport />}>
        <SearchInput
          label="Filtrer les composants"
          value={query}
          onChange={(value) => {
            setQuery(value);
            setPage(1);
          }}
        />
        <DataTable
          caption="Composants de démonstration"
          columns={["Composant", "Usage", "État"]}
          rows={[
            "Bouton",
            "Sélecteur",
            "Dialogue",
            "Carte",
            "Skeleton",
            "Badge",
          ]
            .filter((v) => v.toLowerCase().includes(query.toLowerCase()))
            .slice((page - 1) * 3, page * 3)
            .map((v) => [v, "Bibliothèque UI", <Badge key={v}>Exemple</Badge>])}
        />
        <Pagination
          page={page}
          pages={Math.max(
            1,
            Math.ceil(
              [
                "Bouton",
                "Sélecteur",
                "Dialogue",
                "Carte",
                "Skeleton",
                "Badge",
              ].filter((v) => v.toLowerCase().includes(query.toLowerCase()))
                .length / 3,
            ),
          )}
          onChange={setPage}
        />
      </Card>
      <Dialog
        open={drawer}
        onClose={() => setDrawer(false)}
        drawer
        title="Détails du composant"
      >
        <p>Ce panneau accueille les futurs formulaires et vues de détail.</p>
        <Button onClick={() => setDrawer(false)}>Fermer le panneau</Button>
      </Dialog>
      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          setToast("Confirmation de démonstration uniquement.");
        }}
        title="Confirmer cet exemple ?"
        description="Aucune donnée ne sera supprimée ni modifiée. Cet écran vérifie le composant de confirmation."
      />
      <Toast message={toast} onDismiss={dismiss} />
    </>
  );
}
