---
date: 2026-08-04
status: accepted
---

# 0017 — Tokens in sessionStorage, gated: a BFF is required before the first Shell balance

**Decision:** The web client stores its Cognito tokens (access, ID, refresh)
in `sessionStorage`, with the refresh token's lifetime cut from Cognito's
30-day default to **1 day**. This is explicitly a skeleton-phase choice, and
it carries a hard gate: **before the first real Shell balance exists, auth
must move to a backend-for-frontend** — refresh token in an `httpOnly`,
`Secure`, `SameSite` cookie set by a server-side session layer, access token
held in memory only.

**Why:** Every storage option JavaScript can read, injected JavaScript (XSS)
can read too; the options differ only in how long stolen material stays
useful. Today there is nothing to steal — no balances, no payments, no PII
beyond an email — and `sessionStorage` keeps the entire OAuth exchange
visible in ~200 lines of hand-written client code, which serves the
milestone's learning goal. The 1-day refresh lifetime shrinks the worst case
(a stolen long-lived credential) by 30× at zero cost. The BFF was considered
for day one and rejected: it triples the auth surface (token-exchange
endpoint, session store, CSRF handling) and moves the PKCE exchange
server-side, out of sight, precisely while understanding it is the point.

**Consequence:** The gate is the load-bearing part. "Fix it later" is how
insecure defaults ship; this entry makes the retrofit a **blocking
prerequisite of the ledger milestone**, not an intention. Any spec or work
package for wallet/ledger functionality must list the BFF as a dependency.
The client code localises the change: storage lives in one module
(`web/src/auth/token-store.ts`), so the swap will not touch the PKCE or
exchange logic.
