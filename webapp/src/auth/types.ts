export interface Workspace {
  subscriptionAccess?: {
    valid: boolean;
    status: string;
    expiresAt: string | null;
  };
  key: string;
  scope: "GLOBAL" | "COMPANY" | "AGENCY" | "SHOP";
  companyId?: string;
  agencyId?: string;
  shopId?: string;
  companyName: string;
  agencyName?: string;
  shopName?: string;
  roleCode: string;
  roleName: string;
  permissions: string[];
  portal: string;
}
export interface Profile {
  user: {
    id: string;
    email: string;
    fullName: string;
    phone: string | null;
    customerEnabled?: boolean;
  };
  organizations: Workspace[];
  unavailableOrganizations?: {
    kind: "COMPANY" | "SHOP";
    name: string;
    status: "INACTIVE" | "SUSPENDED" | "ARCHIVED";
  }[];
  activeContext: Workspace | null;
  csrfToken: string | null;
}
export interface DeviceSession {
  id: string;
  deviceName: string;
  clientType: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
}
