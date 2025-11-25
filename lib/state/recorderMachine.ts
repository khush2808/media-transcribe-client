import { createMachine } from "xstate";

export const recorderMachine = createMachine({
  id: "recorder",
  initial: "idle",
  states: {
    idle: {
      on: { START: "recording" },
    },
    recording: {
      on: { PAUSE: "paused", STOP: "processing", ERROR: "error" },
    },
    paused: {
      on: { RESUME: "recording", STOP: "processing", ERROR: "error" },
    },
    processing: {
      on: { COMPLETE: "completed", ERROR: "error" },
    },
    completed: {
      on: { RESET: "idle" },
    },
    error: {
      on: { RESET: "idle" },
    },
  },
});

