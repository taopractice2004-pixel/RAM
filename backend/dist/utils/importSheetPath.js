"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveImportSheetPath = resolveImportSheetPath;
const path_1 = __importDefault(require("path"));
/**
 * Resolves the HRMIS/manual input sheet location. Prefer the explicit env var (set
 * differently per environment - see docker-compose.yml and .env.example) since __dirname-based
 * relative traversal differs between ts-node/tsx (running from backend/src) and the compiled
 * Docker image (running from /app/dist), and can't be made to resolve correctly in both
 * with a single relative expression.
 */
function resolveImportSheetPath() {
    return process.env.HRMIS_INPUT_SHEET || path_1.default.join(process.cwd(), "data", "hrmis_import.csv");
}
