"use client";

import { useActionState, useRef } from "react";
import { addTest } from "@/app/actions/student";
import { buttonClass, ErrorText, inputClass, Label } from "@/components/ui";

export default function TestForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: Awaited<ReturnType<typeof addTest>>, formData: FormData) => {
      const result = await addTest(prev, formData);
      if (result?.ok) formRef.current?.reset();
      return result;
    },
    null,
  );

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="subject">Teema</Label>
          <input
            id="subject"
            name="subject"
            required
            placeholder="nt trigonomeetria"
            className={inputClass}
          />
        </div>
        <div>
          <Label htmlFor="test_date">Kuupäev</Label>
          <input
            id="test_date"
            name="test_date"
            type="date"
            required
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="notes">Märkused</Label>
        <input
          id="notes"
          name="notes"
          placeholder="valikuline"
          className={inputClass}
        />
      </div>
      {state?.error && <ErrorText>{state.error}</ErrorText>}
      <button disabled={pending} className={buttonClass}>
        {pending ? "Lisan…" : "Lisa kontrolltöö"}
      </button>
    </form>
  );
}
