"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMachine } from "@xstate/react";
import useSWR from "swr";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { recorderMachine } from "../lib/state/recorderMachine";
import { useSocket } from "../lib/hooks/useSocket";
import { useMediaRecorder } from "../lib/hooks/useMediaRecorder";
import { API_BASE, statusBadgeMap } from "../lib/constants";
import type { SessionStatus, SessionRecord } from "../lib/types";

// --- Icons ---
const MicIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
);
const PlayIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const PauseIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const StopIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
  </svg>
);
const FileTextIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);
const SparklesIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function Home() {
  const router = useRouter();
  const [state, send] = useMachine(recorderMachine);
  const [sessionTitle, setSessionTitle] = useState(
    () => `Meeting ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`
  );
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<SessionStatus | "IDLE">("IDLE");

  const activeSessionIdRef = useRef<string | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const {
    data: sessions,
    mutate: mutateSessions,
    isLoading,
  } = useSWR<SessionRecord[]>(`${API_BASE}/sessions`, fetcher, {
    refreshInterval: 8000,
  });

  // Scroll to bottom of transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

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
  } = useMediaRecorder();

  const resetState = useCallback(() => {
    setTranscript([]);
    setSummary(null);
    setActiveSessionId(null);
    activeSessionIdRef.current = null;
    setServerStatus("IDLE");
    send({ type: "RESET" });
    setBanner(null);
    setSessionTitle(`Meeting ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`);
  }, [send]);

  const stopRecording = useCallback(() => {
    stopMediaRecording(socketRef.current);
    send({ type: "STOP" });
    setServerStatus("PROCESSING");
  }, [stopMediaRecording, socketRef, send]);

  const startRecording = useCallback(async () => {
    if (state.matches("recording") || state.matches("paused")) return;
    const socket = socketRef.current;
    if (!socket) {
      setBanner("Socket connection unavailable. Please refresh.");
      return;
    }

    if (state.matches("error") || state.matches("completed")) {
      resetState();
    }

    try {
      setBanner(null);
      setTranscript([]);
      setSummary(null);
      send({ type: "START" });
      setServerStatus("RECORDING");

      await startMediaRecording(
        socket,
        sessionTitle,
        (sessionId) => {
          setActiveSessionId(sessionId);
          activeSessionIdRef.current = sessionId;
        },
        () => {
          if (state.matches("recording") || state.matches("paused")) {
            stopRecording();
          }
        }
      );
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
    stopRecording,
    resetState,
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

  useEffect(() => {
    return () => {
      cleanupMedia();
    };
  }, [cleanupMedia]);

  const actionableSessions = useMemo<SessionRecord[]>(() => {
    if (!sessions || !Array.isArray(sessions)) return [];
    return sessions;
  }, [sessions]);

  const getStatusColor = (status: string) => {
    if (status === "RECORDING") return "bg-red-500 animate-pulse";
    if (status === "PAUSED") return "bg-amber-500";
    if (status === "PROCESSING") return "bg-indigo-500 animate-bounce";
    return "bg-slate-300";
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Navbar */}
      <nav className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            
            <span className="font-bold text-xl text-slate-800 tracking-tight">ScribeAI</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200">
              <div className={clsx("w-2 h-2 rounded-full", getStatusColor(serverStatus))} />
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                {serverStatus === "IDLE" ? "Ready" : serverStatus}
              </span>
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {banner && (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {banner}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Recorder & Live Output */}
          <div className="lg:col-span-8 space-y-6">
            {/* Recorder Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex-1">
                  <label htmlFor="title" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Session Title
                  </label>
                  <input
                    id="title"
                    type="text"
                    value={sessionTitle}
                    onChange={(e) => setSessionTitle(e.target.value)}
                    className="w-full text-lg font-medium text-slate-900 placeholder-slate-400 border-0 border-b-2 border-slate-100 focus:border-blue-500 focus:ring-0 px-0 py-1 transition-colors bg-transparent"
                    placeholder="Enter meeting title..."
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                {!state.matches("recording") && !state.matches("paused") ? (
                  <button
                    onClick={startRecording}
                    disabled={state.matches("processing")}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                  >
                    <MicIcon className="w-5 h-5" />
                    Start Recording
                  </button>
                ) : (
                  <>
                    <button
                      onClick={stopRecording}
                      className="flex items-center gap-2 px-6 py-3 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl font-medium transition-all"
                    >
                      <StopIcon className="w-5 h-5" />
                      Stop
                    </button>
                    {state.matches("paused") ? (
                      <button
                        onClick={resumeRecording}
                        className="flex items-center gap-2 px-6 py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-xl font-medium transition-all"
                      >
                        <PlayIcon className="w-5 h-5" />
                        Resume
                      </button>
                    ) : (
                      <button
                        onClick={pauseRecording}
                        className="flex items-center gap-2 px-6 py-3 bg-amber-50 hover:bg-amber-100 text-amber-600 border border-amber-200 rounded-xl font-medium transition-all"
                      >
                        <PauseIcon className="w-5 h-5" />
                        Pause
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Live Output */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Transcript */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[500px]">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-2xl">
                  <div className="flex items-center gap-2 text-slate-700 font-medium">
                    <FileTextIcon className="w-4 h-4" />
                    <h3>Live Transcript</h3>
                  </div>
                  {state.matches("recording") && (
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                    </span>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {transcript.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm text-center px-4">
                      <MicIcon className="w-8 h-8 mb-2 opacity-20" />
                      <p>Ready to transcribe. Start recording to see live text.</p>
                    </div>
                  ) : (
                    transcript.map((text, i) => (
                      <div key={i} className="text-slate-700 text-sm leading-relaxed p-2 rounded-lg hover:bg-slate-50 transition-colors">
                        {text}
                      </div>
                    ))
                  )}
                  <div ref={transcriptEndRef} />
                </div>
              </div>

              {/* Summary */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[500px]">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-2xl">
                  <div className="flex items-center gap-2 text-slate-700 font-medium">
                    <SparklesIcon className="w-4 h-4 text-indigo-500" />
                    <h3>AI Summary</h3>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {summary ? (
                     <div className="prose prose-sm prose-slate max-w-none">
                       <div className="whitespace-pre-wrap text-slate-600 leading-relaxed text-sm">
                         {summary}
                       </div>
                     </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm text-center px-4">
                      <SparklesIcon className="w-8 h-8 mb-2 opacity-20" />
                      <p>Summary will be generated automatically when the session ends.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: History */}
          <div className="lg:col-span-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[calc(100vh-8rem)] sticky top-24">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">Recent Sessions</h3>
                <button 
                  onClick={() => mutateSessions()}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                >
                  Refresh
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {isLoading ? (
                  <div className="p-4 text-center text-sm text-slate-500">Loading history...</div>
                ) : actionableSessions.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    No sessions yet.
                  </div>
                ) : (
                  actionableSessions.map((session) => (
                    <div 
                      key={session.id}
                      onClick={() => router.push(`/sessions/${session.id}`)}
                      className="group p-3 rounded-xl border border-transparent hover:border-slate-200 hover:bg-slate-50 cursor-pointer transition-all"
                    >
                      <div className="flex items-start justify-between mb-1">
                        <h4 className="font-medium text-slate-900 text-sm line-clamp-1 group-hover:text-blue-600 transition-colors">
                          {session.title}
                        </h4>
                        <span className={clsx("text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide", statusBadgeMap[session.status])}>
                           {session.status === 'COMPLETED' ? 'Done' : session.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mb-2">
                        {new Date(session.createdAt).toLocaleDateString()} • {session.mode}
                      </div>
                      {session.summary ? (
                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                          {session.summary}
                        </p>
                      ) : (
                         <p className="text-xs text-slate-400 italic">
                           {session.segments.length > 0 ? "No summary generated." : "No content."}
                         </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
