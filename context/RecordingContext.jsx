import { createContext, useContext } from "react";

export const RecordingContext = createContext(null);

export function useRecordingContext() {
  const ctx = useContext(RecordingContext);
  if (!ctx) {
    throw new Error("useRecordingContext must be used inside RecordingProvider");
  }
  return ctx;
}
