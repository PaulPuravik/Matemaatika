"use client";

import { useActionState } from "react";
import { signIn } from "@/app/actions/auth";
import { buttonClass, ErrorText, inputClass, Label } from "@/components/ui";

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="email">E-post</Label>
        <input id="email" name="email" type="email" required className={inputClass} />
      </div>
      <div>
        <Label htmlFor="password">Parool</Label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className={inputClass}
        />
      </div>
      {state?.error && <ErrorText>{state.error}</ErrorText>}
      <button disabled={pending} className={`${buttonClass} w-full`}>
        {pending ? "Login sisse…" : "Logi sisse"}
      </button>
    </form>
  );
}
