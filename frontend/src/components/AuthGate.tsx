import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { AlertCircle, ArrowLeft, CheckCircle2, KeyRound, LogOut, MailCheck, RefreshCw } from "lucide-react";
import { APP_NAME, APP_TAGLINE } from "../../../appConfig";
import { auth, IS_EMULATOR_MODE } from "../config/firebase";
import { api } from "../services/api";
import { AnvilPolyBackdrop, AnvilWordmark } from "./AnvilLogo";

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
      return "Wrong username or password.";
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
  const [view, setView] = useState<"login" | "register" | "forgot">("login");

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Email verification OTP state
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyDelivery, setVerifyDelivery] = useState<"smtp" | "emulator" | null>(null);
  const [canQuickVerify, setCanQuickVerify] = useState(false);
  const [emulatorVerifyCode, setEmulatorVerifyCode] = useState<string | null>(null);
  const sentOnUidRef = useRef<string | null>(null);

  // Forgot password OTP state
  const [forgotStep, setForgotStep] = useState<"request" | "reset">("request");
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emulatorResetCode, setEmulatorResetCode] = useState<string | null>(null);

  const checkVerificationStatus = useCallback(async () => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    if (auth.currentUser.emailVerified) {
      await auth.currentUser.getIdToken(true);
      await onVerified();
      return true;
    }
    return false;
  }, [onVerified]);

  const requestVerificationCode = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      if (await checkVerificationStatus()) {
        return;
      }
      let firebaseEmailSent = false;
      if (auth.currentUser && !IS_EMULATOR_MODE) {
        // Send official verification email directly through Google Firebase Cloud
        try {
          await sendEmailVerification(auth.currentUser);
          firebaseEmailSent = true;
        } catch (err) {
          console.warn("Firebase sendEmailVerification notice:", err);
        }
      }
      try {
        const res = await api.sendVerificationCode();
        if (res.alreadyVerified) {
          await checkVerificationStatus();
          return;
        }
        setVerifyDelivery(res.delivery);
        setCanQuickVerify(Boolean(res.canQuickVerify));
        setEmulatorVerifyCode(res.emulatorCode ?? null);
        setInfo(
          firebaseEmailSent || res.delivery === "smtp"
            ? `Verification email sent to ${auth.currentUser?.email}. Check your inbox!`
            : `6-digit verification code generated for ${auth.currentUser?.email}.`
        );
      } catch (otpErr) {
        if (firebaseEmailSent) {
          setInfo(
            `Firebase verification link sent to ${auth.currentUser?.email}. Click the link in your inbox, then click "I Verified My Email".`
          );
        } else {
          throw otpErr;
        }
      }
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  }, [checkVerificationStatus]);

  useEffect(() => {
    if (!firebaseUser || firebaseUser.emailVerified) {
      sentOnUidRef.current = null;
      return;
    }
    if (sentOnUidRef.current === firebaseUser.uid) return;
    sentOnUidRef.current = firebaseUser.uid;
    void requestVerificationCode();
  }, [firebaseUser, requestVerificationCode]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const resolved = await api.loginWithUsername(username.trim(), password);
      const cred = await signInWithEmailAndPassword(auth, resolved.email, password);
      await cred.user.reload();
      if (cred.user.emailVerified) {
        await cred.user.getIdToken(true);
        await onVerified();
      } else {
        setError("Your email is not verified yet. Enter the verification code sent to your email.");
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
        await cred.user.delete().catch(() => undefined);
        throw profileErr;
      }

      sentOnUidRef.current = cred.user.uid;
      const otpRes = await api.sendVerificationCode();
      setVerifyDelivery(otpRes.delivery);
      setCanQuickVerify(Boolean(otpRes.canQuickVerify));
      setEmulatorVerifyCode(otpRes.emulatorCode ?? null);
      setInfo(
        otpRes.delivery === "smtp"
          ? `Verification code sent to ${cleanEmail}.`
          : `Account created for ${cleanEmail}. Enter the code below or click Verify Now.`
      );
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await api.verifyEmailCode({ code: verifyCode.trim() });
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      await onVerified();
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleQuickVerify = async () => {
    if (!auth.currentUser) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await api.verifyEmailCode({ emulatorQuickVerify: true });
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      await onVerified();
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleForgotSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const cleanEmail = forgotEmail.trim();
      // Send real password reset email directly via Google Firebase
      await sendPasswordResetEmail(auth, cleanEmail);
      setInfo(`Firebase has sent a password reset email to ${cleanEmail}. Check your inbox (and spam folder)!`);
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleForgotResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.resetPassword(forgotEmail.trim(), resetCode.trim(), newPassword);
      setUsername(res.username);
      setPassword("");
      setResetCode("");
      setNewPassword("");
      setConfirmPassword("");
      setEmulatorResetCode(null);
      setForgotStep("request");
      setView("login");
      setInfo(`Password updated for ${res.username}. Sign in with your username and new password.`);
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setError(null);
    setInfo(null);
    setVerifyCode("");
    setEmulatorVerifyCode(null);
    sentOnUidRef.current = null;
    await signOut(auth);
  };

  // Verification gate if user is authenticated in Firebase but unverified
  if (firebaseUser && !firebaseUser.emailVerified) {
    return (
      <div className="relative h-screen w-screen bg-[#1e1e1e] text-[#cccccc] flex items-center justify-center p-4 overflow-hidden">
        <AnvilPolyBackdrop />
        <div className="relative z-10 w-full max-w-md anvil-poly-frame shadow-2xl p-6">
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
                Enter the 6-digit verification code sent to{" "}
                <span className="text-[#cccccc] font-mono">{firebaseUser.email}</span>.
              </p>
            </div>
          </div>

          {verifyDelivery === "emulator" && (
            <div className="anvil-poly-card p-3 mb-4 text-[11px] text-[#9cdcfe] space-y-1">
              <div>
                <strong>Local Dev Mode</strong> (SMTP not configured in <code>.env</code>):
                {emulatorVerifyCode ? (
                  <>
                    {" "}
                    your verification code is{" "}
                    <span className="font-mono font-bold text-white text-[13px]">{emulatorVerifyCode}</span>.
                  </>
                ) : null}
              </div>
              <div className="text-[#858585]">
                To send real emails to your Gmail inbox, configure <code>SMTP_HOST</code>, <code>SMTP_USER</code>,
                and <code>SMTP_PASS</code> in <code>.env</code>.
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 anvil-poly-card anvil-poly-card-danger text-[#f48771] px-3 py-2 mb-4 text-[12px]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {info && (
            <div className="anvil-poly-card anvil-poly-card-success text-[#89d185] px-3 py-2 mb-4 text-[12px]">
              {info}
            </div>
          )}

          <form onSubmit={handleVerifySubmit} className="space-y-3">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-[#9d9d9d] mb-1">
                6-Digit Verification Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-full bg-[#3c3c3c] border border-[#3c3c3c] focus:border-[#007acc] focus:outline-none px-3 py-2 text-[18px] font-mono tracking-[0.4em] text-center text-white"
              />
            </div>

            <button
              type="submit"
              disabled={busy || verifyCode.trim().length !== 6}
              className="w-full anvil-btn anvil-btn-primary disabled:opacity-50 text-white py-2 px-3 text-[13px] font-medium flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Verify Email
            </button>
          </form>

          <div className="flex flex-col gap-2 mt-3">
            {canQuickVerify && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleQuickVerify()}
                className="w-full anvil-btn anvil-btn-success disabled:opacity-50 text-white py-2 px-3 text-[13px] font-medium cursor-pointer"
              >
                Verify Now (Quick Verify)
              </button>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setError(null);
                setBusy(true);
                void checkVerificationStatus()
                  .then((verified) => {
                    if (!verified) {
                      setError("Email is not verified yet. Open the link in your inbox or enter the 6-digit code.");
                    }
                  })
                  .catch((err) => setError(formatFirebaseAuthError(err)))
                  .finally(() => setBusy(false));
              }}
              className="w-full anvil-btn anvil-btn-secondary disabled:opacity-50 text-white py-2 px-3 text-[13px] flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-[#4ec9b0]" />
              I Verified My Email — Continue
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => void requestVerificationCode()}
              className="w-full anvil-btn anvil-btn-secondary disabled:opacity-50 text-[#cccccc] py-2 px-3 text-[13px] flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />
              Resend Verification Code
            </button>

            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="w-full anvil-btn anvil-btn-ghost text-[#9d9d9d] hover:text-white py-2 px-3 text-[12px] flex items-center justify-center gap-2 mt-1 cursor-pointer"
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
    <div className="relative h-screen w-screen bg-[#1e1e1e] text-[#cccccc] flex items-center justify-center p-4 overflow-hidden">
      <AnvilPolyBackdrop />
      <div className="relative z-10 w-full max-w-md anvil-poly-frame shadow-2xl">
        <div className="bg-[#2c2d30]/90 border-b border-[#3c3c3c] px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <AnvilWordmark size="sm" />
            <span className="text-[11px] text-[#9d9d9d] border-l border-[#3c3c3c] pl-2.5 truncate">
              {APP_TAGLINE}
            </span>
          </div>
          <span className="text-[11px] text-[#858585] font-mono shrink-0">Dark+</span>
        </div>

        {view !== "forgot" ? (
          <div className="flex border-b border-[#3c3c3c]">
            <button
              type="button"
              onClick={() => {
                setView("login");
                setError(null);
                setInfo(null);
              }}
              className={`flex-1 py-2.5 text-[12px] font-medium uppercase tracking-wider cursor-pointer transition-colors ${
                view === "login"
                  ? "bg-[#1e1e1e] text-white border-t-2 border-t-[#007acc]"
                  : "bg-[#2a2b2e] text-[#858585] hover:text-[#cccccc]"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setView("register");
                setError(null);
                setInfo(null);
              }}
              className={`flex-1 py-2.5 text-[12px] font-medium uppercase tracking-wider cursor-pointer transition-colors ${
                view === "register"
                  ? "bg-[#1e1e1e] text-white border-t-2 border-t-[#007acc]"
                  : "bg-[#2a2b2e] text-[#858585] hover:text-[#cccccc]"
              }`}
            >
              Create Account
            </button>
          </div>
        ) : (
          <div className="px-5 py-2.5 border-b border-[#3c3c3c] bg-[#1e1e1e] flex items-center justify-between">
            <span className="text-[12px] font-medium uppercase tracking-wider text-white flex items-center gap-2">
              <KeyRound className="w-3.5 h-3.5 text-[#007acc]" />
              Reset Password
            </span>
            <button
              type="button"
              onClick={() => {
                setView("login");
                setForgotStep("request");
                setError(null);
                setInfo(null);
              }}
              className="text-[11px] text-[#9cdcfe] hover:text-white flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3 h-3" />
              Back to Sign In
            </button>
          </div>
        )}

        {view === "login" && (
          <form onSubmit={handleLogin} className="p-6 space-y-4">
            {error && (
              <div className="flex items-start gap-2 anvil-poly-card anvil-poly-card-danger text-[#f48771] px-3 py-2 text-[12px]">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {info && (
              <div className="anvil-poly-card anvil-poly-card-success text-[#89d185] px-3 py-2 text-[12px]">
                {info}
              </div>
            )}

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-[#9d9d9d] mb-1">
                Username
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. alice"
                autoComplete="username"
                className="w-full bg-[#3c3c3c] border border-[#3c3c3c] focus:border-[#007acc] focus:outline-none px-3 py-2 text-[13px] text-white"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] uppercase tracking-wider text-[#9d9d9d]">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setView("forgot");
                    setForgotStep("request");
                    setError(null);
                    setInfo(null);
                  }}
                  className="text-[11px] text-[#9cdcfe] hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                className="w-full bg-[#3c3c3c] border border-[#3c3c3c] focus:border-[#007acc] focus:outline-none px-3 py-2 text-[13px] text-white"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full anvil-btn anvil-btn-primary disabled:opacity-50 text-white py-2.5 px-4 text-[13px] font-medium cursor-pointer"
            >
              {busy ? "Signing In..." : `Sign In to ${APP_NAME}`}
            </button>
          </form>
        )}

        {view === "register" && (
          <form onSubmit={handleRegister} className="p-6 space-y-4">
            {error && (
              <div className="flex items-start gap-2 anvil-poly-card anvil-poly-card-danger text-[#f48771] px-3 py-2 text-[12px]">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {info && (
              <div className="anvil-poly-card anvil-poly-card-success text-[#89d185] px-3 py-2 text-[12px]">
                {info}
              </div>
            )}

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
                autoComplete="new-password"
                className="w-full bg-[#3c3c3c] border border-[#3c3c3c] focus:border-[#007acc] focus:outline-none px-3 py-2 text-[13px] text-white"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full anvil-btn anvil-btn-primary disabled:opacity-50 text-white py-2.5 px-4 text-[13px] font-medium cursor-pointer"
            >
              {busy ? "Creating Account..." : `Register for ${APP_NAME}`}
            </button>
          </form>
        )}

        {view === "forgot" && forgotStep === "request" && (
          <form onSubmit={handleForgotSendCode} className="p-6 space-y-4">
            {error && (
              <div className="flex items-start gap-2 anvil-poly-card anvil-poly-card-danger text-[#f48771] px-3 py-2 text-[12px]">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <p className="text-[12px] text-[#9d9d9d]">
              Enter the email address linked to your account and we will send a 6-digit password reset code.
            </p>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-[#9d9d9d] mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@studio.dev"
                autoComplete="email"
                className="w-full bg-[#3c3c3c] border border-[#3c3c3c] focus:border-[#007acc] focus:outline-none px-3 py-2 text-[13px] text-white"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full anvil-btn anvil-btn-primary disabled:opacity-50 text-white py-2.5 px-4 text-[13px] font-medium cursor-pointer"
            >
              {busy ? "Sending Code..." : "Send Reset Code"}
            </button>
          </form>
        )}

        {view === "forgot" && forgotStep === "reset" && (
          <form onSubmit={handleForgotResetPassword} className="p-6 space-y-4">
            {error && (
              <div className="flex items-start gap-2 anvil-poly-card anvil-poly-card-danger text-[#f48771] px-3 py-2 text-[12px]">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {info && (
              <div className="anvil-poly-card anvil-poly-card-success text-[#89d185] px-3 py-2 text-[12px]">
                {info}
              </div>
            )}

            {IS_EMULATOR_MODE && emulatorResetCode && (
              <div className="anvil-poly-card p-3 text-[11px] text-[#9cdcfe]">
                Emulator Mode reset code:{" "}
                <span className="font-mono font-bold text-white">{emulatorResetCode}</span>
              </div>
            )}

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-[#9d9d9d] mb-1">
                6-Digit Code Sent to {forgotEmail}
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-full bg-[#3c3c3c] border border-[#3c3c3c] focus:border-[#007acc] focus:outline-none px-3 py-2 text-[16px] font-mono tracking-[0.35em] text-center text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-[#9d9d9d] mb-1">
                New Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                autoComplete="new-password"
                className="w-full bg-[#3c3c3c] border border-[#3c3c3c] focus:border-[#007acc] focus:outline-none px-3 py-2 text-[13px] text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-[#9d9d9d] mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                autoComplete="new-password"
                className="w-full bg-[#3c3c3c] border border-[#3c3c3c] focus:border-[#007acc] focus:outline-none px-3 py-2 text-[13px] text-white"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleForgotSendCode({ preventDefault: () => {} } as React.FormEvent)}
                className="anvil-btn anvil-btn-secondary text-[#cccccc] hover:text-white px-3.5 py-2 text-[12px] cursor-pointer"
              >
                Resend
              </button>
              <button
                type="submit"
                disabled={busy || resetCode.trim().length !== 6}
                className="flex-1 anvil-btn anvil-btn-primary disabled:opacity-50 text-white py-2 px-4 text-[13px] font-medium cursor-pointer"
              >
                {busy ? "Resetting..." : "Reset Password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
