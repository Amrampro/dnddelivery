export interface TrackingSummary {
  reference: string;
  status: string;
  phase?: string | null;
  createdAt: string;
  updatedAt: string;
  refreshedAt: string;
  events: { id: string; label: string; createdAt: string }[];
  company?: string;
  shop?: string;
  otpAvailable?: boolean;
  confirmedAt?: string | null;
  failure?: string | null;
}
export interface CustomerOrders {
  items: {
    reference: string;
    status: string;
    createdAt: string;
    company: string;
    shop: string;
  }[];
  total: number;
  page: number;
}
export interface HandoverCode {
  code: string;
  expiresAt: string;
  instruction: string;
}
