# Private Company Intelligence Agent — Design Document

## Overview

A full-stack web app that provides professional-grade competitive intelligence on private companies. Two primary modes plus a results history dashboard.

- **Explore Mode** — Input a sector (e.g. "AI inference chips"), the agent maps the competitive landscape and returns 10-20 companies with profiles on an interactive force-directed graph
- **Deep Dive Mode** — Input a company name, the agent generates a detailed intelligence report with sourced, confidence-scored data
- **Results History** — Browse and revisit all previous queries and reports. This is the landing page.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Backend | Python + FastAPI + LangGraph | Agent orchestration with stateful graph |
| LLM | DeepSeek V3.2 via OpenRouter | Swappable via `LLM_MODEL` env var. Parallel synthesis for deep-dive (12 sections + 1 metadata call) |
| Web Search | Tavily API + Serper API | Multi-provider search in parallel |
| Semantic Discovery | Exa API | Semantic company finding, runs in parallel with Tavily/Serper |
| Page Extraction (primary) | Crawl4AI | Free, open source, local Playwright-based |
| Page Extraction (fallback) | Jina Reader | Free, no API key, prepend `r.jina.ai/` to any URL |
| Frontend | React + Tailwind CSS + shadcn/ui | Professional dark theme, 50+ components |
| Explore Visualization | react-force-graph-2d | Force-directed company landscape graph |
| Deep Dive Charts | Recharts | Funding timeline, sentiment charts |
| PDF Export | html2pdf.js or react-pdf | Client-side, styled professionally |
| Streaming | FastAPI SSE via sse-starlette | LangGraph get_stream_writer() for node status |
| Deploy | Frontend → Vercel, Backend → Railway | |

### Environment Variables

```
OPENROUTER_API_KEY      # required — routes to DeepSeek/GPT-4o/Claude via OpenRouter
TAVILY_API_KEY          # required — web search provider
EXA_API_KEY             # required — semantic search provider
SERPER_API_KEY          # optional — Google search provider (Serper.dev)
LLM_MODEL               # optional — default: deepseek/deepseek-v3.2
```

Note: Crawl4AI and Jina Reader require no API keys.

---

## Agent Architecture

### Two Separate Subgraphs

Rather than one graph with branching logic, two dedicated subgraphs keep each flow simple and independently tunable.

**Explore Mode Graph:**

```
Planner → Searcher → Profiler (lightweight) → Synthesis → Critic → END
```

**Deep Dive Graph:**

```
Planner → Searcher → Profiler (full extraction) → Synthesis (parallel sections) → Critic → END
```

> **Note (2026-03-13):** Retry loop removed — pipeline is now linear. Deep Dive synthesis
> runs 12 section-level LLM calls in parallel via ThreadPoolExecutor + 1 metadata extraction call.
> Search uses 3 providers (Tavily, Exa, Serper) in parallel.

### Node Descriptions

**Planner Node**
- Takes user query and generates a structured search plan
- Decides: what terms to search, how many companies to target, which sub-sectors to explore
- Focuses the Searcher to avoid wasted API calls on vague queries
- Output: `SearchPlan` Pydantic model with search terms, target count, sub-sector breakdown

**Searcher Node**
- Explore Mode: Uses Exa for semantic company discovery (batch call, 1 request returns 20 companies), supplemented by Tavily keyword search if Exa returns < 5 results
- Deep Dive Mode: Uses Tavily to gather raw signals about a specific company (news, press releases, funding announcements)
- Output: List of `RawCompanySignal` with URLs, snippets, metadata

**Profiler Node**
- Explore Mode (lightweight): Uses Tavily snippets only — no full page extraction to conserve credits. Extracts: funding stage, total raised, founding year, core product/technology
- Deep Dive Mode (full): Uses Crawl4AI to extract full page content from company website and recent news. Falls back to Jina Reader if Crawl4AI fails. Falls back to Tavily snippets as last resort
- Extracts: funding stage, total raised, key investors, founding year, headcount estimate, recent news, core product/technology, key people
- 30-second timeout per company. If timeout, skip with "website data unavailable" note
- Output: List of `CompanyProfile` Pydantic models with source URLs

