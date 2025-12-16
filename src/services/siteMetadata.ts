/**
 * Lightweight website metadata fetcher.
 * Currently extracts <meta name="description" content="..."> as fallback
 * when company description is missing.
 *
 * Note: This is a simple HTML substring scan to avoid adding heavy parsers.
 */

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Fetch meta description from a website.
 * @param url public website URL
 * @returns description string or null if not found / failed
 */
export async function fetchMetaDescription(url: string): Promise<string | null> {
  if (!url) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(
      /<meta\s+name=["']description["']\s+content=["']([^"']+)["'][^>]*>/i
    );
    if (match?.[1]) {
      const desc = match[1].trim();
      if (desc.length > 0) return desc.slice(0, 500); // cap length for safety
    }
    return null;
  } catch (err) {
    // Network errors or timeout -> return null silently
    return null;
  }
}

