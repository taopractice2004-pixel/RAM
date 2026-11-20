"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliverEmail = deliverEmail;
const express_1 = require("express");
const zod_1 = require("zod");
const nodemailer_1 = __importDefault(require("nodemailer"));
const prisma_1 = require("../prisma");
const rbac_1 = require("../middleware/rbac");
const audit_1 = require("../utils/audit");
const router = (0, express_1.Router)();
const defaultRules = [
    { key: "ADVANCE_BENCH_NOTICE", recipients: ["RMG Team", "Portfolio Manager", "Delivery Team"], schedule: "09:00" },
    { key: "BENCH_AGEING", recipients: ["Employee", "Portfolio Leader", "RMG Leader"], schedule: "09:00" },
    { key: "ALLOCATION_MODIFIED", recipients: ["RMG Team", "Portfolio Manager"], schedule: "instant" },
    { key: "BENCH_REPORT", recipients: ["TA Team"], schedule: "08:00" },
];
const ruleLabels = {
    ADVANCE_BENCH_NOTICE: "Advance bench notice",
    BENCH_AGEING: "Bench ageing alert",
    ALLOCATION_MODIFIED: "Allocation modified",
    BENCH_REPORT: "Bench report",
};
async function rulesWithDefaults() {
    const rows = await prisma_1.prisma.notificationRule.findMany();
    return defaultRules.map((rule) => rows.find((row) => row.key === rule.key) ?? { ...rule, enabled: true, id: rule.key });
}
router.get("/", async (req, res) => {
    const notifications = await prisma_1.prisma.notification.findMany({
        where: { userId: req.user.id },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 200,
    });
    const ids = notifications.map((item) => item.relatedEntityId).filter((id) => Boolean(id));
    const resources = ids.length ? await prisma_1.prisma.resource.findMany({ where: { id: { in: ids } }, include: { portfolio: true } }) : [];
    const resourceMap = new Map(resources.map((resource) => [resource.id, resource]));
    const history = await prisma_1.prisma.auditLog.findMany({ where: { entityType: "Notification", entityId: { in: notifications.map((item) => item.id) } }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" } });
    res.json(notifications.map((item) => ({ ...item, resource: item.relatedEntityId ? resourceMap.get(item.relatedEntityId) ?? null : null, history: history.filter((entry) => entry.entityId === item.id) })));
});
router.post("/:id/read", async (req, res) => {
    const notification = await prisma_1.prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!notification || notification.userId !== req.user.id)
        return res.status(404).json({ error: "Not found" });
    const updated = await prisma_1.prisma.notification.update({ where: { id: notification.id }, data: { read: true } });
    res.json(updated);
});
router.post("/:id/resolve", async (req, res) => {
    const parsed = zod_1.z.object({ reason: zod_1.z.enum(["Action taken", "No action needed", "Handled outside the system"]).optional(), note: zod_1.z.string().trim().max(1000).optional() }).safeParse(req.body ?? {});
    if (!parsed.success)
        return res.status(400).json({ error: "Invalid resolution details" });
    const notification = await prisma_1.prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!notification || notification.userId !== req.user.id)
        return res.status(404).json({ error: "Not found" });
    const updated = await prisma_1.prisma.notification.update({ where: { id: notification.id }, data: { read: true, resolvedAt: new Date(), resolvedById: req.user.id, resolveReason: parsed.data.reason ?? null, resolveNote: parsed.data.note ?? null } });
    await (0, audit_1.writeAudit)({ actorId: req.user.id, action: "ALERT_RESOLVED", entityType: "Notification", entityId: notification.id, reason: parsed.data.reason, message: parsed.data.note });
    res.json(updated);
});
router.post("/resolve-many", async (req, res) => {
    const parsed = zod_1.z.object({ ids: zod_1.z.array(zod_1.z.string()).min(1).max(200), reason: zod_1.z.enum(["Action taken", "No action needed", "Handled outside the system"]), note: zod_1.z.string().trim().max(1000).optional() }).safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: "Invalid resolution details" });
    const now = new Date();
    const result = await prisma_1.prisma.notification.updateMany({ where: { id: { in: parsed.data.ids }, userId: req.user.id, resolvedAt: null }, data: { read: true, resolvedAt: now, resolvedById: req.user.id, resolveReason: parsed.data.reason, resolveNote: parsed.data.note ?? null } });
    await Promise.all(parsed.data.ids.map((id) => (0, audit_1.writeAudit)({ actorId: req.user.id, action: "ALERT_RESOLVED", entityType: "Notification", entityId: id, reason: parsed.data.reason, message: parsed.data.note })));
    res.json({ updated: result.count });
});
router.get("/rules", async (_req, res) => {
    const rules = await rulesWithDefaults();
    const logs = await prisma_1.prisma.notificationEmailLog.findMany({ orderBy: { sentAt: "desc" }, take: 500 });
    res.json({ rules: rules.map((rule) => ({ ...rule, label: ruleLabels[rule.key], lastRun: logs.find((log) => log.ruleKey === rule.key) ?? null, sentCount: logs.filter((log) => log.ruleKey === rule.key && log.status === "SENT").length })), emailsConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM) });
});
router.put("/rules/:key", (0, rbac_1.requireRole)("ADMIN", "RMG"), async (req, res) => {
    const parsed = zod_1.z.object({ enabled: zod_1.z.boolean(), recipients: zod_1.z.array(zod_1.z.string().trim().min(1).max(100)).min(1).max(20), schedule: zod_1.z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^instant$/) }).safeParse(req.body);
    if (!parsed.success || !defaultRules.some((item) => item.key === req.params.key))
        return res.status(400).json({ error: "Invalid rule configuration" });
    const rule = await prisma_1.prisma.notificationRule.upsert({ where: { key: req.params.key }, create: { key: req.params.key, ...parsed.data, updatedById: req.user.id }, update: { ...parsed.data, updatedById: req.user.id } });
    res.json(rule);
});
router.post("/rules/:key/test", (0, rbac_1.requireRole)("ADMIN", "RMG"), async (req, res) => {
    const key = req.params.key;
    if (!defaultRules.some((item) => item.key === key))
        return res.status(404).json({ error: "Rule not found" });
    const result = await deliverEmail(key, req.user.email, `[Test] ${ruleLabels[key]}`, `This is a test email for ${ruleLabels[key]}.`);
    res.status(result.status === "SENT" ? 200 : 503).json({ ...result, message: result.status === "SENT" ? `Test email sent to ${req.user.email}` : `Email could not be delivered: ${result.error}` });
});
async function deliverEmail(ruleKey, recipient, subject, text, notificationId, attachments) {
    let status = "FAILED";
    let error = null;
    try {
        if (!process.env.SMTP_HOST || !process.env.SMTP_FROM)
            throw new Error("SMTP is not configured");
        const port = Number(process.env.SMTP_PORT || 587);
        const transport = nodemailer_1.default.createTransport({ host: process.env.SMTP_HOST, port, secure: process.env.SMTP_SECURE === "true", auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined });
        await transport.sendMail({ from: process.env.SMTP_FROM, to: recipient, subject, text, attachments });
        status = "SENT";
    }
    catch (failure) {
        error = failure instanceof Error ? failure.message : "Email delivery failed";
    }
    await prisma_1.prisma.notificationEmailLog.create({ data: { ruleKey, notificationId, recipient, status, error } });
    return { status, error };
}
router.post("/read-all", async (req, res) => {
    await prisma_1.prisma.notification.updateMany({ where: { userId: req.user.id, read: false }, data: { read: true } });
    res.json({ ok: true });
});
exports.default = router;
