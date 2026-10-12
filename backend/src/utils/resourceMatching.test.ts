import assert from "node:assert/strict";
import test from "node:test";
import {
  getAvailableFte,
  getRecommendationStatusTieBreakWeight,
  getRecommendationStatusWeight,
  scoreResourceMatch,
} from "./resourceMatching";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const baseCriteria = {
  skills: ["react"],
  certifications: [],
  certificationDate: date("2026-10-12"),
  locations: [],
  willingToRelocate: false,
};

test("scores only requested dimensions and reports partial skill matches", () => {
  const result = scoreResourceMatch(
    { ...baseCriteria, skills: ["react", "aws"], minProficiency: 3, minExperience: 2 },
    [{ name: "React", proficiency: 4, yearsExperience: 3 }],
    []
  );

  assert.deepEqual(result.components.map((component) => component.key), ["skills", "qualifications"]);
  assert.equal(result.components[0].score, 0.5);
  assert.equal(result.components[1].score, 0.5);
  assert.equal(result.matchScore, 50);
  assert.deepEqual(result.matchedSkills, ["React"]);
  assert.deepEqual(result.components[0].missing, ["aws"]);
});

test("only certifications valid on the requested date count", () => {
  const result = scoreResourceMatch(
    { ...baseCriteria, certifications: ["aws", "pmp"] },
    [],
    [
      { name: "AWS", issueDate: date("2025-01-01"), expiryDate: date("2027-01-01") },
      { name: "PMP", issueDate: date("2020-01-01"), expiryDate: date("2026-10-11") },
    ]
  );

  const certificationComponent = result.components.find((component) => component.key === "certifications");
  assert.ok(certificationComponent);
  assert.equal(certificationComponent.score, 0.5);
  assert.deepEqual(certificationComponent.matched, ["aws"]);
  assert.deepEqual(certificationComponent.missing, ["pmp"]);
});

test("location matches exactly or through relocation willingness", () => {
  const exact = scoreResourceMatch(
    { ...baseCriteria, location: "Bengaluru", locations: [" bengaluru "] },
    [],
    []
  );
  const relocation = scoreResourceMatch(
    { ...baseCriteria, location: "Bengaluru", willingToRelocate: true },
    [],
    []
  );
  const noMatch = scoreResourceMatch(
    { ...baseCriteria, location: "Bengaluru", locations: ["Chennai"] },
    [],
    []
  );

  assert.equal(exact.components.find((component) => component.key === "location")?.score, 1);
  assert.equal(relocation.components.find((component) => component.key === "location")?.score, 1);
  assert.equal(noMatch.components.find((component) => component.key === "location")?.score, 0);
});

test("availability score is capped at a full match", () => {
  const result = scoreResourceMatch(
    { ...baseCriteria, availableFte: 0.5, requiredFte: 0.75 },
    [],
    []
  );
  const availabilityComponent = result.components.find((component) => component.key === "availability");

  assert.ok(availabilityComponent);
  assert.equal(availabilityComponent.score, 2 / 3);
  assert.equal(availabilityComponent.missing.length, 1);

  const capped = scoreResourceMatch(
    { ...baseCriteria, availableFte: 1, requiredFte: 0.5 },
    [],
    []
  );
  assert.equal(capped.components.find((component) => component.key === "availability")?.score, 1);
});

test("availability uses peak overlapping allocation and excludes unavailable statuses", () => {
  assert.equal(
    getAvailableFte([
      { allocationPercent: 80, startDate: date("2026-10-12"), endDate: date("2026-10-12") },
      { allocationPercent: 80, startDate: date("2026-10-13"), endDate: date("2026-10-13") },
    ], "ALLOCATED", date("2026-10-12"), date("2026-10-13")),
    0.2
  );
  assert.equal(
    getAvailableFte([
      { allocationPercent: 40, startDate: date("2026-10-12"), endDate: date("2026-10-14") },
      { allocationPercent: 30, startDate: date("2026-10-13"), endDate: date("2026-10-13") },
    ], "ALLOCATED", date("2026-10-12"), date("2026-10-14")),
    0.3
  );
  assert.equal(
    getAvailableFte([
      { allocationPercent: 100, startDate: date("2026-10-12"), endDate: date("2026-10-14") },
      { allocationPercent: 20, startDate: date("2026-10-13"), endDate: date("2026-10-13") },
    ], "ALLOCATED", date("2026-10-12"), date("2026-10-14")),
    0
  );
  assert.equal(getAvailableFte([], "ON_ML", date("2026-10-12"), date("2026-10-12")), 0);
  assert.equal(getAvailableFte([], "TERMINATED", date("2026-10-12"), date("2026-10-12")), 0);
});

test("status remains a secondary tie-break in the approved order", () => {
  assert.deepEqual(
    ["AVAILABLE", "BENCH_TRUE", "BENCH_COMMITTED", "ALLOCATED"]
      .map(getRecommendationStatusTieBreakWeight),
    [3, 2, 1, 0]
  );
  assert.equal(getRecommendationStatusTieBreakWeight("ON_ML"), -1);
  assert.equal(getRecommendationStatusWeight("ON_ML"), 0);
});
