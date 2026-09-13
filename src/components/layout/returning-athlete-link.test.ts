import { test } from "node:test";
import assert from "node:assert/strict";
import { RETURNING_ATHLETE_PATH } from "@/components/layout/returning-athlete-link";

test("returning-athlete entry point routes to /edit-profile, which itself resolves both the signed-in and signed-out cases", () => {
  assert.equal(RETURNING_ATHLETE_PATH, "/edit-profile");
});
