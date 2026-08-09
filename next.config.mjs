/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd(),
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      ],
    }];
  },
  async redirects() {
    return [
      {
        // The Bootcamp offer is retired in favor of the VibeCode Retreat, so
        // stray QR scans / bookmarks land on the live offer. Exact-path only:
        // this does NOT match /founders-bootcamp/reserve/[id], so the pending
        // reservations keep their live payment links. Temporary (307) on
        // purpose — reversible if a Bootcamp cohort ever runs again.
        source: '/founders-bootcamp',
        destination: '/vibecode-retreat',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
