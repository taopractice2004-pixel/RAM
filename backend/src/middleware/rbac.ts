import { NextFunction, Request, Response } from "express";
import { RoleName } from "@prisma/client";
import { writeAudit } from "../utils/audit";

/**
 * Role capability model, matched strictly to the requirements doc's Section 5.3
 * Role x Action Permissions Matrix. Where FR-2.2/FR-12.3/Workflow 7.5 narrative text
 * elsewhere in the doc conflicts with this matrix, the matrix wins per explicit
 * instruction - see README "Access Control Design Decisions" for the history.
 */

// Allocate / Reallocate / Manually reallocate from Bench: Admin (all portfolios),
// RMG (authorized portfolios only). HR, Delivery, TA/Viewer = No.
export const LIFECYCLE_ACTION_ROLES: RoleName[] = ["ADMIN", "RMG"];

// Organization-wide read bypass for DASHBOARDS/REPORTS/FORECASTING only (FR-12.5) -
// this is a separate concept from per-resource cost/PIP visibility below, and is not
// one of the 9 rows in the Section 5.3 matrix.
export const CROSS_PORTFOLIO_READ_ROLES: RoleName[] = ["ADMIN", "RMG", "HR"];

// Roles allowed to manage portfolio authorizations: Admin only per the matrix.
export const AUTHORIZATION_MANAGER_ROLES: RoleName[] = ["ADMIN"];

// Roles allowed to configure thresholds (bench aging, committed window): Admin + RMG.
export const THRESHOLD_CONFIG_ROLES: RoleName[] = ["ADMIN", "RMG"];

export function requireRole(...roles: RoleName[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Unauthenticated" });
    if (!roles.includes(req.user.role)) {
      void writeAudit({
        actorId: req.user.id,
        action: "BLOCKED_ROLE_CHECK",
        entityType: "Route",
        entityId: req.path,
        success: false,
        message: `Role ${req.user.role} not permitted; required one of ${roles.join(", ")}`,
      });
      return res.status(403).json({ error: "Insufficient role for this action" });
    }
    next();
  };
}

/** True if the user can act on / act-view every portfolioId in the list without restriction. */
export function hasFullPortfolioBypass(role: RoleName): boolean {
  return role === "ADMIN";
}

/** True if the user is authorized (via explicit grant) for a given portfolio. */
export function isAuthorizedForPortfolio(
  user: { role: RoleName; authorizedPortfolioIds: string[] },
  portfolioId: string
): boolean {
  if (hasFullPortfolioBypass(user.role)) return true;
  return user.authorizedPortfolioIds.includes(portfolioId);
}

/**
 * Enforce portfolio authorization for a lifecycle action across one or more portfolios
 * (e.g. both losing and receiving portfolio in a cross-portfolio reallocation - FR-12.2).
 * Blocks and audit-logs on failure per FR-12.4.
 */
export async function assertPortfolioAuthorized(
  req: Request,
  res: Response,
  portfolioIds: string[],
  entityType: string,
  entityId?: string
): Promise<boolean> {
  const user = req.user!;
  if (hasFullPortfolioBypass(user.role)) return true;

  const unauthorized = portfolioIds.filter((pid) => !user.authorizedPortfolioIds.includes(pid));
  if (unauthorized.length > 0) {
    await writeAudit({
      actorId: user.id,
      action: "BLOCKED_PORTFOLIO_SCOPE",
      entityType,
      entityId: entityId ?? null,
      portfolioId: unauthorized[0],
      success: false,
      message: `User not authorized for portfolio(s): ${unauthorized.join(", ")}`,
    });
    res.status(403).json({
      error: "Out-of-scope action: you are not authorized for one or more portfolios involved",
      unauthorizedPortfolioIds: unauthorized,
    });
    return false;
  }
  return true;
}

/** Portfolio IDs a user may read across (null = unrestricted / all portfolios). */
export function readScopePortfolioIds(user: {
  role: RoleName;
  authorizedPortfolioIds: string[];
}): string[] | null {
  if (CROSS_PORTFOLIO_READ_ROLES.includes(user.role)) return null;
  return user.authorizedPortfolioIds;
}

/**
 * Section 5.3 rows "View cost/compensation" and "View performance/PIP status" share
 * an identical rule: Admin/HR see it everywhere, RMG only within authorized portfolios,
 * Delivery/TA/Viewer never. Used to redact costRate and performanceRecords per resource.
 */
export function canViewSensitiveResourceData(
  user: { role: RoleName; authorizedPortfolioIds: string[] },
  portfolioId: string
): boolean {
  if (user.role === "ADMIN" || user.role === "HR") return true;
  if (user.role === "RMG") return user.authorizedPortfolioIds.includes(portfolioId);
  return false;
}

/** True if the role could ever view cost data for at least one portfolio (used to gate cost-range filters/UI). */
export function canEverViewCost(role: RoleName): boolean {
  return role === "ADMIN" || role === "HR" || role === "RMG";
}
