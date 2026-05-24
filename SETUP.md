# GlowTracker — Setup Guide

## Prerequisites
- Node.js 18+ installed
- A free Supabase account

---

## Step 1 — Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in (or sign up for free).
2. Click **New project**.
3. Choose a name (e.g., "glowtracker"), set a strong database password, and pick a region close to you.
4. Wait ~2 minutes for the project to finish provisioning.

---

## Step 2 — Run the Database Migration

1. In your Supabase dashboard, go to **SQL Editor** (left sidebar).
2. Click **New query**.
3. Open `supabase/migrations/001_initial_schema.sql` from this project folder.
4. Copy the entire file contents and paste it into the SQL editor.
5. Click **Run**. You should see "Success. No rows returned."

This creates all the tables, indexes, RLS policies, and seeds the default categories.

---

## Step 3 — Get Your API Keys

1. In your Supabase dashboard, go to **Project Settings → API**.
2. Copy two values:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key (a long JWT string)

---

## Step 4 — Configure Environment Variables

1. In the project root (`C:\GlowLoop`), copy the example file:
   ```
   copy .env.local.example .env.local
   ```
2. Open `.env.local` in a text editor and fill in your values:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```
3. Save the file. **Do not commit `.env.local` to git** — it's already in `.gitignore`.

---

## Step 5 — Run Locally

```bash
cd C:\GlowLoop
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. You should see the GlowTracker login page.

---

## Step 6 — Deploy to Vercel

1. Push your code to a GitHub repository.
2. Go to [vercel.com](https://vercel.com) and click **Add New Project**.
3. Import your GitHub repo.
4. In the **Environment Variables** section, add:
   - `NEXT_PUBLIC_SUPABASE_URL` — your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — your Supabase anon key
5. Click **Deploy**. Vercel will build and publish the app automatically.

> **Tip:** After deploying, add your Vercel domain to Supabase's allowed URLs:
> Supabase Dashboard → Authentication → URL Configuration → Add your `https://your-app.vercel.app` to **Site URL** and **Redirect URLs**.

---

## Notes on Supabase Auth (Email Confirmation)

By default, Supabase requires email confirmation before a new user can log in. During development you can disable this:

1. Supabase Dashboard → **Authentication → Providers → Email**
2. Toggle off **Confirm email**.

Re-enable it before going live.

---

## Phase Overview

| Phase | Features |
|-------|----------|
| **1** (this) | Auth, series CRUD, occurrence engine, dashboard, occurrence detail |
| **2** | Email reminders (Resend), before/after photo upload, product tracking |
| **3** | Google Calendar one-way sync |
| **4** | Event linking (do-both / reset / delay resolution) |
