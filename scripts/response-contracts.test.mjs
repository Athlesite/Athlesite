import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ARGUMENT_REJECTION_CODES,
  REASON,
  classifyArrayArgumentResponse,
  classifyStorageList,
  isStorageObjectRecord,
} from "./response-contracts.mjs";

/**
 * Synthetic responses only — nothing here contacts a project.
 *
 * Both classifiers previously accepted shapes that proved nothing: a bare `{}` with a 400
 * satisfied the argument-rejection check, and `id: ""` / `metadata: []` satisfied the
 * Storage record check. These lock the tightened behaviour in.
 */

const arrayBody = (rows) => ({ kind: "array", status: 200, ok: true, rows });
const objectBody = (status, value) => ({ kind: "object", status, ok: false, value });

describe("classifyArrayArgumentResponse", () => {
  test("200 with exactly zero rows passes — safe coercion to one scalar text value", () => {
    assert.equal(classifyArrayArgumentResponse(arrayBody([])).ok, true);
  });

  test("200 with a row FAILS — that would mean the argument produced a real lookup", () => {
    const result = classifyArrayArgumentResponse(arrayBody([{ slug: "x" }]));
    assert.equal(result.ok, false);
    assert.equal(result.reason, REASON.POLICY_ALLOWED_UNEXPECTEDLY);
  });

  test("200 with a non-array body fails", () => {
    const result = classifyArrayArgumentResponse(objectBody(200, { slug: "x" }));
    assert.equal(result.ok, false);
    assert.equal(result.reason, REASON.BODY_NOT_ARRAY);
  });

  test("an expected rejection code passes", () => {
    for (const code of ARGUMENT_REJECTION_CODES) {
      const status = code === "PGRST202" ? 404 : 400;
      const result = classifyArrayArgumentResponse(objectBody(status, { code, message: "", details: "", hint: "" }));
      assert.equal(result.ok, true, `expected ${code} to pass`);
    }
  });

  test("an empty {} body with 400 FAILS — the previous bug", () => {
    const result = classifyArrayArgumentResponse(objectBody(400, {}));
    assert.equal(result.ok, false);
    assert.equal(result.reason, REASON.ARGUMENT_REJECTION_CODE_UNEXPECTED);
  });

  test("an unrelated 4xx error code fails, even though it is a well-formed error", () => {
    for (const code of ["42501", "PGRST301", "PGRST116", "", "42P01"]) {
      const result = classifyArrayArgumentResponse(objectBody(400, { code }));
      assert.equal(result.ok, false, `expected code "${code}" to fail`);
      assert.equal(result.reason, REASON.ARGUMENT_REJECTION_CODE_UNEXPECTED);
    }
  });

  test("a non-string code fails", () => {
    for (const code of [undefined, null, 400, {}, []]) {
      assert.equal(classifyArrayArgumentResponse(objectBody(400, { code })).ok, false);
    }
  });

  test("5xx always fails, whatever the body", () => {
    for (const status of [500, 502, 503]) {
      const result = classifyArrayArgumentResponse(objectBody(status, { code: "PGRST202" }));
      assert.equal(result.ok, false, `expected ${status} to fail`);
      assert.equal(result.reason, REASON.HTTP_SERVER_ERROR);
    }
  });

  test("an unexpected 4xx status fails even with a valid rejection code", () => {
    const result = classifyArrayArgumentResponse(objectBody(403, { code: "PGRST202" }));
    assert.equal(result.ok, false);
    assert.equal(result.reason, REASON.HTTP_STATUS_UNEXPECTED);
  });

  test("a network failure fails", () => {
    assert.equal(classifyArrayArgumentResponse({ kind: "network", status: 0 }).reason, REASON.NETWORK_FAILURE);
  });

  test("a rejection status with a non-object body fails", () => {
    const result = classifyArrayArgumentResponse({ kind: "invalid-json", status: 400 });
    assert.equal(result.ok, false);
    assert.equal(result.reason, REASON.BODY_NOT_OBJECT);
  });
});

describe("isStorageObjectRecord", () => {
  const valid = { name: "abc.jpg", id: "obj-1", metadata: { size: 10, mimetype: "image/jpeg" } };

  test("a well-formed object record passes", () => {
    assert.equal(isStorageObjectRecord(valid), true);
  });

  test('id: "" FAILS — the previous bug', () => {
    assert.equal(isStorageObjectRecord({ ...valid, id: "" }), false);
  });

  test("metadata: [] FAILS — an array is typeof object and not null", () => {
    assert.equal(isStorageObjectRecord({ ...valid, metadata: [] }), false);
  });

  test("metadata: null fails — that is the documented folder shape", () => {
    assert.equal(isStorageObjectRecord({ ...valid, metadata: null }), false);
  });

  test("id: null fails — also the documented folder shape", () => {
    assert.equal(isStorageObjectRecord({ ...valid, id: null }), false);
  });

  test('name: "" and a missing name fail', () => {
    assert.equal(isStorageObjectRecord({ ...valid, name: "" }), false);
    assert.equal(isStorageObjectRecord({ id: "x", metadata: {} }), false);
  });

  test("non-objects fail", () => {
    for (const bad of [null, undefined, "abc.jpg", 42, []]) {
      assert.equal(isStorageObjectRecord(bad), false);
    }
  });
});

describe("classifyStorageList", () => {
  const record = (name) => ({ name, id: `id-${name}`, metadata: { size: 1 } });

  test("an exact matching set passes", () => {
    assert.equal(classifyStorageList(arrayBody([record("a.jpg")]), ["a.jpg"]).ok, true);
    assert.equal(classifyStorageList(arrayBody([]), []).ok, true);
  });

  test("a duplicate name fails before the set comparison", () => {
    const result = classifyStorageList(arrayBody([record("a.jpg"), record("a.jpg")]), ["a.jpg"]);
    assert.equal(result.ok, false);
    assert.equal(result.reason, REASON.OBJECT_SET_UNEXPECTED);
  });

  test("an extra or missing name fails", () => {
    assert.equal(classifyStorageList(arrayBody([record("a.jpg"), record("b.jpg")]), ["a.jpg"]).ok, false);
    assert.equal(classifyStorageList(arrayBody([]), ["a.jpg"]).ok, false);
  });

  test("an invalid record fails even when the names would match", () => {
    const bad = { name: "a.jpg", id: "", metadata: [] };
    const result = classifyStorageList(arrayBody([bad]), ["a.jpg"]);
    assert.equal(result.ok, false);
    assert.equal(result.reason, REASON.BODY_NOT_OBJECT_LIST);
  });

  test("a non-200 status fails", () => {
    assert.equal(classifyStorageList({ kind: "array", status: 206, rows: [] }, []).reason, REASON.HTTP_STATUS_UNEXPECTED);
  });

  test("an error object instead of an array fails rather than looking like an empty folder", () => {
    const result = classifyStorageList(objectBody(200, { error: "nope" }), []);
    assert.equal(result.ok, false);
    assert.equal(result.reason, REASON.BODY_NOT_ARRAY);
  });
});
