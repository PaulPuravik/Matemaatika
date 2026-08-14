"use client";

import { useActionState } from "react";
import { signUp } from "@/app/actions/auth";
import { buttonClass, ErrorText, inputClass, Label } from "@/components/ui";

export default function SignupForm() {
  const [state, formAction, pending] = useActionState(signUp, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="full_name">Nimi</Label>
        <input id="full_name" name="full_name" required className={inputClass} />
      </div>
      <div>
        <Label htmlFor="grade">Klass</Label>
        <input
          id="grade"
          name="grade"
          placeholder="nt 11. klass"
          className={inputClass}
        />
      </div>
      <div>
        <Label htmlFor="textbook">Matemaatika õpik</Label>
        <input
          id="textbook"
          name="textbook"
          placeholder="nt Avita 11. klass, kitsas matemaatika"
          className={inputClass}
        />
      </div>
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
          minLength={8}
          className={inputClass}
        />
      </div>
      {state?.error && <ErrorText>{state.error}</ErrorText>}
      <button disabled={pending} className={`${buttonClass} w-full`}>
        {pending ? "Loon kontot…" : "Loo konto"}
      </button>
    </form>
  );
}
