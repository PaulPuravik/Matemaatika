"use client";

import { useActionState } from "react";
import { createParentInvite } from "@/app/actions/student";
import { buttonClass, ErrorText, inputClass, Label } from "@/components/ui";

export default function ParentAccess() {
  const [state, formAction, pending] = useActionState(createParentInvite, null);

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <Label htmlFor="parent_email">Vanema e-post</Label>
        <input
          id="parent_email"
          name="parent_email"
          type="email"
          placeholder="valikuline — saadame koodi otse"
          className={inputClass}
        />
      </div>
      {state?.error && <ErrorText>{state.error}</ErrorText>}
      <button disabled={pending} className={buttonClass}>
        {pending ? "Loon koodi…" : "Loo kutse kood"}
      </button>
    </form>
  );
}
