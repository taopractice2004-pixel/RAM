import assert from "node:assert/strict";
import test from "node:test";
import { deriveBenchSubCategory } from "./resourcePresentation";

const now = new Date("2026-10-21T00:00:00Z");
const resource = (status: string, days: number, subCategory: string | null = null) => ({
  status,
  subCategory,
  benchSince: new Date(now.getTime() - days * 86400000),
  allocations: [],
});

for (const status of ["BENCH_TRUE", "BENCH_COMMITTED", "AVAILABLE"]) {
  for (const days of [59, 60, 61]) {
    test(`${status} subcategory at ${days} days preserves lifecycle status`, () => {
      const input = resource(status, days);
      const before = structuredClone(input);
      assert.equal(deriveBenchSubCategory(input, now), days < 60 ? "Bench (Allocated <60)" : "Corporate Bench");
      assert.deepEqual(input, before);
    });
  }
}

test("explicit categories and leave remain distinct from bench age", () => {
  assert.equal(deriveBenchSubCategory(resource("BENCH_TRUE", 61, "Proactive hire"), now), "Proactive Hire");
  assert.equal(deriveBenchSubCategory(resource("BENCH_COMMITTED", 1, "Corporate Bench"), now), "Corporate Bench");
  assert.equal(deriveBenchSubCategory(resource("ON_ML", 61, "Proactive Hire"), now), "ML");
});

test("unknown bench age does not imply fewer than 60 days", () => {
  assert.equal(deriveBenchSubCategory({ status: "BENCH_TRUE", subCategory: null }, now), null);
});

test("allocated resources retain allocation context regardless of old bench date", () => {
  const input = resource("ALLOCATED", 61);
  assert.equal(deriveBenchSubCategory(input, now), "Allocated");
  assert.equal(deriveBenchSubCategory({ ...input, allocations: [{ status: "ACTIVE", project: { billingDelayed: true } }] }, now), "Billing Delay");
  assert.equal(deriveBenchSubCategory({ ...input, allocations: [{ status: "ACTIVE", project: { isInternalProject: true } }] }, now), "Corporate Bench");
});
