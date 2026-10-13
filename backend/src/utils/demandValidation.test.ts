import assert from "node:assert/strict";
import test from "node:test";
import { parseDemandCsvList, validateDemandTransition } from "./demandValidation";

test("demand stage transitions are strictly allowed", () => {
  assert.equal(validateDemandTransition("DRAFT", "PIPELINE"), true);
  assert.equal(validateDemandTransition("PIPELINE", "COMMITTED"), true);
  assert.equal(validateDemandTransition("COMMITTED", "FULFILLED"), true);
  assert.equal(validateDemandTransition("COMMITTED", "PIPELINE"), false);
  assert.equal(validateDemandTransition("FULFILLED", "CANCELLED"), false);
});

test("CSV list parsing trims and deduplicates values", () => {
  assert.deepEqual(parseDemandCsvList("React, AWS,React"), ["React", "AWS"]);
  assert.deepEqual(parseDemandCsvList(""), []);
});
