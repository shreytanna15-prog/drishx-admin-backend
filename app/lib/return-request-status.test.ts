import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatReturnRequestStatusLabel,
  parseExactReturnRequestStatus,
  RETURN_REQUEST_STATUS_LABELS,
  ReturnRequestStatus,
  statusesMatchingDisplayLabel,
} from "./return-request-status";

describe("RETURN_REQUEST_STATUS_LABELS", () => {
  it("covers every enum value with a display label", () => {
    for (const status of Object.values(ReturnRequestStatus)) {
      assert.equal(typeof RETURN_REQUEST_STATUS_LABELS[status], "string");
      assert.ok(RETURN_REQUEST_STATUS_LABELS[status].trim().length > 0);
    }
  });

  it("maps shared Pending Admin Review label to SUBMITTED + ESCALATED_TO_ADMIN", () => {
    assert.equal(
      RETURN_REQUEST_STATUS_LABELS.SUBMITTED,
      "Pending Admin Review"
    );
    assert.equal(
      RETURN_REQUEST_STATUS_LABELS.ESCALATED_TO_ADMIN,
      "Pending Admin Review"
    );
  });

  it("maps shared Replacement Approved label to AWAITING_MATERIAL + APPROVED_REPLACEMENT", () => {
    assert.equal(
      RETURN_REQUEST_STATUS_LABELS.AWAITING_MATERIAL,
      "Replacement Approved"
    );
    assert.equal(
      RETURN_REQUEST_STATUS_LABELS.APPROVED_REPLACEMENT,
      "Replacement Approved"
    );
  });
});

describe("formatReturnRequestStatusLabel", () => {
  it("returns every displayed label for known enums", () => {
    assert.equal(
      formatReturnRequestStatusLabel("SUBMITTED"),
      "Pending Admin Review"
    );
    assert.equal(
      formatReturnRequestStatusLabel("MORE_INFO_REQUIRED"),
      "More Info Needed"
    );
    assert.equal(
      formatReturnRequestStatusLabel("ESCALATED_TO_ADMIN"),
      "Pending Admin Review"
    );
    assert.equal(
      formatReturnRequestStatusLabel("AWAITING_MATERIAL"),
      "Replacement Approved"
    );
    assert.equal(
      formatReturnRequestStatusLabel("APPROVED_CREDIT"),
      "Credit Approved"
    );
    assert.equal(
      formatReturnRequestStatusLabel("APPROVED_REPLACEMENT"),
      "Replacement Approved"
    );
    assert.equal(formatReturnRequestStatusLabel("REJECTED"), "Rejected");
    assert.equal(formatReturnRequestStatusLabel("CLOSED"), "Closed");
  });
});

describe("statusesMatchingDisplayLabel", () => {
  it("matches labels case-insensitively with trim", () => {
    assert.deepEqual(statusesMatchingDisplayLabel("  pending admin review  "), [
      ReturnRequestStatus.SUBMITTED,
      ReturnRequestStatus.ESCALATED_TO_ADMIN,
    ]);
    assert.deepEqual(statusesMatchingDisplayLabel("CREDIT APPROVED"), [
      ReturnRequestStatus.APPROVED_CREDIT,
    ]);
  });

  it("returns empty for non-label text", () => {
    assert.deepEqual(statusesMatchingDisplayLabel("RET-898337397"), []);
    assert.deepEqual(statusesMatchingDisplayLabel("504094"), []);
    assert.deepEqual(statusesMatchingDisplayLabel(""), []);
  });
});

describe("parseExactReturnRequestStatus", () => {
  it("accepts exact enum tokens ignoring case", () => {
    assert.equal(parseExactReturnRequestStatus("submitted"), "SUBMITTED");
    assert.equal(
      parseExactReturnRequestStatus("MORE_INFO_REQUIRED"),
      "MORE_INFO_REQUIRED"
    );
  });

  it("rejects display labels and other text", () => {
    assert.equal(parseExactReturnRequestStatus("Pending Admin Review"), null);
    assert.equal(parseExactReturnRequestStatus("optics"), null);
  });
});
