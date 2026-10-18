/**
 * Range-aware JSON editor.
 *
 * The point of this module: keep `git diff` limited to what the user actually
 * changed. A normal parse -> stringify round trip reformats the whole file,
 * because the shipped data files use inconsistent styles (4-space, 2-space,
 * tabs, and one file that mixes all three). Instead, this parser records the
 * exact character range of every value, and edits replace only those ranges.
 *
 *   const doc = new JsonDoc(text);
 *   doc.set(["characters_by_rarity", "6", 3], "Drake");  // scalar
 *   doc.append(["exclude_character"], "Schneider");      // list membership
 *   doc.toString();                                      // patched text
 *
 * `new JsonDoc(text).toString() === text` holds for every data file, so an
 * unedited document is byte-identical to its input.
 */

function isWs(ch) {
  return ch === " " || ch === "\t" || ch === "\r" || ch === "\n";
}

/* ------------------------------------------------------------------ *
 * Parser (records ranges)
 * ------------------------------------------------------------------ */

class Parser {
  constructor(text) {
    this.t = text;
    this.i = 0;
  }

  fail(msg) {
    const upto = this.t.slice(0, this.i);
    const line = upto.split("\n").length;
    const col = this.i - (upto.lastIndexOf("\n") + 1) + 1;
    throw new SyntaxError(`${msg} at line ${line}, column ${col}`);
  }

  skipWs() {
    while (this.i < this.t.length && isWs(this.t[this.i])) this.i++;
  }

  parseRoot() {
    this.skipWs();
    const node = this.parseValue();
    this.skipWs();
    if (this.i !== this.t.length) this.fail("Trailing content after the root value");
    return node;
  }

  parseValue() {
    this.skipWs();
    if (this.i >= this.t.length) this.fail("Unexpected end of input");
    const start = this.i;
    const ch = this.t[this.i];

    if (ch === "{") return this.parseObject(start);
    if (ch === "[") return this.parseArray(start);
    if (ch === '"') return { type: "string", value: this.parseString(), start, end: this.i };
    if (ch === "-" || (ch >= "0" && ch <= "9")) return this.parseNumber(start);
    if (this.t.startsWith("true", this.i)) {
      this.i += 4;
      return { type: "boolean", value: true, start, end: this.i };
    }
    if (this.t.startsWith("false", this.i)) {
      this.i += 5;
      return { type: "boolean", value: false, start, end: this.i };
    }
    if (this.t.startsWith("null", this.i)) {
      this.i += 4;
      return { type: "null", value: null, start, end: this.i };
    }
    this.fail(`Unexpected character ${JSON.stringify(ch)}`);
  }

