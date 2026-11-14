import { apiUrl } from "../theme";
import {
  readCredentials,
  writeCredentials,
  deleteCredentials,
} from "./session-storage";
import { createTransport } from "./transport";
export { ApiError } from "./transport";
const transport = createTransport({
  baseUrl: apiUrl,
  storage: {
    read: readCredentials,
    write: writeCredentials,
    remove: deleteCredentials,
  },
});
export const {
  api,
  onSessionInvalid,
  restoreCredentials,
  forgetSession,
  login,
  switchContext,
  assertCanSwitchContext,
} = transport;
export async function logout() {
  const { disablePushDevice } = await import("../confirmation/push-device");
  await disablePushDevice();
  await transport.logout();
}
