"use client";

import { useEffect, useState } from "react";
import { signIn, signUp } from "@/api/UserAPI";
import { getSupabaseClient } from "@/utils/supabaseClient";

function errorMessage(error) {
  const detail = error?.response?.data?.error;
  if (typeof detail === "string") return detail;
  if (detail?.reason) return detail.reason;
  if (!error?.response) return "We couldn’t connect. Please try again in a moment.";
  return "Something went wrong. Please try again.";
}

export default function AuthCard() {
  const [mode, setMode] = useState("signin");
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState(null);
  const creatingAccount = mode === "signup";

  useEffect(() => {
    let active = true;
    let subscription;
    let authChanged = false;
    try {
      const supabase = getSupabaseClient();
      subscription = supabase.auth.onAuthStateChange((_event, session) => {
        authChanged = true;
        if (active) setUser(session?.user ?? null);
      }).data.subscription;
      supabase.auth.getSession().then(({ data, error }) => {
        if (!active) return;
        if (!authChanged && !error) setUser(data.session?.user ?? null);
      }).catch(() => {
        // A failed restoration should still let the visitor sign in again.
      }).finally(() => {
        if (active) setCheckingSession(false);
      });
    } catch {
      setCheckingSession(false);
    }
    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  function changeMode(nextMode) {
    setMode(nextMode);
    setNotice(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setPending(true);
    setNotice(null);
    try {
      const password = values.get("password");
      const result = creatingAccount
        ? await signUp({
            name: values.get("name").trim(),
            username: values.get("username").trim().toLowerCase(),
            email: values.get("email").trim(),
            password,
          })
        : await signIn({ identifier: values.get("identifier").trim(), password });
      if (result.session?.user) {
        setUser(result.session.user);
      } else if (creatingAccount) {
        setMode("signin");
        setNotice({ type: "success", text: "Check your email to confirm your account, then come back to sign in." });
      } else {
        setNotice({ type: "error", text: "We couldn’t finish signing you in. Please try again." });
      }
      form.reset();
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error) });
    } finally {
      setPending(false);
    }
  }

  async function handleSignOut() {
    setPending(true);
    setNotice(null);
    try {
      const { error } = await getSupabaseClient().auth.signOut({ scope: "local" });
      if (error) throw error;
      setUser(null);
    } catch {
      setNotice({ type: "error", text: "We couldn’t sign you out. Please try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="auth-card" id="account" aria-labelledby="account-title" aria-busy={pending || checkingSession}>
      {user ? (
        <>
          <div className="account-check" aria-hidden="true">✓</div>
          <p className="eyebrow">YOU’RE IN</p>
          <h2 id="account-title">Welcome back{user.user_metadata?.name ? `, ${user.user_metadata.name}` : ""}.</h2>
          <p className="card-description">You’re signed in to UW Score Tracker.</p>
          <p className="account-email">{user.email}</p>
          <button className="submit-button" onClick={handleSignOut} disabled={pending}>
            {pending ? "Signing out…" : "Sign out"}
          </button>
        </>
      ) : (
        <>
          <div className="auth-switch" aria-label="Account options">
            <button type="button" aria-pressed={!creatingAccount} disabled={pending} onClick={() => changeMode("signin")}>Sign in</button>
            <button type="button" aria-pressed={creatingAccount} disabled={pending} onClick={() => changeMode("signup")}>Create account</button>
          </div>
          <h2 id="account-title">{creatingAccount ? "Let’s get you started." : "Good to see you."}</h2>
          <p className="card-description">{creatingAccount ? "A few details, and you’re on your way." : "Sign in to your account to get started."}</p>
          <form key={mode} onSubmit={handleSubmit}>
            <fieldset disabled={pending || checkingSession}>
              <legend className="sr-only">{creatingAccount ? "Create your account" : "Sign in to your account"}</legend>
              {creatingAccount ? (
                <>
                  <label htmlFor="name">Name</label>
                  <input id="name" name="name" autoComplete="name" placeholder="Your name" required maxLength={80} />
                  <label htmlFor="username">Username</label>
                  <input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Choose a username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" aria-describedby="username-hint" />
                  <p className="field-hint" id="username-hint">3–24 letters, numbers, or underscores.</p>
                  <label htmlFor="email">Email address</label>
                  <input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
                </>
              ) : (
                <>
                  <label htmlFor="identifier">Email or username</label>
                  <input id="identifier" name="identifier" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" required />
                </>
              )}
              <label htmlFor="password">Password</label>
              <input id="password" name="password" type="password" autoComplete={creatingAccount ? "new-password" : "current-password"} placeholder={creatingAccount ? "At least 6 characters" : "Enter your password"} minLength={creatingAccount ? 6 : undefined} required />
              <button className="submit-button" type="submit">
                <span>{checkingSession ? "Getting ready…" : pending ? (creatingAccount ? "Creating account…" : "Signing in…") : creatingAccount ? "Create account" : "Sign in"}</span>
                {!pending && !checkingSession && <span aria-hidden="true">→</span>}
              </button>
            </fieldset>
          </form>
          <p className="switch-prompt">
            {creatingAccount ? "Already have an account?" : "New around here?"}{" "}
            <button type="button" disabled={pending} onClick={() => changeMode(creatingAccount ? "signin" : "signup")}>
              {creatingAccount ? "Sign in" : "Create an account"}
            </button>
          </p>
        </>
      )}
      {notice && <p className={`form-notice ${notice.type}`} role={notice.type === "error" ? "alert" : "status"}>{notice.text}</p>}
    </section>
  );
}
