import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { AppLayout } from "./layout/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { HealthPage } from "./pages/HealthPage";
import { SchemaBuilderPage } from "./pages/SchemaBuilderPage";
import { DataBrowserPage } from "./pages/DataBrowserPage";
import { UsersPage } from "./pages/UsersPage";
import { RolesPage } from "./pages/RolesPage";
import { SessionsPage } from "./pages/SessionsPage";
import { AccessKeysPage } from "./pages/AccessKeysPage";
import { SettingsPage } from "./pages/SettingsPage";
import { JobsPage } from "./pages/JobsPage";

export default function App() {
  const { token } = useAuth();

  if (!token) {
    return (
      <Routes>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/health" replace />} />
        <Route path="/health" element={<HealthPage />} />
        <Route path="/data" element={<DataBrowserPage />} />
        <Route path="/schema" element={<SchemaBuilderPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/roles" element={<RolesPage />} />
        <Route path="/sessions" element={<SessionsPage />} />
        <Route path="/access-keys" element={<AccessKeysPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="*" element={<Navigate to="/health" replace />} />
      </Route>
    </Routes>
  );
}
