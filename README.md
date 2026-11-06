# Stamp

Shared digital loyalty stamp cards. Sign in with Google, make a card, and share
it with friends through an invite link; everyone on a card sees stamps appear
live. Built with Svelte 5, Vite, and TypeScript on Supabase.

## Quick start

```bash
npm install
cp .env.example .env.local # then fill in your Supabase URL and key
npm run dev
```

Open `http://localhost:5173` and sign in with an emailed code. Setting up the
Supabase project is a one-time step; see
[Set up the backend](#set-up-the-backend).

```bash
npm run check   # type check
npm run test:db # database rule tests (Postgres in-process, no Docker)
npm run build   # static site in dist/
```

## How cards work

- Each card type is a **stack** of passes. The newest pass is on top and is the
  only one that takes stamps.
- A new pass can start only once the newest one is full. Claiming the newest
  pass starts the next one automatically; **new card** starts it without
  claiming, and the full pass stays in the stack to be claimed later. **Show
  all** lists every pass in a stack, claimed ones included.
- Each pass keeps the stamp count it started with. Changing a card's count
  reshapes the pass in progress (never below a stamp already used) and future
  passes; finished passes keep theirs.
- Tapping a filled stamp shows who stamped it, when, and its note. Tapping the
  card itself opens a summary of every stamp, plus when the pass was started,
  completed, and claimed.

## Sharing and accounts

- People sign in with a one-time code sent to their email (no password), or with
  Google or GitHub where those are switched on. Each person has one account on
  every device; display names are just labels and may repeat.
- A card's owner can edit, delete, and share it. **Invite link** in the card
  editor makes a link that lets anyone who opens it join for 14 days; **turn off
  old links** stops every link sent so far. Owners can also remove people.
- Members can stamp, unstamp, add notes, claim, and start the next pass, and can
  leave a card from its summary.

The database enforces all of this. The app can only read tables; every change is
a database function that checks who is asking and the stack rules, under a row
lock so two people tapping at once cannot corrupt a stack. See
[the schema](supabase/migrations/20261106000000_init.sql).

## Set up the backend

1. Create a free project at [supabase.com](https://supabase.com) with the Data
   API on and automatic table exposure off.
2. Put the project URL and publishable key (**Project Settings → API Keys**) in
   `.env.local`.
3. Set up email codes, the default sign-in:
   - In **Authentication → Emails**, replace the **Confirm signup** and **Magic
     Link** templates with
     [confirm_signup.html](supabase/templates/confirm_signup.html) and
     [magic_link.html](supabase/templates/magic_link.html), using the subject
     written at the top of each. They show the code, plus a button for people
     who would rather tap.
   - Supabase's built-in mailer only sends to the project's team, a few times an
     hour, as "Supabase Auth". For everyone else, add a mail sender under
     **Authentication → SMTP Settings** with the sender name `stamp`, for
     example Brevo's free tier (verify your own address as the sender) or a
     Gmail app password.
4. Optionally turn on Google or GitHub; the sign-in screen shows whichever are
   on. The callback URL for both is
   `https://<project-ref>.supabase.co/auth/v1/callback`.
   - **Google:** in [Google Cloud Console](https://console.cloud.google.com),
     create a **Web application** OAuth client with that redirect URI (no
     billing or free trial needed), publish the consent screen, and paste the
     client ID and secret into **Authentication → Sign In / Providers →
     Google**.
   - **GitHub:** GitHub → Settings → Developer settings → OAuth Apps → New OAuth
     App, with that callback URL; paste the client ID and secret into the GitHub
     provider.
5. In **Authentication → URL Configuration**, set the site URL to where the app
   is hosted and add `http://localhost:5173/**` to the redirect URLs.

Free Supabase projects pause after about a week without use; the next visit
wakes them up.

## Deploys

Every push to `main` runs [the deploy workflow](.github/workflows/deploy.yml):
type check and database tests, then new migrations to Supabase, then the site to
GitHub Pages. It needs these repository settings:

- Secret `SUPABASE_DB_URL`: the **Session pooler** connection string from
  Supabase → **Connect**, with the database password filled in. The direct
  connection is IPv6-only, which GitHub's runners cannot reach.
- Variables `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.
- **Pages → Source: GitHub Actions**.

Add the Pages URL (`https://<user>.github.io/stamp/**`) to Supabase's redirect
URLs. Migrations run only through the workflow, which records each one, so don't
also paste them into the SQL Editor.
