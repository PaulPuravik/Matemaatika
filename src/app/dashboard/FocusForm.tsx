"use client";

import { useActionState } from "react";
import { saveFocus } from "@/app/actions/student";
import { buttonClass, ErrorText, inputClass } from "@/components/ui";

export default function FocusForm({
  sessionId,
  initialText,
}: {
  sessionId: string;
  initialText: string;
}) {
  const [state, formAction, pending] = useActionState(saveFocus, null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="session_id" value={sessionId} />
      <textarea
        name="focus_text"
        rows={4}
        defaultValue={initialText}
        placeholder="nt logaritmid, eelmise kontrolltöö vead, ülesanded lk 84"
        className={inputClass}
      />
      {state?.error && <ErrorText>{state.error}</ErrorText>}
      <div className="flex items-center gap-3">
        <button disabled={pending} className={buttonClass}>
          {pending ? "Salvestan…" : "Salvesta"}
        </button>
        {state?.ok && <span className="text-sm text-emerald-700">Salvestatud.</span>}
      </div>
    </form>
  );
}