  parseString() {
    // assumes this.t[this.i] === '"'
    this.i++;
    let out = "";
    while (this.i < this.t.length) {
      const ch = this.t[this.i];
      if (ch === '"') {
        this.i++;
        return out;
      }
      if (ch === "\\") {
        const esc = this.t[this.i + 1];
        this.i += 2;
        switch (esc) {
          case '"': out += '"'; break;
          case "\\": out += "\\"; break;
          case "/": out += "/"; break;
          case "b": out += "\b"; break;
          case "f": out += "\f"; break;
          case "n": out += "\n"; break;
          case "r": out += "\r"; break;
          case "t": out += "\t"; break;
          case "u": {
            const hex = this.t.slice(this.i, this.i + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail("Bad \\u escape");
            out += String.fromCharCode(parseInt(hex, 16));
            this.i += 4;
            break;
          }
          default:
            this.fail(`Bad escape \\${esc}`);
        }
        continue;
      }
      if (ch === "\n") this.fail("Unescaped newline in string");
      out += ch;
      this.i++;
    }
    this.fail("Unterminated string");
  }

  parseNumber(start) {
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(this.t.slice(this.i));
    if (!m) this.fail("Bad number");
    this.i += m[0].length;
    return { type: "number", value: Number(m[0]), raw: m[0], start, end: this.i };
  }

  parseObject(start) {
    const node = { type: "object", start, end: 0, entries: [] };
    this.i++; // {
    this.skipWs();
    if (this.t[this.i] === "}") {
      this.i++;
      node.end = this.i;
      return node;
    }
    for (;;) {
      this.skipWs();
      if (this.t[this.i] !== '"') this.fail("Expected a property name");
      const keyStart = this.i;
      const key = this.parseString();
      const keyEnd = this.i;
      this.skipWs();
      if (this.t[this.i] !== ":") this.fail("Expected ':'");
      this.i++;
      const value = this.parseValue();
      node.entries.push({ key, keyStart, keyEnd, value });
      this.skipWs();
      const ch = this.t[this.i];
      if (ch === ",") {
        this.i++;
        continue;
      }
      if (ch === "}") {
        this.i++;
        node.end = this.i;
        return node;
      }
      this.fail("Expected ',' or '}'");
    }
  }

  parseArray(start) {
    const node = { type: "array", start, end: 0, items: [] };
    this.i++; // [
    this.skipWs();
    if (this.t[this.i] === "]") {
      this.i++;
      node.end = this.i;
      return node;
    }
    for (;;) {
      node.items.push(this.parseValue());
      this.skipWs();
      const ch = this.t[this.i];
      if (ch === ",") {
        this.i++;
        continue;
      }
      if (ch === "]") {
        this.i++;
        node.end = this.i;
        return node;
      }
      this.fail("Expected ',' or ']'");
    }
  }
}

/* ------------------------------------------------------------------ *
 * Tree helpers
 * ------------------------------------------------------------------ */

export function parseJson(text) {
  return new Parser(text).parseRoot();
}

/** Plain JS value of a node (no ranges). */
export function toValue(node) {
  switch (node.type) {
    case "object": {
      const out = {};
      for (const e of node.entries) out[e.key] = toValue(e.value);
      return out;
    }
    case "array":
      return node.items.map(toValue);
    default:
      return node.value;
  }
}

/** Walks a path of keys / indices. Returns null when it does not exist. */
export function findNode(root, path) {
  let node = root;
  for (const step of path) {
    if (node === null || node === undefined) return null;
    if (typeof step === "number") {
      if (node.type !== "array" || step < 0 || step >= node.items.length) return null;
      node = node.items[step];
    } else {
      if (node.type !== "object") return null;
      const entry = node.entries.find((e) => e.key === step);
      if (!entry) return null;
      node = entry.value;
    }
  }
  return node;
}

/** Whitespace at the start of the line containing `pos`. */
function lineIndentAt(text, pos) {
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  const m = /^[ \t]*/.exec(text.slice(lineStart, pos));
  return m ? m[0] : "";
}

/**
 * The indentation actually used by the children of `node`.
 *
 * Measured locally rather than from the whole file, because one shipped file
 * (characters_by_rarity.json) mixes tabs and spaces. Local measurement is always
 * right for the container being edited.
 */
function childIndentOf(text, node) {
  let first;
  if (node.type === "array") {
    if (node.items.length === 0) return null;
    first = node.items[0].start;
  } else if (node.type === "object") {
    if (node.entries.length === 0) return null;
    first = node.entries[0].keyStart;
  } else {
    return null;
  }

  const lineStart = text.lastIndexOf("\n", first - 1) + 1;
  const lead = text.slice(lineStart, first);
  // Only accept it when the child really is alone on its line.
  if (!/^[ \t]+$/.test(lead)) return null;
  return lead;
}

/** Indent unit used by a document: tab if any line is tab-indented, else the shortest run. */
export function detectIndent(text) {
  const runs = new Set();
  for (const line of text.split("\n")) {
    const m = /^([ \t]+)\S/.exec(line);
    if (m) runs.add(m[1]);
  }
  if (runs.size === 0) return "  ";
  for (const run of runs) if (run.includes("\t")) return "\t";
  let shortest = null;
  for (const run of runs) if (shortest === null || run.length < shortest.length) shortest = run;
  return shortest;
}

export function detectEol(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

/* ------------------------------------------------------------------ *
 * Rendering new values
 * ------------------------------------------------------------------ */

/** Scalars are emitted as plain JSON. */
export function renderScalar(value, indent) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return renderValue(value, indent, "\n", 0);
}

/**
 * Renders a value for insertion.
 *
 * Objects become multi-line (they are records: psychubes, team slots, skins),
 * while arrays of short primitives stay on one line (they are tag lists).
 * That matches how the shipped files are written.
 */
export function renderValue(value, indent, eol, depth) {
  const pad = indent.repeat(depth);
  const padIn = indent.repeat(depth + 1);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const allPrimitive = value.every((v) => v === null || typeof v !== "object");
    const inline = "[" + value.map((v) => renderScalar(v, indent)).join(", ") + "]";
    if (allPrimitive && inline.length <= 48) return inline;
    return (
      "[" +
      eol +
      value.map((v) => padIn + renderValue(v, indent, eol, depth + 1)).join("," + eol) +
      eol +
      pad +
      "]"
    );
  }

  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) return "{}";
    return (
      "{" +
      eol +
      keys.map((k) => padIn + JSON.stringify(k) + ": " + renderValue(value[k], indent, eol, depth + 1)).join("," + eol) +
      eol +
      pad +
      "}"
    );
  }

  return renderScalar(value, indent);
}

