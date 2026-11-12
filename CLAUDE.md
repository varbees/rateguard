# CLAUDE.md — RateGuard

MIT-licensed in-process AI middleware SDK. Go/Node/Python. Landing at
antharmaya.com/tools/rateguard. Ready for HN launch.

Published (checked 2026-11-12): npm and PyPI at **v0.5.1**, Go module at **v0.5.2** (proxy.golang.org, tagged 2026-08-04):

    npm i @varbees/rateguard-node
    pip install varbees-rateguard
    go get github.com/varbees/rateguard/packages/sdk-go

Use the scoped names only. Unscoped `rateguard` on PyPI is an unrelated package by
another author; publishing or advertising that name sends users to someone else's code.
Repo carries 0.5.3 locally (Node and Python packages; checked 2026-11-12), unreleased: the release waits on the npm and PyPI trusted-publisher settings. The 0.6 USD-budget spec is `docs/specs/0.6-usd-budgets.md`.

Core positioning: "No proxy. No extra service. No latency overhead."
Read AGENTS.md + README.md before touching code. 13 agent rules — follow them.
Connect proxy is a LOCAL FORK ONLY — never mention publicly, never push to main.
