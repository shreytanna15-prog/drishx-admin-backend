import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("adminAuthFetch refresh gate (RW-01)", () => {
  it("skips silent refresh for account/permission 401 codes", () => {
    const src = readFileSync(
      join(process.cwd(), "app/lib/admin-auth-fetch.ts"),
      "utf8"
    );
    assert.match(src, /NON_REFRESHABLE_401_CODES/);
    assert.match(src, /ACCOUNT_INACTIVE/);
    assert.match(src, /FORBIDDEN/);
    assert.match(src, /MISSING_PERMISSION/);
    assert.match(src, /responseAuthCode/);
  });

  it("retries refresh once after transient before surfacing 401", () => {
    const src = readFileSync(
      join(process.cwd(), "app/lib/admin-auth-fetch.ts"),
      "utf8"
    );
    assert.match(src, /outcome\.status === "transient"/);
    assert.match(src, /setTimeout\(r, 400\)/);
    assert.match(src, /second refresh|backoff|transient/i);
  });
});
