"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Eye, EyeOff, Package, ShieldCheck } from "lucide-react";
import { BrandLogo, BrandMark } from "../components/brand-logo";
import {
  clearSession,
  getStoredUser,
  getToken,
  isAdminUser,
  setSession,
  type AuthUser,
} from "../lib/client-auth";
import { authLoginBodySchema } from "../lib/validation/auth-login";
import { parseOrError } from "../lib/validation/parse";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionExpired = params.get("session") === "expired";
    if (sessionExpired) {
      clearSession();
      setError("Your session expired. Please sign in again.");
      setChecking(false);
      return;
    }

    const token = getToken();
    const user = getStoredUser();
    if (token && isAdminUser(user)) {
      router.replace("/");
      return;
    }
    if (token && !isAdminUser(user)) {
      clearSession();
    }
    setChecking(false);
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const parsed = parseOrError(authLoginBodySchema, { email, password });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Client": "admin",
        },
        body: JSON.stringify({
          email: parsed.data.email,
          password: parsed.data.password,
        }),
      });

      const data = (await res.json()) as {
        error?: string;
        token?: string;
        accessToken?: string;
        user?: AuthUser;
      };

      if (!res.ok) {
        setError(data.error || "Login failed. Please try again.");
        return;
      }

      const accessToken = data.accessToken ?? data.token;
      if (!accessToken || !data.user) {
        setError("Unexpected response from server.");
        return;
      }

      if (!isAdminUser(data.user)) {
        setError("Admin access only. This account is not an admin.");
        return;
      }

      setSession(accessToken, data.user);
      router.replace("/");
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="auth-page" aria-hidden>
        <div className="auth-split">
          <aside className="auth-brand-panel" />
          <div className="auth-form-panel" />
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-split">
        <aside className="auth-brand-panel">
          <div className="auth-brand-panel__glow" aria-hidden />
          <div className="auth-brand-panel__top">
            <BrandMark size="lg" className="auth-brand-panel__mark" />
            <h2 className="auth-brand-panel__title">DrishX</h2>
            <p className="auth-brand-panel__tagline">
              Optical ERP — run your entire optical business from one place.
            </p>
          </div>

          <ul className="auth-brand-panel__features">
            <li>
              <span className="auth-brand-panel__feature-icon">
                <Package size={16} />
              </span>
              Orders, Rx lab &amp; dispatch in one flow
            </li>
            <li>
              <span className="auth-brand-panel__feature-icon">
                <BarChart3 size={16} />
              </span>
              Live stock, finance &amp; performance insights
            </li>
            <li>
              <span className="auth-brand-panel__feature-icon">
                <ShieldCheck size={16} />
              </span>
              Role-based access, secure by default
            </li>
          </ul>

          <p className="auth-brand-panel__footer">© 2025 DrishX ERP</p>
        </aside>

        <div className="auth-form-panel">
          <div className="auth-form-panel__brand">
            <BrandLogo size="sm" />
          </div>

          <div className="auth-form-panel__badge">Admin Portal</div>
          <h1 className="auth-card-title">Welcome back</h1>
          <p className="auth-card-subtitle">
            Sign in with your admin credentials to continue.
          </p>

          <form onSubmit={handleSubmit} noValidate>
            {error ? (
              <div className="auth-alert-error" role="alert">
                {error}
              </div>
            ) : null}

            <div className="auth-field">
              <label htmlFor="email" className="auth-label">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="auth-input"
                placeholder="you@example.com"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="password" className="auth-label">
                Password
              </label>
              <div className="auth-input-wrap">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="auth-input auth-input--with-action"
                  placeholder="Password"
                />
                <button
                  type="button"
                  className="auth-input-action"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="auth-button">
              {loading ? "Signing in..." : "Log in"}
            </button>
          </form>

          <p className="auth-form-panel__hint">
            Access restricted to authorized administrators.
          </p>
        </div>
      </div>
    </div>
  );
}
