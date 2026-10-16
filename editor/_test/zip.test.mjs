/**
 * Verifies the ZIP writer against Python's zipfile, which is an independent
 * implementation of the same format.
 *
 *   node editor/_test/zip.test.mjs
 *
 * A hand-written ZIP is only useful if other tools can open it, so the check is
 * "Python agrees", not "our own reader agrees".
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildZip, crc32 } from "../files.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

/**
 * Runs Python with UTF-8 stdio. The Windows console defaults to cp1252, which
 * cannot encode the CJK characters in the data files.
 */
function python(args, opts = {}) {
  return execFileSync("python", args, {
    encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    ...opts,
  });
}

let checks = 0;
let failures = 0;
function check(label, ok, detail) {
  checks++;
  if (ok) console.log(`  PASS  ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${detail}`);
  }
}

/* ------------------------------------------------------------------ *
 * CRC-32 against known values
 * ------------------------------------------------------------------ */

console.log("\n=== CRC-32 ===");
{
  const enc = new TextEncoder();
  // Standard test vectors for CRC-32/ISO-HDLC.
  check('crc32("") = 0', crc32(enc.encode("")) === 0, String(crc32(enc.encode(""))));
  check('crc32("123456789") = 0xCBF43926', crc32(enc.encode("123456789")) === 0xcbf43926, crc32(enc.encode("123456789")).toString(16));
  check('crc32("a") = 0xE8B7BE43', crc32(enc.encode("a")) === 0xe8b7be43, crc32(enc.encode("a")).toString(16));
  check("crc32 handles UTF-8 bytes", typeof crc32(enc.encode("槲寄生")) === "number");
}

/* ------------------------------------------------------------------ *
 * Build a ZIP and let Python read it
 * ------------------------------------------------------------------ */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sm-zip-"));
let pythonAvailable = true;
try {
  execFileSync("python", ["-c", "import zipfile"], { stdio: "ignore" });
} catch {
  pythonAvailable = false;
}

if (!pythonAvailable) {
  console.log("\n=== skipped: python is not available ===");
} else {
  const files = {
    "data/character_reso_shape.json": fs.readFileSync(path.join(ROOT, "data", "character_reso_shape.json"), "utf8"),
    "data/team_archetypes.json": fs.readFileSync(path.join(ROOT, "data", "team_archetypes.json"), "utf8"),
    "data/name_map.json": fs.readFileSync(path.join(ROOT, "data", "name_map.json"), "utf8"),
  };

  const when = new Date("2026-10-16T12:00:00Z");
  const zipPath = path.join(tmp, "out.zip");
  fs.writeFileSync(zipPath, Buffer.from(buildZip(files, when)));

  console.log("\n=== structure ===");
  const magic = fs.readFileSync(zipPath).subarray(0, 4).toString("hex");
  check("starts with the local file header signature", magic === "504b0304", magic);
  const tail = fs.readFileSync(zipPath).subarray(-22, -18).toString("hex");
  check("ends with the end-of-central-directory signature", tail === "504b0506", tail);

  const probe = `
import json, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
print("TESTZIP", z.testzip())
for info in z.infolist():
    text = z.read(info.filename).decode("utf-8")
    try:
        json.loads(text)
        ok = "json-ok"
    except Exception as e:
        ok = "json-BAD:" + str(e)
    print("ENTRY", info.filename, info.file_size, info.compress_type, "%08x" % info.CRC, ok, info.date_time[0], info.date_time[1])
print("NAMELIST", "|".join(z.namelist()))
`;
  const out = python(["-c", probe, zipPath]);
  const lines = out.trim().split(/\r?\n/);

  check("Python reports no corruption", lines[0] === "TESTZIP None", lines[0]);

  const entries = lines.filter((l) => l.startsWith("ENTRY ")).map((l) => l.split(" "));
  check("Python sees all three entries", entries.length === 3, String(entries.length));
  check(
    "entries keep their repository path",
    entries.every((e) => e[1].startsWith("data/") && e[1].endsWith(".json")),
    entries.map((e) => e[1]).join(", ")
  );
  check(
    "every entry is valid JSON on the other side",
    entries.every((e) => e[5] === "json-ok"),
    entries.map((e) => `${e[1]}: ${e[5]}`).join(", ")
  );
  check(
    "entries are stored, not compressed",
    entries.every((e) => e[3] === "0"),
    entries.map((e) => e[3]).join(", ")
  );
  check(
    "the recorded date matches",
    entries.every((e) => e[6] === "2026" && e[7] === "10"),
    entries.map((e) => `${e[6]}-${e[7]}`).join(", ")
  );

  const namelist = lines.find((l) => l.startsWith("NAMELIST ")).slice("NAMELIST ".length).split("|");
  check("entries are sorted, so the archive is deterministic", namelist.join("|") === Object.keys(files).sort().join("|"), namelist.join("|"));

  console.log("\n=== content round trip ===");
  const extractDir = path.join(tmp, "extract");
  python(["-c", "import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])", zipPath, extractDir]);
  for (const [name, text] of Object.entries(files)) {
    const back = fs.readFileSync(path.join(extractDir, name), "utf8");
    check(`${name} survives the round trip byte-for-byte`, back === text, `expected ${text.length} chars, got ${back.length}`);
  }

  console.log("\n=== non-ASCII content ===");
  {
    const tricky = {
      "data/tricky.json": JSON.stringify({ cn: "槲寄生", emoji: "✦", quote: 'he said "hi"', newline: "a\nb" }, null, 2),
    };
    const p = path.join(tmp, "tricky.zip");
    const outDir = path.join(tmp, "tricky-out");
    fs.writeFileSync(p, Buffer.from(buildZip(tricky, when)));
    python(["-c", "import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])", p, outDir]);
    // Compare on disk rather than through stdout: Python's print adds a newline
    // and the Windows console translates line endings.
    const back = fs.readFileSync(path.join(outDir, "data", "tricky.json"), "utf8");
    check("UTF-8 content survives the round trip", back === tricky["data/tricky.json"], JSON.stringify(back.slice(0, 80)));
    check("CJK characters are intact", back.includes("槲寄生"), JSON.stringify(back.slice(0, 60)));
    check("an embedded newline escape is intact", back.includes('"newline": "a\\nb"'), JSON.stringify(back.slice(-40)));
  }

  console.log("\n=== empty input ===");
  {
    const bytes = buildZip({}, when);
    check("an empty archive is just the end record", bytes.length === 22, String(bytes.length));
    const p = path.join(tmp, "empty.zip");
    fs.writeFileSync(p, Buffer.from(bytes));
    const got = python(["-c", "import sys, zipfile; print(len(zipfile.ZipFile(sys.argv[1]).namelist()))", p]).trim();
    check("Python reads it as an empty archive", got === "0", got);
  }
}

fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n=== ${checks - failures}/${checks} checks passed ===`);
process.exit(failures === 0 ? 0 : 1);
