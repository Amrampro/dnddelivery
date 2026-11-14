import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { definition, navigation } from "../../../shared/workspace";
import type { Workspace } from "../auth/types";
import {
  Badge,
  Card,
  Chart,
  EmptyState,
  Stat,
  SearchInput,
  DataTable,
  ImportExport,
} from "../design/ui";
import { ModuleIcon } from "./ModuleIcon";
export function Dashboard({
  context,
  fullName,
}: {
  context: Workspace;
  fullName: string;
}) {
  const config = definition(context)!,
    modules = navigation(context).filter(
      (m) => !["accueil", "parametres", "notifications"].includes(m.id),
    );
  const [search, setSearch] = useState("");
  const base = `/portail/${context.portal}`;
  return (
    <>
      <header className="ws-page-title">
        <div>
          <span className="ws-eyebrow">{config.eyebrow}</span>
          <h1>{config.title}</h1>
          <p>{config.subtitle}</p>
        </div>
        <Badge tone="success">
          <ShieldCheck size={13} />
          Accès vérifié
        </Badge>
      </header>
      <div className="ws-welcome">
        <div className="ws-welcome-copy">
          <span className="ws-greeting">
            Bonjour, {fullName.split(" ")[0]}.
          </span>
          <h2>
            Le bon espace.
            <br />
            Les bonnes perspectives.
          </h2>
          <p>
            {context.agencyName
              ? `Vous travaillez sur ${context.agencyName}.`
              : context.shopName
                ? `${context.shopName} · ${context.companyName}`
                : context.companyName}{" "}
            Retrouvez les outils adaptés à vos responsabilités.
          </p>
          <Link to="/organisations">
            Gérer mon environnement <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="ws-illustration" aria-hidden="true">
          <div className="ws-route-line" />
          <div className="ws-location loc-one">
            <Building2Icon />
          </div>
          <div className="ws-location loc-two">
            <ModuleIcon name="package" size={30} />
          </div>
          <div className="ws-location loc-three">
            <ModuleIcon name="truck" size={28} />
          </div>
          <div className="ws-route-note">
            <span className="ws-live-dot" />
            Connecté à votre environnement
          </div>
        </div>
      </div>
      <div className="ws-section-heading">
        <h2>Votre activité en un regard</h2>
        <span>Indicateurs à venir</span>
      </div>
      <div className={`ws-stats ws-stats-${config.metrics.length}`}>
        {config.metrics.map((label) => (
          <Stat key={label} label={label} />
        ))}
      </div>
      <div className="ws-two-columns">
        <Chart
          title={
            context.portal === "super-admin"
              ? "Évolution des inscriptions"
              : context.portal === "stock"
                ? "Évolution des mouvements"
                : context.portal === "boutique"
                  ? "Activité des expéditions"
                  : "Évolution de l’activité"
          }
        />
        <Card title="À votre attention" action={<BellIcon />}>
          <EmptyState
            title="Un espace pour vos priorités."
            description="Les alertes et événements apparaîtront lorsque les modules seront activés."
            icon={<Sparkles size={23} />}
          />
        </Card>
      </div>
      <div className="ws-section-heading">
        <div>
          <h2>Vos outils de travail</h2>
          <p>Les modules accessibles avec vos permissions actuelles.</p>
        </div>
        <SearchInput value={search} onChange={setSearch} />
      </div>
      <div className="ws-module-grid">
        {modules
          .filter((m) =>
            m.label
              .toLocaleLowerCase("fr")
              .includes(search.toLocaleLowerCase("fr")),
          )
          .map((m) => (
            <Link key={m.id} to={`${base}/${m.id}`} className="ws-module-card">
              <span className="ws-module-icon">
                <ModuleIcon name={m.icon} size={22} />
              </span>
              <div>
                <h3>{m.label}</h3>
                <p>Préparé pour vos prochaines opérations</p>
              </div>
              <ArrowUpRight size={17} />
            </Link>
          ))}
      </div>
      {!modules.filter((m) =>
        m.label
          .toLocaleLowerCase("fr")
          .includes(search.toLocaleLowerCase("fr")),
      ).length && (
        <EmptyState
          title="Aucun module ne correspond."
          description="Essayez un autre mot dans votre recherche."
        />
      )}
      {context.portal === "stock" && (
        <Card title="Vue d’inventaire préparée" action={<ImportExport />}>
          <DataTable
            caption="Structure du futur inventaire"
            columns={["Produit", "Emplacement", "Disponible", "Réservé"]}
            rows={[]}
          />
        </Card>
      )}
      <div className="ws-bottom-note">
        <ShieldCheck size={17} />
        <p>
          Les données métier arriveront progressivement. Aucun indicateur
          présenté ici n’est une statistique réelle.
        </p>
        <Link to="/profil">
          Mon compte <ArrowRight size={14} />
        </Link>
      </div>
    </>
  );
}
function BellIcon() {
  return <ModuleIcon name="bell" size={18} />;
}
function Building2Icon() {
  return <ModuleIcon name="building" size={29} />;
}
