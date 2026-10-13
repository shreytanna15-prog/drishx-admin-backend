import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PdfDocument,
  measureText,
  toWinAnsi,
  truncateText,
  wrapText,
} from "./simple-pdf";

/** Parse the xref table and assert each offset points at "N 0 obj". */
function assertValidXref(buf: Buffer): number {
  const s = buf.toString("latin1");
  const startxref = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(s);
  assert.ok(startxref, "startxref present");
  const xrefAt = Number(startxref[1]);
  assert.equal(s.slice(xrefAt, xrefAt + 4), "xref");
  const head = /^xref\n0 (\d+)\n/.exec(s.slice(xrefAt));
  assert.ok(head);
  const count = Number(head[1]);
  let pos = xrefAt + head[0].length;
  for (let n = 0; n < count; n++) {
    const entry = s.slice(pos, pos + 20);
    assert.match(entry, /^\d{10} \d{5} [nf] \n$/);
    if (n > 0) {
      const off = Number(entry.slice(0, 10));
      assert.equal(s.slice(off, off + `${n} 0 obj`.length), `${n} 0 obj`, `object ${n}`);
    }
    pos += 20;
  }
  const size = /\/Size (\d+)/.exec(s.slice(pos));
  assert.equal(Number(size?.[1]), count);
  return count;
}

function pageCount(buf: Buffer): number {
  const m = /\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(buf.toString("latin1"));
  assert.ok(m);
  return Number(m[1]);
}

describe("PdfDocument", () => {
  it("writes a structurally valid PDF with correct xref", () => {
    const doc = new PdfDocument({ title: "Test" });
    const p1 = doc.addPage();
    p1.text(40, 60, "Hello", { size: 12, bold: true });
    p1.line(40, 70, 200, 70, { width: 1, color: "#ff0000" });
    p1.rect(40, 80, 100, 20, { fill: "#eeeeee", stroke: "#000" });
    doc.addPage().text(40, 60, "Second", { align: "right" });
    doc.addPage();
    const buf = doc.toBuffer();
    const s = buf.toString("latin1");
    assert.ok(s.startsWith("%PDF-1.4"));
    assert.ok(s.trimEnd().endsWith("%%EOF"));
    assertValidXref(buf);
    assert.equal(pageCount(buf), 3);
    assert.match(s, /\/BaseFont \/Helvetica \/Encoding \/WinAnsiEncoding/);
    assert.match(s, /\/BaseFont \/Helvetica-Bold \/Encoding \/WinAnsiEncoding/);
    assert.match(s, /\/Producer \(DrishX\)/);
  });

  it("verifies /Length of each content stream", () => {
    const doc = new PdfDocument();
    doc.addPage().text(10, 20, "Stream (length) check \\ ok");
    const s = doc.toBuffer().toString("latin1");
    const re = /<< \/Length (\d+) >>\nstream\n/g;
    let m: RegExpExecArray | null;
    let seen = 0;
    while ((m = re.exec(s))) {
      const start = m.index + m[0].length;
      assert.equal(s.slice(start + Number(m[1]), start + Number(m[1]) + 9), "endstream");
      seen++;
    }
    assert.equal(seen, 1);
  });

  it("escapes parentheses and backslashes", () => {
    const doc = new PdfDocument();
    doc.addPage().text(10, 20, "a(b)c\\d");
    const s = doc.toBuffer().toString("latin1");
    assert.ok(s.includes("(a\\(b\\)c\\\\d) Tj"));
  });

  it("replaces non-WinAnsi characters and never emits raw high bytes", () => {
    const doc = new PdfDocument();
    doc.addPage().text(10, 20, "₹ 500 — “ok” − 2 × 3 · 中");
    const buf = doc.toBuffer();
    const s = buf.toString("latin1");
    assert.ok(s.includes('(Rs. 500 - "ok" - 2 \\327 3 \\267 ?) Tj'));
    // Only the binary marker comment line contains bytes > 0x7e.
    const afterHeader = buf.subarray(buf.indexOf("\n", 9) + 1);
    assert.ok(afterHeader.every((b) => b < 0x7f));
  });

  it("toWinAnsi is idempotent", () => {
    const once = toWinAnsi("€ • ™ café ā");
    assert.equal(toWinAnsi(once), once);
    assert.equal(once, "\x80 \x95 \x99 café a");
  });
});

describe("text metrics", () => {
  it("measureText uses AFM widths and is monotonic", () => {
    assert.equal(measureText("A", 1000), 667);
    assert.equal(measureText("A", 1000, true), 722);
    assert.equal(measureText("Hello", 10), (722 + 556 + 222 + 222 + 556) / 100);
    let prev = 0;
    const str = "The quick brown fox jumps over 13 lazy dogs!";
    for (let i = 1; i <= str.length; i++) {
      const w = measureText(str.slice(0, i), 9);
      assert.ok(w > prev);
      prev = w;
    }
    assert.ok(measureText("Bold text", 10, true) > measureText("Bold text", 10));
  });

  it("wrapText respects maxWidth", () => {
    const text =
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Supercalifragilisticexpialidociousword and more words\nNew paragraph here.";
    for (const maxWidth of [40, 80, 150, 300]) {
      const lines = wrapText(text, maxWidth, 9);
      assert.ok(lines.length > 1);
      for (const l of lines) assert.ok(measureText(l, 9) <= maxWidth, `${l} > ${maxWidth}`);
      assert.equal(lines.join(" ").replace(/\s+/g, ""), text.replace(/\s+/g, ""));
    }
  });

  it("truncateText adds ellipsis and fits", () => {
    const t = truncateText("A very long product name that cannot fit", 60, 8);
    assert.ok(t.endsWith("..."));
    assert.ok(measureText(t, 8) <= 60);
    assert.equal(truncateText("Short", 60, 8), "Short");
  });
});
