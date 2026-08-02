import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the floating Next.js dev-tools indicator (the "N" circle) so it doesn't
  // sit on top of the app while previewing.
  devIndicators: false,
  // Allow the dev server to accept requests proxied through tunnel domains
  // (used to test on real phones over HTTPS — e.g. localtunnel / cloudflare).
  allowedDevOrigins: [
    "careshift-danu.loca.lt",
    "*.loca.lt",
    "*.trycloudflare.com",
    "*.ngrok-free.app",
  ],
  experimental: {
    // Server Actions run behind Plesk's reverse proxy in production; the public
    // host must be trusted or Next rejects the action ("Invalid Server Actions
    // request"). List the live subdomain (add more tenant domains as they go live).
    serverActions: {
      allowedOrigins: ["shift.pristinecaregroup.au"],
      // Worker profile photos + chat images are posted through server actions.
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
