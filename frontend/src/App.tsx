import { Navigate, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Resources from "./pages/Resources";
import ResourceDetail from "./pages/ResourceDetail";
import Approvals from "./pages/Approvals";
import Reports from "./pages/Reports";
import Demand from "./pages/Demand";
import Admin from "./pages/Admin";
import Alerts from "./pages/Alerts";
import Imports from "./pages/Imports";

const BENCH_FEATURE_ENABLED = false;

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="resources" element={<Resources />} />
        <Route path="resources/:id" element={<ResourceDetail />} />
        <Route path="allocations" element={<Navigate to="/resources" replace />} />
        {BENCH_FEATURE_ENABLED && <Route path="bench" element={<Navigate to="/resources" replace />} />}
        <Route path="alerts" element={<Alerts />} />
        <Route
          path="imports"
          element={
            <ProtectedRoute roles={["ADMIN", "RMG", "HR"]}>
              <Imports />
            </ProtectedRoute>
          }
        />
        <Route path="demand" element={<Demand />} />
        <Route
          path="approvals"
          element={
            <ProtectedRoute roles={["ADMIN", "RMG", "HR"]}>
              <Approvals />
            </ProtectedRoute>
          }
        />
        <Route path="reports" element={<Reports />} />
        <Route
          path="admin"
          element={
            <ProtectedRoute roles={["ADMIN", "RMG", "HR"]}>
              <Admin />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
  );
}
