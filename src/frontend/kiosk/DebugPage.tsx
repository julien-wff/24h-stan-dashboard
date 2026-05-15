import { useEffect } from "react";
import { useRaceState } from "./state/store";
import { connect } from "./ws-client";

export function DebugPage() {
  const state = useRaceState();

  useEffect(() => {
    const dispose = connect();
    return dispose;
  }, []);

  return (
    <div>
      <p>connection: {state.connection}</p>
      <pre><code>{JSON.stringify(state, null, 2)}</code></pre>
    </div>
  );
}
