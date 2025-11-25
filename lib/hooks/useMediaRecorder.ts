import { useCallback, useRef } from "react";
import { Socket } from "socket.io-client";
import { MIME_TYPE, CHUNK_DURATION } from "../constants";
import { requestAudioStream, blobToBase64 } from "../utils/audio";

export const useMediaRecorder = () => {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const activeSessionId = useRef<string | null>(null);
  const chunkIndexRef = useRef(0);
  const loopTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldRecordRef = useRef(false);

  const stopLoop = useCallback(() => {
    if (loopTimeoutRef.current) {
      clearTimeout(loopTimeoutRef.current);
      loopTimeoutRef.current = null;
    }
  }, []);

  const cleanupMedia = useCallback(() => {
    stopLoop();
    shouldRecordRef.current = false;
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current = null;
    }
  }, [stopLoop]);

  const stopRecording = useCallback(
    (socket: Socket | null) => {
      stopLoop();
      shouldRecordRef.current = false;
      
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }

      if (activeSessionId.current) {
        socket?.emit("session:stop", {
          sessionId: activeSessionId.current,
        });
      }
    },
    [stopLoop]
  );

  const startRecording = useCallback(
    async (
      socket: Socket,
      sessionTitle: string,
      onSessionCreated: (sessionId: string) => void,
      onAutoStop?: () => void
    ) => {
      try {
        const { stream, cleanup: streamCleanup } = await requestAudioStream(() => {
          stopRecording(socket);
          if (onAutoStop) onAutoStop();
        });
        cleanupRef.current = streamCleanup;

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
        chunkIndexRef.current = 0;
        shouldRecordRef.current = true;

        const recorder = new MediaRecorder(stream, { mimeType: MIME_TYPE });
        mediaRecorderRef.current = recorder;

        // Handle data
        recorder.ondataavailable = async (event: BlobEvent) => {
          if (!event.data.size || !activeSessionId.current) return;
          const audioBase64 = await blobToBase64(event.data);
          
          socket.emit("audio:chunk", {
            sessionId: activeSessionId.current,
            chunkIndex: chunkIndexRef.current++,
            mimeType: MIME_TYPE,
            audioBase64,
            durationMs: CHUNK_DURATION,
          });
        };

        // Loop logic: onstop, if shouldRecord, start again
        recorder.onstop = () => {
          if (shouldRecordRef.current && mediaRecorderRef.current) {
             // Tiny delay to ensure state stability
             setTimeout(() => {
               if (shouldRecordRef.current && mediaRecorderRef.current?.state === "inactive") {
                 mediaRecorderRef.current.start();
                 // Schedule next stop
                 loopTimeoutRef.current = setTimeout(() => {
                   if (mediaRecorderRef.current?.state === "recording") {
                     mediaRecorderRef.current.stop();
                   }
                 }, CHUNK_DURATION);
               }
             }, 10);
          }
        };

        // Start first cycle
        recorder.start();
        loopTimeoutRef.current = setTimeout(() => {
          if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
          }
        }, CHUNK_DURATION);

      } catch (error) {
        cleanupMedia();
        throw error;
      }
    },
    [cleanupMedia, stopRecording]
  );

  const pauseRecording = useCallback(
    (socket: Socket | null) => {
      shouldRecordRef.current = false;
      stopLoop();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop(); // Stop to flush last chunk
      }
      
      if (activeSessionId.current) {
        socket?.emit("session:pause", {
          sessionId: activeSessionId.current,
        });
      }
    },
    [stopLoop]
  );

  const resumeRecording = useCallback(
    (socket: Socket | null) => {
      if (!mediaRecorderRef.current || !activeSessionId.current) return;
      
      shouldRecordRef.current = true;
      
      // Restart loop
      if (mediaRecorderRef.current.state === "inactive") {
        mediaRecorderRef.current.start();
        loopTimeoutRef.current = setTimeout(() => {
          if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
          }
        }, CHUNK_DURATION);
      }

      socket?.emit("session:resume", {
        sessionId: activeSessionId.current,
      });
    },
    []
  );

  return {
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cleanupMedia,
  };
};
