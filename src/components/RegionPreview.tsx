import type { Region } from "@/lib/types";

/** Shows the image with the box the student drew on it. */
export default function RegionPreview({
  url,
  region,
  alt,
}: {
  url: string;
  region: Region;
  alt: string;
}) {
  return (
    <div className="relative mt-3 inline-block max-w-full overflow-hidden rounded-lg border border-slate-200">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className="block max-h-96 w-auto max-w-full" />
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
    </div>
  );
}
