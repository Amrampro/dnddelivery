export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}
export interface CompanyProfile {
  id: string;
  reference: string;
  name: string;
  tradeName: string | null;
  address: string;
  phone: string;
  email: string;
  city: string;
  countryCode: string;
  description: string | null;
  status: string;
  version: number;
  logoUrl: string | null;
}
export interface Agency {
  id: string;
  companyId: string;
  reference: string;
  name: string;
  phone: string;
  email: string | null;
  address: string;
  city: string;
  countryCode: string | null;
  zone: string | null;
  locationNotes: string | null;
  status: string;
  primaryManagerUserId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  agencyMembership_agencyRecords?: {
    userId: string;
    role: { code: string; name: string };
    membership: {
      user: {
        id: string;
        fullName: string;
        email: string;
        phone: string | null;
      };
    };
  }[];
}
export interface DriverProfile {
  id: string;
  userId: string;
  companyId: string;
  employeeNumber: string | null;
  status: string;
  availability: string;
  availabilityChangedAt: string;
  transport: string | null;
  notes: string | null;
  version: number;
}
export interface Assignment {
  agencyId?: string;
  active: boolean;
  role: { code: string; name: string };
  agency: { id?: string; name: string; status: string };
}
export interface Employee {
  id: string;
  userId: string;
  active: boolean;
  employmentStatus: string;
  organizationRole: string;
  version: number;
  role: { code: string; name: string };
  user: { id: string; fullName: string; email: string; phone: string | null };
  driverProfile: DriverProfile | null;
  agencyMembership_membershipRecords: Assignment[];
}
export interface StaffInvitation {
  id: string;
  email: string;
  fullName: string;
  staffRole: string;
  agencyIds: string[];
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  deliveryStatus: string;
  version: number;
}
export const organizationLabels: Record<string, string> = {
  employee: "Employé",
  agency_employee: "Employé d’agence",
  company_member: "Employé",
  company_admin: "Administrateur d’entreprise",
  agency_manager: "Responsable d’agence",
  stock_manager: "Gestionnaire de stock",
  courier: "Livreur",
  ACTIVE: "Actif",
  INACTIVE: "Inactif",
  SUSPENDED: "Suspendu",
  AVAILABLE: "Disponible",
  UNAVAILABLE: "Indisponible",
  MOTORBIKE: "Moto",
  BICYCLE: "Vélo",
  CAR: "Voiture",
  VAN: "Camionnette",
  OTHER: "Autre",
  PENDING: "En attente",
  SENT: "Envoyée",
  FAILED: "Échec d’envoi",
};
export const organizationLabel = (v: string | null | undefined) =>
  v ? (organizationLabels[v] ?? v) : "—";
export const organizationModuleIds = [
  "entreprise",
  "agences",
  "employes",
  "livreurs",
  "invitations-equipe",
  "mes-affectations",
  "profil-livreur",
  "historique-organisation",
];
export const organizationActions: Record<string, string> = {
  ORG_COMPANY_PROFILE_UPDATED: "Profil de l’entreprise modifié",
  ORG_COMPANY_LOGO_UPDATED: "Logo de l’entreprise modifié",
  ORG_AGENCY_CREATED: "Agence créée",
  ORG_AGENCY_UPDATED: "Agence modifiée",
  ORG_AGENCY_ACTIVATED: "Agence activée",
  ORG_AGENCY_DEACTIVATED: "Agence désactivée",
  ORG_AGENCY_PRIMARY_CHANGED: "Responsable principal modifié",
  ORG_AGENCY_PRIMARY_CLEARED: "Responsable principal retiré",
  ORG_AGENCY_ASSIGNMENT_CHANGED: "Affectation à une agence modifiée",
  ORG_EMPLOYEE_ROLE_CHANGED: "Rôle ou affectations modifiés",
  ORG_EMPLOYEE_AFFILIATION_REMOVED: "Affiliation retirée",
  ORG_EMPLOYEE_INVITED: "Employé invité",
  ORG_INVITATION_ACCEPTED: "Invitation acceptée",
  ORG_INVITATION_RESENT: "Invitation renvoyée",
  ORG_INVITATION_REVOKED: "Invitation révoquée",
  ORG_DRIVER_PROFILE_UPDATED: "Profil livreur modifié",
  ORG_DRIVER_UNAVAILABLE: "Livreur rendu indisponible",
  ORG_DRIVER_AVAILABILITY_CHANGED: "Disponibilité modifiée",
};
export function organizationHistoryDetail(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return "Modification enregistrée.";
  const v = value as Record<string, unknown>;
  return (
    [
      typeof v.reason === "string" ? v.reason : null,
      typeof v.role === "string" ? "Rôle : " + organizationLabel(v.role) : null,
      Array.isArray(v.agencyIds)
        ? String(v.agencyIds.length) + " agence(s)"
        : null,
      typeof v.availability === "string"
        ? organizationLabel(v.availability)
        : null,
      typeof v.status === "string"
        ? "Statut : " + organizationLabel(v.status)
        : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Modification enregistrée."
  );
}
