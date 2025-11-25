import { useCallback, useRef } from "react";
import { Socket } from "socket.io-client";
import { MIME_TYPE, CHUNK_DURATION } from "../constants";
import { requestAudioStream, blobToBase64 } from "../utils/audio";

type MediaRecorderRefs = {
  mediaRecorder: React.MutableRefObject<MediaRecorder | null>;
  cleanup: React.MutableRefObject<(() => void) | null>;
  chunkIndex: React.MutableRefObject<number>;
  activeSessionId: React.MutableRefObject<string | null>;
};

export const useMediaRecorder = (refs: MediaRecorderRefs) => {
  const { mediaRecorder, cleanup, chunkIndex, activeSessionId } = refs;

  const cleanupMedia = useCallback(() => {
    cleanup.current?.();
    cleanup.current = null;
    mediaRecorder.current?.stream.getTracks().forEach((track) => track.stop());
    mediaRecorder.current = null;
  }, [cleanup, mediaRecorder]);

  const startRecording = useCallback(
    async (
      socket: Socket,
      sessionTitle: string,
      onSessionCreated: (sessionId: string) => void
    ) => {
      try {
        const { stream, cleanup: streamCleanup } = await requestAudioStream();
        cleanup.current = streamCleanup;

        const sessionId = await new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Timed out creating session"));
          }, 6000);

          const handleCreated = (payload: { sessionId: string }) => {
            clearTimeout(timeout);
            socket.off("session:error", handleError);
            resolve(payload.sessionId);
          };

          const handleError = (payload: { error: string }) => {
            clearTimeout(timeout);
            socket.off("session:created", handleCreated);
            reject(new Error(payload.error));
          };

          socket.once("session:created", handleCreated);
          socket.once("session:error", handleError);
          socket.emit("session:init", {
            title: sessionTitle.trim() || `Session ${new Date().toLocaleString()}`,
            mode: "tab",
          });
        });

        onSessionCreated(sessionId);
        activeSessionId.current = sessionId;
        chunkIndex.current = 0;

        const recorder = new MediaRecorder(stream, { mimeType: MIME_TYPE });
        mediaRecorder.current = recorder;

        recorder.ondataavailable = async (event: BlobEvent) => {
          if (!event.data.size || !activeSessionId.current) return;
          const audioBase64 = await blobToBase64(event.data);
          socket.emit("audio:chunk", {
            sessionId: activeSessionId.current,
            chunkIndex: chunkIndex.current++,
            mimeType: MIME_TYPE,
            audioBase64,
            durationMs: CHUNK_DURATION,
          });
        };

        recorder.onstop = () => {
          cleanupMedia();
        };

        recorder.start(CHUNK_DURATION);
      } catch (error) {
        cleanupMedia();
        throw error;
      }
    },
    [cleanup, mediaRecorder, activeSessionId, chunkIndex, cleanupMedia]
  );

  const pauseRecording = useCallback(
    (socket: Socket | null) => {
      if (!mediaRecorder.current || !activeSessionId.current) return;
      mediaRecorder.current.pause();
      socket?.emit("session:pause", {
        sessionId: activeSessionId.current,
      });
    },
    [mediaRecorder, activeSessionId]
  );

  const resumeRecording = useCallback(
    (socket: Socket | null) => {
      if (!mediaRecorder.current || !activeSessionId.current) return;
      mediaRecorder.current.resume();
      socket?.emit("session:resume", {
        sessionId: activeSessionId.current,
      });
    },
    [mediaRecorder, activeSessionId]
  );

  const stopRecording = useCallback(
    (socket: Socket | null) => {
      if (!mediaRecorder.current || !activeSessionId.current) return;
      mediaRecorder.current.stop();
      socket?.emit("session:stop", {
        sessionId: activeSessionId.current,
      });
    },
    [mediaRecorder, activeSessionId]
  );

  return {
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cleanupMedia,
  };
};

