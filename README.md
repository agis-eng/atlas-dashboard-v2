This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Recordings Pipeline Foundation

Shared store:

- `data/recordings.json` is the unified dashboard-readable store for local voice memos and Fathom calls.
- `data/recording_project_rules.json` and `data/recording-keywords.yaml` contain commit-safe keyword routing rules for project, partner, and optional brain suggestions.
- `/recordings` is the dashboard review queue for manual routing and review-state updates.

Bootstrap the store from existing legacy files:

```bash
npm run recordings:bootstrap
```

Local voice memo runner:

```bash
python3 -m pip install -r scripts/recordings/requirements.txt
cp .config/recordings/voice-memos.env.example .config/recordings/voice-memos.env
# edit .config/recordings/voice-memos.env
npm run sync:voice-memos
npm run sync:voice-memos -- --apply
```

- Dry-run is the default.
- Processing state is stored in `VOICE_MEMO_SOURCE_DIR/.voice_memo_ingestion_state.json` unless `--state` is passed.
- The runner only writes local store/state when `--apply` is set.

Fathom sync foundation:

```bash
python3 -m pip install -r scripts/recordings/requirements.txt
cp .config/recordings/fathom.env.example .config/recordings/fathom.env
# edit .config/recordings/fathom.env
npm run sync:fathom
npm run sync:fathom -- --apply
```

- Dry-run is the default.
- The sync targets the last 7 days unless `--days` is passed.
- Digest output is written to `data/fathom_digest.json` when applied.
- Email delivery is intentionally stubbed; no email is sent by this foundation.
- Secrets stay out of the repo: `.config/recordings/*.env` is gitignored, and only `.example` files are committed.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# Force rebuild Tue Mar 24 19:40:40 EDT 2026
