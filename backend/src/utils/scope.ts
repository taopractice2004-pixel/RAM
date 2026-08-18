import { Request } from "express";
import { readScopePortfolioIds } from "../middleware/rbac";

/** Returns a Prisma `where` fragment restricting to the caller's readable portfolios, or {} if unrestricted. */
export function portfolioReadWhere(req: Request, field: string = "portfolioId") {
  const scope = readScopePortfolioIds(req.user!);
  if (scope === null) return {};
  return { [field]: { in: scope } };
}
