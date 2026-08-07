# The walkthrough

This file is the guided tour of oddssea's infrastructure, written for someone
deploying to AWS for the first time. It grows with the project: right now it
covers **Increment A — a live URL** and **Increment B — login**. Increment C
(the API) gets appended when it lands.

The rule throughout: **nothing gets run before it is understood.** Every
command says what it does, what it creates, and how to check it worked. When
a term appears for the first time it is explained, and it also lands in the
[glossary](#glossary) at the bottom.

The division of labour: **CDK code defines all application infrastructure**
(so it is reviewable and reproducible), **you run every command that touches
AWS**, and **the console is for one-time account setup and for looking at
what the code created** — creating things by clicking is how environments
become unreproducible, but *inspecting* things is how they stop being
abstract.

---

## What Increment A builds, and why this shape

```
you push to main
      │
GitHub Actions ──(OIDC: borrows a 1-hour AWS identity)──► your AWS account
      │                                                        │
      └── builds web/ ── uploads to ▼                          │
                              S3 bucket   ◄── private; only    │
                                   │          CloudFront reads │
                              CloudFront  ◄── the CDN, HTTPS   │
                                   │                           │
                    https://oddssea.xyz ◄── Route53 ───────┘
```

Reading it bottom-up: a browser asks DNS where `oddssea.xyz` is, DNS
answers "CloudFront", CloudFront serves the files from a private S3 bucket,
and the files got into that bucket because a GitHub workflow — briefly
wearing an AWS identity — put them there.

Two CloudFormation stacks implement this:

| Stack | Contents | Deployed by |
|---|---|---|
| `Oddssea-dev-Cicd` | The GitHub↔AWS trust and the deploy role | **You, once, by hand** |
| `Oddssea-dev-App` | Bucket, CDN, DNS, certificate, site upload | You the first time; **the pipeline forever after** |

The CI/CD stack must be manual: it *creates* the permission that automated
deploys use, so it cannot be deployed by the automation it enables.

---

## Part 1 — get into AWS and look around

**Terminal:**

```bash
aws login
aws sts get-caller-identity
```

The second command asks AWS "who am I right now?" and returns three values:
your **account ID** (the 12-digit number every resource you create lives
under), the **ARN** of your identity, and its user ID. Every ARN — Amazon
Resource Name — follows the same shape,
`arn:aws:service:region:account:resource`, and you will read hundreds of
them, so it is worth decoding this first one consciously.

### If the ARN ends in `:root`, stop and fix that first

A fresh account signs you in as the **root user** — the owner identity
created at signup. It can do everything, including close the account, and it
is the one identity AWS cannot constrain: no permission policy applies to
it. The rule everywhere: root gets MFA and then gets put away; daily work
happens as a created identity that can be scoped and revoked.

The fix (~15 minutes, once):

1. **MFA on root:** account menu → Security credentials → Assign MFA device.
   Non-negotiable, before anything else.
2. **Enable IAM Identity Center** (search for it; keep us-east-1). It
   auto-creates an *AWS Organization* — the multi-account management layer;
   inert and free with one account.
3. **Users → Add user** — your name, your email; verify the email, set a
   password, enrol MFA for this user too.
4. **Permission sets → Create → Predefined: AdministratorAccess.**
5. **AWS accounts → your account → Assign users or groups** — your user,
   that permission set.
6. **Settings → copy the AWS access portal URL** — your login page for both
   console and CLI from now on.
7. **CLI:** `aws configure sso` — session name anything, the portal URL,
   region us-east-1, and when asked for a profile name type `default` so
   everything (including CDK) works without flags. Browser opens; sign in as
   the new user.

Verify: `aws sts get-caller-identity` now shows
`assumed-role/AWSReservedSSO_AdministratorAccess_…/<you>` — temporary,
scoped, MFA-backed credentials that expire in hours. Note the symmetry with
Part 4: this is the same short-lived-credentials design the CI/CD stack
gives GitHub. Nothing long-lived exists on your machine either. When a
session expires, `aws sso login` refreshes it.

**Console — worth 10 minutes before creating anything:** log into
[console.aws.amazon.com](https://console.aws.amazon.com). Two things to
notice:

- **The region selector, top right.** AWS is not one place — it is ~30
  isolated copies of itself. A resource created in one region is invisible
  in the others, and "where did my stack go?" is almost always "wrong region
  selected". Set it to **N. Virginia (us-east-1)** and leave it there. This
  project pins everything to us-east-1, partly because CloudFront only
  accepts TLS certificates issued there.
- **Billing → Budgets.** Create a budget with an email alert at a few
  dollars. Everything in this milestone is free-tier or ~$0.50/month, and
  the alert is how you would find out if that ever stopped being true —
  cheap insurance while learning.

**Console — IAM → Identity providers:** check whether an entry for
`token.actions.githubusercontent.com` already exists. An account may hold
only one provider per issuer URL. Fresh account → the list is empty → leave
`createGithubOidcProvider: true` in [lib/config.ts](lib/config.ts). If one
exists (some other project wired up GitHub Actions before), set it to
`false` and the deploy role will import the existing provider by ARN instead
of failing.

---

## Part 2 — hand DNS to Route53

### The concept: how names resolve

DNS is not a database with all the answers — it is a chain of referrals:

```
root servers        "ask the .xyz registry"
      ↓
.xyz registry       "ask <whichever nameservers oddssea.xyz nominates>"
      ↓
those nameservers   "oddssea.xyz is <CloudFront>"            ← the actual answer
```

Each arrow is a **delegation**: a parent saying "not mine — ask them." When
you bought `oddssea.xyz`, GoDaddy told the `.xyz` registry to point at
GoDaddy's own nameservers. That is all a registrar fundamentally does:
**tell the registry which nameservers speak for your domain.** Where the
records actually live — the "DNS host" — is a separate job that happens to
default to the registrar.

We are moving that second job to **Route53**, AWS's DNS service. Why: the
TLS certificate for HTTPS is validated by publishing a specific DNS record
proving domain control, and it re-validates at every renewal. If AWS is
authoritative for the domain, CDK creates and maintains that record itself —
forever. If GoDaddy stayed authoritative, you would paste validation records
by hand, on a recurring schedule, and the site breaks if you forget.

### Console — Route53 → Hosted zones → Create hosted zone

- Domain name: `oddssea.xyz` · Type: **Public hosted zone**

A **hosted zone** is the container for one domain's records — this is the
$0.50/month, and it is the only fixed cost in the milestone. Subdomains are
free rows inside it, which is why `dev.`, and later `api.`, cost nothing.

**Look at what appeared:** two record sets exist already. The **NS record**
lists the four nameservers AWS assigned you (`ns-….awsdns-….…`) — these are
the values you are about to give GoDaddy. The **SOA record** is zone
metadata. Ignore it, but note that *something* was created for you: every
zone has exactly these two to start.

### GoDaddy — hand over authority

My Products → `oddssea.xyz` → **Domain Settings → Nameservers → Change →
"I'll use my own nameservers"** → enter all four from the NS record, **with
the trailing dot removed**: Route53 displays `ns-335.awsdns-41.com.` (DNS's
absolute-name notation, anchored at the root); GoDaddy wants
`ns-335.awsdns-41.com` and rejects the dotted form with "Hostname has
invalid TLD". One of the four ends in `.co.uk` — not a mistake; AWS spreads
its nameservers across four TLDs so the zone survives a whole-TLD outage.

This edits the middle link of the referral chain. GoDaddy remains the
*registrar* (renewals, billing); it stops being the *DNS host*.

### Terminal — verify, don't wait blindly

```bash
nslookup -type=NS oddssea.xyz 8.8.8.8
```

`8.8.8.8` is Google's public resolver — asking it sidesteps any stale cache
on your own network. Success looks like four `awsdns` servers. While it
still answers `domaincontrol.com` (GoDaddy), the change has not propagated;
re-check in 15–30 minutes. GoDaddy is sometimes slower than others, up to a
few hours.

**Do not proceed to the custom-domain deploy until this shows AWS
nameservers.** The certificate validation in Part 5 *will hang* otherwise —
ACM would be checking for a record in a zone the world cannot yet see. This
is the most likely place for the whole increment to stall, and it looks like
a hang, not an error. Now you know what it means.

---

## Part 3 — install, and meet CDK

**Terminal, repo root:**

```bash
npm install
```

### The concept: CloudFormation, and CDK on top of it

**CloudFormation** is AWS's native infrastructure-as-code service: you hand
it a template describing resources, it creates them, tracks them as a
**stack**, computes diffs when the template changes, and rolls back on
failure. The catch: templates are thousands of lines of hand-written YAML.

**CDK** (Cloud Development Kit) generates those templates from real code —
here, TypeScript in [lib/](lib/). You get types, autocomplete, loops and
review-able diffs; CloudFormation still does the actual creating.
`cdk synth` = compile to template. `cdk deploy` = synth + hand to
CloudFormation. Try the first one now — it touches nothing:

```bash
npm run synth
```

Then open `infra/cdk.out/Oddssea-dev-App.template.json` and skim it. That
wall of JSON is what ~200 lines of TypeScript replaced. You never write
this; you occasionally read it to see what will really happen.

### Terminal — bootstrap (once per account+region, ever)

```bash
cd infra
npx cdk bootstrap
```

CDK needs somewhere to put deployment artifacts before stacks exist — a
chicken-and-egg problem solved by one special stack called **CDKToolkit**:
an S3 staging bucket, an ECR repository, and a handful of IAM roles that
deploys assume (this last part matters in Part 6).

**Console — CloudFormation:** the CDKToolkit stack is there now. Open its
**Resources** tab and match what you see to the list above. This is the
habit that makes everything else in this project make sense: *deploy, then
go look.*

---

## Part 4 — the CI/CD stack, and why no keys are stored anywhere

### The concept: OIDC federation

The traditional way to let CI deploy: create an access key and paste it into
GitHub's secrets. That key is long-lived, lives in a system you don't
control, and works for anyone who obtains it until someone notices.

The way this repo does it: **nothing secret is stored at all.** Every
workflow run, GitHub signs a token stating *"this run is repo
noahndambukig/oddssea, branch main"*. AWS — via an **OIDC identity
provider**, created by this stack — trusts GitHub's signature, checks those
claims against conditions, and issues credentials that expire in an hour.
A leaked token is dead by lunchtime; there is no permanent secret to steal.

Two details in [lib/cicd-stack.ts](lib/cicd-stack.ts) deserve your eyes
before deploying — open it and find them:

- the `sub` condition — the line that narrows trust from "anyone on GitHub"
  to one branch of one repo. Without it the role is world-assumable.
- the role's permissions — not admin. It may only *assume the CDK bootstrap
  roles* from Part 3. Those hold the real deploy permissions; this role is
  just allowed to step into them.

### Terminal — deploy it

```bash
npx cdk deploy Oddssea-dev-Cicd
```

CDK will show you the IAM changes it is about to make and ask `y/n` — this
is `--require-approval`, and locally you always read it. What you should see
listed: one OIDC provider, one role, its policy. Approve.

The deploy prints an output, `DeployRoleArn`. Copy it.

### GitHub — the one settings step

Repo → Settings → Secrets and variables → Actions → **Variables** → New
repository variable: name `AWS_DEPLOY_ROLE_ARN`, value the ARN you copied.
It goes in *Variables*, not *Secrets* — a role ARN is an address, not a
credential; it is useless without GitHub's signed token, which is the entire
point of the design.

---

## Part 5 — deploy the app

### First deploy — from your machine, on the CloudFront URL

The domain stays off for the very first deploy
([lib/config.ts](lib/config.ts) ships with `domainName: undefined`), so you
see the pipeline work end to end before adding DNS to the mix. One new
variable at a time.

```bash
cd ..              # repo root
npm run deploy     # builds web/, then deploys Oddssea-dev-App
```

First CloudFront distribution takes 5–10 minutes — it is being pushed to
hundreds of edge locations. The `AppUrl` output at the end is your site:
open it. HTTPS, padlock, dark page, `environment: dev`.

**Console safari — match each piece to the diagram:**

- **S3 → the site bucket → Permissions:** "Block all public access: On".
  Yet the site loads. The **Bucket policy** below explains it: exactly one
  principal — `cloudfront.amazonaws.com`, scoped to your distribution — may
  `s3:GetObject`. That is **OAC** (Origin Access Control): the CDN signs its
  requests to the bucket; nobody else can read it directly.
- **S3 → the bucket → Objects:** `index.html`, `config.json`, `assets/`.
  Click `index.html` → Metadata: `Cache-Control: no-cache`. Then any file
  under `assets/`: `max-age=31536000, immutable`. Two deployments in
  [lib/app-stack.ts](lib/app-stack.ts) set these deliberately — hashed
  filenames can be cached forever *because* their names change with their
  contents; the unhashed HTML must always be revalidated. The comments in
  that file explain why neither deployment prunes old files.
- **CloudFront → the distribution:** the **Origins** tab points at the
  bucket via OAC; **Error pages** shows 403/404 rewritten to `/index.html`
  — that is what will let the React app own URLs like `/callback` in
  Increment B even though no such file exists in S3.

### Second deploy — turn on the domain

Only after Part 2's `nslookup` shows AWS nameservers. In
[lib/config.ts](lib/config.ts):

```ts
domainName: 'oddssea.xyz',
subdomain: 'dev',
```

```bash
npm run deploy
```

Two new things happen, watchable in the console mid-deploy:

- **ACM (Certificate Manager):** a certificate for `oddssea.xyz` appears
  as *Pending validation*, then *Issued* within a few minutes. Click into it
  — the CNAME record ACM required is listed there, and Route53 → your zone
  now contains it: CDK wrote it for you. That record staying published is
  what makes every future renewal automatic. **If it sits Pending for more
  than ~15 minutes**, the nameserver switch has not propagated — re-run the
  Part 2 check.
- **Route53 → the zone:** a new **A record**, `dev`, marked *Alias*,
  pointing at the distribution. An **alias** is Route53's AWS-aware record
  type: resolves like an A record from outside, but tracks the AWS resource
  behind it and costs nothing to query.

Open **https://oddssea.xyz**. That is your URL now.

### Third deploy — prove the pipeline

```bash
git checkout -b increment-a
git add -A && git commit -m "Increment A: static site, pipeline, DNS"
git push -u origin increment-a
```

Open a PR → **CI** runs (typecheck, build, synth — no AWS access; check the
Actions tab). Merge it → **Deploy** runs. Watch the log:

- *Get temporary AWS credentials* — the OIDC exchange from Part 4, live
- *Who am I* — `sts get-caller-identity` printing the **assumed deploy
  role**, not any stored key: the proof, in every run's log, that no
  credential exists to leak
- *Deploy* — CloudFormation applying the diff (fast when nothing changed)

**Done-when check:** edit one visible line in
[../web/src/App.tsx](../web/src/App.tsx), PR, merge, and confirm the change
is live at oddssea.xyz without you having touched AWS. That is
continuous deployment.

---

## Part 6 — Increment B: login

### The shape of it

```
Sign in ──► https://auth.oddssea.xyz  (Cognito's hosted pages — AWS builds
   ▲         the forms; you style them once in the branding designer)
   │              │ user authenticates; Cognito redirects back with a CODE
   │              ▼
   │        /callback?code=…&state=…
   │              │ web/src/auth/ swaps CODE + PKCE secret for tokens
   │              ▼
   │        first login only: the 18+ attestation gate
   │              ▼
   └── Sign out   sessionStorage: access (1h) · id (1h) · refresh (1 day)
```

Three new pieces of infrastructure, all in the same app stack: a **user
pool** (the user directory — accounts, passwords, verification emails), an
**app client** (this website's registration with the pool: no secret, code
flow only, exact callback URLs), and the **custom auth domain**
`auth.oddssea.xyz` — the same certificate + DNS pattern as the site, pointed
at Cognito. The browser-side half is hand-written in
[../web/src/auth/](../web/src/auth/) — read `pkce.ts` first; it explains the
entire trick.

The site's home also changes with this increment: the app now serves from
**the apex itself** — `https://oddssea.xyz` — and the original
`dev.oddssea.xyz` is retired and no longer resolves (decided 2026-08-04).
This kills two birds: the URL is the one that feels right, and Cognito's
requirement that a custom auth domain's *parent* resolve is satisfied by the
canonical record itself. The distribution's generated `*.cloudfront.net`
name — which alternate domains never disable — 302-redirects to the apex,
so there is exactly one origin with a working login.

### Concepts before commands

- **Authorization Code flow:** the site never sees your password. Cognito
  verifies it and hands the browser a one-time *code* — a claim ticket —
  exchanged for tokens in a separate request.
- **PKCE:** the app invents a fresh secret per login, sends only its SHA-256
  hash up front, and must present the original to cash the code. A stolen
  code without the secret is worthless — this replaces the client secret a
  browser cannot keep.
- **`state`:** a random tag that must come back unchanged, so the app cannot
  be tricked into completing a login *someone else* started.
- **Three tokens:** ID = passport (who you are), access = boarding pass
  (shown to APIs, 1h), refresh = re-issue rights (1 day —
  `docs/decisions/0017`).
- **JWTs are signed, not encrypted:** anyone can read one (the app has a
  "show raw claims" button); nobody can forge one — the signature verifies
  against Cognito's public keys.
- **Logout is two things:** clearing the app's tokens AND ending Cognito's
  own browser session — otherwise the next "sign in" sails through without
  a password.
- **The 18+ gate:** `docs/06-risks/compliance.md` requires attestation from
  day one. It appears once, right after your first login, and writes a
  timestamp to your Cognito user (`custom:age_attested_at`) that later
  migrates to the players table.

### Deploy it

```bash
npm run deploy
```

New in this run, in order: the ACM certificate for `auth.oddssea.xyz`
validating (same DNS dance as Increment A); the apex joining the site
certificate; and **the slow one** — the Cognito domain, which runs on a
CloudFront distribution AWS manages and can take **15–60 minutes** to
create. Not stuck. Go do the console safari below while it works.

### Console safari

- **Cognito → User pools → oddssea-dev:** note the *Essentials* feature plan
  (what unlocks the brandable login pages). Under **App integration**, open
  the app client and read the allowed callback URLs — this exact-string
  list is why a stray trailing slash breaks login.
- **Sign yourself up** at https://oddssea.xyz → Create an account →
  verification code arrives by email → confirm → the 18+ gate → you are in,
  and the page shows your claims. Then find yourself: **Users** tab → your
  email. `sub` is the immutable ID that will one day be the foreign key on
  every ledger row; `custom:age_attested_at` is the gate's write.
- **Watch the exchange happen** (the point of hand-writing it): devtools →
  Network → sign out and in again. Find the redirect to
  `/oauth2/authorize?…code_challenge=…` (the hash going out), the return to
  `/callback?code=…&state=…`, and the POST to `/oauth2/token` (verifier in,
  tokens out).
- **Style the login page:** User pool → App integration → your client →
  **Managed Login → branding designer**. Set the colors to the app palette —
  background `#0a1420`, surface `#10202f`, accent `#3fb7c4`, text `#e6eef5` —
  and upload the sailboat when an asset exists. This designer is the one
  deliberate exception to everything-as-code: a visual tool for a visual
  artefact. The stack only creates the default style once; CloudFormation
  will not overwrite your design on later deploys.
- **Prove the redirect and the retirement:** the `DistributionDomain`
  output's `dxxxx.cloudfront.net` should 302 to `oddssea.xyz`, and
  `dev.oddssea.xyz` should no longer resolve at all.

### Running the app locally (`npm run dev`)

There is no deployed `config.json` on localhost, so after the first deploy
create `web/.env.local` from the stack outputs (gitignored — never
committed):

```
VITE_REGION=us-east-1
VITE_USER_POOL_ID=<UserPoolId output>
VITE_USER_POOL_CLIENT_ID=<UserPoolClientId output>
VITE_COGNITO_DOMAIN=<LoginBaseUrl output>
VITE_API_URL=<ApiUrl output>            # from Increment C on
```

The loader checks every field and names what is missing, so adding a new
increment's variable is never silent: `npm run dev` breaks loudly until
`.env.local` catches up. Local dev talks to the **deployed** API —
`http://localhost:5173` is in its CORS allow-list for exactly this.

`http://localhost:5173/callback` is already a registered callback URL, so
local login works against the real user pool. Three checks worth running
here, all under React StrictMode (the dev default, which double-runs
effects): a full login completes (the single-flight guard survives the
double-run); a reload right after attesting does **not** reopen the gate
(the forced token refresh landed the claim); and the session survives past
the first hour (the refresh token was carried forward — the failure nothing
else would catch).

## Part 7 — Increment C: the API

### The shape of it

```
browser ── GET /health ──────────────► API Gateway ──► Lambda ──► { ok: true }
                                        (HTTP API)
browser ── GET /me ──────────────────► API Gateway
           Authorization: Bearer         │ JWT authorizer: signature (JWKS),
           <access token>                │ issuer, audience, expiry, scope
                                         │
                              valid ─────┼────► Lambda ──► your claims
                              invalid ───┴────► 401/403 — NO Lambda runs
```

This is the piece that closes the milestone's loop: a token minted by
Cognito, **verified by something that is not Cognito**, gating something
that is not the login page. The verifier is API Gateway itself — the
**JWT authorizer** holds the pool's public keys (fetched once from the
JWKS URL you can open in a browser) and checks every request's token
before any code of ours runs. The Lambda behind it
([../api/src/handler.ts](../api/src/handler.ts) — annotated like `pkce.ts`)
contains **no verification code at all**; read it and notice what is
missing. It answers on `https://api.oddssea.xyz` — the same
cert + DNS pattern for the third time, plus one new piece (an **API
mapping** binding the API to the domain).

### Concepts before commands

- **Verification is offline.** The gateway checks the signature against
  cached public keys — it never calls Cognito per request. That is why a
  rejected request costs nothing (no Lambda, no compute, nothing in the
  log) and also why revoking a token does not un-issue it: an access token
  stays accepted until its ≤1h expiry. Stateless verification trades
  revocation immediacy for zero-latency auth; `docs/decisions/0017`'s BFF
  is where that trade gets revisited before money exists.
- **The scope loop, closed in three places.** `openid` is (1) enabled on
  the app client, (2) requested by the browser at authorize time, and —
  new here — (3) required on `/me`. Leg 3 is what actually keeps an ID
  token out of the API: ID tokens carry no `scope` claim at all, so they
  fail the requirement even though their signature, issuer and audience
  all pass.
- **401 vs 403.** 401 = "I don't know who you are" (no token, bad
  signature, expired). 403 = "I know exactly who you are, and no" (valid
  token, insufficient scope). An ID token at `/me` is the 403 case —
  it *is* a valid token; it is just the wrong kind.
- **The token contract.** The access token carries `sub`, `client_id`,
  `token_use`, `scope` — and **no email**. Email lives on the ID token the
  page already holds. `/me` answers from the access token; the page
  renders email from the ID token. Two tokens, two jobs — the separation
  is the lesson, not a workaround.
- **CORS, and a claim worth having checked.** `Authorization` is not a
  CORS-safelisted header, so `/me` triggers a preflight `OPTIONS` — which
  the gateway answers itself, returning `204` with the allow-list. The
  review of this increment's plan asserted that rejections would then be
  *invisible* to browser JS: AWS's own wording is that CORS headers are
  added "to the response from an integration", and an authorizer-generated
  401 never reaches one. Measured against the deployed API, that is
  **false** — the 401 comes back with
  `access-control-allow-origin: https://oddssea.xyz`, so the panel reads
  the status normally. (It is correctly *absent* for an origin outside the
  allow-list.) The advice is real but belongs to **REST APIs (v1)**, where
  gateway responses genuinely need CORS wired up by hand; HTTP APIs (v2)
  do it for you. Two lessons: version-check advice about AWS services, and
  a documentation sentence about one case is not a statement about the
  other.
- **Logout is three things now.** Increment B's logout cleared local
  tokens and ended Cognito's session cookie — but the infra's
  `enableTokenRevocation` was an endpoint nobody called, so the one-day
  refresh token outlived sign-out. `logout()` now also fires a
  best-effort `POST /oauth2/revoke`, killing the refresh token
  server-side. (What it cannot do: un-issue the access token — see the
  first bullet.)
- **A reference vs a constant.** The raw `execute-api` URL would have
  been a CloudFormation *reference*, and the site upload would have been
  ordered after the API for free through the dependency graph. The pretty
  `api.oddssea.xyz` is a computed *constant* — no dependency edge — so the
  ordering is declared by hand (`api.ready`), exactly like the login URL
  in Increment B. Choosing a name turned out to be choosing a deployment
  ordering.

### Deploy it

```bash
npm run deploy
```

New in this run, in order: the `api.oddssea.xyz` certificate validating
(fast — Route53 answers immediately; nothing like the Cognito domain's
15–60 min), then the API, routes, Lambda, custom domain, mapping and DNS
record — and the site republishing last, with `apiUrl` in `config.json`.

### Console safari

- **API Gateway → APIs → oddssea-dev:** open **Routes** — `GET /health`
  bare, `GET /me` with the authorizer attached and `openid` under its
  authorization scopes. Under **Authorization**, read the authorizer's
  issuer and audience — these are exact-string checks against the token's
  claims.
- **Open the JWKS URL:** take the `IssuerUrl` output and append
  `/.well-known/jwks.json` in a browser. These public keys are what the
  gateway verifies signatures with — this file is the entire reason it
  never has to call Cognito.
- **Lambda → the handler:** see the bundled code (esbuild output — your
  TypeScript, transpiled at synth time). Open **Monitor → Logs** and
  start a live tail, then go click the API panel: `/health` and a
  signed-in `/me` each write an invocation; a rejected `/me` writes
  **nothing** — the absence is the observation.
- **The API panel** on https://oddssea.xyz, with devtools → Network open.
  Click `/me` **signed out**: one request, a real `401` rendered in the
  panel — and the Lambda log tail stays silent for it. Click it **signed
  in** and you get *two* requests: a preflight `OPTIONS` answered `204` by
  the gateway, then the `GET`. The preflight appears only in the second
  case, and that is the whole rule made visible — it is triggered by the
  `Authorization` header, which exists only when you have a token. The
  first click after a quiet spell is slower: a **cold start** — AWS
  spinning up an execution environment for a function that scaled to zero.

### The curl checks

The panel covers the paths a browser can reach. curl covers the rest —
sending a *deliberately wrong* token is not something the app will do for
you. Grab tokens from devtools → Application → Session Storage →
`oddssea.tokens` while signed in:

```bash
curl -i https://api.oddssea.xyz/health          # 200 {"ok":true}
curl -i https://api.oddssea.xyz/me              # 401 — no token: unknown caller
curl -i -H "Authorization: Bearer <idToken>" https://api.oddssea.xyz/me
                                                # 403 — valid token, wrong kind:
                                                # no scope claim → scope check fails
curl -i -H "Authorization: Bearer <accessToken>" https://api.oddssea.xyz/me
                                                # 200 — your claims
curl -i <ApiRawEndpoint output>/health          # same body as the custom domain:
                                                # the mapping routes, it doesn't serve
```

## Failure modes worth recognising (Increment A)

| Symptom | Cause | Fix |
|---|---|---|
| GoDaddy rejects nameservers: "Hostname has invalid TLD" | Trailing dot pasted from Route53's absolute-name display | Strip the final dot from each: `…awsdns-41.com`, not `…awsdns-41.com.` |
| Browser says NXDOMAIN right after a successful deploy, but `nslookup <name> 8.8.8.8` resolves | **Negative caching**: your resolver looked the name up before the record existed and cached the non-existence (SOA negative TTL — Route53 default 900s) | Wait ≤15 min, or point the browser at a public resolver (Chrome → Use secure DNS) |
| Deploy hangs at `Certificate … CREATE_IN_PROGRESS` | Nameservers haven't propagated; ACM can't see its validation record | Part 2 check; wait; the deploy resumes on its own once DNS answers |
| `Zone … not found` at synth | Hosted zone missing, or shell has no credentials for the lookup | Create the zone / `aws login` |
| CI synth: `«StackAccountRegionNotSpecified» Cannot retrieve value from context provider` | Stack account derived from credentials CI doesn't have — without a concrete account+region CDK cannot even build the key to read the committed context cache | Pin `account` in `lib/config.ts`; account IDs are not secrets |
| CI/CD stack fails: `provider already exists` | Account already has a GitHub OIDC provider | `createGithubOidcProvider: false` in config.ts |
| Actions credentials step: `Not authorized to perform sts:AssumeRoleWithWebIdentity` | The token's `sub` doesn't match the condition — including GitHub's newer ID-embedded format (`owner@ID/repo@ID`), which a name-only policy rejects — or the variable holds the wrong ARN | **CloudTrail → Event history → AssumeRoleWithWebIdentity** shows the exact `sub` AWS rejected; make the condition accept it (cicd-stack.ts pins both forms), redeploy the Cicd stack, re-run the workflow |
| Actions credentials step: `Credentials could not be loaded` | Workflow missing `id-token: write` | Already set in deploy.yml — check it wasn't edited out |
| `No frontend build found at …/web/dist` | Synth/deploy ran without building web first | `npm run deploy` from the root (it builds first), or `npm run build` |
| `Stack … is in UPDATE_IN_PROGRESS state and can not be updated` | CloudFormation is single-writer — a previous deploy is still running (often the slow Cognito-domain step) | Wait for `UPDATE_COMPLETE` (console Events tab, or `describe-stacks … StackStatus`), then deploy again. Do NOT cancel — rollback is as slow as the create and can leave a lingering domain association |
| `Tried to create resource record set … but it already exists` on a deploy that moves a record | A construct rename made CloudFormation *replace* the record (create-before-delete), colliding with another logical resource that still owns the same name | Keep the construct id of the resource whose physical form survives; let the obsolete one be the deletion. Logical IDs are identity — renames are replacements |
| Page loads but stale after a deploy | CloudFront cache | The root deployment invalidates `/index.html` + `/config.json` — if you see this, check the deploy actually succeeded |

## Failure modes worth recognising (Increment B)

| Symptom | Cause | Fix |
|---|---|---|
| Deploy fails creating the auth domain: parent domain does not resolve | Cognito requires the apex to have a record before accepting a custom subdomain | The stack creates the apex record and declares the dependency — if it still fails, check the apex A record exists in the zone |
| Auth domain sits `CREATE_IN_PROGRESS` for a very long time | Cognito provisions a managed CloudFront distribution behind it | Normal for 15–60 min on first create; not stuck |
| A failed deploy rolled back, and the retry fails "domain already associated" | Cognito's custom-domain association can linger after rollback | Cognito console → the pool → App integration → confirm the domain is gone; wait for dissociation, then retry |
| `redirect_mismatch` on the login page | The redirect_uri sent is not an exact-string match for a registered callback URL | Compare `web/src/auth/auth-client.ts` redirectUri() to the client's callback list — scheme, port and trailing slash all count |
| **"Login pages unavailable. Please contact an administrator."** | Managed Login requires a branding style **per app client** — and that means EVERY client, including any you add later. The ledger milestone added a BFF client and hit this immediately, despite the requirement already being documented here | Add a `CfnManagedLoginBranding` for the new client (`auth.ts` creates one per client). The style may exist for your original client and still be missing for the new one — check with `aws cognito-idp describe-managed-login-branding-by-client --client-id <id>` |
| Login page renders unstyled after a redeploy | The branding style was deleted or replaced | The stack recreates one with defaults; restyle in the designer afterwards. CloudFormation will not revert console edits unless the resource itself changes |
| Tokens fail with `invalid_grant` at the token endpoint | The code was already spent (back button, double navigation), or the PKCE verifier is gone | Start a fresh login; the app consumes its verifier after one use by design |
| Attestation write fails with "Access Token does not have required scopes" | The token was minted without `aws.cognito.signin.user.admin` | **Superseded by the ledger milestone** — attestation writes to Postgres via `POST /me/attest` and needs no Cognito scope at all |
| The 18+ gate reappears after a reload | The stored ID token predates the attestation and lacks the claim | **Superseded by the ledger milestone** — attestation lives in `players.age_attested_at`, so there is no claim to wait for and no refresh to force |
| `npm run dev` shows "Unexpected token '<', \"<!doctype \"... is not valid JSON" | The dev server answers *any* unmatched path with index.html and a **200**, so a missing `/config.json` arrives as HTML wearing a success status | `runtime-config.ts` checks the content type before parsing, then falls through to `web/.env.local`. If you see this, `.env.local` is missing or incomplete |

## Part 8 — the ledger: the first thing you can lose

### What changes

Increments A–C proved a URL, an identity, and a token-guarded API — and
**nothing in the system remembered anything.** `/me` read claims out of the
token you handed it. Destroy the stack, redeploy, lose nothing.

This is where that ends. A player has a **Shell balance that persists**, a
task pays into it, a dice bet moves it, wagering mints **Pearls**, and every
movement is a row in an append-only ledger. It is the first work in this
project that a bug can destroy rather than merely interrupt — which is why
almost everything below is about making mistakes structurally impossible
rather than merely unlikely.

```
Cognito ──► /auth/login ──► BFF (server) ──► /auth/callback
                                │  exchanges the code SERVER-SIDE
                                ▼
                        httpOnly cookie          the browser never
                        (refresh token)          sees a token it can
                                │                 store or leak
                                ▼
  browser ── access token in MEMORY ──► API ──► SECURITY DEFINER function
                                                       │
                                            ledger row + balance + assert
```

### Concepts before commands

- **A backend-for-frontend.** `decisions/0017` gated this milestone on it:
  tokens in `sessionStorage` were an honest trade when there was nothing to
  steal, and a balance ends that trade. The refresh token now lives in an
  `httpOnly` cookie the browser cannot read; the access token lives in a
  JavaScript variable and dies on refresh. Check `document.cookie` when you
  are signed in — it is empty.
- **Scale to zero, and what it costs.** The database pauses after ten idle
  minutes and bills nothing but storage. That single setting is why this
  project costs pennies. The price is a **15-second resume, 30+ after a day
  asleep**, on the first request. It cannot be waited out — HTTP APIs cap
  integration timeout near 29 seconds and it is not increasable — so a cold
  request returns `503` and the client retries. The waiting screen is the
  design, not a failure.
- **Idempotency is not atomicity.** A transaction is all-or-nothing for ONE
  execution. It says nothing about the same request arriving twice, and over
  a mobile network it will: a client that never hears back cannot distinguish
  a lost request from a lost response. Every economic call carries an
  `Idempotency-Key`, generated once per action and reused by every retry; the
  server records it *in the same transaction as the money* and replays the
  stored response.
- **Least privilege in the database, not in the code.** The API connects as
  `oddssea_app`, which has EXECUTE on a handful of functions and **no write
  privilege on any table**. The functions are `SECURITY DEFINER`, so they
  carry their owner's rights when they run. "The ledger is append-only" is
  therefore not a rule the code follows — it is `permission denied`.
- **Ordering the irreversible step last.** An OAuth code is single-use and
  the database is usually asleep. So the callback warms the database, checks
  the replay binding, and only then spends the code. Do the cheap reversible
  work first; leave the one-way door until everything else has succeeded.

### Before your first deploy

**Redeploy the CI/CD stack.** It is the one stack deployed by hand, and it
now needs permission to invoke the migration Lambda:

```bash
npm run deploy:cicd
```

### Deploy

```bash
npm run deploy
```

Three steps in order — data stack, migrations, app stack — because the app
stack publishes the website *during* its own update, so there is no moment
inside it in which to bring the schema forward first. Ordering had to become
structural, which is why the database lives in its own stack.

The Aurora cluster takes ~10 minutes the first time. The migration step
prints which files it applied.

### Console safari

- **RDS → Databases → the cluster → Monitoring.** Watch
  `ServerlessDatabaseCapacity`. Leave the site alone for fifteen minutes and
  it drops to **0** — that is the cost model working, and the single most
  satisfying graph in this project.
- **RDS → Query editor.** Connect with the *admin* secret and look at
  `ledger_entries`. Then try connecting with the **app** secret and running
  `UPDATE ledger_entries SET amount = 0;` — permission denied.
- **Secrets Manager.** Two secrets, both Retain. The database is Snapshot;
  a snapshot whose password was deleted would be a backup nobody can open.
- **CloudWatch → the migration log group.** Every applied file, in order.
- **Devtools → Application → Cookies** while signed in: one `oddssea_session`
  cookie marked `HttpOnly`. Then Storage → Session Storage: **empty**.

### The adversarial checks — this is the deliverable

The milestone is not done when dice works. It is done when you cannot break
the invariants by trying.

```bash
# Replay an economic call with the SAME key -> one ledger row, same response
KEY=$(uuidgen)
curl -s -X POST https://api.oddssea.xyz/tasks/login-claim   -H "Authorization: Bearer $ACCESS" -H "Idempotency-Key: $KEY"
curl -s -X POST https://api.oddssea.xyz/tasks/login-claim   -H "Authorization: Bearer $ACCESS" -H "Idempotency-Key: $KEY"   # identical body
```

| Check | What it proves |
|---|---|
| Replay a claim with the same `Idempotency-Key` → **one** ledger row, original response returned | Retrying is safe, which is what makes the cold-start protocol usable |
| Two concurrent all-in bets → serialised, **balance never negative** | The player row lock and the non-negative CHECK. Not "one is rejected": if the first wins it may legitimately fund the second |
| A winning dice bet writes **three** ledger rows (stake, payout, Pearls) | One currency and one kind per row |
| Claim twice in one UTC day → refused; consecutive days → 50, 60, 70 … capped 100 | The economics, not just the plumbing |
| `UPDATE ledger_entries` as `oddssea_app` → **permission denied**; `SELECT * FROM sessions` → **permission denied** | Append-only is enforced, and credential tables are unreadable |
| Corrupt a cached balance inside a rollbackable admin transaction, then claim → the function `RAISE`s | Drift is prevented in the transaction that would have caused it, not detected afterwards |
| An unattested player calling `/bets/dice` → rejected | Compliance is server-side, not a rendered gate |
| `document.cookie` → **empty** | The session cookie is `HttpOnly` — not merely "the refresh token isn't there" |
| Idle 15 minutes, then `ServerlessDatabaseCapacity` → **0** | Scale-to-zero engaged; the whole cost model |
| Cold first request → waiting screen, then a working session | Both cold-start paths |
| Billing → **no NAT gateway** | The most expensive trap in the milestone, avoided |

### Running locally

`web/.env.local` needs `VITE_API_URL`; the Vite dev server proxies `/auth` to
the deployed API so the callback reaches the BFF rather than the SPA
fallback. Without that proxy, "the browser never sees the code" would be true
in production and false on your machine — the worst kind of difference.

## Failure modes worth recognising (Increment C)

| Symptom | Cause | Fix |
|---|---|---|
| The API panel says "the request never completed" instead of showing a status | A network-level failure, not an HTTP response: DNS, TLS, offline — or a genuine CORS block, which means the calling origin is not in the allow-list | Check the browser console; it names the CORS reason explicitly. A 401 or 403 is *not* this case — the gateway sends allow-origin on those, and the panel renders them |
| `/me` in curl returns 403 when you expected 401 | The token is *valid* but fails the scope requirement — the classic case is sending the **ID token**, which carries no `scope` claim | 401 = unknown caller, 403 = known but not allowed. Send the **access** token |
| Browser console: CORS error naming the origin | The calling origin is not in the allow-list (`appUrl` + `http://localhost:5173`) — e.g. Vite came up on port 5174 because 5173 was taken | Free the port or add the origin; the allow-list is in `infra/lib/constructs/api.ts` |
| First API call after a quiet spell takes ~a second; later ones are fast | **Cold start** — the function scaled to zero and AWS built a fresh execution environment for the first request | Normal at this scale. It matters at volume; provisioned concurrency is the (paid) fix, and nothing here needs it |
| `{"message":"Not Found"}` with a 404 from the API | The path exists on no route (`/Health` ≠ `/health`), or the stage/routes are still creating on a first deploy | Check the path against the Routes console page; on first deploys the site publishes only after `api.ready`, so this should not be visible from the panel |
| `{"message":"Unauthorized"}` in curl with a token you believe is fresh | The authorizer's checks are exact: wrong issuer (different pool), wrong audience (different app client), or the token expired mid-session | Decode the JWT at the payload (base64url) and compare `iss`/`client_id`/`exp` against the authorizer's configuration in the console |


## Failure modes worth recognising (the ledger)

| Symptom | Cause | Fix |
|---|---|---|
| Everything is slow for ~15s, then fine — and it happens again the next morning | **Working as designed.** The cluster paused after ten idle minutes. A resume is ~15s, or 30s+ if it slept over 24 hours | Nothing. The waiting screen exists for this. If it is *never* fast, check whether something is holding a connection open |
| `ServerlessDatabaseCapacity` never reaches 0 | Something is holding a connection: RDS Proxy (not used here, deliberately), a scheduled job, or **a `psql`/query-editor session you left open** | Close it. AWS lists the blockers under "Situations where Aurora serverless doesn't auto-pause"; the failure is silent and costs money |
| A bill appears that dwarfs everything else | A NAT gateway. The CDK default for `ec2.Vpc` is **one per availability zone**, ~$32/mo each | `natGateways: 0` in `data-stack.ts`. The Lambdas never enter the VPC — they use the Data API — so zero is correct, not a compromise |
| CI synth fails: "Need to perform AWS calls … no credentials" | A construct is doing a **context lookup**. CI synthesises without credentials by design | Either cache it in `cdk.context.json` (as the hosted zone is) or remove the lookup — `DataStack` overrides `availabilityZones` for exactly this reason |
| `aws lambda invoke` succeeded but nothing was migrated | The CLI **exits 0 when the function throws** — the API call worked, the function did not | `scripts/run-migrations.sh` checks `FunctionError` and the payload. Never trust the exit code alone |
| Migration fails: "has changed since it was applied" | An already-applied `.sql` file was edited. Applied migrations are history | Add a NEW migration. If the diff is only line endings, check `.gitattributes` still pins `*.sql` to LF |
| `permission denied for table ledger_entries` | **Working as designed** if it came from the API — `oddssea_app` has EXECUTE and no table writes | If it came from a *function*, that function is missing `SECURITY DEFINER` or its `GRANT EXECUTE` in `004` |
| `balance drift for player …` | The cached balance disagreed with the ledger sum, and the function refused rather than proceeding | This should be impossible through the API. It means someone wrote the table directly — investigate before clearing it |
| A minimum-stake bet awards 0 Pearls | Expected for a *single* bet: the award is 0.225 Pearls at stake 10. It accumulates in `players.pearls_fraction` and pays out as whole Pearls | Nothing. `pearlsPending` in the response shows the carry. Flooring per bet would lose it entirely — that bug is why the column exists |
| Pipeline: `could not resolve MigrationFunctionName` (works locally) | Shell-quoting that is required on one platform and harmful on the other. `--query` takes a JMESPath expression full of brackets and quotes; Windows needs it quoted (the AWS CLI is resolved through a shell), Linux does not, and there the quotes become part of the expression so it matches nothing | Pass only inert arguments to build-time commands and filter in Node — `--output json`, then `.find()`. **Third shell-portability bug in this milestone** after `cp` and `bash`; the pattern, not the instance, is the thing to fix |
| `'bash' is not recognized as an internal or external command` during `npm run deploy` | An npm script invoking a shell script. npm runs scripts through the platform shell — `cmd.exe` on Windows — and `bash` is not on PATH even with Git installed | The migration runner is `scripts/run-migrations.mjs`, plain Node, for exactly this reason. **Same root cause as the `cp` row below, and it shipped anyway** because fixing one instance is not the same as removing the assumption |
| `'cp' is not recognized as an internal or external command` during a deploy | A CDK `commandHooks` step shelling out to a Unix tool. CDK runs hooks through the platform shell — `cmd.exe` on Windows — so `cp` works under Git Bash (which ships coreutils) and fails in PowerShell | Use `node -e "require('fs').cpSync(...)"` instead. Node is guaranteed present because CDK runs on it. **A build step whose success depends on which terminal you opened is a bug**, and it is invisible to whoever synthesises in the shell that works |
| Local login redirects but the app never signs in | The Vite `/auth` proxy is missing or `VITE_API_URL` is unset, so the callback hit the SPA fallback instead of the BFF | Set `VITE_API_URL` in `web/.env.local` and restart Vite |
| `redirect_mismatch` after moving to the BFF | Cognito matches `redirect_uri` as a **whole string**, and the BFF registers `/auth/callback` — not an origin | Check the allow-list in `api/src/bff/index.ts` against the client's callback URLs |

---

## Glossary

Grows as terms first appear. Increment A's entries:

| Term | Meaning |
|---|---|
| **Region** | One of AWS's isolated copies of itself. This project lives entirely in us-east-1. |
| **ARN** | Amazon Resource Name — every resource's unique address: `arn:aws:service:region:account:resource`. |
| **CloudFormation** | AWS's infrastructure-as-code engine: give it a template, it creates/updates/rolls back resources as a **stack**. |
| **Stack** | One CloudFormation deployment unit — a set of resources created, updated and deleted together. |
| **CDK** | Cloud Development Kit — TypeScript that *generates* CloudFormation templates. `synth` compiles, `deploy` applies. |
| **Bootstrap / CDKToolkit** | The one-time stack of staging resources (bucket, roles) CDK needs before it can deploy anything else. |
| **S3** | Object storage — files under keys in a **bucket**. Serves the built site here. |
| **CloudFront** | The CDN: caches your files at edge locations worldwide, terminates HTTPS. |
| **OAC** | Origin Access Control — CloudFront signs its requests to S3, so the bucket can stay fully private. |
| **Registrar** | Where a domain is bought and renewed (GoDaddy here). Fundamentally: the party that tells the registry which nameservers speak for the domain. |
| **DNS host / authoritative nameserver** | The servers that actually answer queries for a domain's records (Route53 here, after delegation). |
| **Hosted zone** | Route53's container for one domain's DNS records. The $0.50/month. |
| **Delegation / NS record** | A parent zone's pointer saying "ask these nameservers" — the mechanism the whole DNS tree runs on. |
| **A record / Alias** | Name→address record. Route53's *alias* variant points at an AWS resource instead of an IP, and works at the zone apex. |
| **ACM** | AWS Certificate Manager — issues and auto-renews the TLS certificate; proves domain control via a published DNS record. |
| **DNS validation** | Proving you control a domain by publishing a challenge record ACM specifies. Automated here because Route53 is authoritative. |
| **IAM** | Identity and Access Management — who (principals/roles) may do what (policies) in the account. |
| **Role** | An IAM identity with no password or keys that trusted parties *assume* temporarily. |
| **OIDC provider** | IAM's registration of an external token issuer (GitHub) as trustworthy — the basis of keyless CI/CD. |
| **`sub` condition** | The trust-policy line pinning role assumption to one repo+branch. The single most security-relevant line in the CI/CD stack. |
| **STS** | Security Token Service — mints the temporary credentials behind every role assumption (`sts get-caller-identity` asks it "who am I?"). |
| **Cognito / user pool** | AWS's user directory: accounts, passwords, verification, reset. Hosts the login pages so you don't build them. |
| **App client** | A site's registration with the user pool: which flows, scopes and redirect URLs it may use. Ours is a *public client* — no secret. |
| **Managed Login** | Cognito's brandable hosted login pages (requires the Essentials tier); styled once in the console's branding designer. |
| **OAuth 2.0 / Authorization Code flow** | The redirect dance: authenticate elsewhere, return with a one-time code, exchange it for tokens out-of-band. |
| **PKCE** | Per-login disposable secret: send the hash out, present the original to cash the code. Replaces the client secret a browser can't keep. |
| **`state`** | Random tag echoed through the login round-trip; a mismatch means the redirect wasn't ours — refuse it (login-CSRF protection). |
| **ID / access / refresh tokens** | Passport (who you are) / boarding pass (what you may call, 1h) / re-issue rights (1 day here). |
| **JWT** | Signed-not-encrypted token format: header.payload.signature, each base64url. Readable by anyone, forgeable by no one. |
| **Claims** | The key-value facts inside a token: `sub`, `email`, `exp`, `custom:age_attested_at`… `sub` is the immutable user ID — the future ledger foreign key. |
| **Scopes** | What a token is allowed to do, granted at the authorize request. `aws.cognito.signin.user.admin` is what lets ours call the self-service user APIs. |
| **JWKS** | Cognito's published public keys (`<issuer>/.well-known/jwks.json`) — how Increment C's API will verify signatures without calling Cognito. |
| **L1 escape hatch** | Reaching under a CDK construct to set a raw CloudFormation property it doesn't expose yet (`node.defaultChild`) — how Managed Login is enabled here. |
| **Root user** | The account-owner identity from signup. Unconstrained by policy, so: MFA it, then stop using it for daily work. |
| **IAM Identity Center** | AWS's human-login system: browser sign-in, temporary CLI credentials that expire in hours. Replaces IAM users with permanent access keys. |
| **Permission set** | Identity Center's template for what an assigned user may do in an account (here: AdministratorAccess). |
| **AWS Organization** | Management layer for multiple accounts. Auto-created by Identity Center; inert with one account. |
| **Lambda** | Run-a-function-on-demand compute: no server to own, scales to zero, billed per invocation. The API's handler is one. |
| **Cold start** | The latency of the *first* invocation after a function scaled to zero — AWS building a fresh execution environment. Later calls reuse it. |
| **API Gateway / HTTP API** | The managed front door for APIs: routes, CORS, and auth checks before any code of yours runs. HTTP API (v2) is the cheaper, leaner generation used here. |
| **JWT authorizer** | The gateway's built-in token checker: signature (against JWKS), issuer, audience, expiry, scopes — offline, per request, no Lambda involved in a rejection. |
| **Integration** | The gateway's term for "what a route invokes" — here, one Lambda behind both routes. |
| **API mapping** | The binding between a custom domain and an API (+stage) — the piece that makes `api.oddssea.xyz` route to this API rather than serve anything itself. |
| **Preflight** | The browser's permission-check `OPTIONS` request before a cross-origin call with non-safelisted headers (like `Authorization`). The gateway answers it directly. |
| **Revocation** | Telling Cognito a refresh token is dead (`/oauth2/revoke`) — logout's third job. Cannot un-issue outstanding access tokens; offline verifiers accept them until expiry. |
| **Backend-for-frontend (BFF)** | A server that owns the OAuth exchange and holds the refresh token, so the browser never stores a credential it could leak. |
| **`httpOnly` cookie** | A cookie JavaScript cannot read at all. The only browser storage an XSS payload cannot exfiltrate. |
| **`SameSite`** | Controls whether a cookie rides along on cross-site requests. `Lax` is meaningful here only because CloudFront makes the BFF same-origin with the app. |
| **RDS Data API** | Talking to Postgres over signed HTTPS instead of a connection. No pool, no VPC — and, decisively, nothing held open to prevent the cluster pausing. |
| **Scale to zero / auto-pause** | Aurora Serverless v2 at minimum capacity 0: an idle cluster stops and bills only storage. Resumes in ~15s. |
| **Migration** | An ordered, one-time schema change, recorded with a checksum. Applied migrations are history: you add, never edit. |
| **Advisory lock** | A Postgres lock on an arbitrary number rather than a row — here, so two migration runners cannot apply the same file. Must be *transaction*-scoped over the Data API, which has no session affinity. |
| **`SECURITY DEFINER`** | A function that runs with its owner's privileges rather than the caller's. Privilege delegation, narrowed to one operation — how the API writes a ledger it cannot touch. |
| **`SELECT … FOR UPDATE`** | A pessimistic row lock: one player's economic events serialise, so concurrent bets cannot both spend the same balance. |
| **Idempotency key** | A client-generated identifier making a repeated request harmless. Distinct from atomicity, which only covers a single execution. |
| **UUIDv7** | A time-ordered UUID. Keys sort by creation time, so an append-heavy ledger writes to the end of its index instead of scattering across it. |
| **Quantisation carry** | Accumulating a fractional remainder so repeated rounding loses nothing — why a 0.225-Pearl award is not simply floored away. |
| **Resource server** | Cognito's mechanism for custom API scopes (`oddssea-api/read`…) — the shape this becomes when one protected route grows into many with different permissions. |
