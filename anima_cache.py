"""
Reusable image cache module for ComfyUI-Anima-Tools.
Provides per-namespace disk-backed image caching with domain whitelisting.

Usage:
    from anima_cache import get_cache

    cache = get_cache("anima_character_selector")
    if not cache.has(image_url):
        await cache.fetch_and_cache(image_url)
    cache_path = cache.get_path(image_url)
"""

import hashlib
import json
import os
import threading
from typing import Optional

import aiohttp

# Default CDN domain whitelist (SSRF protection)
DEFAULT_ALLOWED_DOMAINS = [
    "fastly.jsdelivr.net",
    "raw.githubusercontent.com",
    "cdn.statically.io",
    "blobs.animadex.net",
]


class ImageCache:
    """Per-namespace image cache with disk persistence.

    Each namespace maps to a subdirectory under ``cache_root``.
    All file operations are protected by an instance-level lock.
    Writes use atomic ``os.replace`` (write to ``.tmp`` then rename).
    """

    def __init__(
        self,
        namespace: str,
        cache_root: Optional[str] = None,
        allowed_domains: Optional[list[str]] = None,
    ):
        self.namespace = namespace
        self._lock = threading.Lock()

        if cache_root is None:
            plugin_dir = os.path.dirname(os.path.abspath(__file__))
            cache_root = os.path.join(plugin_dir, "temp")

        self._cache_dir = os.path.join(cache_root, namespace)
        self._allowed_domains = allowed_domains or DEFAULT_ALLOWED_DOMAINS

    # ── path helpers ──────────────────────────────────────────────

    def get_cache_dir(self) -> str:
        """Return the namespace cache directory, creating it if needed."""
        with self._lock:
            os.makedirs(self._cache_dir, exist_ok=True)
        return self._cache_dir

    def _filename(self, url: str) -> str:
        """Generate a deterministic filename from a URL (MD5 + extension)."""
        url_hash = hashlib.md5(url.encode()).hexdigest()
        url_lower = url.lower()
        if ".png" in url_lower:
            ext = ".png"
        elif ".jpg" in url_lower or ".jpeg" in url_lower:
            ext = ".jpg"
        else:
            ext = ".webp"
        return url_hash + ext

    def _path(self, url: str) -> str:
        return os.path.join(self.get_cache_dir(), self._filename(url))

    # ── domain whitelist ──────────────────────────────────────────

    def is_allowed_url(self, url: str) -> bool:
        """Check whether *url* points to one of the allowed CDN domains."""
        if not url:
            return False
        from urllib.parse import urlparse

        parsed = urlparse(url)
        return any(parsed.netloc.endswith(d) for d in self._allowed_domains)

    # ── query ─────────────────────────────────────────────────────

    def has(self, url: str) -> bool:
        """Return True if *url* is already cached on disk."""
        return os.path.exists(self._path(url))

    def get_path(self, url: str) -> Optional[str]:
        """Return the absolute cache path for *url*, or None if not cached."""
        path = self._path(url)
        return path if os.path.exists(path) else None

    def get_content_type(self, url: str) -> str:
        """Return the MIME type for a cached image based on its file extension."""
        path = self._path(url)
        if path.endswith(".png"):
            return "image/png"
        if path.endswith(".jpg"):
            return "image/jpeg"
        return "image/webp"

    # ── fetch & store ─────────────────────────────────────────────

    async def fetch_and_cache(self, url: str, timeout: int = 20) -> Optional[bytes]:
        """Download *url* and atomically write to the cache.

        Returns the image bytes on success, or None on failure.
        """
        if not self.is_allowed_url(url):
            print(f"[Anima Cache:{self.namespace}] Blocked disallowed URL: {url}")
            return None

        timeout_obj = aiohttp.ClientTimeout(total=timeout)
        async with aiohttp.ClientSession(timeout=timeout_obj) as session:
            async with session.get(url) as resp:
                if resp.status != 200:
                    print(
                        f"[Anima Cache:{self.namespace}] "
                        f"CDN returned {resp.status} for: {url}"
                    )
                    return None
                data = await resp.read()

        cache_path = self._path(url)
        with self._lock:
            os.makedirs(self._cache_dir, exist_ok=True)
            tmp_path = cache_path + ".tmp"
            with open(tmp_path, "wb") as f:
                f.write(data)
            os.replace(tmp_path, cache_path)

        return data

    # ── management ────────────────────────────────────────────────

    def clear(self) -> int:
        """Delete every file in this namespace cache directory.

        Returns the number of files removed.
        """
        count = 0
        if not os.path.isdir(self._cache_dir):
            return 0
        with self._lock:
            for name in os.listdir(self._cache_dir):
                fpath = os.path.join(self._cache_dir, name)
                if os.path.isfile(fpath):
                    os.remove(fpath)
                    count += 1
        return count

    def stats(self) -> dict:
        """Return statistics for this namespace cache.

        Returns a dict with keys:
            namespace, cache_dir, file_count, total_size_bytes, total_size_mb
        """
        total_size = 0
        file_count = 0
        if os.path.isdir(self._cache_dir):
            for name in os.listdir(self._cache_dir):
                fpath = os.path.join(self._cache_dir, name)
                if os.path.isfile(fpath):
                    file_count += 1
                    total_size += os.path.getsize(fpath)
        return {
            "namespace": self.namespace,
            "cache_dir": self._cache_dir,
            "file_count": file_count,
            "total_size_bytes": total_size,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
        }


# ── singleton registry ──────────────────────────────────────────

_cache_registry: dict[str, ImageCache] = {}
_registry_lock = threading.Lock()


def get_cache(namespace: str) -> ImageCache:
    """Return a shared ``ImageCache`` singleton for *namespace*.

    The first call for a given name creates the instance; subsequent
    calls return the same object.  Thread-safe.
    """
    with _registry_lock:
        if namespace not in _cache_registry:
            _cache_registry[namespace] = ImageCache(namespace)
        return _cache_registry[namespace]
