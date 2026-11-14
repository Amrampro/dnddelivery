import { useApiData } from "../auth/useApiData";
export function useDeliveryData<T>(url: string | null) {
  return useApiData<T>(url, 30000);
}
