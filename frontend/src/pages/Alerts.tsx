import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Notification, Portfolio } from "../types";
import { useAuth } from "../context/AuthContext";

type AlertItem = Notification & { resolveReason?: string | null; resolveNote?: string | null; resource?: { employeeId: string; name: string; email?: string | null; portfolio?: Portfolio; status?: string; benchSince?: string | null } | null; history?: { id: string; action: string; createdAt: string; reason?: string | null; message?: string | null; actor?: { name: string } | null }[] };
type Rule = { id: string; key: string; label: string; enabled: boolean; recipients: string[]; schedule: string; sentCount: number; lastRun: { sentAt: string; recipient: string; status: string } | null };

const categories = [
  { key: "bench", title: "Bench", types: ["BENCH_AGING", "ADVANCE_BENCH_NOTICE", "PAST_60_DAYS", "EMAIL_PROBLEM"] },
  { key: "demand", title: "Demand", types: ["DEMAND_RAISED", "UNMET_DEMAND"] },
  { key: "allocation", title: "Allocation", types: ["REALLOCATION"] },
  { key: "approvals", title: "Approvals", types: ["TERMINATION_APPROVAL_NEEDED", "ML_APPROVAL_NEEDED"] },
  { key: "termination", title: "Termination", types: ["TERMINATION"] },
  { key: "imports", title: "Import review", types: ["IMPORT_QUARANTINE"] },
] as const;
const subcategories = ["All", "Advance notice", "Ageing day 31–60", "Past 60 days", "Email problems"];
const ruleInfo: Record<string, string> = {
  ADVANCE_BENCH_NOTICE: "One notice at 60 days before bench, then a daily email during the final 30 days.",
  BENCH_AGEING: "Employee is on bench from day 31 to day 60. One email a day.",
  ALLOCATION_MODIFIED: "Any change to an allocation: end date, extend, bulk update. Bulk changes send one summary.",
  BENCH_REPORT: "Report of everyone on bench: total, ageing, role and skills, as Excel.",
};

