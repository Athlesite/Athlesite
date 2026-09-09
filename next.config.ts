import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Testing on a real phone? `next dev` 403s requests to `/_next/*` from any
   * host it was not started with, so opening the dev server by LAN IP serves
   * the page but none of its JavaScript. Onboarding then renders blank rather
   * than erroring, because the wizard is gated behind hydration.
   *
   * Add your machine's LAN IP locally while device-testing, then remove it —
   * it is machine-specific and does not belong in shared config:
   *
   *   allowedDevOrigins: ["192.168.x.x"],
   *
   * Development only; the option has no effect in a production build.
   */
};

export default nextConfig;