**Synthesis Node**
- Compiles Profiler output into structured intelligence
- Explore Mode: Competitive landscape map data (companies with coordinates, sub-sector clusters, funding amounts)
- Deep Dive Mode: Full company one-pager with sections
- CRITICAL: System prompt enforces source grounding — "Only include information present in the provided source data. If data is missing, write 'Data not available' — never infer or guess."
- Every claim includes `source_url` and `confidence` score
- Output: `ExploreReport` or `DeepDiveReport` Pydantic model

**Critic Node**
- Receives both Synthesis output AND raw Profiler source URLs
- Cross-checks every claim against raw sources
- Flags unverified claims, conflicting data, missing sections
- Assigns per-section confidence score (0.0–1.0)
- Terminal node — no retry loop (pipeline is linear)
- Output: `CriticReport` with verified/unverified flags per data point

### LangGraph State

State persists across all nodes. Schema:

```python
class AgentState(TypedDict, total=False):
    query: str
    mode: str
    search_plan: SearchPlan
    raw_signals: list[RawCompanySignal]
    company_profiles: list[CompanyProfile]
    report: Union[ExploreReport, DeepDiveReport]
    critic_report: CriticReport
    status_events: Annotated[list[StatusEvent], operator.add]
```

> **Note (2026-03-13):** `retry_count` and `retry_targets` removed — no retry loop.

---

## Anti-Hallucination: Three-Layer Defense

### Layer 1: Source-Grounded Generation (Synthesis Node)

- LLM never generates facts from its own memory
- System prompt: "Only include information present in the provided source data. If data is missing, write 'Data not available'."
- Every output field has `source_url: Optional[str]` and `confidence: float`
- Pydantic validators: if a data field is populated but `source_url` is null, validation fails and triggers retry

### Layer 2: Citation Verification (Critic Node)

- Cross-checks claims against raw Profiler data
- For each claim, verifies the information appears in source snippets
- Unmatched claims flagged as `unverified`
- Conflicting sources flagged with both versions shown

### Layer 3: Transparent Confidence in the UI

- Every data point shows provenance:
  - **Green badge** = verified, source link available
  - **Yellow badge** = single source, not cross-verified
  - **Red badge** = data not found or conflicting sources
- Users can click any data point to see the raw source snippet
- Missing data shown honestly as "Data not available" — never filled with guesses

### Pydantic Enforcement

```python
class CompanyProfile(BaseModel):
    name: str
    funding_total: Optional[str] = None
    funding_source_url: Optional[str] = None
    funding_confidence: float = Field(ge=0.0, le=1.0, default=0.0)

    @model_validator(mode="after")
    def funding_must_have_source(self):
        if self.funding_total and not self.funding_source_url:
            raise ValueError("funding_total set without source URL")
        return self
```

---

## API Credit Conservation

### The Problem

- Tavily: 1,000 credits/month (1 credit per search)
- Exa: 1,000 free credits (lifetime)
- Firecrawl: eliminated (replaced by Crawl4AI, unlimited)
- Jina Reader: free, no limits

### Strategy

1. **Crawl4AI as primary scraper** — eliminates the Firecrawl 500-page bottleneck entirely
2. **Explore Mode uses lightweight profiling** — Tavily snippets only, no full page extraction. Saves Crawl4AI for Deep Dive where it matters
3. **Batch Exa calls** — one call returns up to 20 companies, not one per company
4. **Two-level caching:**
   - API-call level: cache raw responses keyed by query/URL in `/backend/cache/api/`
   - Report level: cache final output keyed by `(mode, query)` in `/backend/cache/reports/`
5. **Credit tracker** — backend tracks remaining Tavily/Exa credits, exposed in UI

### Estimated Cost Per Query

| Query Type | Tavily | Exa | Crawl4AI | Total API Cost |
|-----------|--------|-----|----------|---------------|
| Explore (15 companies) | ~15 | 1 | 0 | ~16 credits |
| Deep Dive (1 company) | ~5 | 0 | 0 (free) | ~5 credits |

With 1,000 Tavily credits/month: ~50 Explore queries OR ~200 Deep Dive queries per month.

---

## Error Handling & Fallback Chain

