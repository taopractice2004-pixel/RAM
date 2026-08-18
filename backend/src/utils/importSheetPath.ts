import path from "path";

/**
 * Resolves the HRMIS/manual input sheet location. Prefer the explicit env var (set
 * differently per environment - see docker-compose.yml and .env.example) since __dirname-based
 * relative traversal differs between ts-node/tsx (running from backend/src) and the compiled
 * Docker image (running from /app/dist), and can't be made to resolve correctly in both
 * with a single relative expression.
 */
export function resolveImportSheetPath(): string {
  return process.env.HRMIS_INPUT_SHEET || path.join(process.cwd(), "data", "hrmis_import.csv");
}
