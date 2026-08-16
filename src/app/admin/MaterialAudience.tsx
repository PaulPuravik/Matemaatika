"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setMaterialAudience } from "@/app/actions/admin";
import type { Profile } from "@/lib/types";

/** Who a material is for. No one ticked means everyone. */
export default function MaterialAudience({
  materialId,
  students,
  selected,
  audience,
}: {
  materialId: string;
  students: Profile[];
  selected: string[];
  audience: "all" | "selected";
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>(audience === "all" ? [] : selected);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  const names =
    audience === "all"
      ? "kõigile"
      : students
          .filter((s) => selected.includes(s.id))
          .map((s) => s.full_name)
          .join(", ") || "mitte kellelegi";

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      await setMaterialAudience(materialId, chosen);
      setSaved(true);
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-sm">
      <button
        onClick={() => setOpen(!open)}
        className="text-slate-600 underline hover:text-slate-900"
      >
        Nähtav: {names}
      </button>
      {saved && <span className="ml-2 text-emerald-700">Salvestatud.</span>}

      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-slate-200 p-3">
          <p className="text-slate-600">
            Märgi õpilased. Kui ühtegi ei märgi, näevad kõik.
          </p>
          {students.map((student) => (
            <label key={student.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={chosen.includes(student.id)}
                onChange={(event) =>
                  setChosen((current) =>
                    event.target.checked
                      ? [...current, student.id]
                      : current.filter((id) => id !== student.id),
                  )
                }
                className="h-4 w-4"
              />
              {student.full_name}
            </label>
          ))}
          <button
            onClick={save}
            disabled={busy}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            {busy ? "Salvestan…" : "Salvesta"}
          </button>
        </div>
      )}
    </div>
  );
}
