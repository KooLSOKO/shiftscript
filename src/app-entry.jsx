import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
document.title = "Your workspace | ShiftScript by Earny";
document
  .querySelector('link[rel="canonical"]')
  ?.setAttribute("href", window.location.origin + "/app");
const robots = document.createElement("meta");
robots.name = "robots";
robots.content = "noindex";
document.head.append(robots);
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
