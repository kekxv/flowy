import { Suspense, lazy } from "react"
import { HashRouter, Routes, Route, Navigate } from "react-router-dom"
import { useAuth } from "./hooks/useAuth"
import ProtectedRoute from "./components/layout/ProtectedRoute"
import AppLayout from "./components/layout/AppLayout"
import ErrorBoundary from "./components/ErrorBoundary"
import Loader from "./components/Loader"

const LoginPage = lazy(() => import("./pages/LoginPage"))
const DashboardPage = lazy(() => import("./pages/DashboardPage"))
const IssueListPage = lazy(() => import("./pages/IssueListPage"))
const IssueCreatePage = lazy(() => import("./pages/IssueCreatePage"))
const IssueDetailPage = lazy(() => import("./pages/IssueDetailPage"))
const IssueEditPage = lazy(() => import("./pages/IssueEditPage"))
const LabelsPage = lazy(() => import("./pages/LabelsPage"))
const UserProfilePage = lazy(() => import("./pages/UserProfilePage"))
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"))
const AdminPage = lazy(() => import("./pages/AdminPage"))
const MilestonesPage = lazy(() => import("./pages/MilestonesPage"))
const MilestoneDetailPage = lazy(() => import("./pages/MilestoneDetailPage"))
const WeChatWorkBotPage = lazy(() => import("./pages/WeChatWorkBotPage"))
const WikiListPage = lazy(() => import("./pages/WikiListPage"))
const WikiCreatePage = lazy(() => import("./pages/WikiCreatePage"))
const WikiDetailPage = lazy(() => import("./pages/WikiDetailPage"))

function App() {
  const { isLoading } = useAuth()

  if (isLoading) {
    return <Loader fullScreen />
  }

  return (
    <ErrorBoundary>
      <HashRouter>
        <Suspense fallback={<Loader fullScreen />}>
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
                      <Route path="/wiki" element={<WikiListPage />} />
                      <Route path="/wiki/new" element={<WikiCreatePage />} />
                      <Route path="/wiki/:id" element={<WikiDetailPage />} />
                      <Route path="/profile" element={<UserProfilePage />} />
                      <Route path="/settings/notifications" element={<NotificationsPage />} />
                      <Route path="/settings/wechat-work-bot" element={<WeChatWorkBotPage />} />
                      <Route path="/admin" element={<AdminPage />} />
                      <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    </Routes>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </Suspense>
      </HashRouter>
    </ErrorBoundary>
  )
}

export default App;
