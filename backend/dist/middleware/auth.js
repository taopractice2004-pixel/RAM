"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signToken = signToken;
exports.requireAuth = requireAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../prisma");
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
function signToken(userId) {
    return jsonwebtoken_1.default.sign({ sub: userId }, JWT_SECRET, { expiresIn: "8h" });
}
async function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or invalid Authorization header" });
    }
    const token = header.slice("Bearer ".length);
    let payload;
    try {
        payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
    }
    catch {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
            portfolioAuthorizations: { where: { isActive: true } },
        },
    });
    if (!user || !user.active) {
        return res.status(401).json({ error: "User not found or inactive" });
    }
    req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        authorizedPortfolioIds: user.portfolioAuthorizations.map((a) => a.portfolioId),
    };
    next();
}
