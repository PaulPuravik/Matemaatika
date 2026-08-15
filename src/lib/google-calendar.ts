import "server-only";

import { JWT } from "google-auth-library";
import type { CalendarEvent } from "@/lib/calendar";
import { normalizePrivateKey } from "@/lib/pem";

/**
 * Reads the tutor's Google Calendar with a service account.
 *
 * A service account avoids the OAuth dance entirely: there is no consent
 * screen, no callback route, no refresh token to keep alive (Google expires
 * those after 7 days while an app sits in "Testing"). The tutor shares their
 * calendar with the service account's address once, read-only, and that is it.
 */
export function isCalendarConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY &&
      process.env.GOOGLE_CALENDAR_ID,
  );
}

function client(): JWT {
  return new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY),
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  });
}

export type FetchResult =
  | { ok: true; events: CalendarEvent[] }
  | { ok: false; error: string };

/**
 * Events between `daysBack` ago and `daysAhead` from now.
 *
 * singleEvents=true makes Google expand a repeating lesson into its individual
 * occurrences, so a weekly slot arrives as one event per week and no recurrence
 * rules have to be interpreted here.
 */
export async function fetchEvents(
  daysBack = 14,
  daysAhead = 60,
): Promise<FetchResult> {
  if (!isCalendarConfigured()) {
    return { ok: false, error: "Google Kalender pole seadistatud." };
  }

  const calendarId = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID!);
  const timeMin = new Date(Date.now() - daysBack * 86400000).toISOString();
  const timeMax = new Date(Date.now() + daysAhead * 86400000).toISOString();

  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events` +
    `?singleEvents=true&orderBy=startTime&maxResults=250` +
    `&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;

  try {
    const response = await client().request<{
      items?: Array<{
        id: string;
        status?: string;
        summary?: string;
        description?: string;
        start?: { dateTime?: string; date?: string };
      }>;
    }>({ url });

    const events: CalendarEvent[] = (response.data.items ?? [])
      .filter((item) => item.status !== "cancelled")
      // All-day entries carry no time, so they cannot become a lesson slot.
      .filter((item) => Boolean(item.start?.dateTime))
      .map((item) => ({
        id: item.id,
        summary: item.summary ?? "",
        description: item.description ?? "",
        start: new Date(item.start!.dateTime!).toISOString(),
      }));

    return { ok: true, events };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Google Calendar fetch failed:", message);

    if (message.includes("404")) {
      return {
        ok: false,
        error:
          "Kalendrit ei leitud. Kontrolli GOOGLE_CALENDAR_ID ja seda, " +
          "kas kalender on teenusekontoga jagatud.",
      };
    }
    if (message.includes("403")) {
      return {
        ok: false,
        error: "Google keeldus ligipääsust. Kas Calendar API on projektis sisse lülitatud?",
      };
    }
    if (message.includes("DECODER") || message.includes("PEM")) {
      return {
        ok: false,
        error:
          "GOOGLE_PRIVATE_KEY ei ole loetav võti. Kopeeri JSON-ist private_key " +
          "väärtus ilma väliste jutumärkideta ja veendu, et algus on " +
          "-----BEGIN PRIVATE KEY-----.",
      };
    }
    if (message.toLowerCase().includes("invalid_grant")) {
      return {
        ok: false,
        error:
          "Google ei aktsepteerinud võtit. Kas teenusekonto on kustutatud või " +
          "võti tühistatud?",
      };
    }
    return { ok: false, error: `Kalendri lugemine ebaõnnestus: ${message}` };
  }
}