| Failure | Fallback | User-Facing Message |
|---------|----------|-------------------|
| Crawl4AI timeout/error | Jina Reader for that URL | (transparent, no message) |
| Jina Reader fails | Tavily snippets for that company | "Limited data — website extraction unavailable" |
| Exa returns < 5 companies | Supplement with Tavily keyword search | (transparent, no message) |
| Tavily rate limited | Return partial results | "Some companies have incomplete data" |
| Gemini API error | Retry once, then return raw data without synthesis | "AI synthesis unavailable — showing raw data" |
| All search APIs fail | Serve cached result if available | "Showing cached results from [date]" |
| All search APIs fail, no cache | Clear error message | "Unable to retrieve data. Please try again later." |

Each node has a 30-second timeout. If exceeded, the node returns partial results and the pipeline continues.

---

## Output Specifications

### Explore Mode

- Interactive force-directed graph (react-force-graph-2d) taking ~70% of viewport
- Custom canvas node rendering: company initial/logo, ring color by sub-sector, node size by funding amount
- Hover tooltip: name, funding, founding year
- Click: right sidebar slides in with full company card + "Deep Dive" button
- Filter chips below graph: funding stage, sub-sector, founding year range
- Top context bar: "AI Inference Chips — 16 companies found"

### Deep Dive Mode

- Left nav with section anchors: Overview | Funding | People | Product | News | Competitors | Red Flags
- Each section is a shadcn Card with confidence badge and source count
- **Overview**: company summary, core metrics grid (founded, HQ, headcount, stage)
- **Funding**: Recharts area chart timeline + table of rounds with investors
- **Key People**: cards with name, title, background snippet
- **Product/Technology**: structured description with competitive positioning
- **News**: sentiment-colored cards (green/yellow/red left border), date, source link
- **Competitors**: comparison table with key metrics
- **Red Flags**: amber/red card background, icon-based warnings, confidence-scored
- PDF download button — styled report with sections, charts as static images, confidence badges, footer with date and source verification note

### Results History (Landing Page)

- Grid of cards showing past queries
- Each card: sector/company name, date, mode badge (Explore/Deep Dive)
- Thumbnail preview: mini force-graph snapshot for Explore, mini report header for Deep Dive
- Click to reopen full results from cache
- Search/filter bar to find past reports

---

## UI/UX Design Principles

**Design system:** shadcn/ui + Tailwind CSS, dark theme default

**Core principle: Intelligence platform, not AI chatbot.**

1. **Search bar is compact**, top-left or sidebar — not a center-screen ChatGPT prompt. Data is the hero, not the input.
2. **Agent status is subtle**: thin progress bar at top (GitHub-style), small step indicators (Planner → Searcher → Profiler → Synthesis → Critic) with active one highlighted. Detail in collapsible bottom drawer. Disappears when complete, results animate in.
3. **Professional visual language**: Bloomberg Terminal / CB Insights aesthetic. Dark neutral theme, no flashy gradients or AI-themed gimmicks.
4. **Confidence is visible everywhere**: green/yellow/red badges on every data point. Click to see source. Builds trust.
5. **Mobile responsive**: sidebar collapses, graph switches to card list view on small screens.

### Layout

```
┌───────────────────────────────────────────────────────┐
│ ▪ CompanyIntel    [Search...]  [Explore|Deep Dive]    │
│ ══════════════ (thin progress bar) ═══════════════════│
├──────────────────────────────────┬────────────────────┤
│                                  │  Company Card      │
│                                  │  ───────────       │
│     Force Graph / Report         │  Funding: $45M     │
│     (main content ~70%)          │  Stage: Series B   │
│                                  │  Founded: 2019     │
│                                  │  HQ: San Francisco │
│                                  │  [Deep Dive →]     │
├──────────────────────────────────┴────────────────────┤
│ ▸ Agent Log (collapsible)                             │
└───────────────────────────────────────────────────────┘
```

---

## SSE Streaming Implementation

### Backend

- Each LangGraph node emits status via `get_stream_writer()`:
  ```python
  writer = get_stream_writer()
  writer({"node": "searcher", "status": "running", "detail": "Searching Exa for AI chip companies..."})
  ```
- FastAPI endpoint uses `sse-starlette` EventSourceResponse
- Heartbeat ping every 15 seconds to keep connection alive behind proxies
- Final SSE event carries the complete result payload — no separate REST call needed

