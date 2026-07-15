import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { AppLayout } from "./layout/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { HealthPage } from "./pages/HealthPage";
import { SchemaBuilderPage } from "./pages/SchemaBuilderPage";
import { DataBrowserPage } from "./pages/DataBrowserPage";
import { UsersPage } from "./pages/UsersPage";
import { ComingSoon } from "./pages/ComingSoon";

export default function App() {
  const { token } = useAuth();

  if (!token) {
    return (
      <Routes>
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
        <Route path="/roles" element={<ComingSoon title="Roles" />} />
        <Route path="/sessions" element={<ComingSoon title="Sessions" />} />
        <Route path="/access-keys" element={<ComingSoon title="Access Keys" />} />
        <Route path="*" element={<Navigate to="/health" replace />} />
      </Route>
    </Routes>
  );
}
