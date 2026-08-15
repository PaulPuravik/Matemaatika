"use client";

import { useActionState, useRef } from "react";
import { addGrade } from "@/app/actions/student";
import { buttonClass, ErrorText, inputClass, Label } from "@/components/ui";

export default function GradeForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: Awaited<ReturnType<typeof addGrade>>, formData: FormData) => {
      const result = await addGrade(prev, formData);
      if (result?.ok) formRef.current?.reset();
      return result;
    },
    null,
  );

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="grade-subject">Aine või teema</Label>
          <input
            id="grade-subject"
            name="subject"
            placeholder="nt logaritmid"
            className={inputClass}
          />
        </div>
        <div>
          <Label htmlFor="grade-mark">Hinne</Label>
          <input
            id="grade-mark"
            name="mark"
            placeholder="nt 4"
            className={inputClass}
          />
        </div>
        <div>
          <Label htmlFor="grade-date">Kuupäev</Label>
          <input
            id="grade-date"
            name="received_on"
            type="date"
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="grade-notes">Märkused</Label>
        <input
          id="grade-notes"
          name="notes"
          placeholder="valikuline"
          className={inputClass}
        />
      </div>
      {state?.error && <ErrorText>{state.error}</ErrorText>}
      <button disabled={pending} className={buttonClass}>
        {pending ? "Lisan…" : "Lisa hinne"}
      </button>
    </form>
  );
}
