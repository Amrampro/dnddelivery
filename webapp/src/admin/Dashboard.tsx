import { useState } from "react";
import { SubscriptionOverview } from "../subscriptions/Subscriptions";
import { Link } from "react-router-dom";
import {
  Card,
  Chart,
  EmptyState,
  ErrorState,
  Select,
  Skeleton,
  Stat,
} from "../design/ui";
import { useResource } from "./useResource";
import { ActivityTable, CompanyTable } from "./components";
import { companyBase, type DashboardData } from "./types";
export function AdminDashboard() {
  const [days, setDays] = useState("30"),
    resource = useResource<DashboardData>(`/admin/dashboard?days=${days}`);
  if (resource.error)
    return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return <Skeleton rows={5} />;
  const data = resource.data,
    bucket = Math.ceil(data.trend.length / 12),
    bars = data.trend
      .filter((_, i) => i % bucket === 0)
      .map((v, i) => ({
        label: `${v.day.slice(8, 10)}/${v.day.slice(5, 7)}`,
        value: data.trend
          .slice(i * bucket, (i + 1) * bucket)
          .reduce((n, v) => n + v.count, 0),
      }));
  return (
    <>
      <header className="ws-page-title">
        <div>
          <span className="ws-eyebrow">ADMINISTRATION DND DELIVERY</span>
          <h1>Votre plateforme, en temps réel.</h1>
          <p>
            Entreprises enregistrées et activités administratives issues de
            votre base.
          </p>
        </div>
        <Link className="ds-button ds-primary" to={`${companyBase}/nouvelle`}>
          Créer une entreprise
        </Link>
      </header>
      <div className="admin-toolbar">
        <Select
          label="Période des créations et activités"
          value={days}
          onChange={(e) => setDays(e.target.value)}
        >
          <option value="7">7 derniers jours</option>
          <option value="30">30 derniers jours</option>
          <option value="90">90 derniers jours</option>
        </Select>
        <p>
          Période UTC du {data.from.slice(0, 10)} au{" "}
          {new Date(new Date(data.until).getTime() - 86400000)
            .toISOString()
            .slice(0, 10)}
          .
        </p>
      </div>
      <div className="ws-stats">
        <Stat
          label="Entreprises enregistrées"
          value={data.counts.total}
          detail="Tous les statuts"
        />
        <Stat
          label="Entreprises actives"
          value={data.counts.active}
          detail="Statut administratif"
        />
        <Stat
          label="Entreprises suspendues"
          value={data.counts.suspended}
          detail="Suspension administrative"
        />
        <Stat
          label="Entreprises désactivées"
          value={data.counts.inactive}
          detail="Accès administrativement fermé"
        />
      </div>
      <div className="ws-two-columns">
        <Card title="Nouvelles entreprises">
          <Stat
            label="Sur la période sélectionnée"
            value={data.counts.newCompanies}
            detail="Créations enregistrées"
          />
        </Card>
        {data.counts.newCompanies ? (
          <Chart title="Évolution des créations" values={bars} />
        ) : (
          <Card title="Évolution des créations">
            <EmptyState
              title="Aucune création sur cette période."
              description="La courbe apparaîtra avec les prochaines inscriptions."
            />
          </Card>
        )}
      </div>
      <Card
        title="Dernières entreprises enregistrées"
        action={<Link to={companyBase}>Voir toutes les entreprises →</Link>}
      >
        <CompanyTable companies={data.latest} />
      </Card>
      <Card
        title="Activité administrative récente"
        action={
          <Link to="/portail/super-admin/activite">Ouvrir le journal →</Link>
        }
      >
        <ActivityTable items={data.activity} />
      </Card>
      <SubscriptionOverview days={days} />
    </>
  );
}
