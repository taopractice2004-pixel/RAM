"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.portfolioReadWhere = portfolioReadWhere;
const rbac_1 = require("../middleware/rbac");
/** Returns a Prisma `where` fragment restricting to the caller's readable portfolios, or {} if unrestricted. */
function portfolioReadWhere(req, field = "portfolioId") {
    const scope = (0, rbac_1.readScopePortfolioIds)(req.user);
    if (scope === null)
        return {};
    return { [field]: { in: scope } };
}