/* ------------------------------------------------------------------ *
 * JsonDoc
 * ------------------------------------------------------------------ */

export class JsonDoc {
  /**
   * @param {string} text raw file contents
   * @param {{indent?: string, eol?: string}} [style] defaults detected from text
   */
  constructor(text, style) {
    this.original = text;
    this.text = text;
    this.root = parseJson(text);
    this.indent = (style && style.indent) || detectIndent(text);
    this.eol = (style && style.eol) || detectEol(text);
    this.dirty = false;
    this.log = [];
  }

  get value() {
    return toValue(this.root);
  }

  nodeAt(path) {
    return findNode(this.root, path);
  }

  /** Re-parses after an edit, so pending paths always address fresh offsets. */
  reparse() {
    this.root = parseJson(this.text);
  }

  /** Replaces the value at `path`. No-op when the value is already equal. */
  set(path, value) {
    const node = this.nodeAt(path);
    if (!node) throw new Error(`No value at ${JSON.stringify(path)}`);
    if (node.type === "string" && node.value === value) return false;
    if (node.type === "number" && node.value === value) return false;
    if (node.type === "boolean" && node.value === value) return false;

    this.text = this.text.slice(0, node.start) + renderScalar(value, this.indent) + this.text.slice(node.end);
    this.dirty = true;
    this.log.push(`set ${JSON.stringify(path)} = ${JSON.stringify(value)}`);
    this.reparse();
    return true;
  }

  /** True when the array at `path` is written on a single line. */
  isInline(path) {
    const node = this.nodeAt(path);
    if (!node || node.type !== "array") return false;
    return !this.text.slice(node.start, node.end).includes("\n");
  }

  /** Inserts at `index` in the array at `path`. Returns the index. */
  insertAt(path, index, value) {
    const node = this.nodeAt(path);
    if (!node || node.type !== "array") throw new Error(`Not an array: ${JSON.stringify(path)}`);
    const at = Math.max(0, Math.min(node.items.length, index));
    if (at === node.items.length) return this.append(path, value);

    const rendered = renderValue(value, this.indent, this.eol, 0);

    if (node.items.length === 0) {
      this.text = this.text.slice(0, node.start + 1) + rendered + this.text.slice(node.start + 1);
    } else if (this.isInline(path)) {
      const target = node.items[at];
      this.text = this.text.slice(0, target.start) + rendered + ", " + this.text.slice(target.start);
    } else {
      const itemIndent = childIndentOf(this.text, node) || lineIndentAt(this.text, node.start) + this.indent;
      if (at === 0) {
        // Before the first item: the new item needs its own indent and comma.
        const target = node.items[0];
        this.text =
          this.text.slice(0, target.start) + rendered + "," + this.eol + itemIndent + this.text.slice(target.start);
      } else {
        // After the previous item, which is where the comma already lives.
        const prev = node.items[at - 1];
        const snippet = "," + this.eol + itemIndent + rendered;
        this.text = this.text.slice(0, prev.end) + snippet + this.text.slice(prev.end);
      }
    }

    this.dirty = true;
    this.log.push(`insertAt ${JSON.stringify(path)}[${at}] <- ${JSON.stringify(value)}`);
    this.reparse();
    return at;
  }

