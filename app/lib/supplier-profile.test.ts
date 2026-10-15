import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkSupplierConsistency,
  findStateByCode,
  findStateByName,
  formatIndianPhone,
  formatSupplierAddress,
  gstinCheckChar,
  gstinError,
  gstinFieldError,
  INDIAN_STATES,
  isValidGstin,
  normalizeGstin,
  normalizeIndianPhone,
  normalizePan,
  panFieldError,
  panFromGstin,
  supplierDisplayName,
  validateSupplierInput,
} from "./supplier-profile";

/** Published sample GSTIN (Maharashtra) with a correct check character. */
const KNOWN_GSTIN = "27AAPFU0939F1ZV";
/** Gujarat sample from Test 68F repro (valid checksum). */
const GUJARAT_GSTIN = "24ABCDE1234F1Z6";

function withCheck(first14: string) {
  return first14 + gstinCheckChar(first14);
}

function expectOk(result: ReturnType<typeof validateSupplierInput>) {
  if (!result.ok) {
    assert.fail(`expected ok, got errors ${JSON.stringify(result.errors)}`);
  }
  return result.data;
}

function expectErrors(result: ReturnType<typeof validateSupplierInput>) {
  if (result.ok) assert.fail(`expected errors, got ${JSON.stringify(result.data)}`);
  return result.errors;
}

describe("GSTIN checksum", () => {
  it("accepts a known-valid GSTIN", () => {
    assert.equal(gstinError(KNOWN_GSTIN), null);
    assert.equal(gstinCheckChar(KNOWN_GSTIN.slice(0, 14)), "V");
    assert.equal(isValidGstin(" 27aapfu0939f1zv "), true);
  });

  it("accepts computed GSTINs for other states", () => {
    const gj = withCheck("24AAACR5055K1Z");
    assert.equal(gstinError(gj), null);
    const dl = withCheck("07AAACR5055K1Z");
    assert.equal(gstinError(dl), null);
  });

  it("rejects a wrong check character", () => {
    const wrong = KNOWN_GSTIN.slice(0, 14) + "A";
    assert.match(gstinError(wrong) ?? "", /checksum/i);
  });

  it("rejects bad format and unknown state codes", () => {
    assert.match(gstinError("27AAPFU0939F1Z") ?? "", /15 characters/);
    assert.match(gstinError("27AAPFU0939F1XV") ?? "", /format/i);
    assert.match(gstinError(withCheck("28AAPFU0939F1Z")) ?? "", /unknown state/i);
  });
});

describe("gstinFieldError (optional field UX)", () => {
  it("allows blank optional GSTIN", () => {
    assert.equal(gstinFieldError(""), null);
    assert.equal(gstinFieldError("   "), null);
    assert.equal(gstinFieldError(null), null);
    assert.equal(gstinFieldError(undefined), null);
  });

  it("rejects invalid GSTIN ABC123", () => {
    assert.match(gstinFieldError("ABC123") ?? "", /15 characters|format/i);
    assert.equal(isValidGstin("ABC123"), false);
  });

  it("accepts valid-format GSTIN and normalises lowercase", () => {
    assert.equal(gstinFieldError(KNOWN_GSTIN.toLowerCase()), null);
    assert.equal(normalizeGstin(" 27aapfu0939f1zv "), KNOWN_GSTIN);
    assert.equal(isValidGstin(KNOWN_GSTIN.toLowerCase()), true);
  });
});

