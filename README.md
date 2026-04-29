# CiteCast

Chrome extension that overlays source citations on YouTube videos. When you watch a video, CiteCast pulls the transcript, extracts every external reference (papers, articles, books, quotes, statistics), finds each source via search APIs, and shows clickable cards at the exact timestamps where claims are made.

## Setup

### Backend (Next.js)

```bash
cp .env.example .env.local
# Fill in at least: LLM_PROVIDER, one LLM API key, BRAVE_API_KEY
pnpm install
pnpm dev
```

Backend runs at `http://localhost:3000`. Test with:
```bash
curl http://localhost:3000/api/annotations/dQw4w9WgXcQ
```

### Extension (Chrome)

```bash
pnpm --filter @citecast/extension build
```

Then in Chrome:
1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select `apps/extension/`
4. Open any YouTube video with captions

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `LLM_PROVIDER` | Yes | `nvidia-nim` or `deepinfra` |
| `NVIDIA_NIM_API_KEY` | If using NIM | NVIDIA NIM API key |
| `DEEPINFRA_API_KEY` | If using DeepInfra | DeepInfra API key |
| `LLM_MODEL` | No | Model ID (default: `meta/llama-3.3-70b-instruct`) |
| `BRAVE_API_KEY` | Yes | Brave Search API key |
| `SEMANTIC_SCHOLAR_API_KEY` | No | Optional, works without auth |
| `PERPLEXITY_API_KEY` | No | For Perplexity Sonar fallback |
| `KV_REST_API_URL` | No | Vercel KV URL (caching disabled if unset) |
| `KV_REST_API_TOKEN` | No | Vercel KV token |
| `SEARCH_ROUTING_JSON` | No | Override claim→provider routing |

## Swapping providers

**LLM:** Change `LLM_PROVIDER` env var. Both use OpenAI-compatible APIs.
- `nvidia-nim` → NVIDIA NIM (free tier available)
- `deepinfra` → DeepInfra (Qwen3/Llama 3.3)

**Search:** All three providers are always active (if keys are set). Routing is automatic by claim type:
- Academic papers → Semantic Scholar, then Brave
- News articles → Brave, then Perplexity
- Everything else → Brave, then Perplexity

Override with `SEARCH_ROUTING_JSON`:
```json
{"academic_paper": ["semantic-scholar", "brave"], "news_article": ["brave", "perplexity"]}
```

## Try it

These videos work well for testing (lots of cited sources):
- `CRXUOv34jQk` — Veritasium "The Simplest Math Problem No One Can Solve"
- `rStL7niR7gs` — Kurzgesagt "The Egg"
- `aircAruvnKk` — 3Blue1Brown "But what is a neural network?"

## Architecture

```
Extension (content script) → GET /api/annotations/:youtube_id → Backend pipeline:
  1. Fetch transcript (youtube-transcript)
  2. LLM extraction (citations from transcript)
  3. Parallel search (Brave / Semantic Scholar / Perplexity)
  4. Cache in Vercel KV (30-day TTL)
  5. Return VideoAnnotation JSON
```

Extension renders:
- Citation cards overlaid on the player (synced to video time)
- Timeline markers on the progress bar
- Sidebar with full citation list, filters, and bibliography export

## Tests

```bash
pnpm test
```

42 unit/integration tests covering claim routing, LLM output parsing, and the full pipeline.

## Known limitations

- YouTube only (no other platforms)
- Pre-recorded videos only (no live streams)
- Requires captions/transcript to be available
- Citation cards positioned in fixed corner (no smart positioning)
- Confidence is LLM self-reported (no ML model)
- Vercel KV free tier: ~30K commands/month
- YouTube DOM changes may break overlay positioning; sidebar is the fallback
