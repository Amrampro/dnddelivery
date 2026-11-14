import nodemailer from "nodemailer";
import { z } from "zod";
import type { ResetMailer } from "./types.js";
const config = z
  .object({
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535),
    SMTP_FROM: z.email(),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_SECURE: z.enum(["true", "false"]).default("false"),
  })
  .refine(
    (v) => !!v.SMTP_USER === !!v.SMTP_PASSWORD,
    "Provide both SMTP user and password, or neither",
  );
export function smtpMailer(
  input: Record<string, unknown> = process.env,
): ResetMailer {
  const parsed = config.safeParse(input);
  return {
    available: () => parsed.success,
    send: async (to, links) => {
      if (!parsed.success) throw new Error("SMTP unavailable");
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
          subject: "R�initialiser votre mot de passe DND Delivery",
          text: `Vous avez demand� � r�initialiser votre mot de passe DND Delivery.\n\nDepuis le Web : ${links.web}\n\nSur un appareil mobile, ouvrez ce lien s�curis� dans votre navigateur : ${links.mobile}\n\nCe lien est personnel et temporaire. Si vous n'�tes pas � l'origine de cette demande, ignorez ce message.`,
        });
      } finally {
        transport.close();
      }
    },
  };
}

export function invitationMailer(input: Record<string, unknown> = process.env) {
  const parsed = config.safeParse(input);
  return {
    available: () => parsed.success,
    send: async (to: string, link: string, company: string) => {
      if (!parsed.success) throw new Error("SMTP unavailable");
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
          text: `Vous �tes invit� � rejoindre ${company} sur DND Delivery.\n\nAcceptez cette invitation depuis ce lien personnel et temporaire. Si vous poss�dez d�j� un compte, connectez-vous avec celui-ci; sinon d�finissez votre mot de passe :\n${link}\n\nAucun mot de passe ne vous sera envoy�. Si vous n'attendiez pas cette invitation, ignorez ce message.`,
        });
      } finally {
        transport.close();
      }
    },
  };
}

export function subscriptionMailer(
  input: Record<string, unknown> = process.env,
) {
  return {
    send: async (
      to: string,
      subject: string,
      text: string,
      messageId: string,
      html?: string,
    ) => {
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
        if (
          !result.accepted
            .map(String)
            .some((address) => address.toLowerCase() === to.toLowerCase())
        )
          throw new Error("SMTP recipient not accepted");
      } finally {
        transport.close();
      }
    },
  };
}
