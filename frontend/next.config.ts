import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  transpilePackages: ["workflow-visualizer"],
};

export default nextConfig;
