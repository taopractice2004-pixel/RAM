"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDailyImportJob = runDailyImportJob;
const fs_1 = __importDefault(require("fs"));
const importService_1 = require("../services/importService");
const importSheetPath_1 = require("../utils/importSheetPath");
const DEFAULT_SHEET_PATH = (0, importSheetPath_1.resolveImportSheetPath)();
/** FR-1.4: daily scheduled import from the HRMIS (or manual input sheet fallback). */
async function runDailyImportJob() {
    if (!fs_1.default.existsSync(DEFAULT_SHEET_PATH)) {
        console.warn(`[importJob] No input sheet found at ${DEFAULT_SHEET_PATH}, skipping daily import.`);
        return;
    }
    const csvText = fs_1.default.readFileSync(DEFAULT_SHEET_PATH, "utf-8");
    const rows = (0, importService_1.parseImportCsv)(csvText);
    const batch = await (0, importService_1.runImport)(rows, "HRMIS_DAILY", null);
    console.log(`[importJob] Daily import complete: created=${batch.createdCount} updated=${batch.updatedCount} quarantined=${batch.quarantinedCount}`);
}
