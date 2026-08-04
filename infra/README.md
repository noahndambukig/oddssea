# The walkthrough

This file is the guided tour of oddssea's infrastructure, written for someone
deploying to AWS for the first time. It grows with the project: right now it
covers **Increment A — a live URL**. Increments B (login) and C (the API) get
appended when they land.

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
                    https://dev.oddssea.xyz ◄── Route53 ───────┘
```

Reading it bottom-up: a browser asks DNS where `dev.oddssea.xyz` is, DNS
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
those nameservers   "dev.oddssea.xyz is <CloudFront>"        ← the actual answer
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

- **ACM (Certificate Manager):** a certificate for `dev.oddssea.xyz` appears
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

Open **https://dev.oddssea.xyz**. That is your URL now.

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
is live at dev.oddssea.xyz without you having touched AWS. That is
continuous deployment.

---

## Failure modes worth recognising (Increment A)

| Symptom | Cause | Fix |
|---|---|---|
| GoDaddy rejects nameservers: "Hostname has invalid TLD" | Trailing dot pasted from Route53's absolute-name display | Strip the final dot from each: `…awsdns-41.com`, not `…awsdns-41.com.` |
| Browser says NXDOMAIN right after a successful deploy, but `nslookup <name> 8.8.8.8` resolves | **Negative caching**: your resolver looked the name up before the record existed and cached the non-existence (SOA negative TTL — Route53 default 900s) | Wait ≤15 min, or point the browser at a public resolver (Chrome → Use secure DNS) |
| Deploy hangs at `Certificate … CREATE_IN_PROGRESS` | Nameservers haven't propagated; ACM can't see its validation record | Part 2 check; wait; the deploy resumes on its own once DNS answers |
| `Zone … not found` at synth | Hosted zone missing, or shell has no credentials for the lookup | Create the zone / `aws login` |
| CI synth: `«StackAccountRegionNotSpecified» Cannot retrieve value from context provider` | Stack account derived from credentials CI doesn't have — without a concrete account+region CDK cannot even build the key to read the committed context cache | Pin `account` in `lib/config.ts`; account IDs are not secrets |
| CI/CD stack fails: `provider already exists` | Account already has a GitHub OIDC provider | `createGithubOidcProvider: false` in config.ts |
| Actions credentials step: `Not authorized to perform sts:AssumeRoleWithWebIdentity` | Repo/branch doesn't match the `sub` condition, or the variable holds the wrong ARN | Compare cicd-stack.ts condition to the actual repo+branch; re-check `AWS_DEPLOY_ROLE_ARN` |
| Actions credentials step: `Credentials could not be loaded` | Workflow missing `id-token: write` | Already set in deploy.yml — check it wasn't edited out |
| `No frontend build found at …/web/dist` | Synth/deploy ran without building web first | `npm run deploy` from the root (it builds first), or `npm run build` |
| Page loads but stale after a deploy | CloudFront cache | The root deployment invalidates `/index.html` + `/config.json` — if you see this, check the deploy actually succeeded |

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
| **Root user** | The account-owner identity from signup. Unconstrained by policy, so: MFA it, then stop using it for daily work. |
| **IAM Identity Center** | AWS's human-login system: browser sign-in, temporary CLI credentials that expire in hours. Replaces IAM users with permanent access keys. |
| **Permission set** | Identity Center's template for what an assigned user may do in an account (here: AdministratorAccess). |
| **AWS Organization** | Management layer for multiple accounts. Auto-created by Identity Center; inert with one account. |
