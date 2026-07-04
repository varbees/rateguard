"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Sidebar links with active-page highlighting. */
export function DocsNavLinks({ links }: { links: { href: string; title: string }[] }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {links.map((l) => {
        const active = pathname === l.href;
        return (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`block rounded-md px-2.5 py-1.5 text-[13.5px] transition-colors ${
                active
                  ? "bg-[#f59e0b]/10 font-medium text-[#f59e0b]"
                  : "text-[#a3a3a3] hover:bg-[#171717] hover:text-[#f5f5f5]"
              }`}
            >
              {l.title}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
