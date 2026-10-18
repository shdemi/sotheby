/**
 * File access for the editor.
 *
 * The editor runs as a static page with no server, so it cannot write to disk.
 * It reads the data over HTTP and hands back the changed files as a download.
 * That is deliberate: nothing on the host can be modified, and the only thing a
 * visitor can obtain is data that is already published in the repository.
 *
 * Downloads are packaged as a single ZIP whose entries are full repository paths
 * (`data/character_reso_shape.json`), so extracting it over the repository root
 * puts every file where it belongs. One download also avoids the browser's
 * "download multiple files?" prompt that N separate downloads would trigger.
 */

export const DATA_DIR = "data";

/** Files the editor reads and may regenerate. */
export const WRITABLE = [
  "characters_by_rarity.json",
  "characters_by_afflatus.json",
  "character_reso_shape.json",
  "shape_patterns.json",
  "reso_shape.json",
  "euphoria_list.json",
  "exclude_character.json",
  "collab_character.json",
  "future_sight.json",
  "global_name_transfer.json",
  "name_map.json",
  "psychube_id.json",
  "team_archetypes.json",
  "characters_progressions.json",
  "guide_builds.json",
  "guide_rotations.json",
  "guide_skills.json",
  "guide_cards.json",
];

/** Files the editor reads but never writes. */
export const READ_ONLY = ["ArcanistMap.json", "i18n.json"];

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

async function fetchText(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

/**
 * Loads every data file plus app.js (which holds the alias tables the model
 * needs for name resolution).
 *
 * @returns {Promise<{texts: Record<string,string>, appJs: string}>}
 */
export async function loadAll() {
  const names = [...WRITABLE, ...READ_ONLY];
  const [texts, appJs] = await Promise.all([
    Promise.all(names.map((n) => fetchText(`../${DATA_DIR}/${n}`))).then((list) =>
      Object.fromEntries(names.map((n, i) => [n, list[i]]))
    ),
    fetchText("../app.js").catch(() => ""),
  ]);
  return { texts, appJs };
}

/* ------------------------------------------------------------------ *
 * CRC-32 (required by the ZIP format)
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ------------------------------------------------------------------ *
 * ZIP writer (store only, no compression)
 * ------------------------------------------------------------------ */

/** DOS date and time, as the ZIP format stores them. */
function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/**
 * Builds a ZIP archive from `{ path: text }`.
 *
 * Entries are stored uncompressed: the payloads are small JSON files, and
 * store-only keeps this writer to a few dozen lines with no dependency. The
 * UTF-8 name flag is set even though repository paths are ASCII.
 *
 * @param {Record<string,string>} files path -> contents
 * @param {Date} [when] timestamp to record; defaults to now
 * @returns {Uint8Array}
 */
export function buildZip(files, when = new Date()) {
  const { time, date } = dosDateTime(when);
  const encode = (text) => new TextEncoder().encode(text);

  const entries = Object.keys(files)
    .sort()
    .map((path) => {
      const nameBytes = encode(path);
      const dataBytes = encode(files[path]);
      return { path, nameBytes, dataBytes, crc: crc32(dataBytes) };
    });

  const localSize = entries.reduce((sum, e) => sum + 30 + e.nameBytes.length + e.dataBytes.length, 0);
  const centralSize = entries.reduce((sum, e) => sum + 46 + e.nameBytes.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let at = 0;

  const u16 = (v) => {
    view.setUint16(at, v, true);
    at += 2;
  };
  const u32 = (v) => {
    view.setUint32(at, v, true);
    at += 4;
  };
  const raw = (bytes) => {
    out.set(bytes, at);
    at += bytes.length;
  };

  // Local file headers + data
  const offsets = [];
  for (const entry of entries) {
    offsets.push(at);
    u32(0x04034b50); // local file header
    u16(20); // version needed
    u16(0x0800); // UTF-8 filename
    u16(0); // store
    u16(time);
    u16(date);
    u32(entry.crc);
    u32(entry.dataBytes.length);
    u32(entry.dataBytes.length);
    u16(entry.nameBytes.length);
    u16(0); // extra field length
    raw(entry.nameBytes);
    raw(entry.dataBytes);
  }

  const centralStart = at;

  // Central directory
  entries.forEach((entry, i) => {
    u32(0x02014b50); // central directory header
    u16(20); // version made by
    u16(20); // version needed
    u16(0x0800);
    u16(0);
    u16(time);
    u16(date);
    u32(entry.crc);
    u32(entry.dataBytes.length);
    u32(entry.dataBytes.length);
    u16(entry.nameBytes.length);
    u16(0); // extra
    u16(0); // comment
    u16(0); // disk number start
    u16(0); // internal attributes
    u32(0); // external attributes
    u32(offsets[i]);
    raw(entry.nameBytes);
  });

  const centralEnd = at;

  // End of central directory
  u32(0x06054b50);
  u16(0); // this disk
  u16(0); // disk with central directory
  u16(entries.length);
  u16(entries.length);
  u32(centralEnd - centralStart);
  u32(centralStart);
  u16(0); // comment length

  return out;
}

/* ------------------------------------------------------------------ *
 * Downloading
 * ------------------------------------------------------------------ */

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on the next tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Saves one file as a download. */
export function downloadFile(name, text) {
  triggerDownload(new Blob([text], { type: "application/json" }), name);
}

/**
 * Packages the changed files into one ZIP and downloads it.
 *
 * Entries keep their repository path, so extracting the archive over the
 * repository root is enough — no manual renaming or moving.
 *
 * @param {Record<string,string>} files path -> contents
 * @param {string} [dataDir] folder prefix inside the archive
 * @returns {{filename: string, files: string[]}}
 */
export function downloadZip(files, dataDir = DATA_DIR) {
  const names = Object.keys(files).sort();
  if (names.length === 0) throw new Error("There is nothing to download.");

  const zipped = {};
  for (const name of names) zipped[`${dataDir}/${name}`] = files[name];

  const bytes = buildZip(zipped);
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `sothebys-mansion-data-${stamp}.zip`;
  triggerDownload(new Blob([bytes], { type: "application/zip" }), filename);

  return { filename, files: names };
}
