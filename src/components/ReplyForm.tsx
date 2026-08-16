"use client";

import { useActionState, useRef } from "react";
import { replyToQuestion } from "@/app/actions/student";
import { answerQuestion } from "@/app/actions/admin";
import { buttonClass, ErrorText, inputClass } from "@/components/ui";

export default function ReplyForm({
  questionId,
  asTutor,
}: {
  questionId: string;
  asTutor: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const action = asTutor ? answerQuestion : replyToQuestion;

  const [state, formAction, pending] = useActionState(
    async (prev: Awaited<ReturnType<typeof action>>, formData: FormData) => {
      const result = await action(prev, formData);
      if (result?.ok) formRef.current?.reset();
      return result;
    },
    null,
  );

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="question_id" value={questionId} />
      <textarea
        name="body"
        rows={2}
        placeholder={asTutor ? "Vastus õpilasele…" : "Lisa täpsustus…"}
        className={inputClass}
      />
      {state?.error && <ErrorText>{state.error}</ErrorText>}
      <button disabled={pending} className={buttonClass}>
        {pending ? "Saadan…" : asTutor ? "Vasta" : "Lisa kommentaar"}
      </button>
    </form>
  );
}
