import "dotenv/config";
import { z } from "zod";
import { assertSecureNode } from "./runtime.js";
assertSecureNode();
const schema = z.object({
    NODE_ENV: z
        .enum(["development", "test", "production"])
        .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(0),
    HOST: z.string().default("0.0.0.0"),
    CORS_ORIGINS: z
        .string()
        .default("http://localhost:5173")
        .transform((s) => s
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean))
        .refine((values) => values.every((v) => {
        try {
            return new URL(v).origin === v;
        }
        catch {
            return false;
        }
    }), "Expected comma-separated origins without trailing slashes"),
    LOG_LEVEL: z
        .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
        .default("info"),
});
export const env = schema.parse(process.env);
