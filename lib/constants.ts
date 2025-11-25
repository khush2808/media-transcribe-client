export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export const MIME_TYPE = "audio/webm;codecs=opus";
export const CHUNK_DURATION = 6000; // 6 seconds

export const statusBadgeMap: Record<
  "RECORDING" | "PAUSED" | "PROCESSING" | "COMPLETED" | "FAILED",
  string
> = {
  RECORDING: "bg-emerald-100 text-emerald-700",
  PAUSED: "bg-amber-100 text-amber-700",
  PROCESSING: "bg-indigo-100 text-indigo-700",
  COMPLETED: "bg-slate-100 text-slate-700",
  FAILED: "bg-rose-100 text-rose-700",
};

