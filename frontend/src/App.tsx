import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import ProtectedRoute from "./components/layout/ProtectedRoute";
import AppLayout from "./components/layout/AppLayout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import IssueListPage from "./pages/IssueListPage";
import IssueCreatePage from "./pages/IssueCreatePage";
import IssueDetailPage from "./pages/IssueDetailPage";
import IssueEditPage from "./pages/IssueEditPage";
import LabelsPage from "./pages/LabelsPage";
import UserProfilePage from "./pages/UserProfilePage";
import NotificationsPage from "./pages/NotificationsPage";
import AdminPage from "./pages/AdminPage";
import MilestonesPage from "./pages/MilestonesPage";
import MilestoneDetailPage from "./pages/MilestoneDetailPage";

function App() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Routes>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/issues" element={<IssueListPage />} />
                  <Route path="/issues/new" element={<IssueCreatePage />} />
                  <Route path="/issues/:id" element={<IssueDetailPage />} />
                  <Route path="/issues/:id/edit" element={<IssueEditPage />} />
                  <Route path="/labels" element={<LabelsPage />} />
                  <Route path="/milestones" element={<MilestonesPage />} />
                  <Route path="/milestones/:id" element={<MilestoneDetailPage />} />
                  <Route path="/profile" element={<UserProfilePage />} />
                  <Route path="/settings/notifications" element={<NotificationsPage />} />
                  <Route path="/admin" element={<AdminPage />} />
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </AppLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </HashRouter>
  );
}

export default App;
