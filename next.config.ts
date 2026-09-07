import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Without this, Turbopack walks up looking for a lockfile and finds a
  // stray package-lock.json in C:\Users\dell (outside this repo entirely),
  // misidentifying the project root. Pinning it avoids that warning and
  // any risk of resolving modules from outside this project.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
