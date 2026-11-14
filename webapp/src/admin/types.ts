export interface Company {
  id: string;
  reference: string;
  name: string;
  tradeName: string | null;
  email: string;
  phone: string;
  address: string;
  city: string;
  countryCode: string;
  registrationNumber: string | null;
  description: string | null;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "ARCHIVED";
  administrativeReason: string | null;
  statusChangedAt: string | null;
  statusChangedById: string | null;
  primaryAdminUserId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  logoUrl: string | null;
}
export interface Administrator {
  userId: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    status: string;
    archivedAt: string | null;
  };
  createdAt: string;
}
export interface Invitation {
  id: string;
  companyId: string;
  email: string;
  fullName: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  isPrimary: boolean;
  deliveryStatus: "PENDING" | "SENT" | "FAILED";
  lastSentAt: string | null;
  version: number;
  createdAt: string;
  company?: { name: string; reference: string };
}
export interface Audit {
  id: string;
  action: string;
  entityId: string;
  companyId: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
  actor: { fullName: string; id?: string } | null;
  company: { name: string; reference?: string } | null;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface CompanyDetail {
  company: Company;
  admins: Administrator[];
  invitations: Invitation[];
  history: Page<Audit>;
  invitationDelivery?: string | null;
}
export interface DashboardData {
  days: number;
  from: string;
  until: string;
  counts: {
    total: number;
    active: number;
    inactive: number;
    suspended: number;
    newCompanies: number;
  };
  trend: { day: string; count: number }[];
  latest: Company[];
  activity: Audit[];
}
export const companyBase = "/portail/super-admin/entreprises";
export const dateLabel = (date: string | null) =>
  date ? new Date(date).toLocaleString("fr-FR") : "—";
export function invitationState(invite: Invitation) {
  return invite.acceptedAt
    ? "Acceptée"
    : invite.revokedAt
      ? "Révoquée"
      : new Date(invite.expiresAt) <= new Date()
        ? "Expirée"
        : "En attente";
}
export const actionLabels: Record<string, string> = {
  COMPANY_CREATED: "Entreprise créée",
  COMPANY_UPDATED: "Informations modifiées",
  COMPANY_ACTIVATED: "Entreprise activée",
  COMPANY_SUSPENDED: "Entreprise suspendue",
  COMPANY_DEACTIVATED: "Entreprise désactivée",
  COMPANY_REACTIVATED: "Entreprise réactivée",
  COMPANY_ADMIN_ASSIGNED: "Administrateur associé",
  COMPANY_ADMIN_REMOVED: "Affiliation retirée",
  COMPANY_PRIMARY_CHANGED: "Administrateur principal modifié",
  COMPANY_ADMIN_INVITED: "Administrateur invité",
  COMPANY_INVITATION_RESENT: "Invitation renvoyée",
  COMPANY_INVITATION_REVOKED: "Invitation révoquée",
  COMPANY_INVITATION_ACCEPTED: "Invitation acceptée",
  COMPANY_LOGO_UPDATED: "Logo modifié",
};
