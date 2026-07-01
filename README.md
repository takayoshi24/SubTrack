# SubTrack

Desktop app for tracking recurring subscriptions — costs, billing dates, and payment history.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) 1.77.2+ (includes `cargo`)
- Windows: [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (pre-installed on Windows 11; downloadable for Windows 10)

Verify your setup:

```bash
node --version
rustc --version
```

## Installation

```bash
git clone https://github.com/takayoshi24/SubTrack.git
cd SubTrack
npm install
```

## Running

```bash
npx tauri dev
```

This starts the Vite dev server and opens the desktop window. The first run compiles ~400 Rust crates and takes 3–5 minutes. Subsequent runs are fast.

> **Windows + Conda**: if you get `cargo not found`, reload your PATH first:
> ```powershell
> $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
> ```
> Then retry `npx tauri dev`.

The database (`subtrack.db`) is created automatically on first launch in your OS app-data directory. Five sample subscriptions are loaded on a fresh database so you can explore immediately.

## Features

- **Dashboard** — monthly cost estimate, year-to-date spend, and all payments due in the next 30 days with a Mark Paid button
- **Subscriptions** — add, edit, and cancel subscriptions; billing cycles: weekly, monthly, quarterly, yearly
- **Price history** — updating a price closes the old record and opens a new one; historical totals stay accurate
- **Payment history** — per-subscription log of payments and price changes

## Project structure

```
src/
├── components/
│   ├── Dashboard.tsx           Upcoming payments and spend stats
│   ├── SubscriptionsView.tsx   Subscription card grid
│   ├── SubscriptionForm.tsx    Add / edit modal
│   └── PaymentHistoryModal.tsx Payment and price history tabs
├── db.ts                       All SQLite operations
├── utils/billing.ts            Billing date computation and formatting
├── types.ts                    TypeScript interfaces
└── App.tsx                     Root layout and navigation

src-tauri/
├── src/lib.rs                  Tauri app entry — registers SQL plugin
├── tauri.conf.json             App config (name, window size, bundle id)
└── Cargo.toml                  Rust dependencies
```

## Database schema

```sql
subscriptions       (id, name, owner, cycle, anchor_date, cancelled_at)
subscription_prices (id, subscription_id, amount, valid_from, valid_to)
payments            (id, subscription_id, amount, due_date, paid_date, status)
```

Billing dates are always computed from `anchor_date`, never from the last payment. Month-end clamping preserves the original anchor day (a subscription starting Jan 31 bills on Feb 28 but snaps back to Mar 31).

## Build for production

```bash
npx tauri build
```

Produces a signed installer in `src-tauri/target/release/bundle/`.

## License

MIT
