import { Prisma } from "../generated/prisma/client.js";
export async function serializable(db, work) {
    for (let attempt = 0;; attempt++) {
        try {
            return await db.$transaction(work, {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
                maxWait: 5000,
                timeout: 10000,
            });
        }
        catch (error) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError) ||
                error.code !== "P2034" ||
                attempt >= 2)
                throw error;
        }
    }
}
