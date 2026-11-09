/**
 * The one external request this site makes: the Fandom wiki's promotional-code
 * page. Shared by the Vercel function and the snapshot script so both ask the
 * same question with the same browser-ish headers.
 */

export const WIKI_PAGE = "https://reverse1999.fandom.com/wiki/Promotional_Code";

export const WIKI_API =
  "https://reverse1999.fandom.com/api.php?action=parse&page=Promotional_Code" +
  "&prop=wikitext%7Crevid&format=json&formatversion=2&origin=*";

// Fandom sits behind Cloudflare; a plain Node user agent is more likely to be
// challenged, so identify as a browser and ask for JSON explicitly.
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * @returns {Promise<{ wikitext: string, revid: number|null, title: string }>}
 */
export async function fetchPromoWikitext({ timeoutMs = 8000, attempts = 2 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(WIKI_API, { headers: HEADERS, signal: controller.signal });
      if (!res.ok) throw new Error(`wiki responded ${res.status}`);
      const json = await res.json();
      const wikitext = json?.parse?.wikitext;
      if (typeof wikitext !== "string" || !wikitext) throw new Error("wiki returned no wikitext");
      return {
        wikitext,
        revid: Number(json.parse.revid) || null,
        title: String(json.parse.title || "Promotional Code"),
      };
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error("wiki request failed");
}
