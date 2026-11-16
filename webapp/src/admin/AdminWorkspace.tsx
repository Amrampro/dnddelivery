import { useParams } from "react-router-dom";
import { AdminDashboard } from "./Dashboard";
import { CompanyList } from "./CompanyList";
import { ShopAdmin } from "./ShopAdmin";
import { AccessRequests } from "./AccessRequests";
import { CompanyForm, EditCompany } from "./CompanyForm";
import { CompanyDetail } from "./CompanyDetail";
import { GlobalHistory, GlobalInvitations, GlobalUsers } from "./GlobalPages";
import { EmptyState } from "../design/ui";
import "./admin.css";
export function AdminWorkspace({ moduleId }: { moduleId: string }) {
  const { entityId, action } = useParams();
  if (moduleId === "accueil") return <AdminDashboard />;
  if (moduleId === "demandes-acces") return <AccessRequests />;
  if (moduleId === "activite") return <GlobalHistory />;
  if (moduleId === "invitations") return <GlobalInvitations />;
  if (moduleId === "utilisateurs") return <GlobalUsers />;
  if (moduleId === "boutiques") return <ShopAdmin id={entityId} />;
  if (moduleId === "entreprises") {
    if (!entityId) return <CompanyList />;
    if (entityId === "nouvelle") return <CompanyForm />;
    if (!/^[a-f0-9-]{36}$/i.test(entityId))
      return (
        <EmptyState
          title="Entreprise introuvable."
          description="Vérifiez le lien ou revenez à la liste."
        />
      );
    if (action === "modifier") return <EditCompany id={entityId} />;
    if (
      !action ||
      ["administrateurs", "invitations", "historique"].includes(action)
    )
      return <CompanyDetail id={entityId} section={action} />;
  }
  return (
    <EmptyState
      title="Page introuvable."
      description="Choisissez une page depuis la navigation."
    />
  );
}
