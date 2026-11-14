import {
  navigation as commonNavigation,
  type Context,
  type Module,
} from "../../../shared/workspace";
export { definition } from "../../../shared/workspace";
export const adminModuleIds = [
  "accueil",
  "entreprises",
  "utilisateurs",
  "invitations",
  "activite",
];
/** Global invitations are a Web-only administration module. No native business screen is added. */
export function navigation(context: Context): Module[] {
  const modules = commonNavigation(context);
  return context.portal === "super-admin" &&
    context.scope === "GLOBAL" &&
    context.permissions.includes("platform.manage") &&
    context.permissions.includes("workspace.access")
    ? [
        ...modules,
        {
          id: "invitations",
          label: "Invitations",
          permission: "platform.manage",
          icon: "users",
          description: "Invitations des administrateurs d’entreprise.",
        },
      ]
    : modules;
}
export function moduleAccess(context: Context, id: string) {
  return navigation(context).find((m) => m.id === id);
}
