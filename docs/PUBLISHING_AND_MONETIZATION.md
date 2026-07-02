# GeoFighters — Publishing & Monetization Report

Where to publish the game, what each platform pays, what they require, and the
recommended rollout order. Figures reflect publicly documented terms as of
mid-2026 — always re-check a platform's docs before signing anything.

---

## TL;DR — Recommended rollout

| Priority | Platform | Model | Why |
| --- | --- | --- | --- |
| 1 | **CrazyGames** | Ad revenue share | Biggest open submission portal, SDK already integrated in this repo, monthly payouts from €100 |
| 2 | **Poki** | 50/50 ad rev share (100% on direct traffic) | Highest-quality traffic and eCPMs, but curated — treat acceptance as a bonus |
| 3 | **itch.io** | Donations / pay-what-you-want, you keep ~90% | Zero gatekeeping, good for community + feedback, upload the same zip |
| 4 | **GameDistribution / GameMonetize / GamePix** | Ad rev share via their SDK | Aggregators that syndicate to thousands of smaller portals — long-tail income |
| 5 | **Yandex Games** | Ad rev share (their SDK) | Huge RU/CIS audience underserved by Western portals |
| 6 | **Licensing (non-exclusive)** | Flat fee per license, ~$500–$2,000 | Sell branded/exclusive builds to portals once the game has traction |

Realistic expectations: web-portal ad revenue for a new indie title is usually
**$1–$5 per 1,000 gameplays** (varies with geography, session length, and
rewarded-ad usage). The money comes from being on *many* portals and from
session length — GeoFighters' 10-minute run format is genuinely good for this.

---

## 1. CrazyGames (start here)

- **Submit at:** https://developer.crazygames.com/
- **Model:** revenue share on ads shown in/around your game (display + midroll
  + rewarded). Exact split depends on traffic source and engagement; they do
  not publish a flat percentage.
- **Payout:** monthly once unpaid earnings reach **€100** (PayPal/wire).
- **Requirements (all already handled in this repo — see §7):**
  - HTML5 build that runs from their CDN (relative paths, no hardcoded domain).
  - **SDK integration is mandatory**: loading events + gameplay start/stop
    events; ads are how you earn.
  - Auto-pause/mute when the tab loses focus.
  - No external links, no forced login, loads fast with a progress bar.
  - Submission runs through their **QA tool** which checks these automatically.
- **Metadata you must prepare manually:** description, controls text, cover
  images (16:9 and 1:1, no text-heavy art), optional gameplay video.
- **Tip:** their editorial team boosts games with high retention. Multiplayer
  co-op (already in the game) is a promoted category.

## 2. Poki (apply, don't block on it)

- **Submit at:** https://developers.poki.com/ (submission form)
- **Model:** **50/50** revenue share on traffic Poki brings; **100% to you** on
  direct traffic (bookmarks, search, your community). Optional "Web Exclusive"
  deals trade 7-year web exclusivity for heavy promotion — don't sign
  exclusivity while the game is unproven.
- **Requirements are stricter than CrazyGames:**
  - Initial download target **under 8 MB** — GeoFighters' entry chunks are
    ~240 KB gzipped before the Rapier/three chunks stream in; keep an eye on
    this if they measure total.
  - Their own SDK only (remove the CrazyGames hooks in a Poki build — the
    portal module in `src/core/portal.ts` only activates on CrazyGames
    domains, so the same build is safe to submit).
  - No debug artifacts, mobile controls on tablets (already present).
- **Reality check:** Poki is curated and rejects most submissions; a rejection
  usually comes with feedback. Reapply after improving retention.

## 3. itch.io (free money, zero risk)

- **Submit at:** https://itch.io/developers — upload the `dist/` zip as an
  HTML5 game, playable in browser.
- **Model:** you choose the split (default they keep 10%). Enable
  "pay-what-you-want" with a $0 minimum: browser players pay nothing, but fans
  can tip.
- **Why bother:** analytics, ratings, comments, devlogs, and game-jam
  visibility. Also the standard place reviewers/portal scouts look.
- **No requirements** beyond the zip having an `index.html` at its root —
  the relative-path build produced by `npm run build` works as-is.

## 4. Aggregators — GameDistribution, GameMonetize, GamePix

- **Model:** they syndicate your game to thousands of small portals and split
  ad revenue (GameDistribution claims 4,000+ portals / 350M monthly users).
