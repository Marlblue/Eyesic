/**
 * Search-as-you-type suggestions.
 *
 * This deliberately does NOT call the YouTube Data API: `search.list` costs 100
 * of the 10,000 daily quota units, so firing it per keystroke would burn the
 * whole day's budget in a few searches. Instead it proxies Google's public
 * autocomplete endpoint (the same one youtube.com's own search box uses),
 * which is a separate, unmetered service — undocumented, so it may change
 * without notice, but free.
 */
const SUGGEST_ROOT = "https://suggestqueries.google.com/complete/search";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query) return Response.json({ suggestions: [] });

  const url = new URL(SUGGEST_ROOT);
  url.searchParams.set("client", "firefox");
  url.searchParams.set("ds", "yt");
  url.searchParams.set("q", query);

  try {
    const response = await fetch(url, { next: { revalidate: 60 * 60 } });
    if (!response.ok) return Response.json({ suggestions: [] });

    const body = (await response.json().catch(() => null)) as [string, string[]] | null;
    const suggestions = Array.isArray(body?.[1]) ? body[1].slice(0, 8) : [];
    return Response.json({ suggestions });
  } catch {
    return Response.json({ suggestions: [] });
  }
}
