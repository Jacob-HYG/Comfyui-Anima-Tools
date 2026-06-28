# Image Cache System — Implementation Guide

## Overview

The Anima Tools image cache system provides on-disk persistent caching for character,
artist, clothing, and background selector preview images. It is designed around a
**two-mode** toggle that the user controls from the selector UI:

| Mode | Behavior | Use case |
|------|----------|----------|
| **Cache ON** | Read-only local disk cache. If image not cached → show placeholder immediately. No CDN requests. | Offline use, slow networks, repeat browsing |
| **Cache OFF** | CDN direct fetch + background pre-cache. Every successfully loaded image is silently cached to disk for future sessions. | First-time browsing, fresh data |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser (JS)                       │
│                                                       │
│  Cache ON: img.src = /anima-tools/cached-image        │
│                       ?readonly=1&_cb=N&url=CDN_URL   │
│                                                       │
│  Cache OFF: img.src = CDN_URL                         │
│             onload → POST /anima-tools/cache-image-async│
└──────────────────┬────────────────────────────────────┘
                   │ HTTP
┌──────────────────▼────────────────────────────────────┐
│              Backend (Python/aiohttp)                   │
│                                                         │
│  GET /anima-tools/cached-image                          │
│    ├─ readonly=0 (default): HIT→file, MISS→download     │
│    └─ readonly=1:           HIT→file, MISS→404(no-store)│
│                                                         │
│  POST /anima-tools/cache-image-async                    │
│    └─ Fire-and-forget CDN download + disk write         │
└──────────────────┬────────────────────────────────────┘
                   │ Disk I/O
┌──────────────────▼────────────────────────────────────┐
│                 Disk Cache (temp/)                     │
│                                                         │
│  custom_nodes/Comfyui-Anima-Tools/temp/                 │
│    ├── anima_character_selector/   (MD5-hashed files)   │
│    ├── anima_artist_selector/                           │
│    ├── anima_clothing_selector/                         │
│    └── anima_background_selector/                       │
└─────────────────────────────────────────────────────────┘
```

---

## Key Components

### 1. `anima_cache.py` — Core cache engine

`ImageCache` class provides per-namespace disk caching:

- **`fetch_and_cache(url, session)`** — Downloads image from CDN and atomically writes to disk (`.tmp` → `os.replace`). Supports optional shared `aiohttp.ClientSession` for connection reuse. Internal retry: 3 attempts with exponential backoff.
- **`has(url)` / `get_path(url)`** — Check and retrieve cached files.
- **`clear()`** — Purge all files in a namespace.
- **`stats()`** — Return file count and total size.
- **Domain whitelist** (`DEFAULT_ALLOWED_DOMAINS`) — SSRF protection; only known CDN domains are allowed.

### 2. `nodes.py` — Backend API routes

**`GET /anima-tools/cached-image`** — Image proxy endpoint.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `namespace` | string | `"default"` | Cache subdirectory |
| `url` | string | (required) | CDN URL to proxy |
| `readonly` | string | `"0"` | `"1"` = skip CDN on miss, return 404 |
| `_cb` | number | — | Cache-bust version (ignored by backend, forces browser re-request) |

- **HIT** → `web.FileResponse` with `Cache-Control: public, max-age=86400`
- **MISS + readonly=0** → Download from CDN with concurrency limit (`asyncio.Semaphore(8)`), retry up to 2 times with backoff
- **MISS + readonly=1** → `404` with `Cache-Control: no-store, must-revalidate`

**`POST /anima-tools/cache-image-async`** — Background pre-cache endpoint.

- Fire-and-forget: returns `202 Accepted` immediately, downloads and caches in background task.
- Idempotent: skips download if already cached.
- Used by Cache OFF mode to silently accumulate disk cache.

**`POST /anima-tools/clear-cache`** — Clear all or per-namespace cache.
**`GET /anima-tools/cache-stats`** — Return cache statistics.

### 3. `js/anima_image_utils.js` — Frontend memory cache

Shared session-level memory cache across all selectors:

- **`markImageLoaded(url)`** — Records URL as loaded. Automatically also records the alternate form (CDN ↔ proxy) so cache mode switching doesnt lose memory state.
- **`isImageLoaded(url)`** — Checks both CDN and proxy forms of the URL.
- LRU eviction when cache exceeds 4000 entries (trims to 3000).

### 4. Selector JS files — Per-selector integration

Each selector (`anima_character_selector.js`, `anima_artist_selector.js`,
`anima_clothing_selector.js`, `anima_background_selector.js`) follows the same
pattern:

```javascript
// Cache ON — readonly proxy, no CDN fallback
if (cacheMode) {
    const readonlyUrl = `/anima-tools/cached-image?readonly=1&_cb=${cacheBustVersion}&namespace=...&url=CDN_URL`;
    if (isImageLoaded(readonlyUrl)) {
        img.src = readonlyUrl;       // Show from memory cache immediately
    } else {
        placeholder.style.opacity = "1";  // Not on disk → show placeholder
    }
}
// Cache OFF — CDN direct + background pre-cache
else {
    img.src = CDN_URL;
    img.onload = () => {
        markImageLoaded(CDN_URL);
        fetch("/anima-tools/cache-image-async?namespace=...&url=CDN_URL")
    };
}
```

---

## Cache-Bust Mechanism

When the user toggles Cache ON, a `cacheBustVersion` counter is incremented and
persisted to localStorage. This version is appended as `_cb=N` to all readonly
proxy URLs. Since the URL changes on every toggle, the browser cannot serve
stale 404 responses from its HTTP cache.

**Two-layer defense:**
1. Backend returns `Cache-Control: no-store` on all readonly 404 responses.
2. Frontend version counter ensures completely fresh URLs each toggle.

---

## Performance Considerations

| Concern | Solution |
|---------|----------|
| 60 concurrent MISS requests | `asyncio.Semaphore(8)` limits concurrent CDN downloads |
| Connection overhead | Global shared `aiohttp.ClientSession` with `TCPConnector(limit=16)` |
| CDN transient failures | Retry 2x (backend) / 3x (fetch_and_cache) with exponential backoff |
| Batch image rendering | IntersectionObserver with 300-320px root margin |
| Disk write safety | Atomic write via `.tmp` + `os.replace()` |
| Memory leak | Memory cache LRU eviction at 4000 entries |

---

## Debugging

**Backend logs** are tagged with `[Anima Cache:namespace]` or `[Anima Tools]`:
```
[Anima Cache:anima_character_selector] CDN returned 404 for: https://...
[Anima Tools] Cached image failed after 2 retries: ns=anima_character_selector url=... err=...
```

**Cache statistics** available at runtime:
```bash
curl http://127.0.0.1:8188/anima-tools/cache-stats
```

**Clear cache:**
```bash
curl -X POST http://127.0.0.1:8188/anima-tools/clear-cache \
  -H "Content-Type: application/json" \
  -d '{"namespace": "anima_character_selector"}'
```

---

## File Listing

| File | Role |
|------|------|
| `anima_cache.py` | Core `ImageCache` class, singleton registry |
| `nodes.py` | API routes: `/cached-image`, `/cache-image-async`, `/clear-cache`, `/cache-stats` |
| `js/anima_image_utils.js` | Shared frontend memory cache (`markImageLoaded`, `isImageLoaded`) |
| `js/anima_character_selector.js` | Character selector with cache mode toggle |
| `js/anima_artist_selector.js` | Artist selector with cache mode toggle |
| `js/anima_clothing_selector.js` | Clothing selector with cache mode toggle |
| `js/anima_background_selector.js` | Background selector with cache mode toggle |
