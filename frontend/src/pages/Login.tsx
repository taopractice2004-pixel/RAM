import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const DEMO_ACCOUNTS = [
  { email: "admin@ram.com", role: "Administrator" },
  { email: "rmg@ram.com", role: "RMG (cross-portfolio)" },
  { email: "delivery.fin@ram.com", role: "Delivery Lead - Financial Services" },
  { email: "delivery.health@ram.com", role: "Delivery Lead - Healthcare" },
  { email: "hr@ram.com", role: "HR" },
  { email: "ta@ram.com", role: "Talent Acquisition" },
  { email: "viewer@ram.com", role: "Read-Only Viewer" },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("rmg@ram.com");
  const [password, setPassword] = useState("Password123!");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.error || "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-900 to-brand-700 px-4">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-8">
          <h1 className="text-xl font-semibold text-slate-900">Resource Allocation & Management</h1>
          <p className="text-sm text-slate-500 mt-1 mb-6">Sign in to continue</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <div className="text-sm text-red-600">{error}</div>}
            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
        <div className="card p-8 bg-white/95">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Demo accounts (password: Password123!)</h2>
          <ul className="space-y-2 text-sm">
            {DEMO_ACCOUNTS.map((acc) => (
              <li key={acc.email}>
                <button
                  type="button"
                  className="text-brand-700 hover:underline font-medium"
                  onClick={() => setEmail(acc.email)}
                >
                  {acc.email}
                </button>
                <span className="text-slate-400"> — {acc.role}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
