import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { parseImportCsvManifest, retryImportTransaction, runImport } from "./importService";

function database() {
  let state: any = { batches: [], records: [], resources: [], audits: [], notifications: [] };
  let failEmployee = "E2";
  let conflict = false;
  let queue = Promise.resolve();
  const matches = (row: any, where: any): boolean => Object.entries(where ?? {}).every(([key, value]: any) => value === undefined || (value && typeof value === "object" && !(value instanceof Date) ? value.in ? value.in.includes(row[key]) : value.not ? row[key] !== value.not : false : value instanceof Date ? row[key]?.getTime() === value.getTime() : row[key] === value));
  const tx: any = {
    importBatch: {
      findUnique: async ({ where }: any) => structuredClone(state.batches.find((row: any) => matches(row, where)) ?? null),
      create: async ({ data }: any) => {
        const batch = { ...data, id: `b${state.batches.length}`, records: undefined };
        state.batches.push(batch);
        for (const row of data.records.create) state.records.push({ ...row, id: `r${state.records.length}`, batchId: batch.id, updatedAt: null });
        return structuredClone(batch);
      },
      update: async ({ where, data }: any) => Object.assign(state.batches.find((row: any) => matches(row, where)), data),
    },
    importRecord: {
      findMany: async ({ where }: any) => structuredClone(state.records.filter((row: any) => matches(row, where))),
      findUniqueOrThrow: async ({ where }: any) => structuredClone(state.records.find((row: any) => matches(row, where))),
      updateMany: async ({ where, data }: any) => { const rows = state.records.filter((row: any) => matches(row, where)); rows.forEach((row: any) => Object.assign(row, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)))); return { count: rows.length }; },
      update: async ({ where, data }: any) => Object.assign(state.records.find((row: any) => matches(row, where)), data),
      count: async ({ where }: any) => state.records.filter((row: any) => matches(row, where)).length,
      groupBy: async ({ where }: any) => Object.entries(state.records.filter((row: any) => matches(row, where)).reduce((counts: any, row: any) => ({ ...counts, [row.status]: (counts[row.status] || 0) + 1 }), {})).map(([status, count]) => ({ status, _count: count })),
    },
    resource: {
      findUnique: async ({ where }: any) => state.resources.find((row: any) => matches(row, where)) ?? null,
      create: async ({ data }: any) => { const resource = { ...data, id: `resource${state.resources.length}`, updatedAt: new Date() }; state.resources.push(resource); return resource; },
      update: async ({ where, data }: any) => Object.assign(state.resources.find((row: any) => matches(row, where)), data),
    },
    portfolio: { findUnique: async () => ({ id: "p1", code: "FIN" }) },
    auditLog: { create: async ({ data }: any) => { const resource = state.resources.find((row: any) => row.id === data.after?.resourceId); if (resource?.employeeId === failEmployee) throw new Error("Injected audit failure"); state.audits.push(data); } },
    user: { findMany: async () => [{ id: "rmg" }] },
    notification: {
      findFirst: async ({ where }: any) => state.notifications.find((row: any) => matches(row, where)),
      create: async ({ data }: any) => state.notifications.push(data),
      updateMany: async ({ where, data }: any) => state.notifications.filter((row: any) => matches(row, where)).forEach((row: any) => Object.assign(row, data)),
    },
  };
  const transaction = async (operation: any) => {
    const previous = queue;
    let unlock!: () => void;
    queue = new Promise<void>((resolve) => { unlock = resolve; });
    await previous;
    const before = structuredClone(state);
    try {
      if (conflict) { conflict = false; throw new Prisma.PrismaClientKnownRequestError("serialization", { code: "P2034", clientVersion: "5" }); }
      return await operation(tx);
    } catch (error) { state = before; throw error; }
    finally { unlock(); }
  };
  return { tx, transaction, state: () => state, allowAll: () => { failEmployee = ""; }, conflict: () => { conflict = true; } };
}

const rows = ["E1", "E2", "E3"].map((employeeId) => ({ employeeId, name: employeeId, location: "NY", costRate: "1", portfolioCode: "FIN" }));

