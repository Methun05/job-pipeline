"""
We Work Remotely RSS — design category jobs.
Free RSS feed, no auth required.
Attribution: "originally posted on We Work Remotely" — shown via source label in dashboard.
"""
import html as html_module
import feedparser
from bs4 import BeautifulSoup
from pipeline.config import HTTP_TIMEOUT

RSS_URL = "https://weworkremotely.com/remote-jobs.rss?term=designer"


def _strip_html(text: str) -> str:
    if not text:
        return ""
    return BeautifulSoup(text, "lxml").get_text(separator=" ", strip=True)


def fetch() -> list[dict]:
    try:
        feed = feedparser.parse(
            RSS_URL,
            request_headers={"User-Agent": "Mozilla/5.0 (compatible; job-pipeline/1.0)"},
        )
    except Exception as e:
        raise RuntimeError(f"We Work Remotely RSS fetch failed: {e}")

    if feed.bozo and not feed.entries:
        raise RuntimeError(f"We Work Remotely RSS parse error: {feed.bozo_exception}")

    results = []
    for entry in feed.entries:
        try:
            title = html_module.unescape((entry.get("title") or "").strip())
            link  = (entry.get("link") or "").strip()
            if not title or not link:
                continue

            # Title format is usually "Company: Job Title" — split it
            company = ""
            if ": " in title:
                company, title = title.split(": ", 1)

            description = _strip_html(entry.get("summary", ""))

            # Region lives in the title suffix like "Anywhere in the World" or in tags
            location = ""
            if hasattr(entry, "tags") and entry.tags:
                location = " ".join(
                    t.term for t in entry.tags
                    if t.term and not t.term.lower().startswith("full-time")
                )

            # published
            posted_at = None
            if hasattr(entry, "published"):
                posted_at = entry.published

            results.append({
                "job_title":       title.strip(),
                "company_name":    company.strip(),
                "company_website": "",
                "job_url":         link,
                "description_raw": description,
                "salary_min":      None,
                "salary_max":      None,
                "salary_currency": "USD",
                "location":        location.strip(),
                "posted_at":       posted_at,
                "source":          "weworkremotely",
                "raw_data":        {"guid": entry.get("id", "")},
            })
        except Exception:
            continue

    return results
