/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // How long the client may reuse a page it already has. Next 15 defaults
    // dynamic routes to 0s, so every tab switch refetched the whole page.
    // These can be long because staleness is handled elsewhere: RealtimeSync
    // refreshes on any household change (and on return from background if the
    // socket dropped), and every save revalidates. `static` governs the full
    // prefetches RouteWarmer makes of every tab; `dynamic` governs pages
    // reached by plain navigation.
    staleTimes: { dynamic: 300, static: 600 },
  },
  async headers() {
    return [
      {
        source: '/manifest.webmanifest',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
      {
        // Browsers already re-check a service worker at most every 24h; this
        // pins it to every load so a logic fix here reaches phones same-day.
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
