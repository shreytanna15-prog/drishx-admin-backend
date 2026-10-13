/**
 * Minimal, dependency-free PDF 1.4 writer.
 *
 * - A4 portrait pages (595.28 x 841.89 pt).
 * - Standard (non-embedded) Type1 fonts Helvetica / Helvetica-Bold with
 *   WinAnsiEncoding. Only WinAnsi characters can be printed; other characters
 *   are mapped to ASCII look-alikes (e.g. "₹" -> "Rs.") or "?".
 * - Coordinate convention of this API: origin at the TOP-LEFT corner of the
 *   page, y grows downwards, units are points. For `text`, `y` is the text
 *   BASELINE measured from the top edge. For `rect`, `(x, y)` is the top-left
 *   corner. Conversion to PDF's bottom-left origin happens internally.
 * - Content streams are uncompressed (plain ASCII; non-ASCII glyph bytes are
 *   written as octal escapes), which keeps the output easy to inspect/test.
 */

export const A4_WIDTH = 595.28;
export const A4_HEIGHT = 841.89;

export type PdfColor = string | readonly [number, number, number];

export type TextOptions = {
  size?: number;
  bold?: boolean;
  color?: PdfColor;
  align?: "left" | "right" | "center";
  /** When set, text wider than this is truncated with "...". */
  maxWidth?: number;
};

export type LineOptions = { width?: number; color?: PdfColor };

export type RectOptions = {
  fill?: PdfColor;
  stroke?: PdfColor;
  lineWidth?: number;
};

// ---------------------------------------------------------------------------
// Font metrics (Adobe Core14 AFM widths, 1/1000 em) for WinAnsi 32..126.
// ---------------------------------------------------------------------------

// prettier-ignore
const HELVETICA_ASCII: readonly number[] = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, // 32-47
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, // 48-63
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, // 64-79
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, // 80-95
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, // 96-111
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,      // 112-126
];

// prettier-ignore
const HELVETICA_BOLD_ASCII: readonly number[] = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, // 32-47
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, // 48-63
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, // 64-79
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, // 80-95
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, // 96-111
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,      // 112-126
];

/** A few common upper-range WinAnsi glyphs (same in both weights). */
const UPPER_WIDTHS: Record<number, number> = {
  0x80: 556, // Euro
  0x85: 1000, // ellipsis
  0x95: 350, // bullet
  0x99: 1000, // trademark
  0xa0: 278, // nbsp
  0xa9: 737, // copyright
  0xae: 737, // registered
  0xb0: 400, // degree
  0xb1: 584, // plusminus
  0xb7: 278, // periodcentered
  0xd7: 584, // multiply
};

const DEFAULT_WIDTH = 556;

function glyphWidth(byte: number, bold: boolean): number {
  if (byte >= 32 && byte <= 126) {
    return (bold ? HELVETICA_BOLD_ASCII : HELVETICA_ASCII)[byte - 32]!;
  }
  return UPPER_WIDTHS[byte] ?? DEFAULT_WIDTH;
}

// ---------------------------------------------------------------------------
// WinAnsi normalisation
// ---------------------------------------------------------------------------

/** Characters replaced with ASCII equivalents before encoding. */
const REPLACEMENTS: Record<string, string> = {
  "₹": "Rs.", // ₹
  "‘": "'",
  "’": "'",
  "‚": "'",
  "‛": "'",
  "′": "'",
  "“": '"',
  "”": '"',
  "„": '"',
  "‟": '"',
  "″": '"',
  "‐": "-",
  "‑": "-",
  "‒": "-",
  "–": "-",
  "—": "-",
  "―": "-",
  "−": "-", // minus sign
  "…": "...",
  " ": " ",
  " ": " ",
  " ": " ",
  "​": "",
  "﻿": "",
};