test("row rollback isolation, same-key retry, concurrent resume and notification deduplication", async (t) => {
  const db = database();
  const originals = Object.fromEntries(Object.keys(db.tx).map((name) => [name, (prisma as any)[name]]));
  for (const [name, delegate] of Object.entries(db.tx)) (prisma as any)[name] = delegate;
  t.after(() => { for (const [name, delegate] of Object.entries(originals)) (prisma as any)[name] = delegate; });
  t.mock.method(prisma, "$transaction", db.transaction as any);
  const first = await runImport(rows, "TEST", null, { idempotencyKey: "key" });
  assert.equal(first.totals.CREATED, 2);
  assert.equal(first.totals.FAILED, 1);
  assert.equal(db.state().resources.length, 2);
  assert.equal(db.state().audits.length, 2);
  assert.equal(db.state().notifications.length, 1);
  await assert.rejects(runImport(rows.slice(1), "TEST", null, { idempotencyKey: "key" }), /mismatch/);
  db.allowAll();
  db.conflict();
  await Promise.all([runImport(rows, "TEST", null, { idempotencyKey: "key" }), runImport(rows, "TEST", null, { idempotencyKey: "key" })]);
  assert.equal(db.state().resources.length, 3);
  assert.equal(db.state().audits.length, 3);
  assert.equal(db.state().batches[0].createdCount, 3);
  assert.equal(db.state().notifications.length, 1);
  assert.ok(db.state().notifications[0].resolvedAt);
  await runImport([rows[0]], "QUARANTINE_RESOLUTION", null, { quarantinedRecordId: "r0" });
  assert.equal(db.state().audits.length, 3);
  await assert.rejects(runImport([{ ...rows[0], name: "different" }], "QUARANTINE_RESOLUTION", null, { quarantinedRecordId: "r0" }), /different values/);
});

test("stale preview is quarantined and duplicate siblings cannot be released independently", async (t) => {
  const db = database();
  db.allowAll();
  const originals = Object.fromEntries(Object.keys(db.tx).map((name) => [name, (prisma as any)[name]]));
  for (const [name, delegate] of Object.entries(db.tx)) (prisma as any)[name] = delegate;
  t.after(() => { for (const [name, delegate] of Object.entries(originals)) (prisma as any)[name] = delegate; });
  t.mock.method(prisma, "$transaction", db.transaction as any);
  await assert.rejects(runImport([rows[0]], "EXCEL_WORKBOOK"), /required/);
  const stale = await runImport([rows[0]], "EXCEL_WORKBOOK", null, { idempotencyKey: "stale", expectedVersions: { E1: "old-version" } });
  assert.equal(stale.totals.QUARANTINED, 1);
  assert.equal(db.state().resources.length, 0);
  const duplicate = await runImport([rows[0], rows[0]], "TEST", null, { idempotencyKey: "duplicates" });
  assert.equal(duplicate.totals.QUARANTINED, 2);
  await Promise.all([runImport([rows[0]], "QUARANTINE_RESOLUTION", null, { quarantinedRecordId: "r1" }), runImport([rows[0]], "QUARANTINE_RESOLUTION", null, { quarantinedRecordId: "r2" })]);
  assert.equal(db.state().resources.length, 0);
  assert.equal(db.state().records[1].status, "QUARANTINED");
  assert.match(db.state().records[1].errors.join(), /siblings/);
});

test("CSV preserves unmapped source and physical ending lines without importing email", () => {
  const parsed = parseImportCsvManifest('employeeId,name,email,extra\nE1,"Two\nLines",private@example.com, original \n\n,,,unmapped\n');
  assert.equal(parsed.blankRowCount, 1);
  assert.deepEqual(parsed.manifest.map((row) => row.rowNumber), [3, 5]);
  assert.equal(parsed.manifest[0].source.extra, " original ");
  assert.equal(parsed.manifest[0].source.email, "[REDACTED EMAIL]");
  assert.equal((parsed.rows[0] as any).email, undefined);
});

test("serialization retry is bounded and does not retry unexpected failures", async () => {
  let attempts = 0;
  await assert.rejects(retryImportTransaction(async () => { attempts++; throw new Prisma.PrismaClientKnownRequestError("serialization", { code: "P2034", clientVersion: "5" }); }));
  assert.equal(attempts, 4);
  attempts = 0;
  await assert.rejects(retryImportTransaction(async () => { attempts++; throw new Error("unexpected"); }));
  assert.equal(attempts, 1);
});
