export type SessionStatus =
  | "RECORDING"
  | "PAUSED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export type TranscriptSegment = {
  id: string;
  chunkIndex: number;
  text: string;
  createdAt: string;
};

export type SessionRecord = {
  id: string;
  title: string;
  mode: string;
  status: SessionStatus;
  summaryStatus: "IDLE" | "RUNNING" | "READY" | "FAILED";
  summary?: string | null;
  createdAt: string;
  updatedAt: string;
  segments: TranscriptSegment[];
};

