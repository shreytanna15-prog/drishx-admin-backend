/**
 * API e2e smoke for lens catalog (attributes + LensProduct).
 * Requires: next server running, DATABASE_URL, ADMIN_CREATION_SECRET or existing admin.
 *
 * Usage:
 *   node scripts/lens-catalog-e2e-smoke.mjs
 *   BASE_URL=http://localhost:3000 node scripts/lens-catalog-e2e-smoke.mjs
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const EMAIL = process.env.E2E_ADMIN_EMAIL || "lens-catalog-e2e@drishx.local";
const PASSWORD = process.env.E2E_ADMIN_PASSWORD || "E2eCatalog!Test99";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function ensureAdmin() {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        password: hash,
        role: "ADMIN",
        isActive: true,
        isApproved: true,
        approvalStatus: "APPROVED",
      },
    });
    return;
  }
  await prisma.user.create({
    data: {
      email: EMAIL,
      password: hash,
      name: "Lens Catalog E2E",
      role: "ADMIN",
      isActive: true,
      isApproved: true,
      approvalStatus: "APPROVED",
    },
  });
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = await res.json().catch(() => ({}));
  assert(res.ok, `login failed ${res.status}: ${JSON.stringify(json)}`);
  const token = json.accessToken || json.token || json.access_token;
  assert(token, `no access token in login response: ${JSON.stringify(json)}`);
  return token;
}

async function api(token, path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function main() {
  console.log(`E2E smoke against ${BASE}`);
  await ensureAdmin();
  const token = await login();
  console.log("✓ login");

  const { res: attrRes, json: attrJson } = await api(
    token,
    "/api/admin/catalog/attributes/family?activeOnly=true"
  );
  assert(attrRes.ok, `attributes family ${attrRes.status}`);
  assert(Array.isArray(attrJson.items) && attrJson.items.length > 0, "no families");
  console.log(`✓ attributes family (${attrJson.items.length})`);

  const { res: compatRes, json: compatJson } = await api(
    token,
    "/api/admin/catalog/attributes/compatibility"
  );
  assert(compatRes.ok, `compatibility ${compatRes.status}`);
  assert(Array.isArray(compatJson.bases) && compatJson.bases.length > 0, "no compat");
  console.log(`✓ compatibility (${compatJson.bases.length} bases)`);

  const { json: families } = await api(
    token,
    "/api/admin/catalog/attributes/family?activeOnly=true"
  );
  const { json: bases } = await api(
    token,
    "/api/admin/catalog/attributes/base?activeOnly=true"
  );
  const { json: materials } = await api(
    token,
    "/api/admin/catalog/attributes/material?activeOnly=true"
  );
  const family = families.items.find((f) => f.code === "SV");
  const base = bases.items.find((b) => b.code === "HC");
  const material = materials.items.find((m) => m.code === "PLAIN");
  assert(family && base && material, "missing SV/HC/PLAIN");

  // Unique range so leftover browser-QA products with same combo don't 409.
  const band = (Date.now() % 40) * 0.25; // 0 .. 9.75
  const { res: createRes, json: createJson } = await api(
    token,
    "/api/admin/catalog/lens-products",
    {
      method: "POST",
      body: JSON.stringify({
        name: "E2E Smoke Product",
        familyId: family.id,
        baseId: base.id,
        materialId: material.id,
        sphMin: band,
        sphMax: band + 0.5,
        cylMin: 0,
        cylMax: 0.25,
      }),
    }
  );
  assert(createRes.status === 201, `create ${createRes.status} ${JSON.stringify(createJson)}`);
  const productId = createJson.product.id;
  const sku = createJson.product.skuCode;
  assert(
    typeof sku === "string" && sku.startsWith("SV-HC-PLAIN-S"),
    `unexpected auto SKU: ${sku}`
  );
  console.log(`✓ create product ${sku}`);

  const { res: listRes, json: listJson } = await api(
    token,
    `/api/admin/catalog/lens-products?q=${encodeURIComponent(sku)}`
  );
  assert(listRes.ok, `list ${listRes.status}`);
  assert(listJson.items.some((p) => p.id === productId), "created product not in list");
  console.log("✓ list contains product");

  const { res: getRes, json: getJson } = await api(
    token,
    `/api/admin/catalog/lens-products/${productId}`
  );
  assert(getRes.ok, `get ${getRes.status}`);
  assert(getJson.product.skuCode === sku, "sku mismatch");
  console.log("✓ get product detail");

  // cleanup
  await prisma.lensProduct.delete({ where: { id: productId } });
  console.log("✓ cleanup");
  console.log("\nAll API e2e smoke checks passed.");
}

main()
  .catch((err) => {
    console.error("\nE2E FAILED:", err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
