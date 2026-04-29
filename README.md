# CiteCast

Chrome extension that surfaces source citations on YouTube videos and web articles. CiteCast extracts every external reference (papers, articles, books, quotes, statistics), finds each source via search APIs, and shows clickable cards where claims are made.

**YouTube:** Automatic — citation cards appear at timestamps as the video plays.
**Articles:** Opt-in — click the extension icon and hit "Analyze this page" to highlight cited claims inline.

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
# Video
curl http://localhost:3000/api/annotations/dQw4w9WgXcQ

# Article
curl -X POST http://localhost:3000/api/annotations/article \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/article","text":"According to a 2023 Pew Research study...","title":"Example"}'
```

### Extension (Chrome)

```bash
pnpm --filter @citecast/extension build
```

Then in Chrome:
1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select `apps/extension/`
4. Open any YouTube video with captions (auto-activates)
5. Or visit any article, click the CiteCast icon, and hit "Analyze this page"

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

**Videos** (lots of cited sources):
- `CRXUOv34jQk` — Veritasium "The Simplest Math Problem No One Can Solve"
- `rStL7niR7gs` — Kurzgesagt "The Egg"
- `aircAruvnKk` — 3Blue1Brown "But what is a neural network?"

**Articles:** Any long-form article with cited studies or attributed claims — op-eds, explainers, research summaries.

## Architecture

```
YouTube:  Content script → GET /api/annotations/:youtube_id
Articles: Popup → Background → Inject article script → POST /api/annotations/article

Backend pipeline (shared):
  1. Text input (transcript or article body)
  2. LLM extraction (citations from text)
  3. Parallel search (Brave / Semantic Scholar / Perplexity)
  4. Cache in Vercel KV (30-day TTL)
  5. Return annotation JSON
```

YouTube renders: citation cards synced to video time, timeline markers, sidebar.
Articles render: inline text highlights, positioned citation cards, sidebar.

## Tests

```bash
pnpm test
```

71 unit/integration tests covering claim routing, LLM output parsing, video pipeline, and article pipeline.

## Known limitations

- Pre-recorded YouTube videos only (no live streams)
- Article analysis requires clicking the extension icon (opt-in via activeTab)
- Article text extraction uses heuristics — login walls and JS-rendered content may not extract well
- Citation cards positioned in fixed corner on YouTube (no smart positioning)
- Confidence is LLM self-reported (no ML model)
- Vercel KV free tier: ~30K commands/month
- YouTube DOM changes may break overlay positioning; sidebar is the fallback
