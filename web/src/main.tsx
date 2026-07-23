import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import App from "./App";
import Dashboard from "./pages/Dashboard";
import ReferenceData from "./pages/ReferenceData";
import CampaignEditor from "./pages/CampaignEditor";
import GuidedBuilder from "./pages/GuidedBuilder";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "guided", element: <GuidedBuilder /> },
      { path: "reference", element: <ReferenceData /> },
      { path: "campaigns/:id", element: <CampaignEditor /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
