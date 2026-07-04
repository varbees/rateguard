# Release Checklist

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

## 5. Publish Go

Go packages are released by pushing a submodule tag.

```bash
git tag -a packages/sdk-go/vX.Y.Z -m "packages/sdk-go/vX.Y.Z"
git push origin packages/sdk-go/vX.Y.Z
GOPROXY=proxy.golang.org go list -m github.com/varbees/rateguard/packages/sdk-go@vX.Y.Z
```

## 6. Create Repo Release Tag

Use a normal repo-wide tag for GitHub Releases. Keep the Go submodule tag from
the previous step because that is what Go module resolution needs.

```bash
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

## 7. Publish Node

```bash
cd packages/sdk-node
npm login
npm publish --access public
npm view @varbees/rateguard-node version
```

If npm requires two-factor auth, complete the browser challenge or pass a fresh
OTP with `--otp`.

## 8. Publish Python

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

## 9. Public Install Smokes

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

## 10. GitHub Release

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

## 11. Post-release

- Update `docs/RELEASE_NOTES.md`.
- Create a GitHub release for the pushed release tag.
- Confirm registry pages render useful metadata and README content.
- Keep PyPI/npm tokens scoped to the minimum project access needed.
