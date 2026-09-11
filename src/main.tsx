import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
import "./studio.css";
// Sign In With Google accepts http://localhost, not http://127.0.0.1, as a local origin.
if (location.hostname === "127.0.0.1") {
  location.replace(location.href.replace("//127.0.0.1", "//localhost"));
} else {
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
