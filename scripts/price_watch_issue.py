#!/usr/bin/env python3
"""Turns the weekly vendor-price check into one GitHub issue in this repo.

The check itself is tokencost's (github.com/antharmaya/tokencost, scripts/check-prices.ts):
it re-reads the vendors' pricing pages and compares them with a table. The workflow
(.github/workflows/price-watch.yml) points it at THIS repo's conformance/pricing.json, so a
moved price is reported where the price lives.

Scope, stated plainly: the check covers the models tokencost models (about 15 current Anthropic,
OpenAI, Google and DeepSeek rows). The other rows of conformance/pricing.json are still read by a
person, and CI fails the table after 90 days without a review.

    python3 scripts/price_watch_issue.py check.json            # print the issue body (dry run)
    python3 scripts/price_watch_issue.py check.json --github   # open, update or close the issue

Opens or updates one open issue labelled `price-watch` when a price differs or a scheduled
change date has arrived; closes it when a run finds none. Unreadable pages are listed inside the
issue but never open one on their own: tokencost already tracks those.
"""
from __future__ import annotations

import json
import subprocess
import sys

LABEL = "price-watch"
TITLE = "Vendor prices differ from conformance/pricing.json"


def body(report: dict) -> str | None:
    rows = [r for r in report["rows"] if r.get("diffs")]
    dates = report.get("changeDates", [])
    if not rows and not dates:
        return None
    out = [f"The weekly price check on {report['today']} found the vendor pages and `conformance/pricing.json` disagreeing.", ""]
    for r in rows:
        out.append(f"### `{r['id']}`")
        for d in r["diffs"]:
            out.append(f"- **{d['field']}**: table {d['old']} → page **{d['new']}** (USD per 1M tokens)")
            out.append(f"  > `{d['quote'].replace('`', chr(39))}`")
        out.append("")
    for c in dates:
        out.append(f"- `{c['id']}`: `priceChangesOn {c['date']}` has arrived; re-read the page and update the row.")
    unread = [s for s in report["sources"] if not s.get("ok")]
    if unread:
        out += ["", "Not checked this run (page unreadable): " + ", ".join(s["id"] for s in unread) + "."]
    out += [
        "",
        "To fix: edit the rows in `conformance/pricing.json` (sourceUrl, seenAt), run `python3 scripts/gen_pricing.py`, commit.",
        "tokencost's weekly sync then picks the change up. This issue closes itself on the first run that finds no difference.",
    ]
    return "\n".join(out)


def gh(*args: str) -> str:
    return subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout


def main() -> None:
    report = json.load(open(sys.argv[1]))["report"]
    text = body(report)
    if "--github" not in sys.argv:
        print(text or "no price differences; nothing to report")
        return
    gh("label", "create", LABEL, "--color", "D9772A", "--description", "Weekly vendor price check", "--force")
    open_issues = json.loads(gh("issue", "list", "--label", LABEL, "--state", "open", "--json", "number"))
    if text is None:
        for i in open_issues:
            gh("issue", "close", str(i["number"]), "--comment", f"The price check on {report['today']} found no differences.")
        print("no differences; closed", len(open_issues))
        return
    if open_issues:
        gh("issue", "edit", str(open_issues[0]["number"]), "--body", text)
        print("updated issue", open_issues[0]["number"])
    else:
        print(gh("issue", "create", "--title", TITLE, "--label", LABEL, "--body", text).strip())


if __name__ == "__main__":
    main()
