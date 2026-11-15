# Oshi Log

This is where I store my oshikatsu stuff: a personal log app, built for my own use.

A personal oshikatsu log for live-idol fans. Log every 特典会 loop and what you talked about, scan your chekis, keep track of lives, marche, merch and tickets you bought ahead, and look back with monthly, quarterly and yearly recaps.

It runs in the browser and installs to your phone's home screen. Your entries stay on your device, and optionally sync through your own Supabase project.

## Features

- **特典会 loops** — who, how many chekis, 特典 used (新規無料, 遠征特典…), automatic cost, and a talk memo where Return switches between 推： and 私：. Save & next loop numbers the next one for you.
- **Cheki scanner** — finds the white instax frame (mini, square, wide), lets you drag the corners with a magnifier, straightens it and fixes the colours.
- **Face suggestions** — add a few face photos per member and the app suggests who's in a new cheki. Runs entirely on your device.
- **Lives** — total lives, lives per month, venues, chekis by member, milestones, and a page per live with its 入場番号 and everything that happened.
- **Ticket wallet** — tickets bought ahead (まとめ買い), how many are left, and a warning a week before they expire.
- **Marche** — photos and video messages with the message written for you.
- **Merch, travel & food, collabs.**
- **Recaps** — month, quarter or year, with spending you can hide until you choose to reveal it.
- **Works offline** — logging in a basement live house with no signal is fine; it syncs later.

## Use it

Open the app at **https://sumiyameng.github.io/Oshikatsu-Diary/**.

- **iPhone:** open it in Safari → Share → **Add to Home Screen**.
- **Android:** open it in Chrome → **Install app**.

## Sync between devices (optional, free)

Sync uses your own [Supabase](https://supabase.com) project, so your data is never on anyone else's server.

1. Create a free Supabase account and a new project. Pick the **Tokyo** region.
2. In the project, open **SQL Editor → New query**, paste everything from [`supabase/schema.sql`](supabase/schema.sql) and press **Run**.
3. Open **Authentication → URL Configuration** and set **Site URL** to the app's address above.
4. Open **Project Settings → API** and copy the **Project URL** and the **publishable (anon) key**.
5. In Oshi Log, go to **More → Sync & backup**, paste both and press **Connect**.
6. Press **Create account** with your email and a password, confirm the email, then sign in. Sign in with the same account on your other devices.

The publishable key is meant to be used in apps. Row level security in the schema makes sure only your account can read your rows and photos.

## Privacy

- Entries, photos and face data are stored on your device (IndexedDB).
- With sync on, they're also stored in your own Supabase project, readable only by your account.
- Face matching runs on your device with models shipped in the app. No photo is sent anywhere for it.
- No analytics, no ads, no tracking.

## Development

```bash
npm install
npm run dev      # local dev server (set BASE=/ to serve from the root)
npm test         # unit tests (stats, wallet, scanner maths)
npm run build    # production build into dist/
```

Pushing to `main` builds and publishes the app to GitHub Pages through `.github/workflows/deploy.yml`. In the repository's **Settings → Pages**, set **Source** to **GitHub Actions** once.

**Stack:** React 18, TypeScript, Vite, vite-plugin-pwa, Dexie (IndexedDB), Supabase, @vladmandic/face-api, Vitest.

```
src/
  lib/          data model, local database, sync, stats, scanner, face matching
  components/   entry form, scanner, shared UI
  views/        Log, Lives, live page, Wallet, Recap, More
supabase/       database schema for sync
tests/          unit tests
```

## License

MIT
