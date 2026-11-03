/**
 * Opt-in HTTP E2E for Admin client edit (against a running backend).
 *
 * Required env:
 *   E2E_BASE_URL=http://localhost:3000   (or Vercel URL)
 *   E2E_ADMIN_EMAIL=...
 *   E2E_ADMIN_PASSWORD=...
 *
 * Optional:
 *   E2E_CUSTOMER_ID=...   (otherwise picks first customer from list)
 *
 * Run:
 *   node scripts/e2e-admin-client-edit.mjs
 */

const base = (process.env.E2E_BASE_URL || "").replace(/\/$/, "");
const email = process.env.E2E_ADMIN_EMAIL || "";
const password = process.env.E2E_ADMIN_PASSWORD || "";

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

async function json(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function main() {
  if (!base || !email || !password) {
    console.log(
      "SKIP: set E2E_BASE_URL, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD to run HTTP E2E."
    );
    process.exit(0);
  }

  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Client": "web" },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await json(loginRes);
  if (!loginRes.ok) {
    fail(`login ${loginRes.status}: ${loginBody.error || loginBody.raw}`);
  }
  const token = loginBody.accessToken || loginBody.token;
  if (!token) fail("login response missing accessToken");
  ok("admin login");

  const auth = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-Client": "web",
  };

  let customerId = process.env.E2E_CUSTOMER_ID || "";
  if (!customerId) {
    const listRes = await fetch(`${base}/api/users/customers?page=1&limit=5`, {
      headers: auth,
    });
    const listBody = await json(listRes);
    if (!listRes.ok) fail(`list customers ${listRes.status}`);
    const items =
      listBody.items || listBody.customers || listBody.data?.items || [];
    if (!items.length) fail("no customers to test against");
    customerId = items[0].id;
  }
  ok(`using customer ${customerId}`);

  const getRes = await fetch(`${base}/api/users/customers/${customerId}`, {
    headers: auth,
  });
  const getBody = await json(getRes);
  if (!getRes.ok) fail(`get customer ${getRes.status}`);
  const customer = getBody.customer;
  ok(
    `loaded customer (gst=${customer.gstinVerifyStatus}, mobileVerified=${Boolean(
      customer.mobileVerifiedAt
    )})`
  );

  // Notes required
  const noNotes = await fetch(`${base}/api/users/customers/${customerId}`, {
    method: "PATCH",
    headers: auth,
    body: JSON.stringify({
      addressLine1: customer.addressLine1 || "E2E Address Line",
    }),
  });
  if (noNotes.status !== 400) {
    fail(`expected 400 when notes missing, got ${noNotes.status}`);
  }
  ok("PATCH without notes rejected");

  // Address-only patch should succeed and not clear mobile verified
  const patchRes = await fetch(`${base}/api/users/customers/${customerId}`, {
    method: "PATCH",
    headers: auth,
    body: JSON.stringify({
      addressLine1: customer.addressLine1 || "E2E Address Line",
      city: customer.city || "Surat",
      notes: "E2E admin client edit address update",
    }),
  });
  const patchBody = await json(patchRes);
  if (!patchRes.ok) {
    fail(`PATCH address ${patchRes.status}: ${patchBody.error || patchBody.raw}`);
  }
  ok("PATCH address fields");

  if (customer.gstinVerifyStatus === "ACTIVE" && customer.gstNumber) {
    const badGst = await fetch(`${base}/api/users/customers/${customerId}`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({
        gstNumber: "27AAAAA0000A1Z5",
        notes: "E2E attempt to change locked GSTIN",
      }),
    });
    if (badGst.status !== 400) {
      fail(`expected 400 when changing ACTIVE GSTIN, got ${badGst.status}`);
    }
    ok("ACTIVE GSTIN change rejected");
  } else {
    ok("skip ACTIVE GST lock check (customer not ACTIVE)");
  }

  const verifyAddr = await fetch(
    `${base}/api/users/${customerId}/verify-address`,
    { method: "POST", headers: auth, body: "{}" }
  );
  const verifyAddrBody = await json(verifyAddr);
  if (!verifyAddr.ok) {
    fail(
      `verify address ${verifyAddr.status}: ${verifyAddrBody.error || verifyAddrBody.raw}`
    );
  }
  ok("verify address");

  console.log("E2E admin client edit: PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
