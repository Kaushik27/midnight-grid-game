import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import MidnightGridGame from "../app/MidnightGridGame";
import "../app/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing game root element");
}

createRoot(root).render(
  <StrictMode>
    <MidnightGridGame />
  </StrictMode>,
);
