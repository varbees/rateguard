import type { NextConfig } from 'next';

/**
 * Served from antharmaya.com/tools/rateguard rather than its own subdomain, so
 * link authority pools into one domain instead of being split across zones that
 * each accumulate nothing.
 *
 * basePath rewrites Next's own asset URLs, <Link> hrefs and the router. It does
 * NOT touch a string handed to fetch(), a bare <a href>, or anything in
 * public/, which is why the sitemap, the metadataBase and one docs anchor are
 * all corrected by hand in this change.
 */
const basePath = '/tools/rateguard';

const nextConfig: NextConfig = {
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
