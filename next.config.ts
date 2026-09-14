import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tesseract spawns a worker by resolving a path inside its own package at
  // runtime. Bundling it rewrites that path to /ROOT/node_modules/... which
  // does not exist once the route is running, so every photo upload threw
  // "Cannot find module .../worker-script/node/index.js" and took the server
  // down with an uncaughtException. Leaving the package external keeps the
  // real path intact. This only shows up inside Next — the same code runs
  // fine in a plain Node script, which is how it got missed.
  serverExternalPackages: ['tesseract.js'],

  async redirects() {
    return [
      {
        source: '/signup',
        destination: '/login',
        permanent: false,
      },
      {
        source: '/register',
        destination: '/login',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
