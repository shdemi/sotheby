/**
 * Parser for the Reverse:1999 Fandom "Promotional Code" page.
 *
 * Pure (no network, no filesystem) so the Vercel function, the snapshot script
 * and the test suite all share one implementation.
 *
 * Input is the raw wikitext of
 * https://reverse1999.fandom.com/wiki/Promotional_Code. The page is a set of
 * `== Active ==` / `=== Permanent ===` / `=== Current ===` / `== Expired ==`
 * sections, each holding wikitables whose rows look like
 *
 *   |-
 *   |Typhonomachy<!-- Expires: 14/12/2026 -->
 *   |{{Item Box|30|Clear Drop|6}}{{Item Box|3|Moment of Dissonance|3}}
 *
 * The expiry date lives in an HTML comment and is hand-written by editors, so
 * it is frequently missing, vague ("idk") or ambiguous (14/12 vs 12/14). The
 * parser therefore keeps `raw` and only produces an ISO date when the text is
 * unambiguous; it never drops a code for a date it cannot read.
 */

const SECTION_RE = /^==\s*(.+?)\s*==\s*$/;
const SUBSECTION_RE = /^===\s*(.+?)\s*===\s*$/;
const CODE_RE = /^\|\s*([A-Za-z0-9][A-Za-z0-9_-]{2,})\s*(?:<!--([\s\S]*?)-->)?\s*$/;
const ITEM_RE = /\{\{\s*Item\s*Box\s*\|\s*([^|}]*?)\s*\|\s*([^|}]*?)\s*(?:\|\s*([^|}]*?)\s*)?\}\}/gi;

/** Strips the wiki markup an item name could carry, keeping the visible text. */
function cleanText(value) {
  return String(value || "")
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/'''?/g, "")
    .trim();
}

/** `19,999` -> 19999, `—` -> null. */
function parseQuantity(value) {
  const digits = String(value || "").replace(/[^0-9.]/g, "");
  if (!digits) return null;
  const num = Number(digits);
  return Number.isFinite(num) ? num : null;
}

/** Reads the `Expires: …` comment (or any leftover text) into a shape. */
export function parseExpiry(comment) {
  const raw = String(comment || "")
    .replace(/expires?\s*:/i, "")
    .trim();
  if (!raw) return null;

  const result = { raw, iso: null, uncertain: true };
  if (/[?]|idk|unknown|tba|tbd/i.test(raw)) return result;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    result.iso = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    result.uncertain = false;
    return result;
  }

  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!slash) return result;

  let [, first, second, year] = slash;
  if (year.length === 2) year = `20${year}`;
  const a = Number(first);
  const b = Number(second);

  // 14/12 can only be day/month; 12/14 can only be month/day. Anything that
  // fits both ways (04/11) is left ambiguous instead of guessing.
  let day = null;
  let month = null;
  if (a > 12 && b <= 12) {
    day = a;
    month = b;
  } else if (b > 12 && a <= 12) {
    month = a;
    day = b;
  }
  if (!day || !month) return result;

  const pad = (n) => String(n).padStart(2, "0");
  result.iso = `${year}-${pad(month)}-${pad(day)}`;
  result.uncertain = false;
  return result;
}

/** Pulls the `{{Item Box|qty|name|rarity}}` templates out of one line. */
function parseRewards(line) {
  const rewards = [];
  ITEM_RE.lastIndex = 0;
  let match;
  while ((match = ITEM_RE.exec(line)) !== null) {
    const name = cleanText(match[2]);
    if (!name) continue;
    rewards.push({
      qty: parseQuantity(match[1]),
      name,
      rarity: parseQuantity(match[3]),
    });
  }
  return rewards;
}

/**
 * @returns {{ permanent: object[], current: object[] }}
 *   `permanent` rows carry `{ code, rewards }`; `current` rows add `expires`.
 */
export function parsePromoCodes(wikitext) {
  const lines = String(wikitext || "").split(/\r?\n/);
  const permanent = [];
  const current = [];
  const seen = new Set();

  let section = "";
  let subsection = "";
  let pending = null; // { bucket, entry }

  const flush = () => {
    pending = null;
  };

  for (const line of lines) {
    // `=== X ===` also satisfies SECTION_RE, so the deeper heading is tested first.
    let match = line.match(SUBSECTION_RE);
    if (match) {
      subsection = match[1].trim().toLowerCase();
      flush();
      continue;
    }
    match = line.match(SECTION_RE);
    if (match) {
      section = match[1].trim().toLowerCase();
      subsection = "";
      flush();
      continue;
    }

    const active = section === "active";
    const bucket =
      !active ? null : subsection === "permanent" ? permanent : subsection === "current" ? current : null;

    match = line.match(CODE_RE);
    if (match) {
      const code = match[1].trim();
      if (!bucket || seen.has(code.toLowerCase())) {
        flush();
        continue;
      }
      seen.add(code.toLowerCase());
      const entry = { code, rewards: [] };
      if (bucket === current) {
        const expires = parseExpiry(match[2]);
        if (expires) entry.expires = expires;
      }
      bucket.push(entry);
      pending = entry;
      continue;
    }

    if (!pending) continue;

    // A table separator closes the row; anything else may still carry Item Boxes.
    if (/^\|-/.test(line) || /^\|}/.test(line)) {
      flush();
      continue;
    }
    const rewards = parseRewards(line);
    if (rewards.length) pending.rewards.push(...rewards);
  }

  return { permanent, current };
}

export default parsePromoCodes;
