# AISIGNALGRAPH v2 — Full Implementation Prompt for Fable

> **Agent Instructions:** You are implementing a complete system upgrade for AISIGNALGRAPH,
> a Flask/Three.js 3D knowledge graph of AI history deployed on Google Cloud Run.
> This prompt is your complete specification. Implement every module described below
> in full. Do not skip sections. Do not stub. Do not leave placeholders. Where behavior
> is unspecified, use the most secure and performant option available.
>
> **Repo:** https://github.com/DiggityDooo/AISIGNALGRAPH
> **Stack:** Python 3.11 / Flask / SQLite / Three.js / D3.js / WebGL GLSL / Google Cloud Run
> **Existing requirements.txt:** requests, requests-cache, beautifulsoup4, bleach, pymupdf,
> python-docx, markdownify, Markdown, python-frontmatter, pathlib, tqdm, loguru, tenacity,
> ollama, adroit, pandas, Flask

---

## Table of Contents

1. [Mission Statement](#1-mission-statement)
2. [Complete File Structure](#2-complete-file-structure)
3. [Database Schema v2](#3-database-schema-v2)
4. [Historical Seed Corpus (1956–2010)](#4-historical-seed-corpus-19562010)
5. [Security Subsystem](#5-security-subsystem)
6. [Scraper Pipeline](#6-scraper-pipeline)
7. [Extraction Engine](#7-extraction-engine)
8. [GitHub Actions Workflows](#8-github-actions-workflows)
9. [Flask Loader + API Routes](#9-flask-loader--api-routes)
10. [Graph Rendering Optimization](#10-graph-rendering-optimization)
11. [Frontend Architecture](#11-frontend-architecture)
12. [Requirements and Dependencies](#12-requirements-and-dependencies)
13. [Environment Variables](#13-environment-variables)
14. [Implementation Order](#14-implementation-order)

---

## 1. Mission Statement

Transform AISIGNALGRAPH from a static-document-fed knowledge graph into a
**self-growing, historically complete, security-hardened, GPU-optimized** system
covering all of AI history from 1956 to the present, updated automatically every day.

### Three Pillars

**Pillar 1 — Historical Completeness (1956–2026)**
The dataset must span the full arc of AI history: the Dartmouth Conference, early
symbolic AI, the two AI winters, the connectionist revolution, the deep learning era,
the transformer era, and the frontier model era. This requires both a curated static
seed corpus for pre-internet history and live scraping for modern content.

**Pillar 2 — Security-First Scraping**
The scraper must never retrieve content from untrusted, malicious, or suspicious
sources. Every URL, domain, and piece of content passes through a multi-layer
security pipeline before touching the extraction engine or the database.

**Pillar 3 — Graph Performance at Scale**
The knowledge graph will eventually contain thousands of nodes and tens of thousands
of edges spanning 70 years. The renderer must maintain 60fps on mid-range hardware
using frustum culling, WebGL instancing, LOD, worker-threaded layout, and adaptive
quality scaling.

---

## 2. Complete File Structure

Create every file and directory listed below. Files marked `[EXISTING - MODIFY]`
already exist in the repo and need the described changes. All others are new.

```
AISIGNALGRAPH/
│
├── app.py                              [EXISTING - no changes needed]
│
├── requirements.txt                    [EXISTING - MODIFY: add new deps]
│
├── .env.example                        [NEW]
│
├── data/
│   ├── ai_stories.json                 [NEW - empty array: []]
│   ├── ai_history_seed.json            [NEW - full historical seed, see §4]
│   ├── scrape_state.json               [NEW - scraper state/lock file]
│   └── ai_graph.db                     [EXISTING - schema will be migrated]
│
├── scraper/
│   ├── __init__.py                     [NEW - empty]
│   ├── daily_scrape.py                 [NEW - main orchestrator]
│   ├── sources.py                      [NEW - RSS + historical sources registry]
│   ├── historical_ingest.py            [NEW - one-time historical seed loader]
│   ├── extractor.py                    [NEW - Anthropic API extraction engine]
│   ├── dedup.py                        [NEW - deduplication engine]
│   └── security/
│       ├── __init__.py                 [NEW - empty]
│       ├── validator.py                [NEW - URL/domain/content validation]
│       ├── allowlist.py                [NEW - trusted domain registry]
│       ├── blocklist.py                [NEW - blocked domains/patterns]
│       ├── sanitizer.py                [NEW - HTML/text content sanitizer]
│       └── rate_limiter.py             [NEW - per-domain rate limiting]
│
├── webapp/
│   ├── __init__.py                     [EXISTING - MODIFY: call loader on startup]
│   ├── loader.py                       [NEW - JSON → DB ingestion]
│   ├── db.py                           [EXISTING - MODIFY: add migration runner]
│   ├── migrations/
│   │   ├── 001_add_source_url.sql      [NEW]
│   │   ├── 002_add_era_column.sql      [NEW]
│   │   ├── 003_add_importance_score.sql [NEW]
│   │   └── 004_add_fts.sql             [NEW - full text search]
│   ├── routes/
│   │   ├── graph.py                    [EXISTING - MODIFY: add graph API routes]
│   │   └── api.py                      [NEW - REST API for graph data]
│   └── static/
│       ├── js/
│       │   ├── graph/
│       │   │   ├── GraphEngine.js      [NEW - main graph controller]
│       │   │   ├── NodeRenderer.js     [NEW - WebGL instanced node rendering]
│       │   │   ├── EdgeRenderer.js     [NEW - line geometry edge rendering]
│       │   │   ├── LayoutWorker.js     [NEW - Web Worker: force simulation]
│       │   │   ├── SpatialIndex.js     [NEW - octree spatial index]
│       │   │   ├── LODManager.js       [NEW - level of detail controller]
│       │   │   ├── FrustumCuller.js    [NEW - frustum culling system]
│       │   │   └── LabelAtlas.js       [NEW - texture atlas for node labels]
│       │   └── graph.js                [EXISTING - MODIFY: wire to new modules]
│       └── css/
│           └── graph.css               [EXISTING - MODIFY: add era timeline styles]
│
├── .github/
│   └── workflows/
│       ├── daily_scrape.yml            [NEW - daily RSS scraper]
│       └── historical_seed.yml         [NEW - one-time historical seed action]
│
└── tests/
    ├── test_security.py                [NEW]
    ├── test_extractor.py               [NEW]
    ├── test_dedup.py                   [NEW]
    └── test_loader.py                  [NEW]
```

---

## 3. Database Schema v2

### `webapp/migrations/001_add_source_url.sql`
```sql
ALTER TABLE stories ADD COLUMN source_url TEXT;
ALTER TABLE stories ADD COLUMN source_name TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_stories_source_url
    ON stories(source_url) WHERE source_url IS NOT NULL;
```

### `webapp/migrations/002_add_era_column.sql`
```sql
-- era values: 'founding' | 'symbolic' | 'first_winter' | 'connectionist'
-- | 'second_winter' | 'statistical' | 'deep_learning' | 'transformer'
-- | 'frontier' | 'agentic'
ALTER TABLE stories ADD COLUMN era TEXT DEFAULT 'frontier';
ALTER TABLE stories ADD COLUMN year INTEGER;
UPDATE stories SET year = CAST(substr(date, 1, 4) AS INTEGER) WHERE date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stories_year ON stories(year);
CREATE INDEX IF NOT EXISTS idx_stories_era ON stories(era);
```

### `webapp/migrations/003_add_importance_score.sql`
```sql
-- importance_score: 0.0–1.0, used for LOD node sizing in the graph
ALTER TABLE stories ADD COLUMN importance_score REAL DEFAULT 0.5;
ALTER TABLE entities ADD COLUMN degree_centrality REAL DEFAULT 0.0;
ALTER TABLE entities ADD COLUMN first_seen_year INTEGER;
ALTER TABLE entities ADD COLUMN last_seen_year INTEGER;
-- Scrape metadata table: track when we last ran, lock against concurrent runs
CREATE TABLE IF NOT EXISTS scrape_meta (
    id INTEGER PRIMARY KEY,
    last_scrape_iso TEXT,
    last_scrape_ts INTEGER,
    stories_added INTEGER DEFAULT 0,
    scrape_duration_s REAL,
    status TEXT DEFAULT 'ok'
);
```

### `webapp/migrations/004_add_fts.sql`
```sql
-- SQLite FTS5 for full-text search across stories
CREATE VIRTUAL TABLE IF NOT EXISTS stories_fts USING fts5(
    title,
    summary,
    content=stories,
    content_rowid=id
);
-- Populate FTS index
INSERT INTO stories_fts(rowid, title, summary)
    SELECT id, title, summary FROM stories;
-- Trigger: keep FTS in sync on insert
CREATE TRIGGER IF NOT EXISTS stories_ai AFTER INSERT ON stories BEGIN
    INSERT INTO stories_fts(rowid, title, summary) VALUES (new.id, new.title, new.summary);
END;
```

### Migration Runner (add to `webapp/db.py`)

Add a `run_migrations(conn)` function that:
1. Creates a `schema_version` table if it does not exist
2. Reads all `.sql` files from `webapp/migrations/` sorted by filename
3. For each migration file not yet recorded in `schema_version`, executes it
4. Records the filename and timestamp in `schema_version` after success
5. Wraps each migration in a transaction; rolls back and logs on failure without
   crashing the app
6. Calls `run_migrations(conn)` inside `create_app()` before loading JSON data

---

## 4. Historical Seed Corpus (1956–2010)

### `data/ai_history_seed.json`

Create this file containing a JSON array of story objects. Each object follows the
exact same schema as `ai_stories.json`. Populate it with the following milestones
as a minimum — add more as needed for completeness. The `importance_score` field
controls how large the node renders in the 3D graph (0.0–1.0).

Every entry must include all required fields:
`id` (UUID v4), `title`, `summary`, `date` (YYYY-MM-DD or YYYY-01-01 for year-only),
`source_url` (use canonical Wikipedia or ACM URL), `source_name`, `entities`,
`keywords`, `relationships`, `era`, `importance_score`, `scraped_at`.

**Era classification:**
- `founding`: 1956–1969
- `symbolic`: 1966–1973
- `first_winter`: 1974–1979
- `connectionist`: 1980–1986
- `second_winter`: 1987–1993
- `statistical`: 1993–2005
- `deep_learning`: 2006–2016
- `transformer`: 2017–2022
- `frontier`: 2022–2024
- `agentic`: 2024–present

**Required seed entries (implement all of these):**

```
1956 — Dartmouth Summer Research Project on Artificial Intelligence
        entities: [McCarthy, Minsky, Shannon, Rochester, Dartmouth, "artificial intelligence"]
        importance_score: 1.0 | era: founding

1957 — Frank Rosenblatt invents the Perceptron
        entities: [Rosenblatt, Perceptron, Cornell, "pattern recognition"]
        importance_score: 0.9 | era: founding

1958 — John McCarthy develops LISP programming language
        entities: [McCarthy, LISP, MIT, "symbolic reasoning"]
        importance_score: 0.85 | era: founding

1965 — Gordon Moore publishes Moore's Law
        entities: [Moore, "Moore's Law", Intel, "semiconductor scaling"]
        importance_score: 0.7 | era: symbolic

1966 — MIT ELIZA chatbot demonstrated by Weizenbaum
        entities: [Weizenbaum, ELIZA, MIT, "natural language processing"]
        importance_score: 0.85 | era: symbolic

1969 — Minsky and Papert publish "Perceptrons" book, critiquing neural networks
        entities: [Minsky, Papert, "Perceptrons", MIT Press, "neural network critique"]
        importance_score: 0.8 | era: symbolic

1969 — Stanford Research Institute demonstrates Shakey the Robot
        entities: [SRI, Shakey, "robotics", "planning"]
        importance_score: 0.75 | era: symbolic

1972 — Prolog programming language created by Colmerauer
        entities: [Colmerauer, Prolog, "logic programming", "knowledge representation"]
        importance_score: 0.7 | era: symbolic

1974 — DARPA cuts AI funding, beginning first AI Winter
        entities: [DARPA, "AI Winter", "Lighthill Report", "funding cuts"]
        importance_score: 0.8 | era: first_winter

1980 — XCON expert system deployed at Digital Equipment Corporation
        entities: [DEC, XCON, "expert systems", "knowledge engineering", Feigenbaum]
        importance_score: 0.75 | era: connectionist

1982 — John Hopfield introduces Hopfield Networks
        entities: [Hopfield, "Hopfield Network", "associative memory", Caltech]
        importance_score: 0.8 | era: connectionist

1984 — The term "cyberspace" coined; Gibson publishes Neuromancer
        entities: [Gibson, cyberspace, Neuromancer, "sci-fi AI influence"]
        importance_score: 0.5 | era: connectionist

1986 — Rumelhart, Hinton, Williams publish backpropagation paper
        entities: [Rumelhart, Hinton, Williams, backpropagation, "PDP Group", Nature]
        importance_score: 0.95 | era: connectionist

1987 — Lisp machine market collapses; second AI winter begins
        entities: ["second AI winter", "Lisp machines", DARPA, "expert system collapse"]
        importance_score: 0.75 | era: second_winter

1989 — Yann LeCun demonstrates convolutional neural networks on digit recognition
        entities: [LeCun, "convolutional neural network", CNN, "LeNet", "digit recognition", Bell Labs]
        importance_score: 0.9 | era: connectionist

1993 — Vernor Vinge publishes "The Coming Technological Singularity"
        entities: [Vinge, Singularity, "technological singularity", "superintelligence"]
        importance_score: 0.7 | era: second_winter

1997 — IBM Deep Blue defeats Garry Kasparov in chess
        entities: [IBM, "Deep Blue", Kasparov, chess, "game AI", "combinatorial search"]
        importance_score: 1.0 | era: statistical

1998 — Yann LeCun publishes LeNet-5; convolutional networks applied to banking
        entities: [LeCun, LeNet-5, CNN, "check reading", banking]
        importance_score: 0.8 | era: statistical

2001 — Wikipedia launched, later becomes major NLP training corpus
        entities: [Wikipedia, "Jimmy Wales", "Larry Sanger", NLP, "training data"]
        importance_score: 0.6 | era: statistical

2002 — Roomba released; practical consumer robotics begins
        entities: [iRobot, Roomba, robotics, "autonomous navigation"]
        importance_score: 0.5 | era: statistical

2006 — Geoffrey Hinton coins "deep learning"; deep belief networks paper
        entities: [Hinton, "deep learning", "deep belief networks", "RBM", "pretraining", Toronto]
        importance_score: 1.0 | era: deep_learning

2007 — Fei-Fei Li begins building ImageNet dataset at Princeton
        entities: ["Fei-Fei Li", ImageNet, "computer vision", Princeton, "visual recognition"]
        importance_score: 0.9 | era: deep_learning

2009 — ImageNet dataset publicly released
        entities: [ImageNet, "Fei-Fei Li", Stanford, "computer vision benchmark"]
        importance_score: 0.9 | era: deep_learning

2010 — First ImageNet Large Scale Visual Recognition Challenge (ILSVRC)
        entities: [ILSVRC, ImageNet, "computer vision", benchmark]
        importance_score: 0.8 | era: deep_learning
```

In addition to these entries, implement a function in
`scraper/historical_ingest.py` that fetches additional historical entries
from the Wayback Machine CDX API for the date range 1990–2012, targeting
these domains:
- `mitpress.mit.edu`
- `cacm.acm.org`
- `spectrum.ieee.org`
- `wired.com`
- `nytimes.com` (AI section)

Use CDX API endpoint: `http://web.archive.org/cdx/search/cdx`
with parameters: `output=json`, `matchType=domain`, `filter=statuscode:200`,
`from=YYYYMMDD`, `to=YYYYMMDD`, `limit=50`, `fl=original,timestamp,statuscode`

For each URL returned, attempt to fetch via `https://web.archive.org/web/{timestamp}/{url}`.
Apply the full security pipeline from §5 before fetching. Throttle to
one request every 3 seconds to respect Wayback Machine rate limits.
Mark these stories with `source_name: "Wayback Machine Archive"`.

---

## 5. Security Subsystem

This is the most critical section. Every URL that the scraper touches
passes through this subsystem. A failed security check silently drops the
item and logs the reason — it never raises an exception that would halt
the scraper.

### `scraper/security/allowlist.py`

Define `ALLOWED_DOMAINS: set[str]` — a set of explicitly trusted domains.
Only URLs whose registered domain is in this set will be fetched.

Include at minimum:
```
openai.com, anthropic.com, deepmind.google, deepmind.com,
huggingface.co, arxiv.org, semanticscholar.org,
venturebeat.com, techcrunch.com, technologyreview.com,
wired.com, theverge.com, arstechnica.com, zdnet.com,
ieee.org, spectrum.ieee.org, acm.org, cacm.acm.org,
nature.com, science.org, cell.com,
blog.google, ai.googleblog.com, research.google,
microsoft.com, research.microsoft.com,
meta.ai, ai.facebook.com, ai.meta.com,
stability.ai, mistral.ai, cohere.com, inflection.ai,
together.ai, a16z.com, nber.org,
web.archive.org, archive.org,
wikipedia.org, wikimedia.org,
mit.edu, stanford.edu, cmu.edu, berkeley.edu,
ox.ac.uk, cambridge.ac.uk, toronto.edu,
turing.ac.uk, eleutherai.org,
nytimes.com, washingtonpost.com, reuters.com, apnews.com
```

Also define `ALLOWED_TLD_EXCEPTIONS: set[str]` — second-level TLDs that are
trustworthy regardless of domain (`.ac.uk`, `.edu.au`, `.gov.uk`).

Define `is_domain_allowed(url: str) -> bool` that:
1. Parses the URL with `urllib.parse.urlparse`
2. Extracts the registered domain using `tldextract`
3. Returns True only if `registered_domain` is in `ALLOWED_DOMAINS` or
   the TLD is in `ALLOWED_TLD_EXCEPTIONS`

### `scraper/security/blocklist.py`

Define `BLOCKED_PATTERNS: list[re.Pattern]` — compiled regex patterns.
Any URL matching any pattern is immediately rejected.

Patterns to include (compile all with `re.IGNORECASE`):
```python
# Malware/phishing keywords in URL path
r'/(malware|phish|exploit|payload|inject|xss|sqli|csrf)/'
# Suspicious TLDs commonly used for throwaway malicious domains
r'\.(tk|ml|ga|cf|gq|buzz|click|download|zip|cam|link|uno)$'
# IP address URLs (no legitimate news source uses a raw IP)
r'https?://\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}'
# URL shorteners (follow-through risk; ban entirely)
r'https?://(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|short\.io)'
# Crypto/NFT spam patterns often masquerading as AI news
r'/(nft|crypto|token|airdrop|mint|blockchain-ai-crypto)[\-_]'
# Pastebin and similar — no legitimate AI news sources
r'https?://(pastebin\.com|hastebin\.com|ghostbin\.com)'
# Data exfiltration via DNS in URL
r'[\w\-]{32,}\.(com|net|org)'  # suspiciously long subdomains
```

Also define a `BLOCKED_DOMAINS: set[str]` with domains that have been observed
to host misinformation, scraped AI content farms, or malicious redirects.
Start with an empty set — add to it as needed.

Define `is_url_blocked(url: str) -> bool` that returns True if any pattern
matches or the parsed domain is in `BLOCKED_DOMAINS`.

### `scraper/security/validator.py`

This is the main entry point. Implement `SecurityValidator` as a class.

```python
class SecurityValidator:
    def __init__(self, rate_limiter: RateLimiter):
        self.rate_limiter = rate_limiter

    def validate_url(self, url: str) -> tuple[bool, str]:
        """
        Returns (is_safe, reason).
        reason is empty string on success, human-readable on failure.
        """
        ...

    def validate_response(self, response: requests.Response) -> tuple[bool, str]:
        """
        Validate an HTTP response before reading its content.
        Checks: status code, Content-Type, Content-Length, redirect chain.
        """
        ...

    def validate_content(self, content: str, url: str) -> tuple[bool, str]:
        """
        Validate sanitized text content for malicious signals.
        """
        ...
```

`validate_url` must perform these checks in order, returning on first failure:
1. URL scheme must be `https` (reject `http`, `ftp`, `file`, `data`, `javascript`)
2. `is_url_blocked(url)` must return False
3. `is_domain_allowed(url)` must return True
4. URL length must not exceed 2048 characters
5. URL must not contain null bytes, unicode control characters, or CRLF injection
6. IDN homograph check: decode punycode hostname; if decoded hostname differs from
   ASCII hostname and decoded domain is not in ALLOWED_DOMAINS, reject
7. Rate limiter must allow the request for this domain

`validate_response` must check:
1. Status code must be 200 (reject 301 chains > 3 hops, reject all 4xx/5xx)
2. Content-Type must begin with `text/html`, `text/plain`, `application/rss+xml`,
   `application/atom+xml`, or `application/xml`
3. Content-Length header, if present, must not exceed 5,242,880 bytes (5MB)
4. Response must not set `X-Frame-Options: DENY` + suspicious `Set-Cookie` combo
   (common phishing indicator)

`validate_content` must check:
1. Decoded content length must not exceed 5MB
2. Content must not contain more than 3 `<script` tags (spam/malware signal)
3. Content must not contain common malicious JavaScript patterns:
   `eval(`, `document.write(`, `window.location =`, `atob(`, `fromCharCode(`
4. Must not contain excessive repetition (spam signal): no single word appearing
   > 50 times in 1000 characters
5. AI relevance signal: content must contain at least one word from a relevance
   vocabulary: `["AI", "artificial intelligence", "machine learning", "neural",
   "model", "LLM", "GPT", "transformer", "deep learning", "algorithm",
   "robotics", "computer vision", "NLP", "inference", "training", "dataset"]`
   (case-insensitive). If none present, return (False, "not AI-relevant").

### `scraper/security/sanitizer.py`

Implement `sanitize_html(raw_html: str) -> str` using `bleach`:

```python
import bleach

ALLOWED_TAGS = [
    "p", "br", "b", "i", "em", "strong", "a", "ul", "ol", "li",
    "h1", "h2", "h3", "h4", "h5", "blockquote", "pre", "code", "span"
]

ALLOWED_ATTRIBUTES = {
    "a": ["href", "title"],
    "span": ["class"],
    "code": ["class"],
}

def sanitize_html(raw_html: str) -> str:
    cleaned = bleach.clean(
        raw_html,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        strip=True,
        strip_comments=True,
    )
    # Additionally strip all event handler attributes that bleach might miss
    # Remove data: URIs in any remaining href/src attributes
    # Collapse excessive whitespace
    return cleaned.strip()
```

Also implement `html_to_plain_text(html: str) -> str` that:
1. Runs `sanitize_html` first
2. Uses BeautifulSoup to extract text with `separator=" ", strip=True`
3. Collapses consecutive whitespace/newlines to single spaces
4. Strips leading/trailing whitespace
5. Truncates to 4096 characters

### `scraper/security/rate_limiter.py`

Implement `RateLimiter` as a thread-safe class using a `threading.Lock`:

```python
class RateLimiter:
    DEFAULT_DELAY_S = 2.0     # minimum seconds between requests to same domain
    WAYBACK_DELAY_S = 3.0     # Wayback Machine gets extra courtesy
    RSS_DELAY_S = 1.0         # RSS endpoints are lighter

    def __init__(self):
        self._last_request: dict[str, float] = {}
        self._lock = threading.Lock()

    def wait_if_needed(self, domain: str, delay_override: float | None = None) -> None:
        """Block until the rate limit for this domain clears."""
        ...

    def record_request(self, domain: str) -> None:
        """Mark that a request was just made to this domain."""
        ...
```

`wait_if_needed` must:
1. Acquire the lock
2. Look up `domain` in `_last_request`
3. Compute elapsed time since last request
4. If elapsed < required delay, `time.sleep(delay - elapsed)`
5. Release the lock

---

## 6. Scraper Pipeline

### `scraper/sources.py`

Define two registries:

**`RSS_SOURCES: list[dict]`** — live RSS feeds (scraped daily):
```python
RSS_SOURCES = [
    {"name": "OpenAI Blog",          "rss": "https://openai.com/blog/rss.xml",                          "rate": "rss"},
    {"name": "Anthropic News",       "rss": "https://www.anthropic.com/rss.xml",                        "rate": "rss"},
    {"name": "HuggingFace Blog",     "rss": "https://huggingface.co/blog/feed.xml",                     "rate": "rss"},
    {"name": "Google DeepMind",      "rss": "https://deepmind.google/blog/rss.xml",                     "rate": "rss"},
    {"name": "Google AI Blog",       "rss": "https://blog.google/technology/ai/rss/",                   "rate": "rss"},
    {"name": "Microsoft AI Blog",    "rss": "https://blogs.microsoft.com/ai/feed/",                     "rate": "rss"},
    {"name": "Meta AI",              "rss": "https://ai.meta.com/blog/rss/",                            "rate": "rss"},
    {"name": "VentureBeat AI",       "rss": "https://venturebeat.com/category/ai/feed/",                "rate": "rss"},
    {"name": "MIT Tech Review AI",   "rss": "https://www.technologyreview.com/topic/artificial-intelligence/feed", "rate": "rss"},
    {"name": "Ars Technica AI",      "rss": "https://feeds.arstechnica.com/arstechnica/technology-lab", "rate": "rss"},
    {"name": "The Verge AI",         "rss": "https://www.theverge.com/ai-artificial-intelligence/rss/index.xml", "rate": "rss"},
    {"name": "Wired AI",             "rss": "https://www.wired.com/feed/tag/ai/latest/rss",             "rate": "rss"},
    {"name": "IEEE Spectrum AI",     "rss": "https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss", "rate": "rss"},
    {"name": "arXiv cs.AI",          "rss": "https://arxiv.org/rss/cs.AI",                              "rate": "rss"},
    {"name": "arXiv cs.LG",          "rss": "https://arxiv.org/rss/cs.LG",                              "rate": "rss"},
    {"name": "arXiv cs.CL",          "rss": "https://arxiv.org/rss/cs.CL",                              "rate": "rss"},
    {"name": "Semantic Scholar",     "rss": "https://www.semanticscholar.org/feeds/feed.xml",           "rate": "rss"},
    {"name": "Reuters Technology",   "rss": "https://feeds.reuters.com/reuters/technologyNews",         "rate": "rss"},
    {"name": "NYT Technology",       "rss": "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml", "rate": "rss"},
    {"name": "a16z AI",              "rss": "https://a16z.com/tag/ai/feed/",                            "rate": "rss"},
    {"name": "Stability AI Blog",    "rss": "https://stability.ai/news/rss",                            "rate": "rss"},
    {"name": "Mistral AI Blog",      "rss": "https://mistral.ai/rss/",                                  "rate": "rss"},
    {"name": "Cohere Blog",          "rss": "https://cohere.com/blog/rss",                              "rate": "rss"},
]
```

**`ERA_DATE_RANGES: dict`** — maps era name to (start_year, end_year):
```python
ERA_DATE_RANGES = {
    "founding":      (1956, 1969),
    "symbolic":      (1966, 1973),
    "first_winter":  (1974, 1979),
    "connectionist": (1980, 1986),
    "second_winter": (1987, 1993),
    "statistical":   (1993, 2005),
    "deep_learning": (2006, 2016),
    "transformer":   (2017, 2022),
    "frontier":      (2022, 2024),
    "agentic":       (2024, 2026),
}
```

Implement `classify_era(year: int) -> str` that returns the correct era for a
given year. When years overlap (e.g., 1993 is both `second_winter` and
`statistical`), prefer the later era.

### `scraper/dedup.py`

Implement `DedupEngine` class:

```python
class DedupEngine:
    def __init__(self, stories_file: Path):
        self._seen_urls: set[str] = set()
        self._seen_title_hashes: set[str] = set()
        self._load(stories_file)

    def _load(self, stories_file: Path) -> None:
        """Load existing URL set and title fingerprints from disk."""
        ...

    def _title_fingerprint(self, title: str) -> str:
        """
        Normalize title: lowercase, strip punctuation, collapse whitespace,
        then return SHA-256 hex digest of the first 60 characters.
        Used to catch near-duplicate titles from different sources.
        """
        ...

    def is_duplicate(self, url: str, title: str) -> bool:
        """Return True if this story has already been seen."""
        ...

    def register(self, url: str, title: str) -> None:
        """Mark a story as seen so future calls detect it as duplicate."""
        ...
```

`is_duplicate` checks both `url` (exact match) and `title_fingerprint` (fuzzy
match). Either match returns True.

### `scraper/daily_scrape.py`

This is the main orchestrator. Implement as a module with a `main()` function.

**Startup sequence:**
1. Acquire a file lock on `data/scrape_state.json` using `filelock.FileLock`
   to prevent concurrent runs
2. Load `scrape_state.json`; if `status == "running"` and
   `started_at` was less than 30 minutes ago, exit 0 with a log message
3. Write `{"status": "running", "started_at": "<ISO timestamp>"}` to
   `scrape_state.json`
4. Initialize `SecurityValidator`, `RateLimiter`, `DedupEngine`

**Main scrape loop:**
```python
for source in RSS_SOURCES:
    try:
        new_stories = scrape_rss_source(source, validator, rate_limiter, dedup)
        all_new.extend(new_stories)
    except Exception as e:
        log.error(f"Source {source['name']} failed entirely: {e}")
        continue  # never let one bad source crash the run
```

**`scrape_rss_source(source, validator, rate_limiter, dedup) -> list[dict]`:**
1. Validate the RSS URL itself via `validator.validate_url(source["rss"])`
2. Apply rate limiter for the RSS domain
3. Parse with `feedparser.parse(source["rss"])`; on `feedparser` exception, log and return `[]`
4. For each entry in `feed.entries[:MAX_ARTICLES_PER_SOURCE]` (max 5):
   a. Extract `url` and `title`; skip if either is empty
   b. Check `dedup.is_duplicate(url, title)`; skip if True
   c. Validate URL: `validator.validate_url(url)`; skip if fails
   d. Apply rate limiter for article domain
   e. Fetch article with `requests.get` using `SCRAPER_HEADERS`, 10s timeout,
      `verify=True`, `allow_redirects=True`, `max_redirects=3`
   f. Validate response: `validator.validate_response(response)`; skip if fails
   g. Get text: `html_to_plain_text(response.text)`
   h. Validate content: `validator.validate_content(text, url)`; skip if fails
   i. Call `extractor.extract_story(...)`; skip if returns None
   j. Build story dict; call `dedup.register(url, title)`
   k. Append to results

**Shutdown sequence:**
1. Load existing `ai_stories.json`
2. Append all new stories (deduplication already handled by DedupEngine)
3. Atomically write to `ai_stories.json` using a temp file + `os.replace()`
   (never write directly; partial writes corrupt the file)
4. Update `scrape_state.json` with `status: "ok"`, `last_scrape_iso`, counts
5. Release file lock
6. Print summary

**Constants:**
```python
MAX_ARTICLES_PER_SOURCE = 5
REQUEST_TIMEOUT = 10
MAX_RESPONSE_SIZE = 5_242_880  # 5MB
SCRAPER_HEADERS = {
    "User-Agent": (
        "AISIGNALGRAPH-Bot/2.0 "
        "(+https://github.com/DiggityDooo/AISIGNALGRAPH; "
        "AI knowledge graph research project)"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
    "Accept-Language": "en-US,en;q=0.5",
    "DNT": "1",
}
```

---

## 7. Extraction Engine

### `scraper/extractor.py`

Implement `StoryExtractor` class using the Anthropic API.

```python
class StoryExtractor:
    MODEL = "claude-haiku-4-5-20251001"
    MAX_TOKENS = 900
    TEXT_CHAR_LIMIT = 3000

    def __init__(self, api_key: str):
        self.client = anthropic.Anthropic(api_key=api_key)

    def extract_story(
        self,
        title: str,
        text: str,
        source_name: str,
        date: str,
        is_historical: bool = False,
    ) -> dict | None:
        ...

    def _build_prompt(self, title, text, source_name, date, is_historical) -> str:
        ...

    def _parse_response(self, raw: str) -> dict | None:
        ...
```

**`_build_prompt`** must produce a prompt that instructs the model to return
ONLY a JSON object with this schema:

```json
{
  "summary": "2-4 factual sentences. No fluff. No 'In this article'. Just facts.",
  "entities": [
    {"name": "exact proper name", "type": "lab|model|person|product|concept|policy|risk|dataset|hardware|event"}
  ],
  "keywords": ["3-8 lowercase topic tags"],
  "relationships": [
    {"source": "Entity A", "target": "Entity B", "relation": "past-tense verb phrase"}
  ],
  "importance_score": 0.1,
  "skip": false
}
```

Rules to embed in the prompt:
- `importance_score`: float 0.0–1.0. Use these guidelines: breakthrough papers/models
  get 0.85–1.0; major product releases 0.7–0.85; significant research 0.5–0.7;
  minor updates/commentary 0.1–0.5
- Historical entries (is_historical=True) should weight importance toward their
  outsized influence on the field
- `skip`: set to true if the article is not substantively about AI
- entities: only genuinely named proper nouns. Minimum 2, maximum 15
- relationships: must only pair entities that appear in the `entities` array
- Never include vague entities like "researchers" or "the company"
- Return `{"skip": true}` for non-AI content

**`_parse_response`** must:
1. Strip markdown code fences if present (`````json ... `````)
2. Attempt `json.loads(raw.strip())`
3. On `JSONDecodeError`, attempt to extract the first `{...}` block via regex
4. Validate that the result has at minimum `summary`, `entities`, `keywords`
5. If `skip == true`, return `None`
6. Clamp `importance_score` to `[0.0, 1.0]`
7. Return the validated dict, or `None` on any unrecoverable error

**Retry logic:** wrap the API call with `tenacity.retry`:
- `wait=tenacity.wait_exponential(multiplier=1, min=2, max=30)`
- `stop=tenacity.stop_after_attempt(3)`
- `retry=tenacity.retry_if_exception_type(anthropic.RateLimitError)`

---

## 8. GitHub Actions Workflows

### `.github/workflows/daily_scrape.yml`

```yaml
name: Daily AI Scrape

on:
  schedule:
    - cron: "0 2 * * *"      # 2:00 AM UTC every day
  workflow_dispatch:           # allow manual trigger
    inputs:
      dry_run:
        description: "Dry run (scrape but do not commit)"
        required: false
        default: "false"
        type: boolean

concurrency:
  group: daily-scrape
  cancel-in-progress: false    # do NOT cancel in-progress runs

jobs:
  scrape:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    permissions:
      contents: write           # needed to commit back to main

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Set up Python 3.11
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: "pip"

      - name: Install scraper dependencies
        run: |
          pip install --upgrade pip
          pip install \
            feedparser \
            requests \
            beautifulsoup4 \
            bleach \
            anthropic \
            tenacity \
            tldextract \
            filelock \
            loguru

      - name: Run daily scraper
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          python -m scraper.daily_scrape

      - name: Commit updated dataset
        if: ${{ inputs.dry_run != 'true' }}
        run: |
          git config user.name  "aisignalgraph-bot[bot]"
          git config user.email "aisignalgraph-bot@users.noreply.github.com"
          git add data/ai_stories.json data/scrape_state.json
          if git diff --staged --quiet; then
            echo "No new stories — nothing to commit."
          else
            STORY_COUNT=$(python -c "import json,sys; d=json.load(open('data/ai_stories.json')); print(len(d))")
            git commit -m "data: daily scrape $(date -u +%Y-%m-%d) [${STORY_COUNT} total stories]"
            git push
          fi

      - name: Upload scrape log as artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: scrape-log-${{ github.run_id }}
          path: data/scrape_state.json
          retention-days: 30
```

### `.github/workflows/historical_seed.yml`

```yaml
name: Historical Seed Ingest (One-Time)

on:
  workflow_dispatch:    # MANUAL ONLY — run once to bootstrap historical data
    inputs:
      year_from:
        description: "Start year (e.g. 1990)"
        required: true
        default: "1990"
      year_to:
        description: "End year (e.g. 2012)"
        required: true
        default: "2012"

jobs:
  seed:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install dependencies
        run: |
          pip install requests beautifulsoup4 bleach anthropic tenacity tldextract loguru feedparser

      - name: Run historical ingest
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          SEED_YEAR_FROM: ${{ inputs.year_from }}
          SEED_YEAR_TO:   ${{ inputs.year_to }}
        run: |
          python -m scraper.historical_ingest

      - name: Commit seed data
        run: |
          git config user.name  "aisignalgraph-bot[bot]"
          git config user.email "aisignalgraph-bot@users.noreply.github.com"
          git add data/ai_stories.json
          git diff --staged --quiet || git commit -m "data: historical seed ${{ inputs.year_from }}-${{ inputs.year_to }}"
          git push
```

---

## 9. Flask Loader + API Routes

### `webapp/loader.py`

Implement `DataLoader` class with two methods:

**`load_seed(conn: sqlite3.Connection) -> int`**
Loads `data/ai_history_seed.json` into the DB on first run (checks for
a `seed_loaded` flag in `scrape_meta`). This is idempotent.

**`load_stories(conn: sqlite3.Connection) -> int`**
Loads all entries from `data/ai_stories.json` that are not yet in the DB
(deduplicates by `source_url`). Returns count inserted.

Both methods must handle:
- File not found (log, return 0)
- JSON parse error (log, return 0)
- All DB inserts in a single transaction; rollback on any error
- Schema additions (via migration runner, not here)
- `importance_score` and `era` columns populated from JSON fields

### `webapp/routes/api.py`

Create a Flask Blueprint `api_bp` with these routes:

**`GET /api/graph`**
Returns the full graph as JSON for the frontend renderer.
Response schema:
```json
{
  "nodes": [
    {
      "id": "entity_name",
      "type": "lab|model|person|...",
      "degree": 42,
      "importance": 0.8,
      "first_year": 2020,
      "last_year": 2026,
      "era": "frontier"
    }
  ],
  "edges": [
    {
      "source": "OpenAI",
      "target": "GPT-4",
      "relation": "developed",
      "weight": 3,
      "year": 2023
    }
  ],
  "meta": {
    "total_stories": 1240,
    "total_nodes": 380,
    "total_edges": 2100,
    "year_range": [1956, 2026],
    "last_updated": "2026-06-09T02:00:00Z"
  }
}
```

Compute `weight` for edges as the count of stories that contain this
source→target relationship. Higher weight = thicker edge in the renderer.

**`GET /api/graph/era/<era_name>`**
Same schema as `/api/graph` but filtered to stories in the given era.

**`GET /api/graph/year-range?from=<year>&to=<year>`**
Filter graph to a year range.

**`GET /api/stories/search?q=<query>&limit=20&offset=0`**
Full-text search using the FTS5 table. Returns:
```json
{
  "results": [
    {"id": 1, "title": "...", "summary": "...", "date": "...", "source_name": "...", "era": "...", "importance_score": 0.7}
  ],
  "total": 45,
  "query": "transformer attention"
}
```

**`GET /api/stories/<int:story_id>`**
Returns full story detail with its entities and relationships.

**`GET /api/stats`**
Returns dataset statistics:
```json
{
  "total_stories": 1240,
  "stories_by_era": {"founding": 8, "deep_learning": 234, ...},
  "stories_by_year": {"1956": 1, "1957": 2, ...},
  "top_entities": [{"name": "OpenAI", "degree": 312}, ...],
  "last_scrape": "2026-06-09T02:00:00Z",
  "scrape_status": "ok"
}
```

All API routes must:
- Return JSON with correct `Content-Type: application/json`
- Include `Cache-Control: public, max-age=3600` (graph data is rebuilt hourly at most)
- Return proper HTTP error codes with JSON error bodies
- Never expose stack traces in production (`app.config["DEBUG"] == False`)

Register `api_bp` in the Flask app factory with prefix `/api`.

---

## 10. Graph Rendering Optimization

This section describes the complete rewrite of the graph rendering subsystem.
The existing graph renderer must be replaced by the new modular system below.
The goal is stable 60fps with 5,000+ nodes and 20,000+ edges.

### Architecture Overview

```
GraphEngine.js  (main controller — owns the Three.js scene)
    ├── NodeRenderer.js    (InstancedMesh for all nodes)
    ├── EdgeRenderer.js    (LineSegments for all edges)
    ├── LabelAtlas.js      (texture atlas; one draw call for all labels)
    ├── LODManager.js      (switches node detail level by distance)
    ├── FrustumCuller.js   (marks nodes outside camera frustum)
    ├── SpatialIndex.js    (octree; accelerates raycasting/culling)
    └── LayoutWorker.js    (Web Worker — D3 force sim off main thread)
```

### `webapp/static/js/graph/LayoutWorker.js`

This file runs inside a Web Worker. It must never import Three.js (no DOM access
in workers). Import D3 force via a CDN-compatible ESM import or pass the force
data via messages.

**Messages it receives from main thread:**
- `{type: "init", nodes: [...], edges: [...], config: {...}}` — start simulation
- `{type: "pin", nodeId: string, x: number, y: number, z: number}` — pin a node
- `{type: "unpin", nodeId: string}` — unpin a node
- `{type: "reheat"}` — restart simulation (alpha = 0.3)
- `{type: "stop"}` — halt simulation

**Messages it sends to main thread:**
- `{type: "tick", positions: Float32Array}` — packed (x,y,z) for each node, in node index order, sent every 3 ticks
- `{type: "stable"}` — simulation has cooled (alpha < 0.001)

**Simulation config:**
- Use D3 force with `forceSimulation`, `forceManyBody`, `forceLink`, `forceCenter`
- `forceManyBody().strength(-120)` — repulsion
- `forceLink().distance(d => 80 / Math.max(d.weight, 1))` — shorter for high-weight edges
- For 3D: extend positions with a Z axis by alternating sign on tick
- Importance score influences node mass: `node.mass = 1 + node.importance * 4`
- Throttle message posting to every 3 ticks using a counter

**Layout caching:**
After `{type: "stable"}` fires, serialize all positions to a JSON object keyed
by node ID. Post `{type: "cache", positions: {...}}` to main thread so it can
store in IndexedDB and restore on next page load, avoiding cold-start layout
computation.

### `webapp/static/js/graph/SpatialIndex.js`

Implement an Octree for 3D spatial queries.

```javascript
class OctreeNode {
    constructor(center, halfSize, depth = 0, maxDepth = 8, maxItems = 8) { }
    insert(item) { }        // item: {id, x, y, z}
    query(frustum) { }      // returns items inside THREE.Frustum
    queryRadius(center, radius) { } // returns items within sphere
    clear() { }
}

export class SpatialIndex {
    constructor(worldSize = 2000) {
        this.root = new OctreeNode({x:0, y:0, z:0}, worldSize/2);
    }
    rebuild(nodes) { }              // call after layout stabilizes
    getVisible(frustum) { }         // returns Set<nodeId>
    getNear(worldPos, radius) { }   // for hover detection
}
```

`getVisible` must return a `Set<string>` of node IDs that are inside the frustum.
The `FrustumCuller` calls this every frame.

### `webapp/static/js/graph/FrustumCuller.js`

```javascript
export class FrustumCuller {
    constructor(camera, spatialIndex) { }

    // Call once per frame, BEFORE rendering
    update() {
        // 1. Update THREE.Frustum from camera
        // 2. Query spatialIndex.getVisible(frustum)
        // 3. Store result as this.visibleSet
    }

    isVisible(nodeId) {
        return this.visibleSet.has(nodeId);
    }

    // Returns count of visible nodes (for debug HUD)
    get visibleCount() { }
}
```

### `webapp/static/js/graph/NodeRenderer.js`

Use `THREE.InstancedMesh` for all nodes. Never create individual `THREE.Mesh`
objects per node.

```javascript
export class NodeRenderer {
    constructor(scene, maxNodes = 10000) {
        // Create one InstancedMesh per node type (lab, model, person, etc.)
        // Each type uses a shared geometry and material
        this._meshes = {};  // type -> THREE.InstancedMesh
        this._nodeIndexMap = new Map();  // nodeId -> {type, instanceIndex}
    }

    // Node type → geometry + material specs:
    // lab:      SphereGeometry(6, 8, 8)    color #4f8ef7   emissive #1a3d7a
    // model:    SphereGeometry(5, 8, 8)    color #a855f7   emissive #4a1a6a
    // person:   SphereGeometry(4, 6, 6)    color #22c55e   emissive #0f4a1f
    // product:  BoxGeometry(8, 8, 8)        color #f59e0b   emissive #7a4a00
    // concept:  OctahedronGeometry(5)       color #64748b   emissive #2a3040
    // policy:   CylinderGeometry(4,4,8,6)  color #ef4444   emissive #6a0a0a
    // dataset:  TetrahedronGeometry(5)      color #06b6d4   emissive #023a47
    // default:  SphereGeometry(4, 6, 6)    color #94a3b8   emissive #3a4050

    init(nodes) { }         // bulk initialize all instances
    updatePosition(nodeId, x, y, z) { }  // called from layout worker messages
    setScale(nodeId, scale) { }          // LOD scales down distant nodes
    setVisibility(nodeId, visible) { }   // frustum culling toggle
    highlight(nodeId) { }               // selected node visual state
    unhighlightAll() { }
    dispose() { }
}
```

**Critical implementation notes:**
- Use `THREE.InstancedMesh` with `count` equal to the number of nodes of each type
- Call `instancedMesh.instanceMatrix.needsUpdate = true` only once per frame
  after all position updates, not per-update
- Use `THREE.Matrix4` from a pool (pre-allocate 50 matrices) to avoid GC pressure
- Node scale encodes importance: `baseScale * (0.5 + node.importance * 1.5)`
- Enable `instancedMesh.frustumCulled = false` — you handle culling manually
  via `setVisibility`, which sets the instance's scale to 0 rather than removing it

### `webapp/static/js/graph/EdgeRenderer.js`

Use `THREE.LineSegments` with a single `THREE.BufferGeometry`.

```javascript
export class EdgeRenderer {
    constructor(scene, maxEdges = 50000) {
        // Pre-allocate position buffer: maxEdges * 2 vertices * 3 components
        this._positions = new Float32Array(maxEdges * 6);
        this._colors    = new Float32Array(maxEdges * 6);
        this._geometry  = new THREE.BufferGeometry();
        this._material  = new THREE.LineBasicMaterial({ vertexColors: true });
        this._line      = new THREE.LineSegments(this._geometry, this._material);
    }

    init(edges, nodePositions) { }
    updatePositions(nodePositions) { }   // update all edge endpoints at once
    setEdgeColor(edgeIndex, color) { }
    setVisibleCount(count) { }           // trim draw range
    dispose() { }
}
```

**Edge coloring by weight:**
```
weight 1:     opacity 0.15,  color #475569
weight 2-5:   opacity 0.30,  color #64748b
weight 6-20:  opacity 0.50,  color #94a3b8
weight 21+:   opacity 0.80,  color #cbd5e1
```

Use `THREE.BufferGeometry.setDrawRange(0, visibleEdgeCount * 2)` to cull
edges to off-screen nodes without modifying the buffer.

Edge visibility: if both endpoint nodes are culled by `FrustumCuller`,
exclude the edge from the draw range.

### `webapp/static/js/graph/LODManager.js`

```javascript
export class LODManager {
    constructor(camera, nodeRenderer) {
        this.camera = camera;
        this.nodeRenderer = nodeRenderer;
        // Thresholds: distance from camera → scale multiplier
        this.LOD_LEVELS = [
            { maxDist: 300,  scale: 1.0 },
            { maxDist: 600,  scale: 0.7 },
            { maxDist: 1000, scale: 0.4 },
            { maxDist: 1500, scale: 0.2 },
            { maxDist: Infinity, scale: 0.0 },  // 0 = invisible
        ];
    }

    // Call once per frame. nodePositions: Map<nodeId, THREE.Vector3>
    update(nodePositions, visibleSet) { }
}
```

`update` must:
1. Iterate only over `visibleSet` (already frustum-culled)
2. Compute distance from `camera.position` to node position
3. Find the appropriate LOD level
4. Call `nodeRenderer.setScale(nodeId, baseScale * level.scale)`
5. For very distant nodes (scale 0.0), also call `nodeRenderer.setVisibility(nodeId, false)`

### `webapp/static/js/graph/LabelAtlas.js`

Labels are rendered via a single `THREE.Sprite` with a canvas-based texture atlas,
not one canvas per node.

```javascript
export class LabelAtlas {
    constructor(scene) {
        this._canvas = document.createElement('canvas');
        this._canvas.width = 4096;
        this._canvas.height = 4096;
        this._ctx = this._canvas.getContext('2d');
        this._sprites = new Map();  // nodeId -> THREE.Sprite
        this._regions = [];          // packed glyph regions
    }

    // Build the atlas for a set of node labels
    build(nodes) { }

    // Show/hide label for a node
    setVisible(nodeId, visible) { }

    // Call each frame: make labels face camera and scale to constant screen size
    update(camera) { }

    // Only show labels for nodes that are close enough + important enough
    updateVisibility(nodePositions, camera, minImportance = 0.6, maxDist = 400) { }
}
```

Label rendering rules:
- Show labels only when camera distance to node < 400 units AND node importance > 0.6
- Font: `"13px 'Inter', 'Segoe UI', sans-serif"` on the canvas context
- Node type determines label color: same palette as node geometry colors
- All sprites use `depthWrite: false, transparent: true` material

### `webapp/static/js/graph/GraphEngine.js`

The main controller. Wires everything together.

```javascript
export class GraphEngine {
    constructor(container) {
        // THREE.js setup
        this._renderer  = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this._scene     = new THREE.Scene();
        this._camera    = new THREE.PerspectiveCamera(60, aspect, 1, 10000);
        this._controls  = new THREE.OrbitControls(this._camera, this._renderer.domElement);

        // Subsystems
        this._nodeRenderer = new NodeRenderer(this._scene);
        this._edgeRenderer = new EdgeRenderer(this._scene);
        this._labelAtlas   = new LabelAtlas(this._scene);
        this._spatialIndex = new SpatialIndex();
        this._frustumCuller = new FrustumCuller(this._camera, this._spatialIndex);
        this._lodManager   = new LODManager(this._camera, this._nodeRenderer);
        this._worker       = null;   // LayoutWorker

        this._nodePositions = new Map();  // nodeId -> THREE.Vector3
        this._frameCount    = 0;
        this._fps           = 60;
        this._adaptiveQuality = 1.0;  // scales down on slow frames

        this._raycaster = new THREE.Raycaster();
        this._hoveredNode = null;
        this._selectedNode = null;
    }

    async init(graphData) {
        // 1. Initialize subsystems with graph data
        // 2. Start layout worker
        // 3. Restore cached positions from IndexedDB if available
        // 4. Start render loop
        // 5. Register event listeners (resize, click, hover)
    }

    _startLayoutWorker(nodes, edges) { }
    _onWorkerMessage(event) { }        // handle tick, stable, cache messages
    _onWindowResize() { }
    _onMouseMove(event) { }            // raycast hover detection
    _onMouseClick(event) { }           // node selection
    _renderLoop() { }
    _adaptQuality() { }               // reduce pixel ratio if FPS < 30
    focusNode(nodeId) { }             // animate camera to node
    filterByEra(era) { }              // fade out nodes not in era
    filterByYear(from, to) { }
    resetFilter() { }
    dispose() { }
}
```

**`_renderLoop` implementation:**
```javascript
_renderLoop() {
    requestAnimationFrame(() => this._renderLoop());

    this._frameCount++;
    const now = performance.now();

    // FPS measurement (every 60 frames)
    if (this._frameCount % 60 === 0) {
        this._fps = 60000 / (now - this._fpsTimer);
        this._fpsTimer = now;
        this._adaptQuality();
    }

    // Update controls
    this._controls.update();

    // Culling + LOD (every 3 frames to reduce CPU cost)
    if (this._frameCount % 3 === 0) {
        this._frustumCuller.update();
        const visible = this._frustumCuller.visibleSet;
        this._lodManager.update(this._nodePositions, visible);
        this._labelAtlas.updateVisibility(this._nodePositions, this._camera);
    }

    // Label billboard update (every frame)
    this._labelAtlas.update(this._camera);

    // Render
    this._renderer.render(this._scene, this._camera);
}
```

**`_adaptQuality`:**
```javascript
_adaptQuality() {
    if (this._fps < 25 && this._adaptiveQuality > 0.5) {
        this._adaptiveQuality = Math.max(0.5, this._adaptiveQuality - 0.1);
        this._renderer.setPixelRatio(window.devicePixelRatio * this._adaptiveQuality);
    } else if (this._fps > 55 && this._adaptiveQuality < 1.0) {
        this._adaptiveQuality = Math.min(1.0, this._adaptiveQuality + 0.05);
        this._renderer.setPixelRatio(window.devicePixelRatio * this._adaptiveQuality);
    }
}
```

**`focusNode` animation:**
Use `TWEEN.js` (or a simple lerp) to animate `camera.position` and
`controls.target` toward the selected node over 800ms with an ease-in-out curve.

**Layout position cache (IndexedDB):**
```javascript
async _saveCachedLayout(positions) {
    const db = await this._openIDB();
    const tx = db.transaction('layouts', 'readwrite');
    tx.objectStore('layouts').put({ id: 'latest', positions, ts: Date.now() });
}

async _loadCachedLayout() {
    const db = await this._openIDB();
    const record = await db.transaction('layouts').objectStore('layouts').get('latest');
    // Only use cache if it is less than 24 hours old
    if (record && (Date.now() - record.ts) < 86_400_000) return record.positions;
    return null;
}
```

**Debug HUD (toggled with `D` key):**
Render an overlay `<div>` with:
- FPS counter (updated every second)
- Visible node count / total node count
- Visible edge count / total edge count
- Layout status (computing / stable)
- Adaptive quality level

---

## 11. Frontend Architecture

### Era Timeline Control

Add a horizontal timeline scrubber to the graph UI that spans 1956–2026.
- Implemented as a custom HTML range input with era bands as colored background zones
- Each era zone is colored distinctly (use the palette from the entity type colors
  as reference, shifting hue per era)
- When dragged, calls `graphEngine.filterByYear(from, to)` via a debounced handler
- Clicking an era label snaps the range to that era's full span

### Era Band Color Palette

```
founding:      #1e3a5f  (deep navy)
symbolic:      #1a4a2e  (deep forest)
first_winter:  #3a1a1a  (dark maroon)
connectionist: #2a1a4a  (deep purple)
second_winter: #3a2a1a  (dark amber)
statistical:   #1a2a4a  (steel blue)
deep_learning: #1a3a3a  (teal)
transformer:   #2a1a4a  (indigo)
frontier:      #1a1a4a  (electric blue)
agentic:       #0a2a1a  (neon green dark)
```

### Performance HUD Styles

Add to `webapp/static/css/graph.css`:

```css
#perf-hud {
    position: fixed;
    top: 12px;
    right: 12px;
    background: rgba(0, 0, 0, 0.75);
    color: #00ff88;
    font-family: 'JetBrains Mono', 'Fira Mono', monospace;
    font-size: 11px;
    padding: 8px 12px;
    border: 1px solid rgba(0, 255, 136, 0.3);
    border-radius: 4px;
    pointer-events: none;
    z-index: 1000;
    display: none;   /* shown only when D key is pressed */
    line-height: 1.8;
}
```

---

## 12. Requirements and Dependencies

### `requirements.txt` (complete updated version)

```
# Web framework
Flask
Werkzeug

# HTTP + feeds
requests
requests-cache
feedparser

# HTML processing
beautifulsoup4
bleach
markdownify
Markdown
lxml

# Document processing
pymupdf
python-docx
python-frontmatter

# Data processing
pandas
tqdm
pathlib

# Domain validation
tldextract

# File locking (prevent concurrent scraper runs)
filelock

# Logging
loguru

# Retry logic
tenacity

# AI APIs
anthropic
ollama

# Utilities
adroit
```

### `package.json` additions (if using npm for frontend)

Add to devDependencies:
```json
{
  "tween.js": "^23.1.3"
}
```

TWEEN.js CDN fallback: `https://cdnjs.cloudflare.com/ajax/libs/tween.js/23.1.3/tween.umd.js`

---

## 13. Environment Variables

### `.env.example`

```bash
# Required: Anthropic API key for story extraction
ANTHROPIC_API_KEY=sk-ant-...

# Required: Flask secret key (generate with: python -c "import secrets; print(secrets.token_hex(32))")
FLASK_SECRET_KEY=your-secret-key-here

# Optional: Path to master doc (legacy; kept for backward compat)
AI_MASTER_DOC_PATH=/absolute/path/to/AI_Master_Document_2020_2026.md

# Optional: override stories file path
AI_STORIES_PATH=data/ai_stories.json

# Optional: override seed file path
AI_SEED_PATH=data/ai_history_seed.json

# Development only
FLASK_ENV=development
FLASK_DEBUG=0
```

---

## 14. Implementation Order

Implement in exactly this order to avoid import errors and broken states:

```
Phase 1 — Foundation
1.  data/ai_stories.json                  (empty array)
2.  scraper/security/allowlist.py
3.  scraper/security/blocklist.py
4.  scraper/security/rate_limiter.py
5.  scraper/security/sanitizer.py
6.  scraper/security/validator.py         (depends on 2,3,4)
7.  scraper/dedup.py
8.  scraper/extractor.py

Phase 2 — Data Pipeline
9.  data/ai_history_seed.json             (full historical seed entries)
10. scraper/sources.py
11. scraper/historical_ingest.py          (Wayback Machine + seed loader)
12. scraper/daily_scrape.py               (depends on all of Phase 1 + 2)

Phase 3 — Database + Flask
13. webapp/migrations/ (all 4 SQL files)
14. webapp/db.py                          (MODIFY: add migration runner)
15. webapp/loader.py
16. webapp/routes/api.py
17. webapp/__init__.py                    (MODIFY: wire loader + api_bp)

Phase 4 — GitHub Actions
18. .github/workflows/daily_scrape.yml
19. .github/workflows/historical_seed.yml

Phase 5 — Graph Rendering
20. webapp/static/js/graph/LayoutWorker.js
21. webapp/static/js/graph/SpatialIndex.js
22. webapp/static/js/graph/FrustumCuller.js
23. webapp/static/js/graph/NodeRenderer.js
24. webapp/static/js/graph/EdgeRenderer.js
25. webapp/static/js/graph/LODManager.js
26. webapp/static/js/graph/LabelAtlas.js
27. webapp/static/js/graph/GraphEngine.js
28. webapp/static/js/graph.js             (MODIFY: replace with new wiring)
29. webapp/static/css/graph.css           (MODIFY: add era + HUD styles)

Phase 6 — Tests + Cleanup
30. tests/test_security.py
31. tests/test_extractor.py
32. tests/test_dedup.py
33. tests/test_loader.py
34. requirements.txt                      (MODIFY: add new deps)
35. .env.example
```

---

## Appendix A — Key Invariants (Never Violate)

1. **The scraper never runs if `scrape_state.json` shows status `running`
   and started within the last 30 minutes.** This prevents GitHub Actions
   reruns from creating duplicate data.

2. **`ai_stories.json` is written atomically.** Always write to a temp file,
   then `os.replace()`. Never write directly to the live file mid-scrape.

3. **Every URL passes the full security pipeline before a request is made.**
   No exceptions for "trusted" sources — the allowlist handles trust; the
   validator enforces it.

4. **The graph renderer never modifies `instancedMesh.count` after init.**
   Visibility is handled by scaling instances to 0. Changing `count` forces
   a full GPU buffer reload.

5. **The layout worker never accesses the DOM.** It receives graph data as
   plain objects via `postMessage` and returns positions via `postMessage`.
   All Three.js is in the main thread.

6. **`bleach.clean` is called before any HTML content reaches the database.**
   Raw HTML is never stored.

7. **Importance scores from the extractor are always clamped to [0.0, 1.0]**
   before storage. Node scale math assumes this range.

---

## Appendix B — Testing Requirements

Each test file must cover at minimum:

**`test_security.py`:**
- `test_allowlist_accepts_trusted_domain`
- `test_blocklist_rejects_url_shortener`
- `test_blocklist_rejects_raw_ip`
- `test_validator_rejects_http_scheme`
- `test_validator_rejects_javascript_scheme`
- `test_validator_rejects_blocked_domain`
- `test_validator_accepts_valid_url`
- `test_content_validation_rejects_no_ai_keywords`
- `test_content_validation_rejects_eval_js`
- `test_sanitizer_strips_script_tags`
- `test_sanitizer_strips_event_handlers`
- `test_rate_limiter_delays_rapid_requests`

**`test_extractor.py`:**
- `test_extract_returns_none_for_non_ai_content`
- `test_extract_returns_correct_schema`
- `test_importance_score_clamped_to_unit_range`
- `test_parse_strips_markdown_fences`
- `test_retry_on_rate_limit_error`

**`test_dedup.py`:**
- `test_exact_url_duplicate_detected`
- `test_title_fingerprint_catches_near_duplicate`
- `test_register_then_detect`
- `test_empty_file_returns_no_duplicates`

**`test_loader.py`:**
- `test_load_stories_inserts_new_entries`
- `test_load_stories_skips_duplicates`
- `test_load_seed_is_idempotent`
- `test_load_handles_missing_file`
- `test_load_handles_malformed_json`