  /** Appends to the array at `path`. Returns the new index. */
  append(path, value) {
    const node = this.nodeAt(path);
    if (!node || node.type !== "array") throw new Error(`Not an array: ${JSON.stringify(path)}`);
    const rendered = renderValue(value, this.indent, this.eol, 0);
    const wasEmpty = node.items.length === 0;

    if (wasEmpty) {
      this.text = this.text.slice(0, node.start + 1) + rendered + this.text.slice(node.start + 1);
    } else if (this.isInline(path)) {
      // Insert after the last item, not before the closing bracket, so any space
      // before `]` is left alone.
      const last = node.items[node.items.length - 1];
      this.text = this.text.slice(0, last.end) + ", " + rendered + this.text.slice(last.end);
    } else {
      // Insert after the LAST ITEM's value, so the comma lands between the old
      // last item and the new one (not after the new one).
      const last = node.items[node.items.length - 1];
      const itemIndent = childIndentOf(this.text, node) || lineIndentAt(this.text, node.start) + this.indent;
      const snippet = "," + this.eol + itemIndent + rendered;
      this.text = this.text.slice(0, last.end) + snippet + this.text.slice(last.end);
    }

    this.dirty = true;
    this.log.push(`append ${JSON.stringify(path)} <- ${JSON.stringify(value)}`);
    this.reparse();
    return wasEmpty ? 0 : node.items.length;
  }

  /** Removes index `index` from the array at `path`. */
  removeAt(path, index) {
    const node = this.nodeAt(path);
    if (!node || node.type !== "array") throw new Error(`Not an array: ${JSON.stringify(path)}`);
    if (index < 0 || index >= node.items.length) throw new Error(`Index ${index} out of range`);

    const item = node.items[index];
    const isLast = index === node.items.length - 1;

    if (node.items.length === 1) {
      this.text = this.text.slice(0, node.start) + "[]" + this.text.slice(node.end);
    } else if (this.isInline(path)) {
      // Drop the value plus the separator that follows it (or precedes it, when last).
      if (isLast) {
        this.text = this.text.slice(0, node.items[index - 1].end) + this.text.slice(item.end);
      } else {
        this.text = this.text.slice(0, item.start) + this.text.slice(node.items[index + 1].start);
      }
    } else if (isLast) {
      // Remove the separator that PRECEDES the item, keeping the newline that
      // follows it so the closing bracket stays on its own line.
      this.text = this.text.slice(0, node.items[index - 1].end) + this.text.slice(item.end);
    } else {
      // Remove the item plus its trailing comma, newline and indent.
      this.text = this.text.slice(0, item.start) + this.text.slice(node.items[index + 1].start);
    }

    this.dirty = true;
    this.log.push(`removeAt ${JSON.stringify(path)}[${index}]`);
    this.reparse();
  }

  /** Adds a property to the object at `path`, or replaces it when present. */
  setProperty(path, key, value) {
    const node = this.nodeAt(path);
    if (!node || node.type !== "object") throw new Error(`Not an object: ${JSON.stringify(path)}`);
    if (node.entries.some((e) => e.key === key)) return this.set([...path, key], value);

    const rendered = renderValue(value, this.indent, this.eol, 0);
    const snippet = `${JSON.stringify(key)}: ${rendered}`;

    if (node.entries.length === 0) {
      this.text = this.text.slice(0, node.start + 1) + snippet + this.text.slice(node.start + 1);
    } else if (!this.text.slice(node.start, node.end).includes("\n")) {
      // Inline object: insert right after the last value, so the separator lands
      // between the old last property and the new one. Inserting before the
      // closing brace instead would move the existing space (`"x" ,`).
      const last = node.entries[node.entries.length - 1];
      this.text = this.text.slice(0, last.value.end) + ", " + snippet + this.text.slice(last.value.end);
    } else {
      // Same rule as append: insert after the LAST entry's value so the comma
      // ends up between the old last property and the new one.
      const last = node.entries[node.entries.length - 1];
      const itemIndent = childIndentOf(this.text, node) || lineIndentAt(this.text, node.start) + this.indent;
      const insert = "," + this.eol + itemIndent + snippet;
      this.text = this.text.slice(0, last.value.end) + insert + this.text.slice(last.value.end);
    }

    this.dirty = true;
    this.log.push(`setProperty ${JSON.stringify(path)}.${key}`);
    this.reparse();
    return true;
  }

