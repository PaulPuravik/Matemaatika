"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { syncCalendar, type SyncReport } from "@/app/actions/admin";
import { buttonClass, ErrorText } from "@/components/ui";

/** Pulls lessons from Google Calendar on demand and reports what it did. */
export default function CalendarSync() {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<SyncReport | null>(null);
  const router = useRouter();

  async function run() {
    setBusy(true);
    setReport(null);
    try {
      const result = await syncCalendar();
      setReport(result);
      if (!result.error) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const nothingHappened =
    report && !report.error && !report.created && !report.updated && !report.skipped?.length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Loeb sinu kalendrist tunnid, mille pealkirjas või kirjelduses on
        märksõna ja õpilase nimi. Kalendri märkus läheb sinu privaatsetesse
        märkmetesse — õpilane seda ei näe.
      </p>

      <button onClick={run} disabled={busy} className={buttonClass}>
        {busy ? "Loen kalendrit…" : "Sünkroniseeri kalendrist"}
      </button>

      {report?.error && <ErrorText>{report.error}</ErrorText>}

      {report && !report.error && (
        <div className="space-y-2">
          <p className="text-sm text-emerald-700">
            {nothingHappened
              ? "Uusi tunde ei leidnud."
              : `Lisatud ${report.created ?? 0}, uuendatud ${report.updated ?? 0}.`}
          </p>

          {report.skipped && report.skipped.length > 0 && (
            <div className="rounded-lg bg-amber-50 px-3 py-2">
              <p className="text-sm font-medium text-amber-900">
                Need jäid lisamata:
              </p>
              <ul className="mt-1 space-y-0.5">
                {report.skipped.map((line) => (
                  <li key={line} className="text-sm text-amber-900">
                    {line}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-amber-800">
                Lisa õpilase juurde kalendri nimi või kirjuta kalendrisse tema
                täisnimi.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
