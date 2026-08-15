"use client";

import { useActionState } from "react";
import { joinAsParent } from "@/app/actions/auth";
import { buttonClass, ErrorText, inputClass, Label } from "@/components/ui";

export default function JoinForm({ initialError }: { initialError?: string }) {
  const [state, formAction, pending] = useActionState(joinAsParent, null);
  const error = state?.error ?? initialError;

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="code">Kutse kood</Label>
        <input
          id="code"
          name="code"
          required
          autoFocus
          placeholder="nt K7QF2M9B"
          className={`${inputClass} uppercase tracking-widest`}
        />
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      <button disabled={pending} className={`${buttonClass} w-full`}>
        {pending ? "Seon…" : "Seo konto"}
      </button>
    </form>
  );
}
