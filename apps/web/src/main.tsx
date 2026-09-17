import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/app/App";
import "@/styles/globals.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root container #root is missing from index.html");

// Drop the static boot splash now that React is taking over.
container.innerHTML = "";

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
