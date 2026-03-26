import { RecordingContext } from "../context/RecordingContext";

export function RecordingProvider({ value, children }) {
  return (
    <RecordingContext.Provider value={value}>
      {children}
    </RecordingContext.Provider>
  );
}
