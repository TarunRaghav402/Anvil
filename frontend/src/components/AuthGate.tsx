import React, { useState } from "react";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { MailCheck, RefreshCw, LogOut, AlertCircle } from "lucide-react";
import { APP_NAME, APP_TAGLINE } from "../../../appConfig";
import { auth, IS_EMULATOR_MODE } from "../config/firebase";
import { api } from "../services/api";
import { AnvilWordmark } from "./AnvilLogo";

interface AuthGateProps {
  firebaseUser: User | null;
  onVerified: () => Promise<void>;
}

function formatFirebaseAuthError(err: unknown): string {
  const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code: string }).code) : "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Wrong email or password.";
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    default:
      return err instanceof Error ? err.message : "Authentication failed.";
  }
}

export const AuthGate: React.FC<AuthGateProps> = ({ firebaseUser, onVerified }) => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      await cred.user.reload();
      if (!cred.user.emailVerified) {
        setError("Your email is not verified yet. Verify your email to enter Anvil.");
      } else {
        await cred.user.getIdToken(true);
        await onVerified();
      }
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const cleanUsername = username.trim();
    const cleanEmail = email.trim();

    if (!cleanUsername || !cleanEmail || !password) {
      setError("Username, email, and password are all required.");
      return;
    }

    setBusy(true);
    try {
      const check = await api.checkUsername(cleanUsername);
      if (!check.available) {
        setError(check.error || "Username is already taken.");
        setBusy(false);
        return;
      }

      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      try {
        await updateProfile(cred.user, { displayName: cleanUsername });
        await api.registerProfile(cleanUsername);
      } catch (profileErr) {
        // Roll back newly created Firebase Auth user if SQL profile registration fails (e.g. username race)
        await cred.user.delete().catch(() => undefined);
        throw profileErr;
      }

      await sendEmailVerification(cred.user, {
        url: window.location.origin,
      });
      setInfo(`Verification email sent to ${cleanEmail}. Verify your email to continue.`);
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleResendVerification = async () => {
    if (!auth.currentUser) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await sendEmailVerification(auth.currentUser, {
        url: window.location.origin,
      });
      setInfo(`Verification email re-sent to ${auth.currentUser.email}.`);
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCheckVerification = async () => {
    if (!auth.currentUser) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        await auth.currentUser.getIdToken(true);
        await onVerified();
      } else {
        setError("Email is still unverified. Click the verification link in your email first.");
      }
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setError(null);
    setInfo(null);
    await signOut(auth);
  };

  // Verification gate if user is authenticated in Firebase but unverified
  if (firebaseUser && !firebaseUser.emailVerified) {
    return (
      <div className="h-screen w-screen bg-[#1e1e1e] text-[#cccccc] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#252526] border border-[#3c3c3c] p-6">
          <div className="flex items-center justify-between border-b border-[#3c3c3c] pb-4 mb-5">
            <AnvilWordmark size="md" />
            <span className="text-[11px] uppercase tracking-wider text-[#858585]">
              Email Verification
            </span>
          </div>

          <div className="flex items-start gap-3 mb-4">
            <MailCheck className="w-5 h-5 text-[#007acc] shrink-0 mt-0.5" />
            <div>
              <h1 className="text-[15px] font-semibold text-[#e5e5e5] mb-1">
                Verify your email for {APP_NAME}
              </h1>
              <p className="text-[12px] text-[#9d9d9d] leading-relaxed">
                A verification link was sent to{" "}
                <span className="text-[#cccccc] font-mono">{firebaseUser.email}</span>. You must
                verify your email before creating or joining sessions.
              </p>
            </div>
          </div>

          {IS_EMULATOR_MODE && (
            <div className="bg-[#1e1e1e] border border-[#3c3c3c] p-3 mb-4 text-[11px] text-[#9cdcfe]">
              Emulator Mode: open the Firebase Auth Emulator logs or UI at{" "}
              <span className="font-mono">http://127.0.0.1:4000/auth</span> to find the verification
              URL, open it in a browser tab, then click <strong>Check Verification Status</strong>.
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-[#5a1d1d] border border-[#be1100] text-[#f48771] px-3 py-2 mb-4 text-[12px]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {info && (
            <div className="bg-[#1b3a2b] border border-[#2ea043] text-[#89d185] px-3 py-2 mb-4 text-[12px]">
              {info}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={handleCheckVerification}
              className="w-full bg-[#007acc] hover:bg-[#1f8ad2] disabled:opacity-50 text-white py-2 px-3 text-[13px] font-medium flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
              Check Verification Status
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={handleResendVerification}
              className="w-full bg-[#3c3c3c] hover:bg-[#4c4c4c] disabled:opacity-50 text-[#cccccc] py-2 px-3 text-[13px] cursor-pointer"
            >
              Resend Verification Email
            </button>

            <button
              type="button"
              onClick={handleSignOut}
              className="w-full bg-transparent hover:bg-[#2a2d2e] border border-[#3c3c3c] text-[#9d9d9d] py-2 px-3 text-[12px] flex items-center justify-center gap-2 mt-1 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out / Switch Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#1e1e1e] text-[#cccccc] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#252526] border border-[#3c3c3c]">
        <div className="bg-[#333333] border-b border-[#3c3c3c] px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AnvilWordmark size="md" />
            <span className="text-[11px] text-[#858585] border-l border-[#3c3c3c] pl-3">
              {APP_TAGLINE}
            </span>
          </div>
          <span className="text-[11px] text-[#858585] font-mono">Dark+</span>
        </div>

        <div className="flex border-b border-[#3c3c3c]">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
              setInfo(null);
            }}
            className={`flex-1 py-2.5 text-[12px] font-medium uppercase tracking-wider cursor-pointer ${
              mode === "login"
                ? "bg-[#1e1e1e] text-white border-t-2 border-t-[#007acc]"
                : "bg-[#2d2d2d] text-[#858585] hover:text-[#cccccc]"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError(null);
              setInfo(null);
            }}
            className={`flex-1 py-2.5 text-[12px] font-medium uppercase tracking-wider cursor-pointer ${
              mode === "register"
                ? "bg-[#1e1e1e] text-white border-t-2 border-t-[#007acc]"
                : "bg-[#2d2d2d] text-[#858585] hover:text-[#cccccc]"
            }`}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={mode === "login" ? handleLogin : handleRegister} className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-[#5a1d1d] border border-[#be1100] text-[#f48771] px-3 py-2 text-[12px]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {info && (
            <div className="bg-[#1b3a2b] border border-[#2ea043] text-[#89d185] px-3 py-2 text-[12px]">
              {info}
            </div>
          )}

          {mode === "register" && (
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-[#9d9d9d] mb-1">
                Username
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. alex_dev"
                autoComplete="username"
                className="w-full bg-[#3c3c3c] border border-[#3c3c3c] focus:border-[#007acc] focus:outline-none px-3 py-2 text-[13px] text-white"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[#9d9d9d] mb-1">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@studio.dev"
              autoComplete="email"
              className="w-full bg-[#3c3c3c] border border-[#3c3c3c] focus:border-[#007acc] focus:outline-none px-3 py-2 text-[13px] text-white"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[#9d9d9d] mb-1">
              Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="w-full bg-[#3c3c3c] border border-[#3c3c3c] focus:border-[#007acc] focus:outline-none px-3 py-2 text-[13px] text-white"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-[#007acc] hover:bg-[#1f8ad2] disabled:opacity-50 text-white py-2 px-4 text-[13px] font-medium cursor-pointer"
          >
            {busy
              ? "Working..."
              : mode === "login"
              ? `Sign In to ${APP_NAME}`
              : `Register for ${APP_NAME}`}
          </button>
        </form>
      </div>
    </div>
  );
};
