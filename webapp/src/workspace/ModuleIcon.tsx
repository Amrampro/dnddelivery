import {
  LayoutDashboard,
  Package,
  Truck,
  Layers,
  Box,
  Wallet,
  Repeat2,
  ChartNoAxesCombined,
  Bell,
  Settings2,
  Clock3,
  Building2,
  Store,
  UsersRound,
  CreditCard,
  ArrowDownLeft,
  ArrowUpRight,
  ClipboardList,
  CircleAlert,
  Plus,
  Route,
  UserRound,
  type LucideIcon,
} from "lucide-react";
const icons: Record<string, LucideIcon> = {
  grid: LayoutDashboard,
  package: Package,
  truck: Truck,
  layers: Layers,
  box: Box,
  wallet: Wallet,
  repeat: Repeat2,
  chart: ChartNoAxesCombined,
  bell: Bell,
  settings: Settings2,
  clock: Clock3,
  building: Building2,
  store: Store,
  users: UsersRound,
  "credit-card": CreditCard,
  "arrow-down": ArrowDownLeft,
  "arrow-up": ArrowUpRight,
  clipboard: ClipboardList,
  alert: CircleAlert,
  plus: Plus,
  route: Route,
  user: UserRound,
};
export function ModuleIcon({
  name,
  size = 19,
}: {
  name: string;
  size?: number;
}) {
  const Icon = icons[name] ?? LayoutDashboard;
  return <Icon size={size} strokeWidth={1.7} aria-hidden="true" />;
}
