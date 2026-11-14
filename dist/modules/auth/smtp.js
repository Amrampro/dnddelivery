import nodemailer from "nodemailer";
import { z } from "zod";
const config = z
    .object({
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535),
    SMTP_FROM: z.email(),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_SECURE: z.enum(["true", "false"]).default("false"),
})
    .refine((v) => !!v.SMTP_USER === !!v.SMTP_PASSWORD, "Provide both SMTP user and password, or neither");
export function smtpMailer(input = process.env) {
    const parsed = config.safeParse(input);
    return {
        available: () => parsed.success,
        send: async (to, links) => {
            if (!parsed.success)
                throw new Error("SMTP unavailable");
            const c = parsed.data;
            const transport = nodemailer.createTransport({
                host: c.SMTP_HOST,
                port: c.SMTP_PORT,
                secure: c.SMTP_SECURE === "true",
                requireTLS: input.NODE_ENV === "production" && c.SMTP_SECURE !== "true",
                ...(c.SMTP_USER
                    ? { auth: { user: c.SMTP_USER, pass: c.SMTP_PASSWORD } }
                    : {}),
                connectionTimeout: 5000,
                greetingTimeout: 5000,
                socketTimeout: 10000,
            });
            try {
                await transport.sendMail({
                    from: c.SMTP_FROM,
                    to,
                    subject: "Réinitialiser votre mot de passe DND Delivery",
                    text: `Vous avez demandé à réinitialiser votre mot de passe DND Delivery.\n\nDepuis le Web : ${links.web}\n\nSur un appareil mobile, ouvrez ce lien sécurisé dans votre navigateur : ${links.mobile}\n\nCe lien est personnel et temporaire. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.`,
                });
            }
            finally {
                transport.close();
            }
        },
    };
}
export function invitationMailer(input = process.env) {
    const parsed = config.safeParse(input);
    return {
        available: () => parsed.success,
        send: async (to, link, company) => {
            if (!parsed.success)
                throw new Error("SMTP unavailable");
            const c = parsed.data;
            const transport = nodemailer.createTransport({
                host: c.SMTP_HOST,
                port: c.SMTP_PORT,
                secure: c.SMTP_SECURE === "true",
                requireTLS: input.NODE_ENV === "production" && c.SMTP_SECURE !== "true",
                ...(c.SMTP_USER
                    ? { auth: { user: c.SMTP_USER, pass: c.SMTP_PASSWORD } }
                    : {}),
                connectionTimeout: 5000,
                greetingTimeout: 5000,
                socketTimeout: 10000,
            });
            try {
                await transport.sendMail({
                    from: c.SMTP_FROM,
                    to,
                    subject: "Invitation DND Delivery",
                    text: `Vous êtes invité à rejoindre ${company} sur DND Delivery.\n\nAcceptez cette invitation depuis ce lien personnel et temporaire. Si vous possédez déjà un compte, connectez-vous avec celui-ci; sinon définissez votre mot de passe :\n${link}\n\nAucun mot de passe ne vous sera envoyé. Si vous n’attendiez pas cette invitation, ignorez ce message.`,
                });
            }
            finally {
                transport.close();
            }
        },
    };
}
export function subscriptionMailer(input = process.env) {
    return {
        send: async (to, subject, text, messageId, html) => {
            const c = config.parse(input);
            const transport = nodemailer.createTransport({
                host: c.SMTP_HOST,
                port: c.SMTP_PORT,
                secure: c.SMTP_SECURE === "true",
                requireTLS: input.NODE_ENV === "production" && c.SMTP_SECURE !== "true",
                ...(c.SMTP_USER
                    ? { auth: { user: c.SMTP_USER, pass: c.SMTP_PASSWORD } }
                    : {}),
                connectionTimeout: 5000,
                greetingTimeout: 5000,
                socketTimeout: 10000,
            });
            try {
                const result = await transport.sendMail({
                    from: c.SMTP_FROM,
                    to,
                    subject,
                    text,
                    html,
                    messageId: `<${messageId}>`,
                });
                if (!result.accepted
                    .map(String)
                    .some((address) => address.toLowerCase() === to.toLowerCase()))
                    throw new Error("SMTP recipient not accepted");
            }
            finally {
                transport.close();
            }
        },
    };
}
