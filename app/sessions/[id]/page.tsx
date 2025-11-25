"use client";

import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { API_BASE, statusBadgeMap } from "../../../lib/constants";
import { SessionRecord } from "../../../lib/types";
import clsx from "clsx";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params?.id as string;

  const { data: session, isLoading, error } = useSWR<SessionRecord>(
    sessionId ? `${API_BASE}/sessions/${sessionId}` : null,
    fetcher
  );

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600"></div>
          <p>Loading session details...</p>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">Session not found</h1>
          <p className="mt-2">The session you are looking for does not exist or could not be loaded.</p>
          <button
            onClick={() => router.push("/")}
            className="mt-6 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300"
          >
            Go back home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <button
          onClick={() => router.push("/")}
          className="mb-6 flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-blue-600"
        >
          ← Back to Dashboard
        </button>

        <header className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                {session.title}
              </h1>
              <span
                className={clsx(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
                  statusBadgeMap[session.status] || "bg-gray-100 text-gray-600 ring-gray-500/10"
                )}
              >
                {session.status}
              </span>
            </div>
            <p className="mt-2 text-slate-500">
              Recorded on {new Date(session.createdAt).toLocaleDateString(undefined, { dateStyle: "long" })} at {new Date(session.createdAt).toLocaleTimeString(undefined, { timeStyle: "short" })}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="uppercase tracking-wider text-xs font-semibold bg-slate-100 px-2 py-1 rounded text-slate-600">
              {session.mode} Mode
            </span>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Summary Section */}
          <div className="lg:col-span-1">
            <div className="sticky top-10 space-y-6">
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
                  <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  AI Summary
                </h2>
                {session.summary ? (
                  <div className="prose prose-sm prose-slate max-w-none">
                    <p className="whitespace-pre-wrap text-slate-600 leading-relaxed">
                      {session.summary}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">
                    <p>No summary available for this session.</p>
                  </div>
                )}
              </section>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-3">Details</h3>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Duration</dt>
                    <dd className="font-medium text-slate-900">
                      {session.segments.length > 0 
                         ? Math.ceil((new Date(session.updatedAt).getTime() - new Date(session.createdAt).getTime()) / 1000 / 60) + " mins"
                         : "N/A"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Segments</dt>
                    <dd className="font-medium text-slate-900">{session.segments.length}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">ID</dt>
                    <dd className="font-mono text-xs text-slate-400">{session.id}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>

          {/* Transcript Section */}
          <div className="lg:col-span-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-6 flex items-center gap-2 text-lg font-semibold text-slate-900">
                <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Full Transcript
              </h2>
              
              <div className="space-y-4">
                {session.segments.length === 0 ? (
                  <p className="text-center text-slate-500 italic py-10">No transcript segments recorded.</p>
                ) : (
                  session.segments.map((segment) => (
                    <div key={segment.id} className="flex gap-4 group hover:bg-slate-50 p-2 rounded-lg transition-colors -mx-2">
                      <div className="flex-none w-12 pt-1">
                        <span className="text-xs font-mono text-slate-400 group-hover:text-slate-500">
                          {new Date(segment.createdAt).toLocaleTimeString([], {minute: '2-digit', second: '2-digit'})}
                        </span>
                      </div>
                      <div className="flex-1">
                        <p className="text-slate-700 leading-relaxed">{segment.text}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

