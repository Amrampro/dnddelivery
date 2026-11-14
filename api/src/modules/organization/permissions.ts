export const organizationGrants: Record<string, readonly string[]> = {
  company_admin: [
    "company.profile.read",
    "company.profile.write",
    "agencies.read",
    "agencies.create",
    "agencies.update",
    "agencies.status",
    "employees.read",
    "employees.invite",
    "employees.manage",
    "employees.remove",
    "drivers.read",
    "drivers.manage",
    "organization.self.read",
    "organization.audit.read",
  ],
  company_member: [
    "workspace.access",
    "company.profile.read",
    "organization.self.read",
  ],
  agency_manager: [
    "workspace.access",
    "company.profile.read",
    "agencies.read",
    "employees.read",
    "drivers.read",
    "organization.self.read",
  ],
  stock_manager: [
    "workspace.access",
    "company.profile.read",
    "agencies.read",
    "organization.self.read",
  ],
  courier: [
    "workspace.access",
    "company.profile.read",
    "agencies.read",
    "organization.self.read",
    "drivers.self.read",
    "drivers.availability.write",
  ],
  agency_employee: [
    "workspace.access",
    "company.profile.read",
    "agencies.read",
    "organization.self.read",
  ],
};
export const staffRoles = [
  "employee",
  "agency_manager",
  "stock_manager",
  "courier",
] as const;
export type StaffRole = (typeof staffRoles)[number];
export const agencyRole = (role: StaffRole) =>
  role === "employee" ? "agency_employee" : role;
export const restrictedCourierPermissions = (permissions: string[]) =>
  permissions.filter((p) =>
    [
      "workspace.access",
      "company.profile.read",
      "organization.self.read",
      "drivers.self.read",
      "agencies.read",
      "collections.self.read",
      "remittances.self.read",
      "remittances.declare",
      "financial.corrections.self.request",
      "financial.history.self.read",
    ].includes(p),
  );
