import "./index.css";
import { DebugPage } from "./kiosk/DebugPage";
import { KioskPage } from "./kiosk/KioskPage";

export function App() {
  if (location.pathname === "/kiosk") {
    return <KioskPage />;
  }
  if (location.pathname === "/kiosk/debug") {
    return <DebugPage />;
  }
  return <h1>Hello, World!</h1>;
}
