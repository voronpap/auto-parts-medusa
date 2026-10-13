"""HTTP access that is polite to the catalogs it reads.

Requests identify themselves, are spaced out per host and cached, and a
source that refuses automated access is reported as blocked rather than
worked around.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlsplit

import requests

USER_AGENT = (
    "auto-parts.pp.ua catalog lookup/0.1 (+https://auto-parts.pp.ua; "
    "on-demand single part-number lookups)"
)

# Responses that mean "not for robots". They are never retried or bypassed.
BLOCKED_STATUSES = {401, 403, 407, 429, 451}
BLOCK_MARKERS = ("captcha", "cf-challenge", "just a moment...", "access denied")


class SourceError(Exception):
    """The source could not be read. The message is reported to the catalog."""


class SourceBlocked(SourceError):
    """The source refuses automated access (login, captcha, bot protection)."""


class RateLimiter:
    """Keeps at least `min_interval` seconds between requests to one host."""

    def __init__(
        self,
        min_interval: float = 5.0,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._min_interval = min_interval
        self._clock = clock
        self._sleep = sleep
        self._last: dict[str, float] = {}
        self._intervals: dict[str, float] = {}
        self._lock = threading.Lock()

    def set_interval(self, host: str, seconds: float) -> None:
        self._intervals[host] = max(seconds, 0.0)

    def wait(self, host: str) -> float:
        """Blocks until the host may be contacted again; returns the delay."""
        with self._lock:
            interval = self._intervals.get(host, self._min_interval)
            now = self._clock()
            ready_at = self._last.get(host, float("-inf")) + interval
            delay = max(0.0, ready_at - now)
            self._last[host] = now + delay

        if delay:
            self._sleep(delay)

        return delay


class ResponseCache:
    """Small on-disk cache so repeated lookups do not hit the source again."""

    def __init__(self, path: Path | None, ttl_seconds: int = 7 * 24 * 3600) -> None:
        self._ttl = ttl_seconds
        self._lock = threading.Lock()
        self._db: sqlite3.Connection | None = None

        if path is not None:
            path.parent.mkdir(parents=True, exist_ok=True)
            self._db = sqlite3.connect(str(path), check_same_thread=False)
            self._db.execute(
                "CREATE TABLE IF NOT EXISTS responses ("
                "key TEXT PRIMARY KEY, stored_at REAL, status INTEGER, body TEXT)"
            )

    @staticmethod
    def key(method: str, url: str, payload: Any) -> str:
        raw = json.dumps([method, url, payload], sort_keys=True, default=str)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def get(self, key: str, now: float | None = None) -> tuple[int, str] | None:
        entry = self.get_entry(key, now)

        return (entry[1], entry[2]) if entry else None

    def get_entry(self, key: str, now: float | None = None) -> tuple[float, int, str] | None:
        """Like `get`, with the time the response was stored."""
        if self._db is None:
            return None

        with self._lock:
            row = self._db.execute(
                "SELECT stored_at, status, body FROM responses WHERE key = ?", (key,)
            ).fetchone()

        if row is None or (now or time.time()) - row[0] > self._ttl:
            return None

        return row[0], row[1], row[2]

    def put(self, key: str, status: int, body: str, now: float | None = None) -> None:
        if self._db is None:
            return

        with self._lock:
            self._db.execute(
                "INSERT OR REPLACE INTO responses VALUES (?, ?, ?, ?)",
                (key, now or time.time(), status, body),
            )
            self._db.commit()


class PoliteSession:
    """A requests session with identification, spacing, caching and limits."""

    def __init__(
        self,
        cache: ResponseCache | None = None,
        limiter: RateLimiter | None = None,
        timeout: float = 30.0,
        session: requests.Session | None = None,
    ) -> None:
        self._cache = cache or ResponseCache(None)
        self.limiter = limiter or RateLimiter()
        self._timeout = timeout
        self._session = session or requests.Session()
        self._session.headers.update(
            {"User-Agent": USER_AGENT, "Accept-Language": "en,uk;q=0.8"}
        )
        #: When set, every response that is returned is appended here, so
        #: the raw data behind a lookup can be archived with its result.
        self.recorder: list[dict[str, Any]] | None = None

    def _record(
        self,
        key: str,
        method: str,
        url: str,
        params: dict[str, Any] | None,
        json_body: Any,
        form_body: dict[str, Any] | None,
        status: int,
        body: str,
        fetched_at: float,
    ) -> None:
        if self.recorder is None:
            return

        request: dict[str, Any] = dict(params or {})

        if json_body is not None:
            request["json"] = json_body
        if form_body is not None:
            request["form"] = form_body

        self.recorder.append(
            {
                "request_key": key,
                "method": method,
                "url": url,
                "params": request or None,
                "http_status": status,
                "body": body,
                "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(fetched_at)),
            }
        )

    def fetch(
        self,
        url: str,
        *,
        method: str = "GET",
        params: dict[str, Any] | None = None,
        json_body: Any = None,
        form_body: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        use_cache: bool = True,
    ) -> str:
        """Returns the response body, raising SourceError on any failure."""
        if json_body is not None and form_body is not None:
            raise ValueError("Send either JSON or form data, not both")

        payload = [params, json_body]
        if form_body is not None:
            payload.append({"form": form_body})
        if headers is not None:
            payload.append({"headers": headers})
        key = ResponseCache.key(method, url, payload)

        if use_cache:
            cached = self._cache.get_entry(key)

            if cached is not None:
                self._record(key, method, url, params, json_body, form_body, cached[1], cached[2], cached[0])

                return cached[2]

        self.limiter.wait(urlsplit(url).netloc)

        try:
            body_args = {"data": form_body} if form_body is not None else {"json": json_body}
            response = self._session.request(
                method,
                url,
                params=params,
                **body_args,
                headers=headers,
                timeout=self._timeout,
            )
        except requests.RequestException as error:
            raise SourceError(f"{type(error).__name__}: {error}") from error

        body = response.text
        # Challenge pages are HTML. JSON may mention these words as data
        # (a "reCaptcha enabled" flag, say) without being a refusal.
        is_html = body.lstrip()[:1] == "<"

        if response.status_code in BLOCKED_STATUSES or (
            is_html and any(marker in body[:4000].lower() for marker in BLOCK_MARKERS)
        ):
            raise SourceBlocked(
                f"HTTP {response.status_code}: the source refuses automated access"
            )

        if response.status_code >= 400:
            raise SourceError(f"HTTP {response.status_code}")

        if use_cache:
            self._cache.put(key, response.status_code, body)

        self._record(key, method, url, params, json_body, form_body, response.status_code, body, time.time())

        return body

    def fetch_json(self, url: str, **kwargs: Any) -> Any:
        body = self.fetch(url, **kwargs)

        try:
            return json.loads(body)
        except ValueError as error:
            raise SourceError("The source did not return JSON") from error
