import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import { AuthProvider } from "./auth/AuthContext";
import { ToastProvider } from "./components/Toast";
import { ThemeProvider } from "./theme/ThemeContext";
import "./index.css";
import "./components/components.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* basename matches the Gateway SPA mount prefix (/admin-desk) so
        react-router's paths line up with where the app is actually served. */}
    <BrowserRouter basename="/admin-desk">
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
