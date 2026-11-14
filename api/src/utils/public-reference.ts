import { randomBytes } from "node:crypto";
export const createPublicOrderNumber = () =>
  `DND-${randomBytes(18).toString("base64url")}`;
