import type { Profile, Workspace } from "./types";
import { ApiError } from "./transport";
function workspace(value: unknown): value is Workspace {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<Workspace>;
  return (
    typeof v.key === "string" &&
    typeof v.companyName === "string" &&
    typeof v.roleCode === "string" &&
    typeof v.roleName === "string" &&
    typeof v.portal === "string" &&
    ["GLOBAL", "COMPANY", "AGENCY", "SHOP"].includes(v.scope ?? "") &&
    Array.isArray(v.permissions) &&
    v.permissions.every((p) => typeof p === "string")
  );
}
export function parseProfile(value: unknown): Profile {
  const v = value as Partial<Profile> | null;
  if (
    !v?.user ||
    typeof v.user.id !== "string" ||
    typeof v.user.email !== "string" ||
    typeof v.user.fullName !== "string" ||
    !Array.isArray(v.organizations) ||
    !v.organizations.every(workspace) ||
    !(v.activeContext === null || workspace(v.activeContext))
  )
    throw new ApiError(
      502,
      "INVALID_PROFILE",
      "Vos accès n’ont pas pu être vérifiés. Rechargez votre session.",
    );
  return v as Profile;
}
export function parseWorkspace(value: unknown): Workspace {
  if (!workspace(value))
    throw new ApiError(
      502,
      "INVALID_WORKSPACE",
      "L’environnement retourné est invalide. Vérifiez vos affiliations.",
    );
  return value;
}
