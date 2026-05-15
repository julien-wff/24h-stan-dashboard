import "./index.css";
import { DebugPage } from "./kiosk/DebugPage";

export function App() {
  if (location.pathname === "/kiosk") {
    return <DebugPage />;
  }
  return <h1>Hello, World!</h1>;
}
