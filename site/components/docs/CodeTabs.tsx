import { CodeTabsClient } from "./CodeTabsClient";
import { highlight } from "./highlight";

export type CodeTab = { label: string; code: string };

/**
 * Language-tabbed code block. Server component: each tab's code is highlighted at
 * build time (per its label — "Go", "Node.js", "Python", …), then handed to the
 * client shell that switches tabs. The page-level API is unchanged:
 * `<CodeTabs tabs={[{ label, code }]} />`.
 */
export async function CodeTabs({ tabs }: { tabs: CodeTab[] }) {
  const highlighted = await Promise.all(
    tabs.map(async (t) => ({ ...t, html: await highlight(t.code, t.label) })),
  );
  return <CodeTabsClient tabs={highlighted} />;
}
