# Supply-chain integrity — how to verify a RateGuard release

RateGuard ships cryptographic spend evidence. A tool that asks you to trust its
signatures has no business shipping unsigned artifacts, so every release is
signed — and this document shows you how to check, in commands you can run
yourself.

Every mechanism below is [Sigstore](https://www.sigstore.dev) **keyless**: a
short-lived certificate is issued by Fulcio, bound to the release workflow's
OIDC identity (no long-lived signing key exists anywhere), and the signing event
is recorded in the Rekor public transparency log. There is no key to steal and
no key to trust — you verify against *the identity that signed* and *the public
log that witnessed it*.

## What is signed, by which mechanism

| Artifact | Mechanism | Verify with |
|---|---|---|
| **npm** `@varbees/rateguard-node` | npm provenance (Sigstore) | `npm audit signatures` |
| **PyPI** `varbees-rateguard` | PEP 740 attestations (Sigstore) | pip / the PyPI attestations API |
| **GitHub Release** SBOM + notes | cosign `sign-blob` (Sigstore) | `cosign verify-blob` (below) |
| **Go** module | `sum.golang.org` checksum + transparency log | automatic on `go get` |

Three registries, three native mechanisms — and they are not three different
trust stories. npm provenance, PyPI attestations, and the cosign bundle all use
the **same Fulcio + Rekor keyless model**; the Go checksum database is its own
long-standing transparency log. We deliberately do **not** re-sign the npm/PyPI
packages with cosign: that would be redundant theatre over mechanisms that
already do it correctly. cosign signs the one thing the registries don't — a
whole-repo SBOM attached to the GitHub Release.

## Verify the npm package

```bash
npm install -g @varbees/rateguard-node
npm audit signatures       # confirms the provenance attestation chains to the build
```

Or inspect the provenance on the package page — it names the exact commit,
workflow, and builder that produced the tarball.

## Verify the PyPI package

PyPI shows a "Verified details" / attestations panel on the release page, and
the attestations are queryable via the integrity API:

```bash
curl https://pypi.org/integrity/varbees-rateguard/<version>/<file>/provenance
```

## Verify the GitHub Release SBOM (cosign)

```bash
# from the release assets: the SBOM and its .sigstore.json bundle
cosign verify-blob \
  --bundle rateguard-vX.Y.Z-sbom.cyclonedx.json.sigstore.json \
  --certificate-identity-regexp 'https://github.com/varbees/rateguard/.github/workflows/release.yml@.*' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  rateguard-vX.Y.Z-sbom.cyclonedx.json
```

A pass means: this exact SBOM was signed by RateGuard's release workflow (that
identity, that issuer), the certificate was valid at signing time, and Rekor
holds an inclusion proof. Anyone can check it offline from the bundle — no key
to fetch, no server to trust.

## Why keyless, and why it matters for what RateGuard sells

This is not incidental hygiene. RateGuard's own evidence-chain design
(`evidence_chain.go`) states the bar for honest cryptographic evidence:

> The signing key must live somewhere the application cannot read … and the head
> must be witnessed outside the application. A key the audited process holds
> cannot produce independently verifiable logs.

Sigstore keyless **is** that pattern, applied to our own releases:

- **External key custody** → there is no held key at all. Fulcio issues a
  short-lived certificate bound to the workflow's OIDC identity for the duration
  of the signing, then it's gone. Nothing to leak from a secret store.
- **External witness** → Rekor is the public, append-only transparency log. The
  signature isn't trusted because we say so; it's witnessed by infrastructure
  neither we nor you operate.

So the way RateGuard signs its releases is a working reference for the same
"external key + external witness" discipline its evidence features are built
around. An evidence product that signed its own releases with a raw key sitting
in a CI secret would be contradicting its own thesis. This one doesn't.

## Reproduce the whole chain

Nothing here is trust-us. The build is public
(`.github/workflows/release.yml`), the transparency records are public (Rekor),
and the verification commands above run on your machine against artifacts you
downloaded. That is the same standard RateGuard holds its own SDKs to — see
[FRAMEWORK.md](FRAMEWORK.md): claims replaced with numbers and proofs you can
reproduce, not adjectives.
