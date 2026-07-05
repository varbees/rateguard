// Minimal line-art marks for the tools RateGuard plugs into — drawn in the
// site's own geometric style rather than reproducing each project's official
// logo, so the strip stays visually consistent with FeatureMicros/ChaosField
// instead of becoming a clashing grid of foreign brand colors.
const ITEMS: { label: string; icon: React.ReactNode }[] = [
  {
    label: "Claude Code",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 5.5h14M3 10h14M3 14.5h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Cursor",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M4 3l12 6.5-5.2 1.3L9 16z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: "OpenAI SDK",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M10 3.5v13M3.5 10h13" stroke="currentColor" strokeWidth="1.1" opacity="0.55" />
      </svg>
    ),
  },
  {
    label: "Anthropic API",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M6 15l4-10 4 10M7.4 11.5h5.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: "Gemini",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 3c0 3.9 3.1 7 7 7-3.9 0-7 3.1-7 7 0-3.9-3.1-7-7-7 3.9 0 7-3.1 7-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: "LangChain",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="7" cy="7" r="3.2" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="13" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M9.2 9.2l1.6 1.6" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    label: "MCP",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="8" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.4" />
        <path d="M9 9h3a2 2 0 0 1 2 2v0a2 2 0 0 0 2 2h1M9 11h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Docker Compose",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="7" width="3.4" height="3.4" stroke="currentColor" strokeWidth="1.2" />
        <rect x="7" y="7" width="3.4" height="3.4" stroke="currentColor" strokeWidth="1.2" />
        <rect x="7" y="3" width="3.4" height="3.4" stroke="currentColor" strokeWidth="1.2" />
        <path d="M2 13c1 1.5 3 2.5 8 2.5s7-1 8-2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function LogoStrip() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
      {ITEMS.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-2 text-[var(--muted)] transition-colors hover:text-[var(--fg)]"
        >
          {item.icon}
          <span className="text-sm font-medium">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
