"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMachine } from "@xstate/react";
import useSWR from "swr";
import clsx from "clsx";
import { recorderMachine } from "../lib/state/recorderMachine";
import { useSocket } from "../lib/hooks/useSocket";
import { useMediaRecorder } from "../lib/hooks/useMediaRecorder";
import { API_BASE, statusBadgeMap } from "../lib/constants";
import type { SessionStatus, SessionRecord } from "../lib/types";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function Home() {
  const [state, send] = useMachine(recorderMachine);
  const [sessionTitle, setSessionTitle] = useState(
    () => `Session ${new Date().toLocaleDateString()}`
  );
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<SessionStatus | "IDLE">(
    "IDLE"
  );

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const chunkIndexRef = useRef(0);
  const activeSessionIdRef = useRef<string | null>(null);

  const {
    data: sessions,
    mutate: mutateSessions,
    isLoading,
  } = useSWR<SessionRecord[]>(`${API_BASE}/sessions`, fetcher, {
    refreshInterval: 8000,
  });

  const socketRef = useSocket({
    onStatusUpdate: (payload) => {
      if (payload.sessionId === activeSessionIdRef.current) {
        setServerStatus(payload.status);
      }
    },
    onTranscriptUpdate: (payload) => {
      if (payload.sessionId === activeSessionIdRef.current) {
        setTranscript((prev) => [...prev, payload.text]);
      }
    },
    onSummaryReady: (payload) => {
      if (payload.sessionId === activeSessionIdRef.current) {
        setSummary(payload.summary);
        send({ type: "COMPLETE" });
        setServerStatus("COMPLETED");
      }
    },
    onSummaryFailed: (payload) => {
      setBanner(`Summary failed: ${payload.error}`);
      send({ type: "ERROR" });
      setServerStatus("FAILED");
    },
    onSessionError: (payload) => {
      setBanner(payload.error);
      send({ type: "ERROR" });
    },
    onMutateSessions: mutateSessions,
  });

  const {
    startRecording: startMediaRecording,
    pauseRecording: pauseMediaRecording,
    resumeRecording: resumeMediaRecording,
    stopRecording: stopMediaRecording,
    cleanupMedia,
  } = useMediaRecorder({
    mediaRecorder: mediaRecorderRef,
    cleanup: cleanupRef,
    chunkIndex: chunkIndexRef,
    activeSessionId: activeSessionIdRef,
  });

  const resetState = useCallback(() => {
    setTranscript([]);
    setSummary(null);
    setActiveSessionId(null);
    activeSessionIdRef.current = null;
    setServerStatus("IDLE");
    send({ type: "RESET" });
  }, [send]);

  const startRecording = useCallback(async () => {
    if (state.matches("recording")) return;
    const socket = socketRef.current;
    if (!socket) {
      setBanner("Socket connection unavailable. Refresh?");
      return;
    }

    try {
      setBanner(null);
      setTranscript([]);
      setSummary(null);
      send({ type: "START" });
      setServerStatus("RECORDING");

      await startMediaRecording(socket, sessionTitle, (sessionId) => {
        setActiveSessionId(sessionId);
        activeSessionIdRef.current = sessionId;
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to start recording";
      setBanner(message);
      cleanupMedia();
      send({ type: "ERROR" });
    }
  }, [
    state,
    socketRef,
    startMediaRecording,
    sessionTitle,
    cleanupMedia,
    send,
  ]);

  const pauseRecording = useCallback(() => {
    pauseMediaRecording(socketRef.current);
    send({ type: "PAUSE" });
    setServerStatus("PAUSED");
  }, [pauseMediaRecording, socketRef, send]);

  const resumeRecording = useCallback(() => {
    resumeMediaRecording(socketRef.current);
    send({ type: "RESUME" });
    setServerStatus("RECORDING");
  }, [resumeMediaRecording, socketRef, send]);

  const stopRecording = useCallback(() => {
    stopMediaRecording(socketRef.current);
    send({ type: "STOP" });
    setServerStatus("PROCESSING");
  }, [stopMediaRecording, socketRef, send]);

  useEffect(() => {
    return () => {
      cleanupMedia();
    };
  }, [cleanupMedia]);

  const actionableSessions = useMemo<SessionRecord[]>(
    () => sessions ?? [],
    [sessions]
  );

  const statusLabel =
    serverStatus === "IDLE"
      ? state.value.toString()
      : `${serverStatus.charAt(0)}${serverStatus.toLowerCase().slice(1)}`;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-wide text-cyan-400">
            ScribeAI Pilot
          </p>
          <h1 className="text-4xl font-semibold">
            Real-time meeting transcription
          </h1>
          <p className="text-slate-300">
            Capture tab audio and mic input, stream to Gemini, and receive
            diarized transcripts with automatic summaries for every session.
          </p>
        </header>

        {banner && (
          <div className="rounded-lg border border-rose-400 bg-rose-500/20 px-4 py-3 text-sm text-rose-100">
            {banner} — try refreshing permissions or checking the backend logs.
          </div>
        )}

        <main className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="rounded-3xl bg-slate-900/80 p-6 lg:col-span-2">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label htmlFor="title" className="text-sm text-slate-400">
                  Session title
                </label>
                <input
                  id="title"
                  className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-400"
                  value={sessionTitle}
                  onChange={(event) => setSessionTitle(event.target.value)}
                  placeholder="e.g. GTM Weekly Sync"
                />
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <p className="text-sm uppercase text-slate-400">
                  Recorder status
                </p>
                <div className="mt-2 flex items-center gap-3 text-lg font-semibold">
                  <span
                    className={clsx("h-3 w-3 rounded-full", {
                      "bg-emerald-400 animate-pulse":
                        state.matches("recording"),
                      "bg-amber-400": state.matches("paused"),
                      "bg-indigo-400": state.matches("processing"),
                      "bg-slate-400":
                        state.matches("idle") || state.matches("completed"),
                      "bg-rose-500": state.matches("error"),
                    })}
                  />
                  {statusLabel}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <button
                  onClick={startRecording}
                  disabled={state.matches("recording")}
                  className="rounded-2xl bg-linear-to-r from-cyan-400 to-blue-500 px-4 py-3 font-semibold text-slate-900 transition disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Start
                </button>
                <button
                  onClick={pauseRecording}
                  disabled={!state.matches("recording")}
                  className="rounded-2xl border border-amber-400/60 px-4 py-3 font-semibold text-amber-200 transition disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Pause
                </button>
                <button
                  onClick={resumeRecording}
                  disabled={!state.matches("paused")}
                  className="rounded-2xl border border-emerald-400/60 px-4 py-3 font-semibold text-emerald-200 transition disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Resume
                </button>
                <button
                  onClick={stopRecording}
                  disabled={
                    !(state.matches("recording") || state.matches("paused"))
                  }
                  className="rounded-2xl bg-rose-500/80 px-4 py-3 font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Stop
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 p-4">
                <p className="text-sm uppercase text-slate-400">
                  Live transcript
                </p>
                <div className="mt-3 max-h-64 space-y-2 overflow-y-auto text-sm text-slate-200">
                  {transcript.length === 0 && (
                    <p className="text-slate-500">
                      Start recording to stream transcript updates.
                    </p>
                  )}
                  {transcript.map((line, index) => (
                    <p
                      key={index}
                      className="rounded-xl bg-slate-900/60 px-3 py-2"
                    >
                      {line}
                    </p>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-800 p-4">
                <p className="text-sm uppercase text-slate-400">AI summary</p>
                <div className="mt-3 text-sm text-slate-200">
                  {summary && summary.length > 0 ? (
                    <pre className="whitespace-pre-wrap font-sans">
                      {summary}
                    </pre>
                  ) : (
                    <p className="text-slate-500">
                      Stop the session to trigger Gemini powered summaries.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>

          <aside className="rounded-3xl bg-slate-900/80 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase text-slate-400">
                  Session history
                </p>
                <p className="text-xl font-semibold">Past runs</p>
              </div>
              <button
                className="text-sm text-cyan-300 underline decoration-dotted"
                onClick={() => mutateSessions()}
              >
                Refresh
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {isLoading && (
                <p className="text-sm text-slate-500">Loading sessions…</p>
              )}
              {!isLoading && actionableSessions.length === 0 && (
                <p className="text-sm text-slate-500">
                  No sessions yet. Start your first recording!
                </p>
              )}
              {actionableSessions.map((session) => (
                <article
                  key={session.id}
                  className="rounded-2xl border border-slate-800 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{session.title}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(session.createdAt).toLocaleString()} •{" "}
                        {session.mode.toUpperCase()}
                      </p>
                    </div>
                    <span
                      className={clsx(
                        "rounded-full px-3 py-1 text-xs font-semibold",
                        statusBadgeMap[session.status]
                      )}
                    >
                      {session.status.toLowerCase()}
                    </span>
                  </div>
                  {session.summary && (
                    <p className="mt-3 max-h-24 overflow-hidden text-ellipsis text-sm text-slate-300">
                      {session.summary}
                    </p>
                  )}
                  {!session.summary && session.segments.length > 0 && (
                    <p className="mt-3 max-h-24 overflow-hidden text-ellipsis text-sm text-slate-400">
                      Latest note: {session.segments.at(-1)?.text}
                    </p>
                  )}
                </article>
              ))}
            </div>

            {state.matches("completed") && (
              <button
                className="mt-6 w-full rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
                onClick={resetState}
              >
                Reset recorder
              </button>
            )}
          </aside>
        </main>
      </div>
    </div>
  );
}