export default function Alerts() {
  const [categoryKey, setCategoryKey] = useState("bench");
  const [subcat, setSubcat] = useState("All");
  const [status, setStatus] = useState("Unresolved");
  const [query, setQuery] = useState("");
  const [portfolio, setPortfolio] = useState("My portfolio");
  const [sort, setSort] = useState("Most urgent");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drawer, setDrawer] = useState<AlertItem | null>(null);
  const [rulesView, setRulesView] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [ruleSchedule, setRuleSchedule] = useState("");
  const [ruleRecipients, setRuleRecipients] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const { user, portfolios } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: alerts = [], isLoading } = useQuery<AlertItem[]>({ queryKey: ["notifications"], queryFn: async () => (await api.get("/notifications")).data, refetchInterval: 30000 });
  const { data: rulesData } = useQuery<{ rules: Rule[]; emailsConfigured: boolean }>({ queryKey: ["notification-rules"], queryFn: async () => (await api.get("/notifications/rules")).data, enabled: rulesView });

  const active = alerts.filter((item) => !item.resolvedAt);
  const category = categories.find((item) => item.key === categoryKey)!;
  const scoped = useMemo(() => alerts.filter((item) => category.types.includes(item.type as never)), [alerts, category]);
  const counts = categories.map((item) => ({ ...item, count: active.filter((alert) => item.types.includes(alert.type as never)).length }));
  const filtered = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    let rows = scoped.filter((item) => status === "All" || (status === "Resolved" ? Boolean(item.resolvedAt) : !item.resolvedAt));
    if (categoryKey === "bench" && subcat !== "All") rows = rows.filter((item) => item.type.toLowerCase().includes(subcat === "Advance notice" ? "advance" : subcat === "Ageing day 31–60" ? "aging" : subcat === "Past 60 days" ? "past" : "email"));
    if (lowered) rows = rows.filter((item) => [item.message, item.resource?.name, item.resource?.employeeId, item.resource?.portfolio?.name].some((value) => value?.toLowerCase().includes(lowered)));
    if (portfolio !== "My portfolio") rows = rows.filter((item) => item.resource?.portfolio?.id === portfolio || item.resource?.portfolio?.name === portfolio);
    const urgency = (item: AlertItem) => item.type.includes("EMAIL") || item.type.includes("PAST") ? 0 : item.type.includes("ADVANCE") || item.type.includes("AGING") ? 1 : 2;
    return [...rows].sort((a, b) => sort === "Most recent" ? b.createdAt.localeCompare(a.createdAt) : urgency(a) - urgency(b) || a.createdAt.localeCompare(b.createdAt));
  }, [scoped, status, subcat, query, portfolio, sort, categoryKey]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    await queryClient.invalidateQueries({ queryKey: ["notification-rules"] });
  }

  async function openAlert(item: AlertItem) {
    setDrawer(item);
    if (!item.read) {
      await api.post(`/notifications/${item.id}/read`);
      await refresh();
    }
  }

  async function saveRule() {
    if (!editingRule) return;
    setSaving(true);
    try {
      await api.put(`/notifications/rules/${editingRule.key}`, { enabled: editingRule.enabled, recipients: ruleRecipients.split(",").map((value) => value.trim()).filter(Boolean), schedule: ruleSchedule });
      setEditingRule(null);
      setNotice("Rule updated");
      await queryClient.invalidateQueries({ queryKey: ["notification-rules"] });
    } catch {
      setNotice("Could not update rule");
    } finally {
      setSaving(false);
    }
  }

  async function testEmail(rule: Rule) {
    try {
      const response = await api.post(`/notifications/rules/${rule.key}/test`);
      setNotice(response.data.message);
    } catch (error: any) {
      setNotice(error?.response?.data?.message || "Test email failed. Check SMTP configuration.");
    }
  }

  function openRelated(item: AlertItem) {
    if (item.relatedEntityType === "Resource" && item.relatedEntityId) navigate(`/resources/${item.relatedEntityId}`);
    else if (item.relatedEntityType === "DemandRequest") navigate("/demand");
    else if (item.relatedEntityType === "TerminationRequest" || item.relatedEntityType === "MaternityLeaveRequest") navigate("/approvals");
    else if (item.relatedEntityType === "ImportBatch") navigate(`/admin?tab=imports&batch=${encodeURIComponent(item.relatedEntityId || "")}`);
  }

  function display(item: AlertItem) {
    if (item.type === "BENCH_AGING") return `Day ${item.resource?.benchSince ? Math.floor((Date.now() - new Date(item.resource.benchSince).getTime()) / 86400000) : "—"} of 60 on bench`;
    if (item.type.includes("ADVANCE")) return item.message;
    if (item.type.includes("EMAIL")) return item.message;
    if (item.type.includes("PAST")) return item.message;
    return item.message;
  }

  return <div className="alerts-page">
    {!rulesView ? <>
      <div className="alerts-heading"><div><h1>Alerts</h1><p>Notifications grouped by category. Track each alert and follow through on the next step.</p></div><div className="alerts-heading-actions"><span className="unresolved-total">{active.length} unresolved</span><button className="alert-button" onClick={() => setRulesView(true)}>⚙ Rules and schedule</button></div></div>
      <div className="alert-categories">{counts.map((item) => <button key={item.key} className={`alert-category ${categoryKey === item.key ? "selected" : ""}`} onClick={() => { setCategoryKey(item.key); setSubcat("All"); setSelectedIds([]); }}><strong>{item.title}</strong><div><b>{item.count}</b><span>{item.count ? "unresolved" : "All clear ✓"}</span></div></button>)}</div>
      <section className="alert-workspace">
        <div className="alert-filters">{categoryKey === "bench" && <div className="alert-subfilters"><span>BENCH</span>{subcategories.map((label) => <button key={label} className={subcat === label ? "active" : ""} onClick={() => setSubcat(label)}>{label}{label === "All" ? ` ${active.filter((item) => category.types.includes(item.type as never)).length}` : ` · ${active.filter((item) => item.type.toLowerCase().includes(label === "Advance notice" ? "advance" : label === "Ageing day 31–60" ? "aging" : label === "Past 60 days" ? "past" : "email")).length}`}</button>)}</div>}
          <div className="alert-toolbar"><div className="segmented">{["Unresolved", "Resolved", "All"].map((value) => <button className={status === value ? "active" : ""} key={value} onClick={() => setStatus(value)}>{value}{value === "Unresolved" ? ` ${scoped.filter((item) => !item.resolvedAt).length}` : ""}</button>)}</div><input className="alert-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee, ID, project…"/><select className="alert-select" value={portfolio} onChange={(event) => setPortfolio(event.target.value)}><option>My portfolio</option>{portfolios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select className="alert-select" value={sort} onChange={(event) => setSort(event.target.value)}><option>Most urgent</option><option>Most recent</option></select></div>
        </div>
        {notice && <button className="alert-notice" onClick={() => setNotice("")}>{notice} <span>×</span></button>}
        <div className="alert-table-wrap"><table className="alert-table"><thead><tr><th className="check-cell"><input type="checkbox" aria-label="Select all alerts" checked={filtered.length > 0 && filtered.every((item) => selectedIds.includes(item.id))} onChange={(event) => setSelectedIds(event.target.checked ? filtered.filter((item) => !item.resolvedAt).map((item) => item.id) : [])}/></th><th>URGENCY</th><th>ALERT</th><th>EMPLOYEE</th><th>WHAT IS HAPPENING</th><th>RAISED</th><th>EMAILED</th><th>NEXT STEP</th></tr></thead><tbody>{isLoading ? <tr><td colSpan={8} className="table-empty">Loading alerts…</td></tr> : filtered.length ? filtered.map((item) => { const high = item.type.includes("EMAIL") || item.type.includes("PAST") || item.type.includes("ADVANCE"); const selected = selectedIds.includes(item.id); return <tr key={item.id} onClick={() => openAlert(item)} className={selected ? "row-selected" : ""}><td className="check-cell" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selected} disabled={Boolean(item.resolvedAt)} onChange={(event) => setSelectedIds((ids) => event.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id))}/></td><td><span className={`urgency ${high ? "high" : "medium"}`}><i/> {high ? "High" : "Medium"}</span></td><td className="strong-cell">{item.type === "BENCH_AGING" ? "Ageing" : item.type.includes("ADVANCE") ? "Advance notice" : item.type.includes("PAST") ? "Past 60 days" : item.type.includes("EMAIL") ? "Email problem" : item.type.replace(/_/g, " ")}</td><td><b>{item.resource?.name || item.message.match(/^([^(:]+)/)?.[1] || "—"}</b><small>{item.resource?.employeeId || (item.relatedEntityId ? item.relatedEntityId.slice(0, 8) : "")}</small></td><td>{display(item)}</td><td>{new Date(item.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</td><td>{item.type.includes("EMAIL") ? <span className="email-failed">✕ Not delivered</span> : <><span className="email-sent">✓ Emailed</span><small>Employee, Leaders</small></>}</td><td className="actions-cell" onClick={(event) => event.stopPropagation()}>{item.resolvedAt ? <span className="resolved-label">Resolved</span> : <button className="row-action" onClick={() => openRelated(item)}>{item.type.includes("ADVANCE") ? "↻ Extend" : item.type.includes("EMAIL") ? "Fix recipient" : "Allocate"}</button>}</td></tr>; }) : <tr><td colSpan={8} className="table-empty">No alerts match these filters.</td></tr>}</tbody></table><div className="alert-table-footer">Showing {Math.min(filtered.length, 6)} of {filtered.length} · Click a row for the notification history. An alert also resolves by itself when the cause is fixed.</div></div>
      </section>
    </> : <>
      <div className="rules-heading"><div><button className="rules-back" onClick={() => setRulesView(false)}>Alerts ›</button><h1>Rules and schedule</h1><p>Who gets which email, and when. Only RMG and Admin can change these.</p></div><span className={`mail-status ${rulesData?.emailsConfigured ? "configured" : ""}`}>{rulesData?.emailsConfigured ? "Emails are being sent" : "Email service not configured"}</span></div>
      <div className="rules-table-wrap"><table className="rules-table"><thead><tr><th>RULE</th><th>WHEN IT FIRES</th><th>SENT TO</th><th>SCHEDULE</th><th>ON</th><th>LAST / NEXT RUN</th><th/></tr></thead><tbody>{(rulesData?.rules || []).map((rule) => <tr key={rule.key}><td><b>{rule.label}</b></td><td>{ruleInfo[rule.key]}</td><td><div className="recipient-list">{rule.recipients.map((recipient) => <span key={recipient}>{recipient}</span>)}</div></td><td>{rule.schedule === "instant" ? "Instantly" : `Daily ${rule.schedule}`}</td><td><button className={`rule-toggle ${rule.enabled ? "on" : ""}`} disabled={!(["ADMIN", "RMG"] as string[]).includes(user?.role || "")} onClick={() => void api.put(`/notifications/rules/${rule.key}`, { enabled: !rule.enabled, recipients: rule.recipients, schedule: rule.schedule }).then(() => queryClient.invalidateQueries({ queryKey: ["notification-rules"] }))}><i/></button></td><td>{rule.lastRun ? `Last ${new Date(rule.lastRun.sentAt).toLocaleString()} · ${rule.sentCount} sent` : "No email run recorded"}<small>Next {rule.schedule === "instant" ? "On next change" : `next day ${rule.schedule}`}</small></td><td className="rule-actions"><button className="alert-button" onClick={() => void testEmail(rule)}>Send test email</button><button className="alert-button" disabled={!(["ADMIN", "RMG"] as string[]).includes(user?.role || "")} onClick={() => { setEditingRule(rule); setRuleSchedule(rule.schedule); setRuleRecipients(rule.recipients.join(", ")); }}>Edit</button></td></tr>)}<tr className="minimum-notice"><td><b>Minimum 2-month notice</b></td><td colSpan={3}>A bench date earlier than today + 2 months is rejected when saving. Immediate bench moves are not allowed.</td><td colSpan={2}><span className="rule-always">Always on</span><small>Not an email. A save-time check.</small></td><td/></tr></tbody></table></div><p className="rules-footnote">Edit lets you change the recipient groups and the send time. Send test email sends one sample to your own address only.</p>
    </>}
    {drawer && <div className="history-backdrop" onClick={() => setDrawer(null)}><aside className="history-drawer" onClick={(event) => event.stopPropagation()}><header><div><h2>{drawer.type === "BENCH_AGING" ? `Bench ageing · ${drawer.resource?.name || "Resource"}` : `${drawer.type.replace(/_/g, " ")} · ${drawer.resource?.name || "Alert"}`}</h2><p>{drawer.resource?.employeeId || drawer.relatedEntityId} · {drawer.resource?.portfolio?.name ? `Portfolio: ${drawer.resource.portfolio.name}` : "Notification history"}</p></div><button className="alert-button" onClick={() => setDrawer(null)}>Close</button></header><div className="history-content"><div className="history-callout"><b>{drawer.resource?.benchSince ? `On bench since ${new Date(drawer.resource.benchSince).toLocaleDateString()}. ` : "Alert details. "}</b>{drawer.type === "BENCH_AGING" ? "Daily emails run from day 31 to day 60 and stop on day 60." : drawer.message}</div><h3>RECIPIENTS</h3><div className="recipient-list"><span>Employee · {drawer.resource?.name || "Employee"}</span><span>Portfolio Leader · {drawer.resource?.portfolio?.managerName || "Portfolio leader"}</span><span>RMG Leader</span></div><h3>NOTIFICATION HISTORY</h3><div className="history-timeline">{drawer.history?.length ? drawer.history.map((entry) => <div key={entry.id}><b>{new Date(entry.createdAt).toLocaleString()} · {entry.action.replace(/_/g, " ")}</b><span>{entry.reason || entry.message || "Recorded in system"}</span></div>) : <div><b>{new Date(drawer.createdAt).toLocaleString()} · Alert raised</b><span>{drawer.resolvedAt ? `Resolved ${new Date(drawer.resolvedAt).toLocaleString()}${drawer.resolveReason ? ` · ${drawer.resolveReason}` : ""}` : "Unresolved"}</span></div>}</div><div className="history-status"><b>Status: {drawer.resolvedAt ? "Resolved" : "Unresolved"}</b> · It resolves automatically when the cause is fixed.</div><div className="email-preview"><b>Email preview</b><div>Subject: {drawer.resource?.name || "Employee"} has been on bench</div><small>{drawer.message}</small></div></div><footer>{!drawer.resolvedAt && <button className="alert-button primary" onClick={() => openRelated(drawer)}>Allocate</button>}</footer></aside></div>}
    {editingRule && <div className="resolve-backdrop" onClick={() => setEditingRule(null)}><section className="resolve-popover rule-editor" onClick={(event) => event.stopPropagation()}><h2>Edit {editingRule.label}</h2><label>Recipients (comma separated)<input className="alert-search" value={ruleRecipients} onChange={(event) => setRuleRecipients(event.target.value)}/></label><label>Send time<select className="alert-select full" value={ruleSchedule} onChange={(event) => setRuleSchedule(event.target.value)}>{editingRule.key === "ALLOCATION_MODIFIED" && <option value="instant">Instantly</option>}<option value="08:00">Daily 08:00</option><option value="09:00">Daily 09:00</option><option value="10:00">Daily 10:00</option><option value="12:00">Daily 12:00</option><option value="17:00">Daily 17:00</option></select></label><div className="popover-actions"><button className="alert-button" onClick={() => setEditingRule(null)}>Cancel</button><button className="alert-button primary" disabled={saving} onClick={() => void saveRule()}>Save changes</button></div></section></div>}
  </div>;
}