describe("panFieldError (PAN–GSTIN match)", () => {
  const expectedPan = panFromGstin(GUJARAT_GSTIN);

  it("accepts valid GSTIN with matching PAN", () => {
    assert.equal(isValidGstin(GUJARAT_GSTIN), true);
    assert.equal(expectedPan, "ABCDE1234F");
    assert.equal(panFieldError(expectedPan, GUJARAT_GSTIN), null);
    assert.equal(
      panFieldError(expectedPan.toLowerCase(), GUJARAT_GSTIN.toLowerCase()),
      null
    );
  });

  it("rejects valid GSTIN with mismatching PAN (blur case)", () => {
    const err = panFieldError("ABCDE1234G", GUJARAT_GSTIN);
    assert.match(err ?? "", /ABCDE1234F/);
  });

  it("clears mismatch after correcting PAN", () => {
    assert.ok(panFieldError("ABCDE1234G", GUJARAT_GSTIN));
    assert.equal(panFieldError("ABCDE1234F", GUJARAT_GSTIN), null);
  });

  it("revalidates existing PAN when GSTIN changes", () => {
    const mhPan = panFromGstin(KNOWN_GSTIN);
    assert.equal(panFieldError(mhPan, KNOWN_GSTIN), null);
    assert.match(panFieldError(mhPan, GUJARAT_GSTIN) ?? "", /ABCDE1234F/);
  });

  it("allows blank optional PAN/GSTIN combinations", () => {
    assert.equal(panFieldError("", GUJARAT_GSTIN), null);
    assert.equal(panFieldError("   ", GUJARAT_GSTIN), null);
    assert.equal(panFieldError(null, GUJARAT_GSTIN), null);
    assert.equal(panFieldError(expectedPan, ""), null);
    assert.equal(panFieldError("", ""), null);
  });

  it("rejects invalid PAN format independently of GSTIN", () => {
    assert.match(panFieldError("ABCDE1234", GUJARAT_GSTIN) ?? "", /format/i);
    assert.match(panFieldError("ABCD1234F") ?? "", /format/i);
  });

  it("normalises PAN spacing/case", () => {
    assert.equal(normalizePan(" abcde1234f "), "ABCDE1234F");
  });
});

describe("state lookup", () => {
  it("covers states and UTs with unique codes", () => {
    const codes = INDIAN_STATES.map((s) => s.code);
    assert.equal(new Set(codes).size, codes.length);
    assert.equal(findStateByCode("24")?.name, "Gujarat");
    assert.equal(findStateByCode("7")?.name, "Delhi");
    assert.equal(findStateByCode("25")?.code, "26");
    assert.equal(findStateByName("TAMIL NADU")?.code, "33");
    assert.equal(findStateByName("Jammu & Kashmir")?.code, "01");
  });
});

describe("phone normalisation", () => {
  it("normalises mobile numbers in common formats", () => {
    for (const input of [
      "9876543210",
      "+91 98765 43210",
      "+91-98765-43210",
      "919876543210",
      "09876543210",
      "0091 98765 43210",
      "(98765) 43210",
    ]) {
      assert.equal(normalizeIndianPhone(input), "+919876543210", input);
    }
  });

  it("accepts landlines with STD code", () => {
    assert.equal(normalizeIndianPhone("022 2654 3210"), "+912226543210");
    assert.equal(normalizeIndianPhone("079-26543210"), "+917926543210");
  });

  it("rejects invalid numbers", () => {
    for (const input of ["12345", "0000000000", "+1 415 555 0100", "98765x3210", "98765432101"]) {
      assert.equal(normalizeIndianPhone(input), null, input);
    }
  });

  it("formats for display", () => {
    assert.equal(formatIndianPhone("+919876543210"), "+91 98765 43210");
    assert.equal(formatIndianPhone("legacy 123"), "legacy 123");
  });
});

