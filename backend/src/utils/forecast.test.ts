import assert from "node:assert/strict";
import test from "node:test";
import { buildForecastBuckets } from "./forecast";

const startDate = new Date("2026-10-12T00:00:00Z");

const resources = [
  {
    id: "r1",
    status: "AVAILABLE",
    allocations: [
      { status: "ACTIVE", startDate: "2026-10-12", endDate: "2026-10-18", allocationPercent: 50 },
      { status: "SCHEDULED", startDate: "2026-10-19", endDate: "2026-10-25", allocationPercent: 30 },
    ],
  },
  {
    id: "r2",
    status: "BENCH_TRUE",
    allocations: [],
  },
  {
    id: "r3",
    status: "ON_ML",
    allocations: [],
  },
];

const demandRequests = [
  {
    id: "d1",
    status: "PIPELINE",
    requiredFte: "1.00",
    startDate: "2026-10-14",
    endDate: "2026-10-20",
  },
  {
    id: "d2",
    status: "COMMITTED",
    requiredFte: 0.5,
    startDate: "2026-10-19",
    endDate: "2026-10-25",
  },
  {
    id: "d3",
    status: "CANCELLED",
    requiredFte: "1.50",
    startDate: "2026-10-12",
    endDate: "2026-10-26",
  },
];

test("forecast bucket computes supply and demand across the horizon", () => {
  const buckets = buildForecastBuckets({
    resources,
    demandRequests,
    startDate,
    horizonWeeks: 2,
  });

  assert.equal(buckets[0].weekStart, "2026-10-12");
  assert.equal(buckets[0].supplyFte, 1.5);
  assert.equal(buckets[0].demandFte, 1);
  assert.equal(buckets[0].gapFte, 0.5);
  assert.equal(buckets[0].pipelineFte, 1);
  assert.equal(buckets[0].committedFte, 0);
  assert.equal(buckets[0].cancelledFte, 1.5);
});

test("forecast excludes terminated and ML resources from supply", () => {
  const buckets = buildForecastBuckets({
    resources: [{ id: "r1", status: "TERMINATED", allocations: [] }],
    demandRequests: [],
    startDate,
    horizonWeeks: 1,
  });

  assert.equal(buckets[0].supplyFte, 0);
});
