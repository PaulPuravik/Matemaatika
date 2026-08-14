import "server-only";

import { Resend } from "resend";

/**
 * Transactional email via Resend. Never import this from a client component —
 * RESEND_API_KEY must stay server-side.
 *
 * Sending is best-effort: a mail failure should never break the student's
 * upload or note, so callers get a boolean instead of an exception.
 */
async function send(to: string, subject: string, lines: string[]): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    console.warn("Resend is not configured; skipping email:", subject);
    return false;
  }

  try {
    const { error } = await new Resend(apiKey).emails.send({
      from,
      to,
      subject,
      text: lines.join("\n"),
    });
    if (error) {
      console.error("Resend error:", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Failed to send email:", error);
    return false;
  }
}

/** Notifies the tutor, with a link straight to the admin view. */
export async function notifyTutor(subject: string, lines: string[]): Promise<boolean> {
  const to = process.env.TUTOR_NOTIFICATION_EMAIL;
  if (!to) {
    console.warn("TUTOR_NOTIFICATION_EMAIL is not set; skipping:", subject);
    return false;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  return send(to, subject, [
    ...lines,
    ...(siteUrl ? ["", `Vaata: ${siteUrl}/admin`] : []),
  ]);
}

/** Notifies a student, e.g. when the tutor schedules or moves their session. */
export async function notifyStudent(
  to: string,
  subject: string,
  lines: string[],
): Promise<boolean> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  return send(to, subject, [
    ...lines,
    ...(siteUrl ? ["", `Vaata: ${siteUrl}/dashboard`] : []),
  ]);
}
