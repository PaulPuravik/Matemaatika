"use client";

import { useActionState, useRef, useState } from "react";
import { askQuestion } from "@/app/actions/student";
import { buttonClass, ErrorText, inputClass, Label } from "@/components/ui";
import type { Region } from "@/lib/types";

export type Askable = {
  id: string;
  kind: "file" | "material";
  label: string;
  url: string | null;
  isImage: boolean;
};

/**
 * Ask about one file. When it is an image, dragging on it marks the exact spot
 * the question is about — which is the whole point: "siin ma ei saa aru" is far
 * easier to point at than to describe.
 */
export default function AskQuestion({ items }: { items: Askable[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [selectedId, setSelectedId] = useState<string>(items[0]?.id ?? "");
  const [region, setRegion] = useState<Region | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);

  const [state, formAction, pending] = useActionState(
    async (prev: Awaited<ReturnType<typeof askQuestion>>, formData: FormData) => {
      const result = await askQuestion(prev, formData);
      if (result?.ok) {
        formRef.current?.reset();
        setRegion(null);
      }
      return result;
    },
    null,
  );

  const selected = items.find((item) => item.id === selectedId) ?? null;

  const pointFrom = (event: React.PointerEvent) => {
    const box = imageRef.current?.getBoundingClientRect();
    if (!box) return null;
    return {
      x: Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1),
      y: Math.min(Math.max((event.clientY - box.top) / box.height, 0), 1),
    };
  };

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      {selected?.kind === "file" && <input type="hidden" name="file_id" value={selected.id} />}
      {selected?.kind === "material" && (
        <input type="hidden" name="material_id" value={selected.id} />
      )}
      <input type="hidden" name="region" value={region ? JSON.stringify(region) : ""} />

      {items.length > 0 && (
        <div>
          <Label htmlFor="ask-file">Mille kohta?</Label>
          <select
            id="ask-file"
            value={selectedId}
            onChange={(event) => {
              setSelectedId(event.target.value);
              setRegion(null);
            }}
            className={inputClass}
          >
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {selected?.isImage && selected.url && (
        <div className="space-y-1">
          <p className="text-sm text-slate-600">
            Tõmba pildil ala, mille kohta küsid.{" "}
            {region && (
              <button
                type="button"
                onClick={() => setRegion(null)}
                className="underline hover:text-slate-900"
              >
                Eemalda märgistus
              </button>
            )}
          </p>
          <div
            className="relative inline-block max-w-full touch-none select-none overflow-hidden rounded-lg border border-slate-200"
            onPointerDown={(event) => {
              const point = pointFrom(event);
              if (!point) return;
              (event.target as Element).setPointerCapture?.(event.pointerId);
              setDrag(point);
              setRegion({ x: point.x, y: point.y, w: 0, h: 0 });
            }}
            onPointerMove={(event) => {
              if (!drag) return;
              const point = pointFrom(event);
              if (!point) return;
              setRegion({
                x: Math.min(drag.x, point.x),
                y: Math.min(drag.y, point.y),
                w: Math.abs(point.x - drag.x),
                h: Math.abs(point.y - drag.y),
              });
            }}
            onPointerUp={() => {
              setDrag(null);
              // A tap rather than a drag should not leave an invisible marker.
              setRegion((current) =>
                current && current.w > 0.01 && current.h > 0.01 ? current : null,
              );
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              src={selected.url}
              alt={selected.label}
              draggable={false}
              className="block max-h-96 w-auto max-w-full"
            />
            {region && (
              <span
                aria-hidden
                className="pointer-events-none absolute border-2 border-amber-500 bg-amber-400/20"
                style={{
                  left: `${region.x * 100}%`,
                  top: `${region.y * 100}%`,
                  width: `${region.w * 100}%`,
                  height: `${region.h * 100}%`,
                }}
              />
            )}
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="ask-body">Küsimus</Label>
        <textarea
          id="ask-body"
          name="body"
          rows={3}
          placeholder="nt siin ma ei saa aru, kuhu ruutjuur kadus"
          className={inputClass}
        />
      </div>

      {state?.error && <ErrorText>{state.error}</ErrorText>}
      <div className="flex items-center gap-3">
        <button disabled={pending} className={buttonClass}>
          {pending ? "Saadan…" : "Küsi õpetajalt"}
        </button>
        {state?.ok && <span className="text-sm text-emerald-700">Küsimus saadetud.</span>}
      </div>
    </form>
  );
}