- **Requirement:** integrate *their* ad SDK per platform (each is a small
  wrapper similar to `src/core/portal.ts` — extend that module rather than
  scattering SDK calls).
- **Caveat:** eCPMs are lower than CrazyGames/Poki, and some portals will
  re-skin or iframe your game. Read the license terms; keep it non-exclusive.

## 5. Yandex Games

- **Submit at:** https://yandex.com/dev/games/
- **Model:** ad revenue share (rewarded + interstitial via their SDK).
- **Why:** very large audience with little overlap with Western portals;
  procedural audio + no text-heavy assets makes localization cheap (translate
  the UI strings only).

## 6. Licensing and other channels

- **Non-exclusive HTML5 licenses:** portals and media companies buy branded
  builds for **$500–$2,000 per license**. Only realistic once the game shows
  traction on open portals — keep analytics screenshots.
- **CoolMath Games:** pays licensing fees; family-friendly requirement — the
  abstract neon-shapes aesthetic qualifies, the word "SURVIVE THE HORDE" is fine.
- **Newgrounds:** small ad share but a strong feedback community.
- **Kongregate:** no longer accepts new web-game uploads — skip.
- **Steam (later):** wrap with Electron/Tauri, $100 fee per title, sell at
  $3–5. Only worth it with more content (multiple arenas/characters, meta
  progression) since Steam users compare against Vampire Survivors itself.
- **Not worth it now:** AdSense on a self-hosted site (needs traffic you don't
  have yet); mobile stores (needs touch-first UX rework and AdMob).

---

## 7. What this branch already did to make the game portal-ready

| Change | Why portals need it |
| --- | --- |
| `vite.config.ts` → `base: './'` + relative links in `index.html` | Portals host builds under nested CDN paths; absolute `/assets/...` URLs 404 there |
| `src/core/portal.ts` (new) — CrazyGames SDK v3 wrapper | Mandatory for CrazyGames: loading events, gameplayStart/Stop on state changes, `happytime()` on victory, midroll ad at end of run with auto-mute. No-op everywhere else |
| Auto-pause on tab blur/hide re-enabled (single-player only) | QA requirement on CrazyGames/Poki; multiplayer is exempt so the host keeps simulating |
| Audio fully muted while the tab is hidden | QA requirement; also used to mute during ads |
| `alert()` replaced with an in-game toast | Browsers block `alert()` in cross-origin iframes — portal embeds would silently swallow multiplayer errors |
| PWA/service worker skipped inside iframes | A SW would fight the portal's caching; install prompts never fire in iframes anyway |
| Vendor chunk splitting (three / rapier / socket.io) | Parallel downloads → faster first paint on portal embeds; game code is now a 170 KB chunk instead of a 2.8 MB monolith |
| `@dimforge/rapier3d-compat` promoted to a direct dependency | It was only installed transitively via `@types/three` (a dev dependency) — a routine update could have broken production builds |

### Remaining manual steps (cannot be done from code)

1. Create a CrazyGames developer account and run the build through their QA
   tool (`npm run build`, zip the contents of `dist/`).
2. Test locally against the SDK with `?portal=crazygames` appended to the URL.
3. Prepare art: 16:9 cover (1920×1080), 1:1 icon, 3–5 screenshots, and ideally
   a 15–30 s gameplay clip.
4. For multiplayer on portals, deploy `server.js` publicly (Render config is
   already in the repo) and set `VITE_SIGNALING_SERVER_URL` **at build time**.
5. Payout setup: PayPal or bank details in each platform's dashboard; expect
   the first payment only after crossing the threshold (€100 on CrazyGames).

### Sources

- [CrazyGames developer docs](https://docs.crazygames.com/) — [requirements](https://docs.crazygames.com/requirements/intro/), [payouts](https://docs.crazygames.com/payouts/)
- [Poki for Developers](https://developers.poki.com/) — [requirements](https://sdk.poki.com/new-requirements), [deal types](https://sdk.poki.com/deals), [monetization guide](https://developers.poki.com/guide/monetization)
- [itch.io for developers](https://itch.io/developers)
- [GameDistribution blog — 2026 HTML5 landscape](https://blog.gamedistribution.com/html5-indie-game-developer-opportunities-2026/)
- [itch.io community list of HTML5 portals/sponsors](https://itch.io/s/28570/make-money-with-html5-games)
