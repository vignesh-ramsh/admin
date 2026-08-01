import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { AppLayout } from "./layout/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { HealthPage } from "./pages/HealthPage";

import { DataBrowserPage } from "./pages/data/DataBrowserPage";
import { DataTableView } from "./pages/data/DataTableView";
import { RowEditorRoute } from "./pages/data/RowEditorRoute";

import { SchemaBuilderPage } from "./pages/schema/SchemaBuilderPage";
import { SchemaFileEditorRoute } from "./pages/schema/SchemaFileEditorRoute";

import { UsersPage } from "./pages/users/UsersPage";
import { CreateUserRoute } from "./pages/users/CreateUserRoute";
import { UserDetailRoute } from "./pages/users/UserDetailRoute";

import { RolesPage } from "./pages/roles/RolesPage";
import { CreateRoleRoute } from "./pages/roles/CreateRoleRoute";
import { EditRoleRoute } from "./pages/roles/EditRoleRoute";
import { DeleteRoleRoute } from "./pages/roles/DeleteRoleRoute";
import { RoleMembersRoute } from "./pages/roles/RoleMembersRoute";

import { SessionsPage } from "./pages/sessions/SessionsPage";
import { PruneSessionsRoute } from "./pages/sessions/PruneSessionsRoute";

import { AccessKeysPage } from "./pages/access-keys/AccessKeysPage";
import { CreateAccessKeyRoute } from "./pages/access-keys/CreateAccessKeyRoute";
import { PruneAccessKeysRoute } from "./pages/access-keys/PruneAccessKeysRoute";

import { FileManagerPage } from "./pages/files/FileManagerPage";
import { FilerFilesTab } from "./pages/files/FilerFilesTab";
import { FilerSettingsTab } from "./pages/files/FilerSettingsTab";
import { UploadFileRoute } from "./pages/files/UploadFileRoute";
import { FilePreviewRoute } from "./pages/files/FilePreviewRoute";

import { JobsPage } from "./pages/jobs/JobsPage";
import { ScheduledJobsTab } from "./pages/jobs/ScheduledJobsTab";
import { ExecutionLogTab } from "./pages/jobs/ExecutionLogTab";

import { SettingsPage } from "./pages/settings/SettingsPage";
import { SetSettingRoute } from "./pages/settings/SetSettingRoute";


export default function App() {
  const { loading, authenticated } = useAuth();

  if (loading) return null;

  if (!authenticated) {
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
        <Route path="/login" element={<Navigate to="/health" replace />} />
        <Route path="/health" element={<HealthPage />} />

        <Route path="/data" element={<DataBrowserPage />}>
          <Route path=":table" element={<DataTableView />}>
            <Route path="new" element={<RowEditorRoute mode="create" />} />
            <Route path=":rowId" element={<RowEditorRoute mode="edit" />} />
          </Route>
        </Route>

        <Route path="/schema" element={<SchemaBuilderPage />}>
          <Route path=":kind/:name" element={<SchemaFileEditorRoute />} />
        </Route>

        <Route path="/users" element={<UsersPage />}>
          <Route path="new" element={<CreateUserRoute />} />
          <Route path=":userId" element={<UserDetailRoute />} />
        </Route>

        <Route path="/roles" element={<RolesPage />}>
          <Route path="new" element={<CreateRoleRoute />} />
          <Route path=":roleId/edit" element={<EditRoleRoute />} />
          <Route path=":roleId/delete" element={<DeleteRoleRoute />} />
          <Route path=":roleId/members" element={<RoleMembersRoute />} />
        </Route>

        <Route path="/sessions" element={<SessionsPage />}>
          <Route path="prune" element={<PruneSessionsRoute />} />
        </Route>

        <Route path="/access-keys" element={<AccessKeysPage />}>
          <Route path="new" element={<CreateAccessKeyRoute />} />
          <Route path="prune" element={<PruneAccessKeysRoute />} />
        </Route>

        <Route path="/files" element={<FileManagerPage />}>
          <Route index element={<Navigate to="browse" replace />} />
          <Route path="browse" element={<FilerFilesTab />}>
            <Route path="upload" element={<UploadFileRoute />} />
            <Route path=":fileId" element={<FilePreviewRoute />} />
          </Route>
          <Route path="settings" element={<FilerSettingsTab />} />
        </Route>

        <Route path="/jobs" element={<JobsPage />}>
          <Route index element={<Navigate to="scheduled" replace />} />
          <Route path="scheduled" element={<ScheduledJobsTab />} />
          <Route path="log" element={<ExecutionLogTab />} />
        </Route>

        <Route path="/settings" element={<SettingsPage />}>
          <Route path=":key/edit" element={<SetSettingRoute />} />
        </Route>

        <Route path="*" element={<Navigate to="/health" replace />} />
      </Route>
    </Routes>
  );
}
