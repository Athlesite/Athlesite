"use client";

import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { maskEmail } from "@/components/auth/otpMachine";
import type { InlineOtp } from "@/components/auth/useInlineOtp";

/**
 * Inline email OTP, rendered in place at the save step.
 *
 * Presentational: all state lives in useInlineOtp, held higher in the tree so
 * it survives step changes. Nothing here navigates — no Link, no router, no
 * form action, no window.location. Navigating away would revoke the blob URLs
 * behind the athlete's selected photos.
 *
 * Note the deliberate absence of any code-length assumption: no maxLength, no
 * digit count in the copy. The live project issues 8-digit codes and the length
 * is a dashboard setting that can change without a deploy.
 */
export function InlineOtpForm({ otp }: { otp: InlineOtp }) {
  const emailId = useId();
  const codeId = useId();
  const errorId = useId();

  const { state, busy, resendIn } = otp;

  // Nothing to show while the session check is in flight, or once signed in —
  // the signed-in confirmation is rendered by the step itself.
  if (state.status === "checking" || state.status === "signedIn") {
    return null;
  }

  const collectingCode = state.status === "collectingCode" || state.status === "verifying";

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      {collectingCode ? (
        <>
          <label htmlFor={codeId} className="block text-sm font-medium text-foreground">
            Enter the code we emailed you
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            Sent to {maskEmail(state.email)}. It may take a minute — check spam too.
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              id={codeId}
              value={state.code}
              onChange={(event) => otp.setCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && state.code && !busy) {
                  event.preventDefault();
                  void otp.verifyCode();
                }
              }}
              disabled={busy}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Paste or type your code"
              aria-invalid={Boolean(state.error)}
              aria-describedby={state.error ? errorId : undefined}
              className={cn(
                "w-full rounded-lg border bg-background px-4 py-3 font-mono text-base tracking-[0.25em] text-foreground outline-none transition-colors placeholder:font-sans placeholder:tracking-normal placeholder:text-muted-foreground/50 focus:border-accent disabled:opacity-60",
                state.error ? "border-red-500/60" : "border-border"
              )}
            />
            <Button
              type="button"
              onClick={() => void otp.verifyCode()}
              disabled={busy || !state.code.trim()}
              className="shrink-0"
            >
              {state.status === "verifying" ? "Checking…" : "Verify"}
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <button
              type="button"
              onClick={otp.changeEmail}
              disabled={busy}
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
            >
              Use a different email
            </button>
            <button
              type="button"
              onClick={() => void otp.sendCode()}
              disabled={busy || resendIn > 0}
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50 disabled:no-underline"
            >
              {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
            </button>
          </div>
        </>
      ) : (
        <>
          <label htmlFor={emailId} className="block text-sm font-medium text-foreground">
            Save your Athlesite
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            We&apos;ll email you a code to confirm it&apos;s you. This is how you get back in
            to edit your profile later.
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              id={emailId}
              value={state.email}
              onChange={(event) => otp.setEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && state.email && !busy) {
                  event.preventDefault();
                  void otp.sendCode();
                }
              }}
              disabled={busy}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              aria-invalid={Boolean(state.error)}
              aria-describedby={state.error ? errorId : undefined}
              className={cn(
                "w-full rounded-lg border bg-background px-4 py-3 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-accent disabled:opacity-60",
                state.error ? "border-red-500/60" : "border-border"
              )}
            />
            <Button
              type="button"
              onClick={() => void otp.sendCode()}
              disabled={busy || !state.email.trim()}
              className="shrink-0"
            >
              {state.status === "sending" ? "Sending…" : "Send code"}
            </Button>
          </div>
        </>
      )}

      {state.error ? (
        <p id={errorId} role="alert" className="mt-3 text-xs text-red-400">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