  /**
   * Moves the property `key` to `toIndex` among its siblings.
   *
   * A reorder cannot be expressed as a range replacement, so the object body is
   * reassembled from the existing entry sources: each entry's own text is reused
   * verbatim, and only the glue between entries is re-emitted. When the glue is
   * uniform (which it is in every shipped file) moving a property and moving it
   * back leaves the file byte-identical.
   */
  reorderProperty(path, key, toIndex) {
    const node = this.nodeAt(path);
    if (!node || node.type !== "object") throw new Error(`Not an object: ${JSON.stringify(path)}`);

    const keys = node.entries.map((e) => e.key);
    const from = keys.indexOf(key);
    if (from === -1) return false;
    const to = Math.max(0, Math.min(node.entries.length - 1, toIndex));
    if (from === to) return false;

    // Entry sources, verbatim: from the key to the end of its value.
    const entries = node.entries.map((e) => this.text.slice(e.keyStart, e.value.end));

    // Glue: what sits between the opening brace and the first key, between each
    // pair of entries, and between the last entry and the closing brace.
    const opening = this.text.slice(node.start + 1, node.entries[0].keyStart);
    const closing = this.text.slice(node.entries[node.entries.length - 1].value.end, node.end - 1);
    const separators = [];
    for (let i = 1; i < node.entries.length; i++) {
      separators.push(this.text.slice(node.entries[i - 1].value.end, node.entries[i].keyStart));
    }

    // Use the separator already used at the destination, so the result matches
    // the surrounding style even if the file mixes separators.
    const separator = separators.length > 0 ? separators[Math.min(to, separators.length - 1)] : "," + this.eol;

    const order = keys.slice();
    order.splice(from, 1);
    order.splice(to, 0, key);

    const byKey = new Map(keys.map((k, i) => [k, entries[i]]));
    const body = order.map((k) => byKey.get(k)).join(separator);

    this.text =
      this.text.slice(0, node.start + 1) + opening + body + closing + this.text.slice(node.end - 1);

    this.dirty = true;
    this.log.push(`reorderProperty ${JSON.stringify(path)}.${key} -> ${to}`);
    this.reparse();
    return true;
  }

  /**
   * Moves item `from` to `to` inside the array at `path`.
   *
   * Same approach as reorderProperty: each item's own source is reused verbatim
   * and only the glue between items is re-emitted, so moving an item and moving
   * it back leaves the file byte-identical.
   */
  reorderAt(path, from, to) {
    const node = this.nodeAt(path);
    if (!node || node.type !== "array") throw new Error(`Not an array: ${JSON.stringify(path)}`);

    const count = node.items.length;
    if (from < 0 || from >= count) return false;
    const target = Math.max(0, Math.min(count - 1, to));
    if (from === target) return false;

    const items = node.items.map((item) => this.text.slice(item.start, item.end));
    const opening = this.text.slice(node.start + 1, node.items[0].start);
    const closing = this.text.slice(node.items[count - 1].end, node.end - 1);
    const separators = [];
    for (let i = 1; i < count; i++) {
      separators.push(this.text.slice(node.items[i - 1].end, node.items[i].start));
    }

    // Use the separator already used at the destination, so the result matches
    // the surrounding style even if the array mixes separators.
    const separator = separators.length > 0 ? separators[Math.min(target, separators.length - 1)] : "," + this.eol;

    const order = node.items.map((_, i) => i);
    order.splice(from, 1);
    order.splice(target, 0, from);

    this.text =
      this.text.slice(0, node.start + 1) +
      opening +
      order.map((i) => items[i]).join(separator) +
      closing +
      this.text.slice(node.end - 1);

    this.dirty = true;
    this.log.push(`reorderAt ${JSON.stringify(path)} ${from} -> ${target}`);
    this.reparse();
    return true;
  }

  /** Deletes the property `key` from the object at `path`. */
  deleteProperty(path, key) {
    const node = this.nodeAt(path);
    if (!node || node.type !== "object") throw new Error(`Not an object: ${JSON.stringify(path)}`);
    const idx = node.entries.findIndex((e) => e.key === key);
    if (idx === -1) return false;
    const entry = node.entries[idx];

    if (node.entries.length === 1) {
      this.text = this.text.slice(0, node.start) + "{}" + this.text.slice(node.end);
    } else if (idx === node.entries.length - 1) {
      // Drop the comma before it, keep the newline before the closing brace.
      this.text = this.text.slice(0, node.entries[idx - 1].value.end) + this.text.slice(entry.value.end);
    } else {
      // Drop the property and everything up to the next key's line.
      this.text = this.text.slice(0, entry.keyStart) + this.text.slice(node.entries[idx + 1].keyStart);
    }

    this.dirty = true;
    this.log.push(`deleteProperty ${JSON.stringify(path)}.${key}`);
    this.reparse();
    return true;
  }

  toString() {
    return this.text;
  }

  changedFromOriginal() {
    return this.text !== this.original;
  }
}