describe("validateSupplierInput (create)", () => {
  it("accepts a full profile and normalises values", () => {
    const data = expectOk(
      validateSupplierInput(
        {
          name: "  Usha   Optical Industries ",
          tradeName: "Usha Optics",
          businessEntityType: "partnership",
          gstin: KNOWN_GSTIN.toLowerCase(),
          pan: "aapfu0939f",
          state: "maharashtra",
          contactPerson: "R. Mehta",
          phone: "+91 98765 43210",
          alternatePhone: "022-2654-3210",
          email: "Orders@Usha.IN",
          address: "Plot 12, MIDC",
          city: "Mumbai",
          pincode: "400 093",
          dispatchAddress: "",
          notes: "Net 30",
        },
        "create"
      )
    );
    assert.deepEqual(data, {
      name: "Usha Optical Industries",
      tradeName: "Usha Optics",
      businessEntityType: "PARTNERSHIP",
      gstin: KNOWN_GSTIN,
      pan: "AAPFU0939F",
      state: "Maharashtra",
      stateCode: "27",
      contactPerson: "R. Mehta",
      phone: "+919876543210",
      alternatePhone: "+912226543210",
      email: "orders@usha.in",
      address: "Plot 12, MIDC",
      city: "Mumbai",
      pincode: "400093",
      dispatchAddress: null,
      notes: "Net 30",
    });
  });

  it("accepts a legacy name-only supplier", () => {
    const data = expectOk(validateSupplierInput({ name: "Legacy Lens Co" }, "create"));
    assert.deepEqual(data, { name: "Legacy Lens Co" });
  });

  it("requires a name of 2–120 characters", () => {
    assert.ok(expectErrors(validateSupplierInput({}, "create")).name);
    assert.ok(expectErrors(validateSupplierInput({ name: "  " }, "create")).name);
    assert.ok(expectErrors(validateSupplierInput({ name: "A" }, "create")).name);
    assert.ok(
      expectErrors(validateSupplierInput({ name: "x".repeat(121) }, "create")).name
    );
  });

  it("derives state and state code from GSTIN", () => {
    const data = expectOk(
      validateSupplierInput({ name: "Supplier", gstin: KNOWN_GSTIN }, "create")
    );
    assert.equal(data.state, "Maharashtra");
    assert.equal(data.stateCode, "27");
  });

  it("rejects GSTIN / state mismatch", () => {
    const errors = expectErrors(
      validateSupplierInput(
        { name: "Supplier", gstin: KNOWN_GSTIN, state: "Gujarat" },
        "create"
      )
    );
    assert.match(errors.gstin, /Maharashtra/);
    const byCode = expectErrors(
      validateSupplierInput(
        { name: "Supplier", gstin: KNOWN_GSTIN, stateCode: "24" },
        "create"
      )
    );
    assert.ok(byCode.gstin);
  });

  it("rejects state / state code mismatch and unknown state", () => {
    assert.ok(
      expectErrors(
        validateSupplierInput({ name: "S1", state: "Gujarat", stateCode: "27" }, "create")
      ).stateCode
    );
    assert.ok(
      expectErrors(validateSupplierInput({ name: "S1", state: "Atlantis" }, "create"))
        .state
    );
  });

  it("rejects PAN that does not match GSTIN", () => {
    const errors = expectErrors(
      validateSupplierInput(
        { name: "Supplier", gstin: KNOWN_GSTIN, pan: "ABCDE1234F" },
        "create"
      )
    );
    assert.match(errors.pan, /AAPFU0939F/);
  });

  it("create rejects Gujarat GSTIN with mismatching PAN ABCDE1234G", () => {
    const errors = expectErrors(
      validateSupplierInput(
        { name: "Supplier", gstin: GUJARAT_GSTIN, pan: "ABCDE1234G" },
        "create"
      )
    );
    assert.match(errors.pan, /ABCDE1234F/);
  });

  it("create accepts Gujarat GSTIN with matching PAN", () => {
    const data = expectOk(
      validateSupplierInput(
        { name: "Supplier", gstin: GUJARAT_GSTIN, pan: "ABCDE1234F" },
        "create"
      )
    );
    assert.equal(data.gstin, GUJARAT_GSTIN);
    assert.equal(data.pan, "ABCDE1234F");
    assert.equal(data.state, "Gujarat");
    assert.equal(data.stateCode, "24");
  });

  it("rejects invalid GSTIN checksum, PAN format, email, phone, pincode", () => {
    const errors = expectErrors(
      validateSupplierInput(
        {
          name: "Supplier",
          gstin: KNOWN_GSTIN.slice(0, 14) + "A",
          email: "not-an-email",
          phone: "12345",
          pincode: "012345",
          businessEntityType: "TRUST",
        },
        "create"
      )
    );
    assert.match(errors.gstin, /checksum/i);
    assert.ok(errors.email);
    assert.ok(errors.phone);
    assert.ok(errors.pincode);
    assert.ok(errors.businessEntityType);
    assert.ok(
      expectErrors(validateSupplierInput({ name: "S1", pan: "ABCD1234F" }, "create")).pan
    );
  });

  it("blocks create when GSTIN is ABC123 (backend path)", () => {
    const errors = expectErrors(
      validateSupplierInput({ name: "Supplier", gstin: "ABC123" }, "create")
    );
    assert.ok(errors.gstin);
    assert.match(errors.gstin, /15 characters|format/i);
  });

  it("accepts blank GSTIN on create", () => {
    const omitted = expectOk(validateSupplierInput({ name: "Supplier" }, "create"));
    assert.equal(omitted.gstin, undefined);
    const cleared = expectOk(
      validateSupplierInput({ name: "Supplier", gstin: "" }, "create")
    );
    assert.equal(cleared.gstin, null);
  });

  it("enforces text length limits", () => {
    const errors = expectErrors(
      validateSupplierInput(
        { name: "S1", notes: "n".repeat(1001), address: "a".repeat(501) },
        "create"
      )
    );
    assert.ok(errors.notes);
    assert.ok(errors.address);
  });

  it("rejects non-object payloads", () => {
    assert.ok(expectErrors(validateSupplierInput(null, "create"))._form);
    assert.ok(expectErrors(validateSupplierInput([], "create"))._form);
  });
});

