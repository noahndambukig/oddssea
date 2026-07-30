# Setup — one time, ~5 minutes

## 1. Create the repo on GitHub

Go to <https://github.com/new>

- **Name:** `avatar-cosmetics-design` (or whatever you like)
- **Visibility:** **Private**
- **Do not** tick "Add a README", "Add .gitignore" or "Choose a license" — this
  folder already has commits, and an initialised remote will cause a conflict on
  the first push.

Click **Create repository**. Leave the page open; you'll need the URL.

## 2. Put this folder somewhere permanent on your Mac

Unzip the docs somewhere you'll keep them. A dedicated projects folder is ideal:

```
~/Projects/avatar-cosmetics-design
```

Avoid putting it inside Dropbox, iCloud Drive or Google Drive. Those sync
tools fight with git's `.git` directory and can corrupt the repo — GitHub is
already your cloud backup, so you don't need a second one.

## 3. Push it

Open Terminal and run these, replacing the URL with your own:

```bash
cd ~/Projects/avatar-cosmetics-design

git remote add origin https://github.com/YOUR-USERNAME/avatar-cosmetics-design.git
git push -u origin main
```

Git history is already initialised with a first commit, so there's nothing to
`git init` or `git add` — it should push straight up.

If it asks for a password, GitHub no longer accepts account passwords over
HTTPS. Either install the GitHub CLI (`brew install gh` then `gh auth login`,
which handles it once and forever), or create a token at
<https://github.com/settings/tokens> and paste that as the password.

## 4. Connect the folder to Claude

In the Claude desktop app, click **Add folder** and choose
`~/Projects/avatar-cosmetics-design`.

That's it. From then on, any Cowork session can read and write these files
directly — no tokens, no uploads, no re-pasting.

## Day-to-day loop

**Starting a session:** say something like *"read the design docs in my
avatar-cosmetics folder"*. I'll read `CLAUDE.md` first, which tells me the
conventions and where things live.

**Ending a session:** commit whatever changed.

```bash
cd ~/Projects/avatar-cosmetics-design
git add -A
git commit -m "Lock headgear roster; adjust set crate price"
git push
```

One commit per working session is a good rhythm. The message matters more than
the frequency — six months from now `git log` is how you'll reconstruct why the
economy looks the way it does.

## If you'd rather not touch the terminal

GitHub Desktop (<https://desktop.github.com>) does steps 3 and the daily commit
loop with buttons instead of commands. Point it at the folder, click
"Publish repository", and commit from the UI afterwards.

## Optional: let me push directly

If you later want me committing and pushing on my own — useful when you're away
from the machine and want work to continue — create a **fine-grained** token at
<https://github.com/settings/personal-access-tokens/new>, scoped to *only* this
repository, with **Contents: Read and write** and nothing else. Paste it into a
session and I'll handle git from the cloud.

Keep it fine-grained and single-repo. A classic token with broad scopes is a
key to your whole GitHub account; this one can only touch these docs, and you
can revoke it from that same page at any time.
