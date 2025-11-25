"use client";

import { useEffect, useRef, useState } from "react";

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [inputSource, setInputSource] = useState<"mic" | "tab">("mic");
  const [sourceWarning, setSourceWarning] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalSize: "0 MB",
    recordingTime: "0s",
    chunkCount: 0,
    chunks: [] as string[],
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number>(0);
  const chunkLogRef = useRef<HTMLDivElement>(null);
  const cleanupStreamsRef = useRef<(() => void) | null>(null);

  const requestAudioStream = async () => {
    cleanupStreamsRef.current?.();
    setSourceWarning(null);

    let tabStream: MediaStream | null = null;

    if (inputSource === "tab") {
      try {
        tabStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
      } catch (error) {
        console.warn("Tab audio capture failed; falling back to mic.", error);
        tabStream = null;
      }
    }

    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    const cleanupFns: Array<() => void> = [
      () => micStream.getTracks().forEach((track) => track.stop()),
    ];

    if (tabStream) {
      const audioTracks = tabStream.getAudioTracks();
      const videoTracks = tabStream.getVideoTracks();

      if (audioTracks.length > 0) {
        const audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();
        cleanupFns.push(() => audioContext.close());
        cleanupFns.push(() =>
          tabStream?.getTracks().forEach((track) => track.stop())
        );

        const connectStream = (stream: MediaStream) => {
          const source = audioContext.createMediaStreamSource(stream);
          source.connect(destination);
        };

        connectStream(micStream);
        connectStream(new MediaStream(audioTracks));
        videoTracks.forEach((track) => track.stop());

        cleanupStreamsRef.current = () => cleanupFns.forEach((fn) => fn());
        return destination.stream;
      }

      tabStream.getTracks().forEach((track) => track.stop());
      console.warn(
        "Tab capture returned no audio tracks; falling back to mic."
      );
    }

    if (inputSource === "tab") {
      setSourceWarning(
        "Tab audio unavailable; recording microphone input instead."
      );
    }

    cleanupStreamsRef.current = () => cleanupFns.forEach((fn) => fn());
    return micStream;
  };

  const startRecording = async () => {
    try {
      const stream = await requestAudioStream();

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data);
        const chunkLog = `Chunk ${audioChunksRef.current.length}: ${e.data.size} bytes`;

        setStats((prev) => ({
          ...prev,
          chunks: [...prev.chunks, chunkLog],
        }));

        console.log(`Chunk received: ${e.data.size} bytes`);
      };

      mediaRecorder.onstop = () => {
        if (cleanupStreamsRef.current) {
          cleanupStreamsRef.current();
          cleanupStreamsRef.current = null;
        }

        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);

        const recordingDuration = Date.now() - recordingStartTimeRef.current;
        const durationSeconds = (recordingDuration / 1000).toFixed(2);
        const sizeMB = (audioBlob.size / (1024 * 1024)).toFixed(2);

        setStats((prev) => ({
          ...prev,
          totalSize: `${sizeMB} MB (${audioBlob.size} bytes)`,
          recordingTime: `${durationSeconds}s`,
          chunkCount: audioChunksRef.current.length,
        }));

        setIsRecording(false);
        console.log(`Total recording size: ${audioBlob.size} bytes`);
      };

      mediaRecorder.start(2000);
      recordingStartTimeRef.current = Date.now();
      setIsRecording(true);
      setStats((prev) => ({ ...prev, chunks: [] }));
    } catch (err) {
      alert("Error accessing audio input: " + (err as Error).message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream
        .getTracks()
        .forEach((track) => track.stop());
    }

    if (cleanupStreamsRef.current) {
      cleanupStreamsRef.current();
      cleanupStreamsRef.current = null;
    }
  };

  useEffect(() => {
    if (chunkLogRef.current) {
      chunkLogRef.current.scrollTop = chunkLogRef.current.scrollHeight;
    }
  }, [stats.chunks]);

  useEffect(() => {
    return () => {
      cleanupStreamsRef.current?.();
      cleanupStreamsRef.current = null;
    };
  }, []);

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-500 to-purple-600 flex justify-center items-center p-5">
      <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          🎙️ Audio Recorder
        </h1>
        <p className="text-gray-600 text-sm mb-8">
          Record, store, and replay audio
        </p>

        <div className="flex items-center gap-3 bg-gray-100 p-4 rounded-2xl mb-7">
          <div
            className={`w-3 h-3 rounded-full transition-all ${
              isRecording ? "bg-red-500 animate-pulse" : "bg-gray-300"
            }`}
          ></div>
          <span className="text-gray-700 text-sm">
            {isRecording ? "Recording..." : "Ready"}
          </span>
        </div>

        <div className="mb-7">
          <p className="text-gray-700 text-sm font-semibold mb-2">
            Audio source
          </p>
          <div className="grid grid-cols-2 gap-3">
            {(["mic", "tab"] as const).map((source) => (
              <button
                key={source}
                onClick={() => setInputSource(source)}
                className={`py-2 px-3 rounded-xl text-sm font-semibold border transition-all cursor-pointer ${
                  inputSource === source
                    ? "bg-blue-500 text-white border-blue-500 shadow-lg"
                    : "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
                }`}
                disabled={isRecording}
              >
                {source === "mic" ? "🎙️ Microphone" : "🪟 Tab Sharing"}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Tab sharing tries to capture the selected tab&apos;s audio via
            display capture. If it fails, the recorder falls back to the mic
            automatically.
          </p>
          {sourceWarning && (
            <p className="text-xs text-red-500 mt-2 font-semibold">
              {sourceWarning}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-7">
          <button
            onClick={startRecording}
            disabled={isRecording}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-bold py-3 px-5 rounded-xl transition-all hover:shadow-lg disabled:cursor-not-allowed cursor-pointer"
          >
            Start Recording
          </button>
          <button
            onClick={stopRecording}
            disabled={!isRecording}
            className="bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white font-bold py-3 px-5 rounded-xl transition-all hover:shadow-lg disabled:cursor-not-allowed cursor-pointer"
          >
            Stop Recording
          </button>
        </div>

        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-lg text-sm text-gray-700 mb-7">
          <strong>How it works:</strong> Click &ldquo;Start Recording&rdquo; to
          begin capturing audio and &ldquo;Stop Recording&rdquo; when done. Use
          the built-in audio player below to listen back.
        </div>

        {audioUrl && (
          <div className="bg-gray-100 p-6 rounded-xl">
            <div className="mb-3">
              <div className="flex justify-between py-2.5 border-b border-gray-300">
                <span className="font-bold text-gray-800">Total Size:</span>
                <span className="text-blue-600 font-bold">
                  {stats.totalSize}
                </span>
              </div>
              <div className="flex justify-between py-2.5 border-b border-gray-300">
                <span className="font-bold text-gray-800">Recording Time:</span>
                <span className="text-blue-600 font-bold">
                  {stats.recordingTime}
                </span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="font-bold text-gray-800">
                  Chunks Received:
                </span>
                <span className="text-blue-600 font-bold">
                  {stats.chunkCount}
                </span>
              </div>
            </div>
            <div
              ref={chunkLogRef}
              className="bg-white border border-gray-300 rounded-lg p-4 max-h-48 overflow-y-auto"
            >
              {stats.chunks.map((chunk, idx) => (
                <div
                  key={idx}
                  className="text-xs bg-gray-50 p-2 rounded mb-1 font-mono text-gray-600"
                >
                  {chunk}
                </div>
              ))}
            </div>

            <div className="mt-4 bg-white border border-gray-300 rounded-lg p-4">
              <span className="font-bold text-gray-800 block mb-2">
                Playback
              </span>
              <audio
                controls
                src={audioUrl ?? undefined}
                className="w-full rounded-xl border border-gray-200"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
