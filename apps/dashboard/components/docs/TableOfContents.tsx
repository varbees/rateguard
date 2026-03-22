"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface TOCItem {
  id: string;
  text: string;
  level: number;
}

export function TableOfContents() {
  const pathname = usePathname();
  const [headings, setHeadings] = useState<TOCItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    // Small delay to ensure content is rendered
    const timer = setTimeout(() => {
      // Extract headings from the document
      const elements = Array.from(
        document.querySelectorAll("main h1, main h2, main h3")
      ) as HTMLElement[];

      const items: TOCItem[] = elements.map((el) => ({
        id: el.id || el.textContent?.toLowerCase().replace(/\s+/g, "-") || "",
        text: el.textContent || "",
        level: parseInt(el.tagName.charAt(1)),
      }));

      // Add IDs to headings that don't have them
      elements.forEach((el, index) => {
        if (!el.id) {
          el.id = items[index].id;
        }
      });

      setHeadings(items);

      // Intersection Observer for active heading
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setActiveId(entry.target.id);
            }
          });
        },
        {
          rootMargin: "-100px 0px -66%",
          threshold: 1.0,
        }
      );

      elements.forEach((el) => observer.observe(el));

      return () => {
        elements.forEach((el) => observer.unobserve(el));
      };
    }, 100);

    return () => {
      clearTimeout(timer);
    };
  }, [pathname]);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      const y = element.getBoundingClientRect().top + window.pageYOffset - 100;
      window.scrollTo({ top: y, behavior: "smooth" });
      setActiveId(id);
    }
  };

  if (headings.length === 0) {
    return null;
  }

  return (
    <nav className="space-y-2">
      <p className="font-semibold text-sm text-foreground mb-4">On This Page</p>
      <ul className="space-y-2 text-sm">
        {headings.map((heading) => (
          <li
            key={heading.id}
            style={{
              paddingLeft: `${(heading.level - 1) * 12}px`,
            }}
          >
            <a
              href={`#${heading.id}`}
              onClick={(e) => handleClick(e, heading.id)}
              className={cn(
                "block py-1 transition-colors hover:text-primary border-l-2 pl-3",
                activeId === heading.id
                  ? "border-primary text-primary font-medium"
                  : "border-border text-muted-foreground hover:border-muted-foreground"
              )}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
