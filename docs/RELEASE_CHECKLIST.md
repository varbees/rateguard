# Release Checklist

> ## Releasing is now one command
>
> ```bash
> git tag -a v0.5.0 -m "v0.5.0" && git push origin v0.5.0
> ```
>
> `.github/workflows/release.yml` verifies, publishes npm + PyPI, and then
> **asks the registries whether they actually serve it**. The Go proxy picks up
> the `packages/sdk-go/vX.Y.Z` tag on its own (§6 below).
>
> **Why this changed.** v0.3.0 and v0.4.0 were cut and never published — npm and
> PyPI served 0.2.0 the whole time, and v0.4.0's own commit message says it was
> cut to close that exact gap before falling into it too. This checklist was not
> missing; it had every publish step. But steps 1–5 verify and get done, while
> steps 6–9 are manual, interactive (`npm login`), credential-gated, and last —
> so they got deferred, three times. **"Cut" and "published" have to be the same
> action, or they drift.** They are now.
>
> **One-time setup** (see the workflow header): add the `NPM_TOKEN` repo secret,
> and configure PyPI Trusted Publishing (OIDC — no stored token).
>
> The manual steps below remain as the fallback for when CI is unavailable, and
> as the record of what the automation does. **If you run them by hand, do §10
> — confirming the registry — or you have not released anything.**

Use this checklist for every RateGuard SDK release.

## 1. Preflight

- Confirm the worktree is clean:

```bash
git status --short
```

- Confirm versions are updated consistently:

```bash
rg -n '"version":|version = |__version__|v[0-9]+\.[0-9]+\.[0-9]+' README.md packages docs
```

- Confirm install names:

```bash
npm view @varbees/rateguard-node version --json || true
python3 -m pip index versions varbees-rateguard || true
go list -m -versions github.com/varbees/rateguard/packages/sdk-go
```

## 2. Verify Go

```bash
cd packages/sdk-go
CC=/usr/bin/gcc GOCACHE=/tmp/go-build-cache GOWORK=off go test ./...
```

Includes `TestConformanceTokenBucket`, which replays the shared oracle in
`conformance/token_bucket_vectors.json` — a real cross-language parity check, not just a
per-language pass. If touching limiter/token-bucket code, also run the throughput benchmarks
before tagging a release (`go test -bench=. -benchmem -run=^$ .` in sdk-go, `node
bench/throughput.mjs` in sdk-node after `bun run build`, `python3 bench/throughput.py` in
sdk-python) and update the numbers in `docs/RELEASE_NOTES.md` if they moved meaningfully.

## 3. Verify Node

```bash
cd packages/sdk-node
BUN_TMPDIR=/tmp BUN_INSTALL=/tmp/bun bun install --frozen-lockfile
BUN_TMPDIR=/tmp BUN_INSTALL=/tmp/bun bun run typecheck
BUN_TMPDIR=/tmp BUN_INSTALL=/tmp/bun bun run test
npm publish --dry-run --access public
```

## 4. Verify Python

```bash
cd packages/sdk-python
RATEGUARD_STRICT_TYPES=1 python3 scripts/typecheck.py
python3 -m pytest -q
rm -rf dist
python3 -m build --sdist --wheel
python3 -m twine check dist/*
```

## 5. Verify Dashboard

Dashboard doesn't publish to a package registry — it ships from the repo (Docker), so this is a
build + smoke test, not a publish step.

```bash
cd packages/dashboard
npx next build
```

## 6. Publish Go

Go packages are released by pushing a submodule tag.

```bash
git tag -a packages/sdk-go/vX.Y.Z -m "packages/sdk-go/vX.Y.Z"
git push origin packages/sdk-go/vX.Y.Z
GOPROXY=proxy.golang.org go list -m github.com/varbees/rateguard/packages/sdk-go@vX.Y.Z
```

## 7. Create Repo Release Tag

Use a normal repo-wide tag for GitHub Releases. Keep the Go submodule tag from
the previous step because that is what Go module resolution needs.

```bash
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

## 8. Publish Node

```bash
cd packages/sdk-node
npm login
npm publish --access public
npm view @varbees/rateguard-node version
```

If npm requires two-factor auth, complete the browser challenge or pass a fresh
OTP with `--otp`.

## 9. Publish Python

The local project-scoped PyPI token is stored in the ignored root file
`.env.pypi`.

```bash
cd /home/driftr/Desktop/bolting/02-fast-cash/rateguard
set -a
source .env.pypi
set +a

cd packages/sdk-python
rm -rf dist
python3 -m build --sdist --wheel
python3 -m twine check dist/*
python3 -m twine upload dist/*
python3 -m pip index versions varbees-rateguard
```

Never commit `.env.pypi`.

## 10. Public Install Smokes

```bash
rm -rf /tmp/rateguard-public-go
mkdir -p /tmp/rateguard-public-go
cd /tmp/rateguard-public-go
go mod init smoke
go get github.com/varbees/rateguard/packages/sdk-go@vX.Y.Z
```

```bash
rm -rf /tmp/rateguard-public-node
mkdir -p /tmp/rateguard-public-node
cd /tmp/rateguard-public-node
npm init -y
npm install @varbees/rateguard-node@X.Y.Z
node --input-type=module -e "import { RateGuard } from '@varbees/rateguard-node'; console.log(typeof RateGuard)"
```

```bash
rm -rf /tmp/rateguard-public-python
python3 -m venv /tmp/rateguard-public-python
/tmp/rateguard-public-python/bin/python -m pip install varbees-rateguard==X.Y.Z
/tmp/rateguard-public-python/bin/python -c "import rateguard; print(rateguard.__version__)"
```

## 11. GitHub Release

Create the GitHub Release from the repo-wide tag `vX.Y.Z`.

If GitHub CLI is available and authenticated:

```bash
gh release create vX.Y.Z \
  --title "RateGuard vX.Y.Z" \
  --notes-file docs/RELEASE_NOTES.md
```

Otherwise create the release in the GitHub UI:

- Tag: `vX.Y.Z`
- Title: `RateGuard vX.Y.Z`
- Body: copy the matching section from `docs/RELEASE_NOTES.md`

## 12. Post-release

- Update `CHANGELOG.md` (the source of truth) and `docs/RELEASE_NOTES.md`.
- Create a GitHub release for the pushed release tag.
- Confirm registry pages render useful metadata and README content.
- Keep PyPI/npm tokens scoped to the minimum project access needed.

## 13. THE STEP THAT WAS ALWAYS SKIPPED — did it actually publish?

Bumping a version and committing is **cutting** a release. It is not
**publishing** one. That distinction stranded v0.3.0 and v0.4.0 for months
while the site advertised features nobody could install.

The release workflow does this automatically (`confirm` job). If you released
by hand, do it yourself — and believe the registry, not the checklist:

```bash
TAG=0.5.0
curl -s https://registry.npmjs.org/@varbees/rateguard-node | python3 -c "import json,sys;print('npm  ->', json.load(sys.stdin)['dist-tags']['latest'])"
curl -s https://pypi.org/pypi/varbees-rateguard/json      | python3 -c "import json,sys;print('pypi ->', json.load(sys.stdin)['info']['version'])"
curl -s https://proxy.golang.org/github.com/varbees/rateguard/packages/sdk-go/@v/list | sort -V | tail -1 | sed 's/^/go   -> /'
```

**All three must print `$TAG`.** If any prints an older version, the release did
not happen, regardless of what the commit log says.