### Frontend

- `useSSE.js` hook manages connection lifecycle
- Auto-reconnect with exponential backoff on disconnect
- 60-second timeout: if no event arrives, show "Agent may be stalled" rather than spinning forever
- Status events update the thin progress bar and step indicators
- Final event triggers result render with entrance animation

---

## Project Structure

```
/backend
  main.py                  # FastAPI app, SSE streaming endpoint, history endpoint
  config.py                # LLM factory (get_llm), API key management, provider switching
  graph.py                 # LangGraph graph definitions (explore_graph, deep_dive_graph)
  streaming.py             # SSE event helpers, heartbeat logic
  models.py                # All Pydantic schemas: state, input, output, validation
  cache.py                 # Two-level caching (API-call level + report level)
  nodes/
    planner.py             # Query analysis and search plan generation
    searcher.py            # Tavily + Exa search logic
    profiler.py            # Crawl4AI + Jina Reader extraction logic
    synthesis.py           # Source-grounded LLM synthesis
    critic.py              # Citation verification and confidence scoring
  fixtures/
    explore_ai_inference_chips.json
    explore_digital_health_saas.json
    deep_dive_nvidia.json
    deep_dive_mistral_ai.json
    deep_dive_recursion_pharma.json
  requirements.txt
  .env.example

/frontend
  src/
    components/
      layout/
        TopBar.jsx             # Compact search bar + mode toggle
        ProgressBar.jsx        # Thin GitHub-style progress bar
        StepIndicator.jsx      # Planner → Searcher → ... status
        AgentLog.jsx           # Collapsible bottom drawer with detail
      explore/
        ExploreView.jsx        # Main Explore layout
        ForceGraph.jsx         # react-force-graph-2d with custom nodes
        CompanySidebar.jsx     # Slide-in company card on click
        FilterChips.jsx        # Funding stage, sub-sector, year filters
      deep-dive/
        DeepDiveView.jsx       # Main Deep Dive layout
        SectionNav.jsx         # Left nav with section anchors
        ReportSection.jsx      # Reusable card with confidence badge + source count
        FundingChart.jsx       # Recharts area chart timeline
        NewsCard.jsx           # Sentiment-colored news cards
        CompetitorTable.jsx    # Comparison table
        RedFlagCard.jsx        # Amber/red warning cards
        SentimentBadge.jsx     # Positive/neutral/negative indicator
        ConfidenceBadge.jsx    # Green/yellow/red with source link
      history/
        HistoryGrid.jsx        # Landing page grid of past reports
        HistoryCard.jsx        # Individual report card with thumbnail
      shared/
        PDFExport.jsx          # Styled PDF generation
        SourcePopover.jsx      # Click-to-see raw source snippet
    hooks/
      useSSE.js                # SSE connection, auto-reconnect, timeout
      useAgentQuery.js         # Query state, loading, results
    lib/
      api.js                   # Backend URL config, API client
    App.jsx
  package.json
  .env.example
```

---

## Demo Data

5 pre-cached fixture sets so the app works offline without any API keys:

1. **Explore: "AI inference chips"** — ~15 companies (NVIDIA, AMD, Cerebras, Groq, etc.)
2. **Explore: "digital health SaaS"** — ~15 companies
3. **Deep Dive: "NVIDIA"** — full report with funding, people, news, competitors
4. **Deep Dive: "Mistral AI"** — full report
5. **Deep Dive: "Recursion Pharmaceuticals"** — full report

Fixtures include both raw API responses (for testing) and final assembled reports (for instant demo). App detects fixture matches and serves them without hitting any APIs.

---

## Deployment

- **Frontend → Vercel**: standard React deployment, env var for backend URL
- **Backend → Railway**: Python deployment, all env vars configured there
- Crawl4AI requires Playwright — Railway supports this with a custom Dockerfile or buildpack
- CORS configured in FastAPI for Vercel domain

---

## README Requirements

- Architecture diagram showing the LangGraph node flow
- Why LangGraph over CrewAI: state persistence, conditional edges, production readiness, typed state
- How to swap LLM providers (change one env var + config.py setting)
- How to run with fixtures only (no API keys needed)
- How to add new fixture data sets
- Credit usage estimates per query type
