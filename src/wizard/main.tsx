import React from "react";
import ReactDOM from "react-dom/client";
import WizardApp from "./WizardApp";
import "./wizard.css";

ReactDOM.createRoot(document.getElementById("wizard-root") as HTMLElement).render(
  <React.StrictMode>
    <WizardApp />
  </React.StrictMode>,
);
