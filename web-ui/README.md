# NOCTRA Official Website (`web-ui`)

Official product website, Download Center, MDX Documentation, and Changelog for the **NOCTRA** ecosystem:

- **NOCTRA AI** — Privacy-first Android AI chat application (`../android`)
- **NOCTRA STUDIO** — Desktop AI agent, MCP, Skills & workflow platform (`../desktop`)

> **"YOUR AI. YOUR RULES. YOUR OWN ECOSYSTEM."**

---

## Tech Stack

- **Next.js** (App Router) & **React 19**
- **TypeScript** (strict mode)
- **Tailwind CSS v4**
- **Framer Motion** (respecting `prefers-reduced-motion`)
- **Lucide React** icons
- **MDX** (`next-mdx-remote/rsc` + `remark-gfm` + `gray-matter`)

---

## Centralized Content & Release Management

- `data/site-config.ts` — Navigation, brand metadata, and environment-driven community/contact links
- `data/products/noctra-ai.json` & `data/products/noctra-studio.json` — Product copy, features, and security notices
- `data/releases/noctra-ai.json` & `data/releases/noctra-studio.json` — Release versions, checksums, system requirements, and download URLs
- `data/faq.ts` — Centralized FAQ entries
- `content/docs/` — Categorized MDX documentation (`getting-started/`, `noctra-ai/`, `noctra-studio/`, `advanced/`)
- `content/changelog/` — MDX changelog entries

---

## Environment Variables

Copy `.env.example` to `.env.local` and configure values as needed:

```bash
cp .env.example .env.local
```

See [`.env.example`](.env.example) for supported keys:

- `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME` — Server-side Backblaze B2 credentials used by `/api/download` to issue temporary signed redirects for the private `Noctra` bucket.
- `NEXT_PUBLIC_GITHUB_URL` and other `NEXT_PUBLIC_*` keys — Public site and community links.

---

## Commands

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm run dev
```

### 3. Typecheck & Lint
```bash
npm run typecheck
npm run lint
```

### 4. Run Production Build
```bash
npm run build
npm start
```

### 5. Deploy to Vercel
```bash
npx vercel --prod
```
Or connect the repository in Vercel with **Root Directory** set to `web-ui`.
