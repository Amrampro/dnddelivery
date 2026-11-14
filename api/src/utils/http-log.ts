import type { IncomingMessage, ServerResponse } from "node:http";

// Omit headers and queries: even rejected requests may contain credentials,
// capability links or recipient contact data.
export const httpLogSerializers = {
  req(req: IncomingMessage & { id?: unknown }) {
    return { id: req.id, method: req.method,
      url: (req.url ?? "").split(/[?#]/, 1)[0] };
  },
  res(res: ServerResponse) { return { statusCode: res.statusCode }; },
};
