import { Link } from "react-router-dom";
import type { Module } from "../../../shared/workspace";
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  ImportExport,
  Field,
  Select,
  Textarea,
  Button,
} from "../design/ui";
import { ModuleIcon } from "./ModuleIcon";
export function ModulePage({ module }: { module: Module }) {
  return (
    <>
      <header className="ws-page-title">
        <div>
          <span className="ws-eyebrow">VOTRE ESPACE DE TRAVAIL</span>
          <h1>{module.label}</h1>
          <p>{module.description}</p>
        </div>
        <Badge>Prochainement</Badge>
      </header>
      <Card title={module.label} action={<ImportExport />}>
        {module.columns ? (
          <DataTable
            caption={`Structure ${module.label}`}
            columns={module.columns}
            rows={[]}
          />
        ) : (
          <EmptyState
            title="Cet espace se prépare pour vous."
            description="Le module métier n’est pas encore disponible. Vous pourrez l’utiliser lors d’une prochaine étape."
            icon={<ModuleIcon name={module.icon} size={28} />}
            action={
              module.id === "parametres" ? (
                <Link className="ds-button ds-secondary" to="/profil">
                  Gérer mon profil et mes sessions
                </Link>
              ) : module.id === "transporteurs" ? (
                <Link className="ds-button ds-secondary" to="/organisations">
                  Choisir une agence de livraison autorisée
                </Link>
              ) : undefined
            }
          />
        )}
      </Card>
      {["entrees", "sorties", "transferts", "inventaires"].includes(
        module.id,
      ) && (
        <Card title="Structure de saisie préparée">
          <p className="ws-disclaimer">
            Les champs seront activés avec les opérations de stock.
          </p>
          <div className="ds-form-grid">
            <Field
              label="Produit"
              placeholder="Catalogue à connecter"
              disabled
            />
            <Select label="Emplacement" disabled>
              <option>Emplacements à connecter</option>
            </Select>
            <Field label="Quantité" type="number" disabled />
            <Textarea label="Note de mouvement" disabled />
          </div>
          <div className="ds-actions">
            <Button disabled>Enregistrer — prochainement</Button>
          </div>
        </Card>
      )}
      <p className="ws-disclaimer">
        Aucune opération métier n’est exécutée depuis cet écran. Les imports et
        exports seront activés avec le module.
      </p>
    </>
  );
}
