"use client";

import { useActionState, useState } from "react";
import { signUp } from "@/app/actions/auth";
import { buttonClass, ErrorText, inputClass, Label } from "@/components/ui";

export default function SignupForm() {
  const [mode, setMode] = useState<"student" | "parent">("student");
  const [state, formAction, pending] = useActionState(signUp, null);

  const tab = (value: "student" | "parent", label: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={
        "flex-1 rounded-lg px-3 py-2 text-sm font-medium " +
        (mode === value
          ? "bg-slate-900 text-white"
          : "bg-white text-slate-600 hover:text-slate-900")
      }
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
        {tab("student", "Olen õpilane")}
        {tab("parent", "Olen lapsevanem")}
      </div>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="mode" value={mode} />

        <div>
          <Label htmlFor="full_name">Nimi</Label>
          <input id="full_name" name="full_name" required className={inputClass} />
        </div>

        {mode === "student" ? (
          <>
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
              <Label htmlFor="school">Kool</Label>
              <input
                id="school"
                name="school"
                placeholder="nt Tallinna Reaalkool"
                className={inputClass}
              />
            </div>
          </>
        ) : (
          <div>
            <Label htmlFor="invite_code">Kutse kood</Label>
            <input
              id="invite_code"
              name="invite_code"
              required
              placeholder="nt K7QF2M9B"
              className={`${inputClass} uppercase tracking-widest`}
            />
            <p className="mt-1 text-sm text-slate-500">
              Koodi saab sulle saata ainult sinu laps oma kontolt.
            </p>
          </div>
        )}

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
    </div>
  );
}
