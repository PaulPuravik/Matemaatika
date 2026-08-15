"use client";

import { useActionState } from "react";
import { createSession, updateSession } from "@/app/actions/admin";
import { buttonClass, ErrorText, inputClass, Label } from "@/components/ui";
import { toLocalInputValue } from "@/lib/format";
import type { Profile, TutorSession } from "@/lib/types";

/**
 * One form for both jobs: pass `students` to create a session, or `session`
 * to edit an existing one.
 */
export default function SessionForm({
  students,
  session,
}: {
  students?: Profile[];
  session?: TutorSession;
}) {
  const [state, formAction, pending] = useActionState(
    session ? updateSession : createSession,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      {session ? (
        <input type="hidden" name="id" value={session.id} />
      ) : (
        <div>
          <Label htmlFor="student_id">Õpilane</Label>
          <select id="student_id" name="student_id" required className={inputClass}>
            <option value="">Vali õpilane…</option>
            {students?.map((student) => (
              <option key={student.id} value={student.id}>
                {student.full_name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`when-${session?.id ?? "new"}`}>Aeg</Label>
          <input
            id={`when-${session?.id ?? "new"}`}
            name="scheduled_at"
            type="datetime-local"
            required
            defaultValue={
              session ? toLocalInputValue(session.scheduled_at) : undefined
            }
            className={inputClass}
          />
        </div>
        {session && (
          <div>
            <Label htmlFor={`status-${session.id}`}>Staatus</Label>
            <select
              id={`status-${session.id}`}
              name="status"
              defaultValue={session.status}
              className={inputClass}
            >
              <option value="upcoming">Tulemas</option>
              <option value="done">Toimunud</option>
            </select>
          </div>
        )}
      </div>

      {session && (
        <>
          <div>
            <Label htmlFor={`summary-${session.id}`}>
              Mida tegime (õpilane ja vanem näevad)
            </Label>
            <textarea
              id={`summary-${session.id}`}
              name="summary"
              rows={2}
              defaultValue={session.summary ?? ""}
              placeholder="nt kordasime logaritme, tegime kontrolltöö vead läbi"
              className={inputClass}
            />
          </div>
          <div>
            <Label htmlFor={`homework-${session.id}`}>
              Kodutöö (õpilane ja vanem näevad)
            </Label>
            <textarea
              id={`homework-${session.id}`}
              name="homework"
              rows={2}
              defaultValue={session.homework ?? ""}
              placeholder="nt lk 84 ülesanded 1-6"
              className={inputClass}
            />
          </div>
        </>
      )}

      <div>
        <Label htmlFor={`notes-${session?.id ?? "new"}`}>Minu märkmed (privaatsed)</Label>
        <textarea
          id={`notes-${session?.id ?? "new"}`}
          name="tutor_notes"
          rows={2}
          defaultValue={session?.tutor_notes ?? ""}
          className={inputClass}
        />
      </div>

      {state?.error && <ErrorText>{state.error}</ErrorText>}
      <div className="flex items-center gap-3">
        <button disabled={pending} className={buttonClass}>
          {pending ? "Salvestan…" : session ? "Salvesta" : "Loo tund"}
        </button>
        {state?.ok && <span className="text-sm text-emerald-700">Salvestatud.</span>}
      </div>
    </form>
  );
}
