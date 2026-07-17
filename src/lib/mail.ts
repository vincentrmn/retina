import nodemailer from "nodemailer";

/**
 * Envoi d'e-mails depuis la boîte Gmail de BBI (relance des candidats pour
 * compléter leur dossier). Identifiants dans l'environnement :
 *   BBI_GMAIL_USER          = adresse Gmail/Workspace BBI (expéditeur)
 *   BBI_GMAIL_APP_PASSWORD  = mot de passe d'application Google (16 car.)
 *   BBI_MAIL_FROM_NAME      = nom affiché (optionnel, défaut « Brouwers Bureau Immobilier »)
 * Sans identifiants configurés, l'envoi est désactivé (comme la clé Anthropic).
 */

export function mailConfigured(): boolean {
  return !!(process.env.BBI_GMAIL_USER && process.env.BBI_GMAIL_APP_PASSWORD);
}

export async function sendMail(opts: { to: string; subject: string; text: string }): Promise<void> {
  const user = process.env.BBI_GMAIL_USER;
  const pass = process.env.BBI_GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("Envoi d'e-mail non configuré (BBI_GMAIL_USER / BBI_GMAIL_APP_PASSWORD).");
  const fromName = process.env.BBI_MAIL_FROM_NAME || "Brouwers Bureau Immobilier";
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  await transport.sendMail({
    from: `"${fromName}" <${user}>`,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    replyTo: user,
  });
}
