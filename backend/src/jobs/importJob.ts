import fs from "fs";
import { parseImportCsv, runImport } from "../services/importService";
import { resolveImportSheetPath } from "../utils/importSheetPath";

const DEFAULT_SHEET_PATH = resolveImportSheetPath();

/** FR-1.4: daily scheduled import from the HRMIS (or manual input sheet fallback). */
export async function runDailyImportJob() {
  if (!fs.existsSync(DEFAULT_SHEET_PATH)) {
    console.warn(`[importJob] No input sheet found at ${DEFAULT_SHEET_PATH}, skipping daily import.`);
    return;
  }
  const csvText = fs.readFileSync(DEFAULT_SHEET_PATH, "utf-8");
  const rows = parseImportCsv(csvText);
  const batch = await runImport(rows, "HRMIS_DAILY", null);
  console.log(
    `[importJob] Daily import complete: created=${batch.createdCount} updated=${batch.updatedCount} quarantined=${batch.quarantinedCount}`
  );
}
