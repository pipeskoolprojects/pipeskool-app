/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // HTML documents only — never cache, always fetch the current build.
        // /_next/* (js/css chunks) is excluded and keeps Vercel's immutable caching.
        source: "/((?!_next/|favicon|icon-|manifest).*)",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};
