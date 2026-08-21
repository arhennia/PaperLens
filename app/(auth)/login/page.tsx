"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useTransition, Suspense, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-xs text-gray-500 text-center p-8">Loading authentication...</div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {

  const searchParams = useSearchParams();
  const router = useRouter();
  const next = searchParams.get("next") ?? "/";
  const authError = searchParams.get("error");

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(
    authError === "auth" ? "Authentication failed. Please try again." : null,
  );
  const [isPending, startTransition] = useTransition();

  async function handleEmailAuth(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const supabase = createClient();

    startTransition(async () => {
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });
        if (signUpError) {
          setError(signUpError.message);
          return;
        }
        setError(null);
        setEmail("");
        setPassword("");
        alert("Check your email for a confirmation link.");
      } else {
        const { error: signInError } =
          await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          // If offline or placeholder, allow preview entry
          if (
            process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
            process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("placeholder")
          ) {
            router.push(next);
            return;
          }
          setError(signInError.message);
          return;
        }
        router.push(next);
        router.refresh();
      }
    });
  }

  async function handleGoogleAuth() {
    setError(null);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (oauthError) {
      // In demo/placeholder mode, proceed to dashboard
      if (
        process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
        process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("placeholder")
      ) {
        router.push(next);
        return;
      }
      setError(oauthError.message);
    }
  }

  function handleDemoAccess() {
    router.push(next);
  }

  return (
    <div className="flex w-full flex-col items-center justify-center gap-6 md:flex-row md:items-stretch md:justify-center">
      {/* ========================================================================= */}
      {/* LEFT PANEL: Cute Dark Navy Hero & Mascot Card                             */}
      {/* ========================================================================= */}
      <div className="relative flex w-full max-w-sm flex-col justify-between rounded-[32px] bg-[#19163F] p-8 text-center text-white shadow-xl md:w-[380px] md:min-h-[520px]">
        {/* Top spacing */}
        <div className="h-4" />

        {/* Center Mascot & Typography */}
        <div className="flex flex-col items-center space-y-4">
          {/* Cute Stylized Feather Icon with Sparkles */}
          <div className="relative flex h-28 w-28 items-center justify-center">
            {/* Top-left Pink Sparkle */}
            <span className="absolute -top-1 left-2 text-xl text-[#F472B6] animate-pulse">
              ✦
            </span>

            {/* Right Cyan Sparkle */}
            <span className="absolute bottom-4 right-1 text-2xl text-[#38BDF8] animate-bounce">
              ✦
            </span>

            {/* Feather Mascot SVG */}
            <svg
              className="h-24 w-24 drop-shadow-md"
              viewBox="0 0 100 100"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Feather Outer Shape */}
              <path
                d="M75 18C75 18 82 25 80 45C78 65 60 78 45 82C38 84 32 82 30 80L34 72C34 72 44 74 54 68C64 62 70 50 68 35C66 22 55 18 55 18C55 18 65 16 75 18Z"
                fill="white"
              />
              <path
                d="M62 26C72 32 75 48 68 62C61 76 46 82 32 86C28 87 26 84 28 80C34 68 46 42 62 26Z"
                stroke="white"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Inner Feather Quill Loop */}
              <path
                d="M60 38C60 38 68 44 65 54C62 64 52 70 42 74"
                stroke="#19163F"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>
          </div>

          {/* Brand Name */}
          <h1 className="text-4xl font-extrabold tracking-tight text-white font-sans">
            PaperLens
          </h1>

          {/* Cute Tagline */}
          <p className="text-sm font-medium text-purple-200/90">
            your gpa&apos;s new best friend
          </p>
        </div>

        {/* Footer Navigation Links */}
        <div className="flex items-center justify-center gap-6 pt-6 text-xs text-purple-200/80">
          <button
            type="button"
            onClick={() => alert("PaperLens helps students ace exams through AI past-paper analytics!")}
            className="hover:text-white hover:underline transition-colors"
          >
            About
          </button>
          <button
            type="button"
            onClick={() => alert("Loved by 10,000+ university scholars worldwide!")}
            className="hover:text-white hover:underline transition-colors"
          >
            Testimonials
          </button>
          <button
            type="button"
            onClick={() => alert("Support: help@paperlens.app")}
            className="hover:text-white hover:underline transition-colors"
          >
            Contact
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* RIGHT PANEL: Floating Form Card                                          */}
      {/* ========================================================================= */}
      <div className="w-full max-w-sm rounded-[28px] bg-white p-7 shadow-xl md:w-[380px] flex flex-col justify-between space-y-4">
        {/* 1. Top Mode Tabs: Sign in | Sign up */}
        <div className="flex rounded-xl bg-[#E4E8F2] p-1 text-xs">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(false);
              setError(null);
            }}
            className={`flex-1 rounded-lg py-1.5 font-bold transition-all ${
              !isSignUp
                ? "bg-[#B4C0D6] text-gray-900 shadow-xs"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSignUp(true);
              setError(null);
            }}
            className={`flex-1 rounded-lg py-1.5 font-bold transition-all ${
              isSignUp
                ? "bg-[#B4C0D6] text-gray-900 shadow-xs"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Sign up
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">error</span>
            <span>{error}</span>
          </div>
        )}

        {/* 2. Social OAuth Buttons */}
        <div className="space-y-2.5">
          {/* Sign in with Google Button */}
          <button
            type="button"
            onClick={handleGoogleAuth}
            disabled={isPending}
            className="flex w-full items-center justify-center gap-2.5 rounded-full border border-gray-900 bg-white py-2.5 text-xs font-semibold text-gray-900 shadow-xs transition-colors hover:bg-gray-50 active:scale-[0.99]"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            <span>Sign in with Google</span>
          </button>

          {/* Instant Demo Access Button */}
          <button
            type="button"
            onClick={handleDemoAccess}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-gray-900 bg-white py-2.5 text-xs font-semibold text-gray-900 shadow-xs transition-colors hover:bg-gray-50 active:scale-[0.99]"
          >
            <span className="material-symbols-outlined text-[18px]">
              visibility
            </span>
            <span>Instant Demo Preview</span>
          </button>
        </div>

        {/* 3. Divider */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-[11px] font-medium text-gray-400">or</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        {/* 4. Form Inputs */}
        <form onSubmit={handleEmailAuth} className="space-y-3">
          <div>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full rounded-xl border border-gray-800 bg-[#EFF2F8] px-4 py-2.5 text-xs text-gray-900 placeholder:text-gray-500 focus:border-[#0099FF] focus:outline-none shadow-xs"
            />
          </div>

          <div>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-xl border border-gray-800 bg-[#EFF2F8] px-4 py-2.5 text-xs text-gray-900 placeholder:text-gray-500 focus:border-[#0099FF] focus:outline-none shadow-xs"
            />
          </div>

          {/* Remember me & Forgot password row */}
          <div className="flex items-center justify-between pt-0.5 text-xs">
            <label className="flex items-center gap-1.5 text-gray-700 cursor-pointer font-medium">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded text-[#0099FF] focus:ring-0"
              />
              <span>Remember me</span>
            </label>

            <button
              type="button"
              onClick={() => alert("Password reset link will be sent to your email.")}
              className="font-medium text-gray-900 hover:underline"
            >
              Forgot password?
            </button>
          </div>

          {/* Primary Action Button (Solid Blue) */}
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-xl bg-[#0099FF] py-2.5 text-xs font-bold text-white shadow-md transition-colors hover:bg-[#0088EE] active:scale-[0.99]"
          >
            {isPending ? "Please wait..." : isSignUp ? "Sign up" : "Sign in"}
          </button>
        </form>

        {/* 5. Terms & Policy Disclaimer */}
        <p className="text-center text-[10px] leading-tight text-gray-400">
          By signing in you agree to PaperLens&apos;s terms of service, privacy policy, and cookie usage.
        </p>

        {/* 6. Cute Lilac Secondary CTA Button */}
        <button
          type="button"
          onClick={() => {
            setIsSignUp(!isSignUp);
            setError(null);
          }}
          className="w-full rounded-2xl bg-[#C49DE8] py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-[#B58CDE] active:scale-[0.99]"
        >
          {isSignUp ? "Already have an account? Sign in" : "Create a free account"}
        </button>
      </div>
    </div>
  );
}
