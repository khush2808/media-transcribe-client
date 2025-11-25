/**
 * Converts a Blob to base64 string
 */
export const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result.split(",").pop() ?? "");
      } else {
        reject(new Error("Could not encode chunk"));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

/**
 * Requests both tab sharing and mic input, then properly mixes them using AudioContext
 */
export const requestAudioStream = async (): Promise<{
  stream: MediaStream;
  cleanup: () => void;
}> => {
  const tabStream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true,
  });

  const micStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
  });

  const cleanupFns: Array<() => void> = [
    () => micStream.getTracks().forEach((track) => track.stop()),
    () => tabStream.getTracks().forEach((track) => track.stop()),
  ];

  const audioTracks = tabStream.getAudioTracks();
  const videoTracks = tabStream.getVideoTracks();

  // Stop video tracks (we only need audio)
  videoTracks.forEach((track) => track.stop());

  // If tab has audio, mix both streams using AudioContext
  if (audioTracks.length > 0) {
    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();

    cleanupFns.push(() => audioContext.close());

    const connectStream = (stream: MediaStream) => {
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(destination);
    };

    // Connect both mic and tab audio to mix them properly
    connectStream(micStream);
    connectStream(new MediaStream(audioTracks));

    return {
      stream: destination.stream,
      cleanup: () => cleanupFns.forEach((fn) => fn()),
    };
  }

  // Fallback: if no tab audio, just return mic stream
  return {
    stream: micStream,
    cleanup: () => cleanupFns.forEach((fn) => fn()),
  };
};