/** Unicode -> WinAnsi byte for the 0x80-0x9F block. */
const WIN_ANSI_HIGH: Record<number, number> = {
  0x20ac: 0x80,
  0x0192: 0x83,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2022: 0x95,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

const WIN_ANSI_HIGH_BYTES = new Set<number>(Object.values(WIN_ANSI_HIGH));

/**
 * Normalise arbitrary text to a "WinAnsi string": every char code is a
 * WinAnsi byte in 0x20..0xFF. Whitespace controls become spaces, unknown
 * characters become "?".
 */
export function toWinAnsi(input: string): string {
  let out = "";
  for (const ch of input) {
    const rep = REPLACEMENTS[ch];
    if (rep !== undefined) {
      out += rep;
      continue;
    }
    const cp = ch.codePointAt(0)!;
    if (cp === 0x09 || cp === 0x0a || cp === 0x0d) out += " ";
    else if (cp < 0x20 || cp === 0x7f) continue;
    else if (cp < 0x7f) out += ch;
    else if (cp >= 0xa0 && cp <= 0xff) out += ch;
    else if (WIN_ANSI_HIGH_BYTES.has(cp)) {
      // Already a WinAnsi byte (keeps toWinAnsi idempotent).
      out += ch;
    } else if (WIN_ANSI_HIGH[cp] !== undefined) {
      out += String.fromCharCode(WIN_ANSI_HIGH[cp]!);
    } else {
      // Try stripping diacritics (e.g. "ā" -> "a") before giving up.
      const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      out += base && /^[\x20-\x7e]+$/.test(base) ? base : "?";
    }
  }
  return out;
}

/** Width of `str` in points at `size` (str is normalised first). */
export function measureText(str: string, size: number, bold = false): number {
  const s = toWinAnsi(str);
  let units = 0;
  for (let i = 0; i < s.length; i++) units += glyphWidth(s.charCodeAt(i), bold);
  return (units * size) / 1000;
}

/** Truncate with "..." so the result fits within `maxWidth`. */
export function truncateText(
  str: string,
  maxWidth: number,
  size: number,
  bold = false
): string {
  const s = toWinAnsi(str);
  if (measureText(s, size, bold) <= maxWidth) return s;
  const ellipsis = "...";
  const ellW = measureText(ellipsis, size, bold);
  if (ellW > maxWidth) return "";
  let w = 0;
  let i = 0;
  for (; i < s.length; i++) {
    const cw = (glyphWidth(s.charCodeAt(i), bold) * size) / 1000;
    if (w + cw + ellW > maxWidth) break;
    w += cw;
  }
  return s.slice(0, i).trimEnd() + ellipsis;
}

/**
 * Greedy word-wrap. Explicit newlines start new lines; words wider than
 * `maxWidth` are broken by character. Every returned line fits `maxWidth`
 * (except when a single glyph is wider than maxWidth).
 */
export function wrapText(
  str: string,
  maxWidth: number,
  size: number,
  bold = false
): string[] {
  const lines: string[] = [];
  const fits = (s: string) => measureText(s, size, bold) <= maxWidth;
  for (const paragraph of str.split(/\r?\n/)) {
    const words = toWinAnsi(paragraph).split(" ").filter((w) => w.length > 0);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (let word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (fits(candidate)) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      current = "";
      // Break over-long words by character.
      while (!fits(word)) {
        let cut = 1;
        while (cut < word.length && fits(word.slice(0, cut + 1))) cut++;
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      current = word;
    }
    if (current) lines.push(current);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
}

function colorComponents(color: PdfColor): [number, number, number] {
  if (typeof color !== "string") return [color[0], color[1], color[2]];
  let hex = color.replace(/^#/, "");
  if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
  const n = Number.parseInt(hex, 16);
  if (hex.length !== 6 || Number.isNaN(n)) return [0, 0, 0];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function colorOp(color: PdfColor, stroke: boolean): string {
  const [r, g, b] = colorComponents(color);
  return `${fmt(r)} ${fmt(g)} ${fmt(b)} ${stroke ? "RG" : "rg"}`;
}

/** Escape a WinAnsi string for a PDF literal string (ASCII-only output). */
function pdfLiteral(winAnsi: string): string {
  let out = "(";
  for (let i = 0; i < winAnsi.length; i++) {
    const c = winAnsi.charCodeAt(i);
    const ch = winAnsi[i]!;
    if (ch === "\\" || ch === "(" || ch === ")") out += `\\${ch}`;
    else if (c < 0x20 || c > 0x7e) out += `\\${c.toString(8).padStart(3, "0")}`;
    else out += ch;
  }
  return out + ")";
}

export class PdfPage {
  readonly width = A4_WIDTH;
  readonly height = A4_HEIGHT;
  private readonly ops: string[] = [];

  text(x: number, y: number, str: string, opts: TextOptions = {}): void {
    const size = opts.size ?? 10;
    const bold = opts.bold ?? false;
    let s = toWinAnsi(str);
    if (opts.maxWidth !== undefined) s = truncateText(s, opts.maxWidth, size, bold);
    if (!s) return;
    const w = measureText(s, size, bold);
    let px = x;
    if (opts.align === "right") px = x - w;
    else if (opts.align === "center") px = x - w / 2;
    this.ops.push(
      "BT",
      colorOp(opts.color ?? "#000000", false),
      `/${bold ? "F2" : "F1"} ${fmt(size)} Tf`,
      `${fmt(px)} ${fmt(this.height - y)} Td`,
      `${pdfLiteral(s)} Tj`,
      "ET"
    );
  }

  line(x1: number, y1: number, x2: number, y2: number, opts: LineOptions = {}): void {
    this.ops.push(
      colorOp(opts.color ?? "#000000", true),
      `${fmt(opts.width ?? 0.5)} w`,
      `${fmt(x1)} ${fmt(this.height - y1)} m ${fmt(x2)} ${fmt(this.height - y2)} l S`
    );
  }

  rect(x: number, y: number, w: number, h: number, opts: RectOptions = {}): void {
    const path = `${fmt(x)} ${fmt(this.height - y - h)} ${fmt(w)} ${fmt(h)} re`;
    if (opts.fill && opts.stroke) {
      this.ops.push(
        colorOp(opts.fill, false),
        colorOp(opts.stroke, true),
        `${fmt(opts.lineWidth ?? 0.5)} w`,
        `${path} B`
      );
    } else if (opts.fill) {
      this.ops.push(colorOp(opts.fill, false), `${path} f`);
    } else {
      this.ops.push(
        colorOp(opts.stroke ?? "#000000", true),
        `${fmt(opts.lineWidth ?? 0.5)} w`,
        `${path} S`
      );
    }
  }

  /** @internal */
  contentStream(): string {
    return this.ops.join("\n") + "\n";
  }
}

export type PdfDocumentInfo = { title?: string; author?: string; subject?: string };

export class PdfDocument {
  private readonly pages: PdfPage[] = [];

  constructor(private readonly info: PdfDocumentInfo = {}) {}

  addPage(): PdfPage {
    const page = new PdfPage();
    this.pages.push(page);
    return page;
  }

  get pageCount(): number {
    return this.pages.length;
  }

  getPages(): readonly PdfPage[] {
    return this.pages;
  }

  toBuffer(): Buffer {
    if (this.pages.length === 0) this.addPage();

    // Object numbering: 1 Catalog, 2 Pages, 3 F1, 4 F2, 5 Info, then
    // (page, content) pairs.
    const objects: string[] = [];
    const pageObjNum = (i: number) => 6 + i * 2;
    const kids = this.pages.map((_, i) => `${pageObjNum(i)} 0 R`).join(" ");

    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${this.pages.length} >>`;
    objects[3] =
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    objects[4] =
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
    const infoParts = [`/Producer ${pdfLiteral(toWinAnsi("DrishX"))}`];
    if (this.info.title) infoParts.push(`/Title ${pdfLiteral(toWinAnsi(this.info.title))}`);
    if (this.info.author) infoParts.push(`/Author ${pdfLiteral(toWinAnsi(this.info.author))}`);
    if (this.info.subject) infoParts.push(`/Subject ${pdfLiteral(toWinAnsi(this.info.subject))}`);
    objects[5] = `<< ${infoParts.join(" ")} >>`;

    this.pages.forEach((page, i) => {
      const num = pageObjNum(i);
      objects[num] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(A4_WIDTH)} ${fmt(A4_HEIGHT)}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${num + 1} 0 R >>`;
      const stream = page.contentStream();
      // Stream content is pure ASCII, so string length == byte length.
      objects[num + 1] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}endstream`;
    });

    const size = objects.length; // highest object number + 1
    const chunks: Buffer[] = [];
    let offset = 0;
    const push = (s: string) => {
      const b = Buffer.from(s, "latin1");
      chunks.push(b);
      offset += b.length;
    };
    // Header + binary comment marker (recommended for files with binary data).
    push("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
    const offsets: number[] = [];
    for (let n = 1; n < size; n++) {
      offsets[n] = offset;
      push(`${n} 0 obj\n${objects[n]}\nendobj\n`);
    }
    const xrefOffset = offset;
    let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
    for (let n = 1; n < size; n++) {
      xref += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
    }
    push(xref);
    push(`trailer\n<< /Size ${size} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
    return Buffer.concat(chunks);
  }
}
