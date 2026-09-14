export type FieldChange = {
  field: string;
  before: unknown;
  after: unknown;
};

function serialize(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === "object" && value !== null && "toString" in value) {
    const s = String(value);
    if (s !== "[object Object]") return s;
  }
  return value;
}

export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
  fields: (keyof T)[]
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of fields) {
    const b = serialize(before[field]);
    const a = serialize(after[field]);
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changes.push({ field: String(field), before: b, after: a });
    }
  }
  return changes;
}

export function singleChange(
  field: string,
  before: unknown,
  after: unknown
): FieldChange[] {
  if (JSON.stringify(serialize(before)) === JSON.stringify(serialize(after))) {
    return [];
  }
  return [{ field, before: serialize(before), after: serialize(after) }];
}
