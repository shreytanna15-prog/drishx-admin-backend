import fs from "fs";
import path from "path";
import { applyProgressiveAxis } from "../app/lib/progressive-axis";

type ProgressiveSeedRow = {
  category: string;
  item: string;
  brand: string;
  index: string;
  type: string;
  coating: string;
  sph: string;
  cyl: string | null;
  axis: number | null;
  add: string;
  eye: string;
  price: string;
  quantity: number;
};

function formatRow(row: ProgressiveSeedRow): string {
  const cyl = row.cyl == null ? "null" : `'${row.cyl}'`;
  const axis = row.axis == null ? "null" : String(row.axis);
  return `    { category: '${row.category}', item: '${row.item}', brand: '${row.brand}', index: '${row.index}', type: '${row.type}', coating: '${row.coating}', sph: '${row.sph}', cyl: ${cyl}, axis: ${axis}, add: '${row.add}', eye: '${row.eye}', price: '${row.price}', quantity: ${row.quantity} }`;
}

function main() {
  const seedPath = path.join(__dirname, "seed.ts");
  const source = fs.readFileSync(seedPath, "utf8");
  const match = source.match(
    /const progressiveLensData = \[([\s\S]*?)\];\s*\r?\n\s*const bifocalLensData/
  );

  if (!match || match.index == null) {
    throw new Error("Could not find progressiveLensData array in prisma/seed.ts");
  }

  const rows = new Function(`return [${match[1]}]`)() as ProgressiveSeedRow[];
  const patched = rows.map((row) => applyProgressiveAxis(row));

  const withAxis = patched.filter((row) => row.axis != null).length;
  const beforeAxis = rows.filter((row) => row.axis != null).length;

  const header = "  const progressiveLensData = [\n";
  const body = patched.map((row) => `${formatRow(row)},`).join("\n");
  const footer = "\n  ];";

  const replacement = `${header}${body}${footer}\n\n  const bifocalLensData`;
  const updated =
    source.slice(0, match.index) +
    replacement +
    source.slice(match.index + match[0].length);

  fs.writeFileSync(seedPath, updated, "utf8");
  console.log(
    `Patched progressiveLensData: ${rows.length} rows, axis set on ${withAxis - beforeAxis} new rows (${withAxis} total with axis).`
  );
}

main();
