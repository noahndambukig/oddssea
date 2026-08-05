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
```

`http://localhost:5173/callback` is already a registered callback URL, so
local login works against the real user pool. Three checks worth running
here, all under React StrictMode (the dev default, which double-runs
effects): a full login completes (the single-flight guard survives the
double-run); a reload right after attesting does **not** reopen the gate
(the forced token refresh landed the claim); and the session survives past
the first hour (the refresh token was carried forward — the failure nothing
else would catch).

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
| Login page errors or renders unstyled ("branding style not found") | Managed Login requires a branding style per client | The stack creates one with defaults; redeploy if it was deleted, then restyle in the designer |
| Tokens fail with `invalid_grant` at the token endpoint | The code was already spent (back button, double navigation), or the PKCE verifier is gone | Start a fresh login; the app consumes its verifier after one use by design |
| Attestation write fails with "Access Token does not have required scopes" | The token was minted without `aws.cognito.signin.user.admin` | The authorize request must ask for it — check SCOPES in auth-client.ts; sign out and in to mint a fresh token |
| The 18+ gate reappears after a reload | The stored ID token predates the attestation and lacks the claim | The gate forces a token refresh after writing; if it recurs, check forceRefresh ran and GetUser fallback is reachable |
| `npm run dev` shows "Unexpected token '<', \"<!doctype \"... is not valid JSON" | The dev server answers *any* unmatched path with index.html and a **200**, so a missing `/config.json` arrives as HTML wearing a success status | `runtime-config.ts` checks the content type before parsing, then falls through to `web/.env.local`. If you see this, `.env.local` is missing or incomplete |

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
