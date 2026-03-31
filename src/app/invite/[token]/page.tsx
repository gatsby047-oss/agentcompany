"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type InviteViewer = {
  email: string;
  displayName: string;
};

type InviteData = {
  companyId: string;
  companyName: string;
  inviterEmail: string;
  inviteeEmail: string;
  role: string;
  status: string;
  expiresAt: string;
  viewer: InviteViewer | null;
};

type InviteState = {
  data: InviteData | null;
  isLoading: boolean;
  isAccepting: boolean;
  isAuthenticating: boolean;
  error: string | null;
  success: boolean;
};

type AuthMode = "login" | "register";

type AuthFormState = {
  displayName: string;
  password: string;
};

const defaultAuthForm: AuthFormState = {
  displayName: "",
  password: ""
};

export default function InvitePage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [state, setState] = useState<InviteState>({
    data: null,
    isLoading: true,
    isAccepting: false,
    isAuthenticating: false,
    error: null,
    success: false
  });
  const [authMode, setAuthMode] = useState<AuthMode>("register");
  const [authForm, setAuthForm] = useState<AuthFormState>(defaultAuthForm);

  const refreshInvite = useCallback(async () => {
    const response = await fetch(`/api/invitations/${params.token}`, {
      cache: "no-store"
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error?.message ?? "Invalid invitation");
    }

    setState((current) => ({
      ...current,
      data: payload.data,
      isLoading: false
    }));
  }, [params.token]);

  const completeAccept = useCallback(async () => {
    setState((current) => ({ ...current, isAccepting: true, error: null }));

    try {
      const response = await fetch(`/api/invitations/${params.token}/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to accept invitation");
      }

      setState((current) => ({ ...current, isAccepting: false, success: true }));
    } catch (nextError) {
      setState((current) => ({
        ...current,
        isAccepting: false,
        error:
          nextError instanceof Error ? nextError.message : "Failed to accept invitation"
      }));
    }
  }, [params.token]);

  const isInvitePending = state.data?.status === "PENDING";
  const viewerMatchesInvite = useMemo(() => {
    if (!state.data?.viewer || !state.data.inviteeEmail) {
      return false;
    }

    return (
      state.data.viewer.email.toLowerCase() === state.data.inviteeEmail.toLowerCase()
    );
  }, [state.data]);

  const submitAuth = useCallback(async () => {
    if (!state.data) {
      return;
    }

    if (authForm.password.length < 8) {
      setState((current) => ({
        ...current,
        error: "Password must be at least 8 characters long"
      }));
      return;
    }

    if (authMode === "register" && !authForm.displayName.trim()) {
      setState((current) => ({
        ...current,
        error: "Display name is required"
      }));
      return;
    }

    setState((current) => ({
      ...current,
      isAuthenticating: true,
      error: null
    }));

    try {
      const response = await fetch(
        authMode === "register" ? "/api/auth/register" : "/api/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(
            authMode === "register"
              ? {
                  email: state.data.inviteeEmail,
                  password: authForm.password,
                  displayName: authForm.displayName.trim(),
                  locale: "zh-HK"
                }
              : {
                  email: state.data.inviteeEmail,
                  password: authForm.password
                }
          )
        }
      );

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Authentication failed");
      }

      setState((current) => ({
        ...current,
        isAuthenticating: false,
        data: current.data
          ? {
              ...current.data,
              viewer: {
                email: payload.data.user.email,
                displayName: payload.data.user.displayName
              }
            }
          : current.data
      }));

      setAuthForm((current) => ({
        ...current,
        password: ""
      }));

      await completeAccept();
    } catch (nextError) {
      setState((current) => ({
        ...current,
        isAuthenticating: false,
        error:
          nextError instanceof Error ? nextError.message : "Authentication failed"
      }));
    }
  }, [authForm, authMode, completeAccept, state.data]);

  const logoutCurrentUser = useCallback(async () => {
    await fetch("/api/auth/logout", {
      method: "POST"
    });

    setState((current) => ({
      ...current,
      error: null,
      data: current.data
        ? {
            ...current.data,
            viewer: null
          }
        : null
    }));
    setAuthForm(defaultAuthForm);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await refreshInvite();
      } catch (nextError) {
        setState((current) => ({
          ...current,
          isLoading: false,
          error: nextError instanceof Error ? nextError.message : "Invalid invitation"
        }));
      }
    })();
  }, [refreshInvite]);

  if (state.isLoading) {
    return (
      <main style={{ padding: "40px", maxWidth: "680px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <p>Loading invitation...</p>
        </div>
      </main>
    );
  }

  if (!state.data) {
    return (
      <main style={{ padding: "40px", maxWidth: "680px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <h1>Invitation not found</h1>
          <button
            onClick={() => router.push("/")}
            style={{
              marginTop: "24px",
              padding: "12px 24px",
              background: "var(--accent-mint)",
              color: "var(--bg-surface)",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer"
            }}
          >
            Go to Home
          </button>
        </div>
      </main>
    );
  }

  if (state.success) {
    return (
      <main style={{ padding: "40px", maxWidth: "680px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <h1>Welcome!</h1>
          <p style={{ color: "var(--text-muted)", marginTop: "12px" }}>
            You have successfully joined {state.data.companyName}
          </p>
          <button
            onClick={() => router.push("/")}
            style={{
              marginTop: "24px",
              padding: "12px 24px",
              background: "var(--accent-mint)",
              color: "var(--bg-surface)",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer"
            }}
          >
            Go to Dashboard
          </button>
        </div>
      </main>
    );
  }

  const statusMessage =
    state.data.status === "EXPIRED"
      ? "This invitation has expired."
      : state.data.status === "ACCEPTED"
        ? "This invitation has already been accepted."
        : state.data.status === "REVOKED"
          ? "This invitation has been revoked."
          : null;

  const shouldShowAuth =
    isInvitePending && (!state.data.viewer || !viewerMatchesInvite);

  return (
    <main style={{ padding: "40px", maxWidth: "680px", margin: "0 auto" }}>
      <div
        style={{
          padding: "40px 24px",
          background: "var(--bg-elevated)",
          borderRadius: "16px"
        }}
      >
        <h1>You&apos;ve been invited</h1>
        <p style={{ color: "var(--text-muted)", marginTop: "12px" }}>
          {state.data.inviterEmail} invited <strong>{state.data.inviteeEmail}</strong> to join{" "}
          <strong>{state.data.companyName}</strong>
        </p>

        <div
          style={{
            marginTop: "24px",
            padding: "16px",
            background: "var(--bg-surface)",
            borderRadius: "12px",
            display: "grid",
            gap: "10px"
          }}
        >
          <p style={{ margin: 0 }}>
            Role: <strong>{state.data.role}</strong>
          </p>
          <p style={{ margin: 0 }}>
            Expires: <strong>{new Date(state.data.expiresAt).toLocaleString()}</strong>
          </p>
          <p style={{ margin: 0 }}>
            Current status: <strong>{state.data.status}</strong>
          </p>
        </div>

        {statusMessage ? (
          <p style={{ color: "var(--accent-rose)", marginTop: "20px" }}>{statusMessage}</p>
        ) : null}

        {state.data.viewer ? (
          <div
            style={{
              marginTop: "20px",
              padding: "14px 16px",
              borderRadius: "12px",
              background: viewerMatchesInvite
                ? "rgba(121, 255, 183, 0.08)"
                : "rgba(255, 190, 92, 0.08)",
              border: viewerMatchesInvite
                ? "1px solid rgba(121, 255, 183, 0.2)"
                : "1px solid rgba(255, 190, 92, 0.2)"
            }}
          >
            <p style={{ margin: 0 }}>
              Signed in as <strong>{state.data.viewer.email}</strong>
            </p>
            {!viewerMatchesInvite ? (
              <p style={{ margin: "8px 0 0", color: "var(--text-muted)" }}>
                This invite is for {state.data.inviteeEmail}. Switch accounts or create that user
                first.
              </p>
            ) : null}
          </div>
        ) : null}

        {state.error ? (
          <p style={{ color: "var(--accent-rose)", marginTop: "20px" }}>{state.error}</p>
        ) : null}

        {shouldShowAuth ? (
          <div
            style={{
              marginTop: "24px",
              padding: "20px",
              background: "var(--bg-surface)",
              borderRadius: "14px",
              display: "grid",
              gap: "16px"
            }}
          >
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                type="button"
                onClick={() => setAuthMode("register")}
                style={{
                  padding: "10px 16px",
                  borderRadius: "8px",
                  border: authMode === "register"
                    ? "1px solid var(--accent-mint)"
                    : "1px solid var(--border-default)",
                  background: authMode === "register"
                    ? "rgba(121, 255, 183, 0.12)"
                    : "transparent",
                  color: "var(--text-primary)",
                  cursor: "pointer"
                }}
              >
                Register
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("login")}
                style={{
                  padding: "10px 16px",
                  borderRadius: "8px",
                  border: authMode === "login"
                    ? "1px solid var(--accent-mint)"
                    : "1px solid var(--border-default)",
                  background: authMode === "login"
                    ? "rgba(121, 255, 183, 0.12)"
                    : "transparent",
                  color: "var(--text-primary)",
                  cursor: "pointer"
                }}
              >
                Login
              </button>
              {state.data.viewer ? (
                <button
                  type="button"
                  onClick={() => void logoutCurrentUser()}
                  style={{
                    marginLeft: "auto",
                    padding: "10px 16px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-default)",
                    background: "transparent",
                    color: "var(--text-primary)",
                    cursor: "pointer"
                  }}
                >
                  Use another account
                </button>
              ) : null}
            </div>

            <label style={{ display: "grid", gap: "8px" }}>
              <span>Email</span>
              <input
                value={state.data.inviteeEmail}
                readOnly
                style={{
                  padding: "12px 14px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-default)",
                  background: "rgba(255,255,255,0.03)",
                  color: "var(--text-muted)"
                }}
              />
            </label>

            {authMode === "register" ? (
              <label style={{ display: "grid", gap: "8px" }}>
                <span>Display name</span>
                <input
                  value={authForm.displayName}
                  onChange={(event) =>
                    setAuthForm((current) => ({
                      ...current,
                      displayName: event.target.value
                    }))
                  }
                  placeholder="Your display name"
                  style={{
                    padding: "12px 14px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-default)",
                    background: "transparent",
                    color: "var(--text-primary)"
                  }}
                />
              </label>
            ) : null}

            <label style={{ display: "grid", gap: "8px" }}>
              <span>Password</span>
              <input
                type="password"
                value={authForm.password}
                onChange={(event) =>
                  setAuthForm((current) => ({
                    ...current,
                    password: event.target.value
                  }))
                }
                placeholder={authMode === "register" ? "At least 8 characters" : "Account password"}
                style={{
                  padding: "12px 14px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-default)",
                  background: "transparent",
                  color: "var(--text-primary)"
                }}
              />
            </label>

            <button
              type="button"
              onClick={() => void submitAuth()}
              disabled={state.isAuthenticating}
              style={{
                padding: "12px 18px",
                borderRadius: "8px",
                border: "none",
                background: "var(--accent-mint)",
                color: "var(--bg-surface)",
                cursor: state.isAuthenticating ? "not-allowed" : "pointer",
                opacity: state.isAuthenticating ? 0.7 : 1
              }}
            >
              {state.isAuthenticating
                ? authMode === "register"
                  ? "Creating account..."
                  : "Signing in..."
                : authMode === "register"
                  ? "Create account and join"
                  : "Login and join"}
            </button>
          </div>
        ) : null}

        <div style={{ marginTop: "32px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button
            onClick={() => router.push("/")}
            style={{
              padding: "12px 24px",
              background: "transparent",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              borderRadius: "8px",
              cursor: "pointer"
            }}
          >
            Back to Home
          </button>

          {isInvitePending && viewerMatchesInvite ? (
            <button
              onClick={() => void completeAccept()}
              disabled={state.isAccepting}
              style={{
                padding: "12px 24px",
                background: "var(--accent-mint)",
                color: "var(--bg-surface)",
                border: "none",
                borderRadius: "8px",
                cursor: state.isAccepting ? "not-allowed" : "pointer",
                opacity: state.isAccepting ? 0.7 : 1
              }}
            >
              {state.isAccepting ? "Accepting..." : "Accept Invitation"}
            </button>
          ) : null}
        </div>
      </div>
    </main>
  );
}
