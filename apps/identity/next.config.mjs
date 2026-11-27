import { validateDeployConfig } from "./lib/deploy-config.mjs";
validateDeployConfig(process.env);

/** @type {import('next').NextConfig} */
const config = {
  poweredByHeader: false,
  async headers() { return [{ source: '/:path*', headers: [
    { key: 'Cache-Control', value: 'no-store' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  ] }]; },
};
export default config;
