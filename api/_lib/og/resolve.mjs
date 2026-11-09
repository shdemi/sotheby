/**
 * Shared lookups for the share cards and the `/sim` shell.
 *
 * Both read `data/og_index.json`, so a name that is not in the roster is simply dropped:
 * a shared link survives a rename, a new patch or a hand-typed typo.
 */

export function parseList(value) {
  const raw = Array.isArray(value) ? value.join(",") : String(value || "");
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function findCharacter(index, token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  if (index.characters[raw]) return index.characters[raw];

  const lower = raw.toLowerCase();
  for (const [key, char] of Object.entries(index.characters)) {
    if (key.toLowerCase() === lower) return char;
    if (String(char.name || "").toLowerCase() === lower) return char;
    if (char.nameZh && char.nameZh === raw) return char;
  }
  return null;
}

export function findPsychube(index, token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  if (index.psychubes[raw]) return { key: raw, ...index.psychubes[raw] };

  // Bare game id (what a compact link stores, e.g. `1527`). The id is unique across
  // rarities, so the first matching key is the right one.
  if (/^\d+$/.test(raw)) {
    for (const [key, row] of Object.entries(index.psychubes)) {
      if (String(key).split(":").pop() === raw) return { key, ...row };
    }
    return null;
  }

  const lower = raw.toLowerCase();
  for (const [key, row] of Object.entries(index.psychubes)) {
    if (String(row.name || "").toLowerCase() === lower) return { key, ...row };
    if (row.nameZh && row.nameZh === raw) return { key, ...row };
  }
  return null;
}
