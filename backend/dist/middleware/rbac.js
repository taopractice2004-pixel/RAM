"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.THRESHOLD_CONFIG_ROLES = exports.AUTHORIZATION_MANAGER_ROLES = exports.CROSS_PORTFOLIO_READ_ROLES = exports.LIFECYCLE_ACTION_ROLES = void 0;
exports.requireRole = requireRole;
exports.hasFullPortfolioBypass = hasFullPortfolioBypass;
exports.isAuthorizedForPortfolio = isAuthorizedForPortfolio;
exports.assertPortfolioAuthorized = assertPortfolioAuthorized;
exports.readScopePortfolioIds = readScopePortfolioIds;
exports.canViewSensitiveResourceData = canViewSensitiveResourceData;
exports.canEverViewCost = canEverViewCost;
const audit_1 = require("../utils/audit");
/**
 * Role capability model, matched strictly to the requirements doc's Section 5.3
 * Role x Action Permissions Matrix. Where FR-2.2/FR-12.3/Workflow 7.5 narrative text
 * elsewhere in the doc conflicts with this matrix, the matrix wins per explicit
 * instruction - see README "Access Control Design Decisions" for the history.
 */
// Allocate / Reallocate / Manually reallocate from Bench: Admin (all portfolios),
// RMG (authorized portfolios only). HR, Delivery, TA/Viewer = No.
exports.LIFECYCLE_ACTION_ROLES = ["ADMIN", "RMG"];
// Organization-wide read bypass for DASHBOARDS/REPORTS/FORECASTING only (FR-12.5) -
// this is a separate concept from per-resource cost/PIP visibility below, and is not
// one of the 9 rows in the Section 5.3 matrix.
exports.CROSS_PORTFOLIO_READ_ROLES = ["ADMIN", "RMG", "HR"];
// Roles allowed to manage portfolio authorizations: Admin only per the matrix.
exports.AUTHORIZATION_MANAGER_ROLES = ["ADMIN"];
// Roles allowed to configure thresholds (bench aging, committed window): Admin + RMG.
exports.THRESHOLD_CONFIG_ROLES = ["ADMIN", "RMG"];
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user)
            return res.status(401).json({ error: "Unauthenticated" });
        if (!roles.includes(req.user.role)) {
            void (0, audit_1.writeAudit)({
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
function hasFullPortfolioBypass(role) {
    return role === "ADMIN";
}
/** True if the user is authorized (via explicit grant) for a given portfolio. */
function isAuthorizedForPortfolio(user, portfolioId) {
    if (hasFullPortfolioBypass(user.role))
        return true;
    return user.authorizedPortfolioIds.includes(portfolioId);
}
/**
 * Enforce portfolio authorization for a lifecycle action across one or more portfolios
 * (e.g. both losing and receiving portfolio in a cross-portfolio reallocation - FR-12.2).
 * Blocks and audit-logs on failure per FR-12.4.
 */
async function assertPortfolioAuthorized(req, res, portfolioIds, entityType, entityId) {
    const user = req.user;
    if (hasFullPortfolioBypass(user.role))
        return true;
    const unauthorized = portfolioIds.filter((pid) => !user.authorizedPortfolioIds.includes(pid));
    if (unauthorized.length > 0) {
        await (0, audit_1.writeAudit)({
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
function readScopePortfolioIds(user) {
    if (exports.CROSS_PORTFOLIO_READ_ROLES.includes(user.role))
        return null;
    return user.authorizedPortfolioIds;
}
/**
 * Section 5.3 rows "View cost/compensation" and "View performance/PIP status" share
 * an identical rule: Admin/HR see it everywhere, RMG only within authorized portfolios,
 * Delivery/TA/Viewer never. Used to redact costRate and performanceRecords per resource.
 */
function canViewSensitiveResourceData(user, portfolioId) {
    if (user.role === "ADMIN" || user.role === "HR")
        return true;
    if (user.role === "RMG")
        return user.authorizedPortfolioIds.includes(portfolioId);
    return false;
}
/** True if the role could ever view cost data for at least one portfolio (used to gate cost-range filters/UI). */
function canEverViewCost(role) {
    return role === "ADMIN" || role === "HR" || role === "RMG";
}
