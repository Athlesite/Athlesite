"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { sendEmailOtp, verifyEmailOtp, getCurrentUser } from "@/lib/supabase/auth";
import {
  otpReducer,
  initialOtpState,
  resendSecondsRemaining,
  isAuthenticated,
  isBusy,
  RESEND_COOLDOWN_SECONDS,
  type OtpState,
} from "@/components/auth/otpMachine";

/**
 * Wires the pure OTP state machine to the Supabase auth helpers.
 *
 * This hook is called once, high in the onboarding tree, so the flow survives
 * moving between wizard steps — stepping Back to fix a typo and returning must
 * not discard an outstanding code and force a second send, which would burn a
 * rate-limited email.
 *
 * It performs no navigation of any kind. No router.push, no router.refresh, no
 * location changes: onboarding holds photo File/blob state in memory, and a
 * remount would revoke those object URLs.
 */
export type InlineOtp = {
  state: OtpState;
  authenticated: boolean;
  busy: boolean;
  resendIn: number;
  setEmail: (value: string) => void;
  setCode: (value: string) => void;
  sendCode: () => Promise<void>;
  verifyCode: () => Promise<void>;
  changeEmail: () => void;
};

export function useInlineOtp(): InlineOtp {
  const [state, dispatch] = useReducer(otpReducer, initialOtpState);
  // Ticks once a second only while a cooldown is running, so the countdown
  // renders without a permanent interval.
  const [now, setNow] = useState(() => Date.now());
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;

    // Detect an existing session so an already-signed-in athlete never sees the
    // OTP UI. Guarded because createClient throws when Supabase env values are
    // absent, and the local-draft onboarding flow must still work without them.
    (async () => {
      let email: string | null = null;
      try {
        const user = await getCurrentUser();
        email = user?.email ?? null;
      } catch {
        email = null;
      }
      if (!cancelled.current) dispatch({ type: "SESSION_CHECKED", email });
    })();

    return () => {
      cancelled.current = true;
    };
  }, []);

  const resendIn = resendSecondsRemaining(state, now);

  const lastSentAt = state.lastSentAt;
  useEffect(() => {
    if (lastSentAt == null) return;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      // Stop once the cooldown is spent, rather than leaving an interval
      // running for the rest of the session.
      if (current - lastSentAt >= RESEND_COOLDOWN_SECONDS * 1000) {
        clearInterval(id);
      }
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastSentAt]);

  const setEmail = useCallback((value: string) => {
    dispatch({ type: "EMAIL_CHANGED", value });
  }, []);

  const setCode = useCallback((value: string) => {
    dispatch({ type: "CODE_CHANGED", value });
  }, []);

  const sendCode = useCallback(async () => {
    dispatch({ type: "SEND_STARTED" });
    try {
      const result = await sendEmailOtp(state.email);
      if (result.ok) {
        dispatch({ type: "SEND_SUCCEEDED", at: Date.now() });
      } else {
        dispatch({ type: "SEND_FAILED", message: result.message });
      }
    } catch {
      // Never surface a raw provider or configuration error to an athlete.
      dispatch({
        type: "SEND_FAILED",
        message: "Couldn't send your code right now. Try again in a moment.",
      });
    }
  }, [state.email]);

  const verifyCode = useCallback(async () => {
    dispatch({ type: "VERIFY_STARTED" });
    try {
      const result = await verifyEmailOtp(state.email, state.code);
      if (result.ok) {
        dispatch({ type: "VERIFY_SUCCEEDED", email: result.user.email ?? null });
      } else {
        dispatch({ type: "VERIFY_FAILED", message: result.message });
      }
    } catch {
      dispatch({
        type: "VERIFY_FAILED",
        message: "Couldn't check that code right now. Try again in a moment.",
      });
    }
  }, [state.email, state.code]);

  const changeEmail = useCallback(() => {
    dispatch({ type: "CHANGE_EMAIL" });
  }, []);

  return {
    state,
    authenticated: isAuthenticated(state),
    busy: isBusy(state),
    resendIn,
    setEmail,
    setCode,
    sendCode,
    verifyCode,
    changeEmail,
  };
}
