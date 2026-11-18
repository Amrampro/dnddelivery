import { randomUUID } from "node:crypto";
import { appendFile, lstat, mkdir, readdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { assertPrivateDirectory, checkPrivateDirectory, } from "./private-storage.js";
import { z } from "zod";
const entrySchema = z.object({
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    action: z.enum([
        "API_STARTED",
        "API_STOPPING",
        "API_AVAILABLE",
        "API_UNAVAILABLE",
        "DEPENDENCIES_AVAILABLE",
        "DEPENDENCIES_UNAVAILABLE",
        "HTTP_SERVER_ERROR",
        "SECURITY_LOG_UNAVAILABLE",
        "JOB_COMPLETED",
        "JOB_PARTIAL_FAILURE",
        "JOB_FAILED",
        "BACKUP_COMPLETED",
        "BACKUP_FAILED",
        "RESTORE_VERIFIED",
        "RESTORE_FAILED",
    ]),
    result: z.enum(["SUCCESS", "FAILURE", "INFO"]),
    actorId: z.uuid().nullable(),
    entityId: z.string().max(250),
    requestId: z.string().max(100).optional(),
    method: z.string().max(20).optional(),
    status: z.number().int().min(100).max(599).optional(),
    errorType: z.string().regex(/^[a-zA-Z0-9_]{1,80}$/).optional(),
    errorCode: z.string().regex(/^[a-zA-Z0-9_]{1,40}$/).optional(),
});
const directory = () => path.resolve(process.env.TECHNICAL_LOG_DIR || "storage/technical-logs");
export async function technicalLog(input) {
    const folder = directory();
    assertPrivateDirectory(folder);
    await mkdir(folder, { recursive: true, mode: 0o700 });
    await checkPrivateDirectory(folder);
    const entry = {
        ...input,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
    };
    const file = path.join(folder, entry.createdAt.slice(0, 10) + ".jsonl");
    try {
        if (!(await lstat(file)).isFile())
            throw Error("Invalid log file");
    }
    catch (error) {
        if (error.code !== "ENOENT")
            throw error;
    }
    await appendFile(file, "\n" + JSON.stringify(entrySchema.parse(entry)) + "\n", {
        mode: 0o600,
    });
}
export async function technicalEntries(page, size, from, to, result, search = "") {
    const folder = directory();
    let files;
    try {
        await checkPrivateDirectory(folder);
        files = (await readdir(folder)).filter((file) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(file));
    }
    catch (error) {
        if (error.code === "ENOENT")
            return { items: [], total: 0 };
        throw error;
    }
    const items = [];
    let total = 0;
    for (const file of files.sort().reverse()) {
        if ((from && file.slice(0, 10) < from.slice(0, 10)) ||
            (to && file.slice(0, 10) > to.slice(0, 10)))
            continue;
        const fullPath = path.join(folder, file);
        if (!(await lstat(fullPath)).isFile())
            continue;
        const lines = createInterface({
            input: createReadStream(fullPath),
            crlfDelay: Infinity,
        });
        for await (const line of lines) {
            let entry;
            try {
                entry = entrySchema.parse(JSON.parse(line));
            }
            catch {
                continue;
            }
            if ((from && entry.createdAt < from) ||
                (to && entry.createdAt > to) ||
                (result && entry.result !== result) ||
                (search &&
                    !JSON.stringify(entry).toLowerCase().includes(search.toLowerCase())))
                continue;
            total++;
            items.push(entry);
            items.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
            if (items.length > page * size)
                items.pop();
        }
    }
    return { items: items.slice((page - 1) * size), total };
}
export function recordTechnical(input) {
    void technicalLog(input).catch(() => console.error("TechnicalLogWriteFailed"));
}
