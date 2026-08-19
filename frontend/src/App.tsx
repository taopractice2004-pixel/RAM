import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Resources from "./pages/Resources";
import ResourceDetail from "./pages/ResourceDetail";
import Allocations from "./pages/Allocations";
import Bench from "./pages/Bench";
import Approvals from "./pages/Approvals";
import Reports from "./pages/Reports";
import Admin from "./pages/Admin";

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
        <Route path="allocations" element={<Allocations />} />
        <Route path="bench" element={<Bench />} />
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
