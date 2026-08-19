"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toCsv = toCsv;
function toCsv(rows) {
    if (rows.length === 0)
        return "";
    const headers = Object.keys(rows[0]);
    const escape = (val) => {
        const s = val === null || val === undefined ? "" : String(val);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const row of rows) {
        lines.push(headers.map((h) => escape(row[h])).join(","));
    }
    return lines.join("\n");
}
