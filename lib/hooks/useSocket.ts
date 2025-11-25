import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { API_BASE } from "../constants";
import type { SessionStatus } from "../types";

type SocketHandlers = {
  onStatusUpdate: (payload: { sessionId: string; status: SessionStatus }) => void;
  onTranscriptUpdate: (payload: { sessionId: string; text: string }) => void;
  onSummaryReady: (payload: { sessionId: string; summary: string }) => void;
  onSummaryFailed: (payload: { error: string }) => void;
  onSessionError: (payload: { error: string }) => void;
  onMutateSessions: () => void;
};

export const useSocket = (handlers: SocketHandlers) => {
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef(handlers);

  // Keep handlers ref updated
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    const socket = io(API_BASE, {
      transports: ["websocket"],
    });
    socketRef.current = socket;

    socket.on("session:status", (payload) => {
      handlersRef.current.onStatusUpdate(payload);
    });
    socket.on("transcript:update", (payload) => {
      handlersRef.current.onTranscriptUpdate(payload);
      handlersRef.current.onMutateSessions();
    });
    socket.on("summary:ready", (payload) => {
      handlersRef.current.onSummaryReady(payload);
      handlersRef.current.onMutateSessions();
    });
    socket.on("summary:failed", (payload) => {
      handlersRef.current.onSummaryFailed(payload);
    });
    socket.on("session:error", (payload) => {
      handlersRef.current.onSessionError(payload);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return socketRef;
};

