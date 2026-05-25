import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n";
import "./index.css";
import App from "./App";

// Redirect OAuth callback from non-hash URL to hash URL
(function() {
  const p = new URLSearchParams(window.location.search);
  const code = p.get("code");
  const state = p.get("state");
  if (code && state) {
    window.location.replace(window.location.origin + "/#/profile" + window.location.search);
    return;
  }
})();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
