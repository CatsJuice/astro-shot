import React from "react";
import { createRoot } from "react-dom/client";
import starCatalog from "../public/data/stars.json";
import panoramaUrl from "./assets/eso-milky-way-panorama-xhs.jpg?url";
import { SkySimulator } from "../app/SkySimulator";
import { installXhsRuntimeAssets } from "../app/site-path";
import "../app/globals.css";

installXhsRuntimeAssets({
  paths: {
    "/textures/eso-milky-way-panorama-4096.jpg": panoramaUrl,
  },
  data: {
    starCatalog,
  },
});

const root = document.getElementById("root");
if (!root) throw new Error("AstroShot root element is missing");

createRoot(root).render(
  <React.StrictMode>
    <SkySimulator />
  </React.StrictMode>,
);