describe("validateSupplierInput (update)", () => {
  it("returns only provided keys", () => {
    const data = expectOk(validateSupplierInput({ city: " Surat " }, "update"));
    assert.deepEqual(data, { city: "Surat" });
  });

  it("treats null and empty string as clear", () => {
    const data = expectOk(
      validateSupplierInput({ email: "", phone: null, gstin: "" }, "update")
    );
    assert.deepEqual(data, { email: null, phone: null, gstin: null });
  });

  it("does not require name when absent but rejects clearing it", () => {
    expectOk(validateSupplierInput({ notes: "x" }, "update"));
    assert.ok(expectErrors(validateSupplierInput({ name: "" }, "update")).name);
    assert.ok(expectErrors(validateSupplierInput({ name: null }, "update")).name);
  });

  it("accepts isActive toggles and rejects non-boolean", () => {
    assert.deepEqual(expectOk(validateSupplierInput({ isActive: false }, "update")), {
      isActive: false,
    });
    assert.ok(
      expectErrors(validateSupplierInput({ isActive: "no" }, "update")).isActive
    );
  });

  it("empty update is ok and empty", () => {
    assert.deepEqual(expectOk(validateSupplierInput({}, "update")), {});
  });

  it("blocks update when GSTIN is ABC123 even if frontend is bypassed", () => {
    const errors = expectErrors(
      validateSupplierInput({ gstin: "ABC123" }, "update")
    );
    assert.ok(errors.gstin);
  });

  it("update rejects PAN mismatch against provided GSTIN", () => {
    const errors = expectErrors(
      validateSupplierInput(
        { gstin: GUJARAT_GSTIN, pan: "ABCDE1234G" },
        "update"
      )
    );
    assert.match(errors.pan, /ABCDE1234F/);
  });

  it("update accepts matching PAN with GSTIN", () => {
    const data = expectOk(
      validateSupplierInput(
        { gstin: GUJARAT_GSTIN, pan: "abcde1234f" },
        "update"
      )
    );
    assert.equal(data.pan, "ABCDE1234F");
    assert.equal(data.gstin, GUJARAT_GSTIN);
  });

  it("accepts clearing GSTIN on update", () => {
    assert.deepEqual(
      expectOk(validateSupplierInput({ gstin: "" }, "update")),
      { gstin: null }
    );
  });

  it("accepts a valid GSTIN update and derives state", () => {
    const data = expectOk(
      validateSupplierInput({ gstin: KNOWN_GSTIN.toLowerCase() }, "update")
    );
    assert.equal(data.gstin, KNOWN_GSTIN);
    assert.equal(data.state, "Maharashtra");
    assert.equal(data.stateCode, "27");
  });
});

describe("checkSupplierConsistency", () => {
  it("flags stored GSTIN vs new state and PAN", () => {
    const errors = checkSupplierConsistency({
      gstin: KNOWN_GSTIN,
      stateCode: "24",
      pan: "ABCDE1234F",
    });
    assert.ok(errors.state);
    assert.ok(errors.pan);
    assert.deepEqual(
      checkSupplierConsistency({ gstin: KNOWN_GSTIN, stateCode: "27", pan: null }),
      {}
    );
    assert.deepEqual(checkSupplierConsistency({ gstin: null, stateCode: "24" }), {});
  });
});

describe("display helpers", () => {
  it("formats address lines", () => {
    assert.deepEqual(
      formatSupplierAddress({
        address: "Plot 12\nMIDC",
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400093",
      }),
      ["Plot 12", "MIDC", "Mumbai, Maharashtra – 400093"]
    );
    assert.deepEqual(formatSupplierAddress({}), []);
  });

  it("builds display names", () => {
    assert.equal(supplierDisplayName({ name: "Legacy" }), "Legacy");
    assert.equal(
      supplierDisplayName({ name: "Usha Optical Pvt Ltd", tradeName: "Usha" }),
      "Usha (Usha Optical Pvt Ltd)"
    );
    assert.equal(supplierDisplayName({ name: "Same", tradeName: "same" }), "Same");
  });
});
