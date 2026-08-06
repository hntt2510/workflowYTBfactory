import React from "react";
import { createRoot } from "react-dom/client";
import { AppRuntime } from "./app/AppRuntime";
import "./styles.css";

function App() {
  return <AppRuntime />;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
