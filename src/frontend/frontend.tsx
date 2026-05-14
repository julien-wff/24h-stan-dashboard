import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { App } from "./App";

const elem = document.getElementById("root");
if (!elem) throw new Error("Root element #root not found");

const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

// https://bun.com/docs/bundler/hot-reloading#import-meta-hot-data
let root = import.meta.hot.data.root as Root | undefined;
if (!root) {
  root = createRoot(elem);
  import.meta.hot.data.root = root;
}
root.render(app);
