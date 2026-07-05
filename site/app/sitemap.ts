import type { MetadataRoute } from "next";
import { docHref, flatPages } from "../lib/docs-nav";

const BASE_URL = "https://rateguard.antharmaya.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const docs = flatPages.map((page) => ({
    url: `${BASE_URL}${docHref(page.slug)}`,
    changeFrequency: "weekly" as const,
    priority: page.slug === "" ? 0.9 : 0.7,
  }));

  return [
    { url: BASE_URL, changeFrequency: "daily", priority: 1 },
    ...docs,
  ];
}
