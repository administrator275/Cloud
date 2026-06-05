import { useState, useEffect, useCallback } from "react";
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, orderBy, setDoc
} from "firebase/firestore";
import { db } from "./firebase";

const ADMIN_PIN = "4792";
const LEAVE_TYPES = ["Casual Leave", "Sick Leave", "Loss of Pay"];
const ROLES = ["Office Staff", "Junior Consultant", "Senior Consultant"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Leave entitlement: 4 per quarter = 1 per month, max 4 per quarter
const QUARTERLY_LIMIT = 4; // per quarter, per leave type (CL and SL)

function getTodayStr() { return new Date().toISOString().split("T")[0]; }
function calcLeaveDays(from, to) {
  const a = new Date(from), b = new Date(to);
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}
function getQuarter(month) { return Math.floor(month / 3); } // 0,1,2,3

const C = {
  darkHex: "#0B3D49", midHex: "#0D6E83", accentHex: "#02B3A0",
  white: "#FFFFFF", offwhite: "#F4FAFB", text: "#1A2E35",
  muted: "#5A7A85", gold: "#E8A020", red: "#D94F3D", green: "#16a34a",
  purple: "#7C3AED",
};

const s = {
  app:      { minHeight: "100vh", background: C.offwhite, color: C.text, fontFamily: "'DM Sans','Segoe UI',sans-serif" },
  header:   { background: C.darkHex, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  logo:     { fontSize: "17px", fontWeight: "700", color: C.white },
  logoSub:  { fontSize: "10px", color: C.accentHex, letterSpacing: "2px", textTransform: "uppercase" },
  toggle:   (a) => ({ padding: "7px 18px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: "600", background: a ? C.accentHex : "transparent", color: a ? "#fff" : "#aaa" }),
  wrap:     { maxWidth: "900px", margin: "0 auto", padding: "24px 16px" },
  card:     { background: C.white, border: "1px solid #D8EEEF", borderRadius: "14px", padding: "22px", marginBottom: "18px" },
  label:    { display: "block", fontSize: "11px", color: C.muted, marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600" },
  input:    { width: "100%", background: C.offwhite, border: "1px solid #C8E0E4", borderRadius: "8px", padding: "10px 12px", color: C.text, fontSize: "16px", outline: "none", boxSizing: "border-box" },
  select:   { width: "100%", background: C.offwhite, border: "1px solid #C8E0E4", borderRadius: "8px", padding: "10px 12px", color: C.text, fontSize: "16px", outline: "none", boxSizing: "border-box" },
  btn:      (bg = C.accentHex, small) => ({ padding: small ? "5px 10px" : "10px 20px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: small ? "11px" : "13px", fontWeight: "600", background: bg, color: "#fff" }),
  tab:      (a) => ({ padding: "8px 14px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "600", background: a ? C.white : "transparent", color: a ? C.darkHex : C.muted, borderBottom: a ? `2px solid ${C.accentHex}` : "2px solid transparent" }),
  badge:    (col) => ({ display: "inline-block", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "700", background: col + "22", color: col }),
  row:      { display: "flex", alignItems: "center", gap: "10px", padding: "11px 0", borderBottom: "1px solid #E8F0F2", flexWrap: "wrap" },
  secTitle: { fontSize: "15px", fontWeight: "700", marginBottom: "14px", color: C.darkHex },
  statCard: (col) => ({ background: col + "18", border: `1px solid ${col}40`, borderRadius: "12px", padding: "14px 16px" }),
  grid2:    { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" },
  grid3:    { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" },
  th:       { padding: "8px 10px", borderBottom: "1px solid #D8EEEF", textAlign: "left", fontSize: "10px", color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" },
  td:       { padding: "10px 10px", borderBottom: "1px solid #EEF5F6", fontSize: "13px" },
};

function roleColor(role) {
  if (role === "Senior Consultant") return C.accentHex;
  if (role === "Junior Consultant") return C.purple;
  return C.gold;
}
function leaveColor(type) {
  if (type === "Loss of Pay") return C.red;
  if (type === "Sick Leave") return C.gold;
  return C.accentHex;
}

// ─── Helpers ──────────────────────────────────────────────────────

function getQuarterLeaveDays(leaves, staffId, leaveType, quarter, year) {
  return leaves
    .filter(l => {
      const d = new Date(l.from);
      return l.staffId === staffId &&
        l.type === leaveType &&
        l.status === "Approved" &&
        d.getFullYear() === year &&
        getQuarter(d.getMonth()) === quarter;
    })
    .reduce((sum, l) => sum + l.days, 0);
}

function getLeaveBalance(leaves, staffId, leaveType, year) {
  // Returns array of 4 quarters: { used, remaining }
  return [0,1,2,3].map(q => {
    const used = getQuarterLeaveDays(leaves, staffId, leaveType, q, year);
    return { quarter: q, used, remaining: Math.max(0, QUARTERLY_LIMIT - used) };
  });
}

// ─── Stable sub-components ────────────────────────────────────────

function LeaveForm({ staff, leaves, onSubmit }) {
  const [selectedStaff, setSelectedStaff] = useState("");
  const [leaveType, setLeaveType] = useState("Casual Leave");
  const [fromDate, setFromDate] = useState(getTodayStr());
  const [toDate, setToDate] = useState(getTodayStr());
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [warning, setWarning] = useState("");

  const selectedMember = staff.find(s => s.id === selectedStaff);
  const days = fromDate && toDate ? calcLeaveDays(fromDate, toDate) : 0;
  const year = fromDate ? new Date(fromDate).getFullYear() : new Date().getFullYear();
  const quarter = fromDate ? getQuarter(new Date(fromDate).getMonth()) : 0;

  useEffect(() => {
    if (!selectedStaff || !fromDate || leaveType === "Loss of Pay") { setWarning(""); return; }
    const used = getQuarterLeaveDays(leaves, selectedStaff, leaveType, quarter, year);
    const remaining = QUARTERLY_LIMIT - used;
    if (days > remaining) {
      setWarning(`⚠️ Only ${remaining} ${leaveType} day(s) remaining this quarter (Q${quarter+1}). Extra will be Loss of Pay.`);
    } else {
      setWarning("");
    }
  }, [selectedStaff, leaveType, fromDate, days, quarter, year, leaves]);

  const handleSubmit = useCallback(async () => {
    if (!selectedStaff || !fromDate || !toDate) return;
    await onSubmit({ staffId: selectedStaff, type: leaveType, from: fromDate, to: toDate, days, reason, status: "Pending", appliedOn: getTodayStr() });
    setReason(""); setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  }, [selectedStaff, leaveType, fromDate, toDate, days, reason, onSubmit]);

  return (
    <div style={s.card}>
      <p style={s.secTitle}>🌿 Apply for Leave</p>
      {staff.length === 0 ? <p style={{ color: C.muted, fontSize: "14px" }}>No staff added yet.</p> : (<>
        <div style={{ marginBottom: "12px" }}>
          <label style={s.label}>Your Name</label>
          <select style={s.select} value={selectedStaff} onChange={e => setSelectedStaff(e.target.value)}>
            <option value="">— Select your name —</option>
            {staff.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
          </select>
        </div>

        {/* Leave balance chips */}
        {selectedStaff && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
            {["Casual Leave","Sick Leave"].map(lt => {
              const currentQ = getQuarter(new Date().getMonth());
              const used = getQuarterLeaveDays(leaves, selectedStaff, lt, currentQ, new Date().getFullYear());
              const rem = QUARTERLY_LIMIT - used;
              return (
                <div key={lt} style={{ background: rem > 0 ? C.accentHex + "15" : C.red + "15", border: `1px solid ${rem > 0 ? C.accentHex : C.red}33`, borderRadius: "8px", padding: "6px 12px" }}>
                  <p style={{ margin: 0, fontSize: "10px", color: C.muted }}>{lt} (this quarter)</p>
                  <p style={{ margin: 0, fontSize: "13px", fontWeight: "700", color: rem > 0 ? C.accentHex : C.red }}>{rem} remaining / {QUARTERLY_LIMIT}</p>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginBottom: "12px" }}>
          <label style={s.label}>Leave Type</label>
          <select style={s.select} value={leaveType} onChange={e => setLeaveType(e.target.value)}>
            {LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ ...s.grid2, marginBottom: "12px" }}>
          <div><label style={s.label}>From</label><input type="date" style={s.input} value={fromDate} onChange={e => setFromDate(e.target.value)} /></div>
          <div><label style={s.label}>To</label><input type="date" style={s.input} value={toDate} min={fromDate} onChange={e => setToDate(e.target.value)} /></div>
        </div>
        <div style={{ marginBottom: "12px" }}>
          <label style={s.label}>Reason (optional)</label>
          <input type="text" style={s.input} value={reason} onChange={e => setReason(e.target.value)} placeholder="Brief reason..." autoComplete="off" />
        </div>
        {days > 0 && <p style={{ color: C.muted, fontSize: "13px", marginBottom: "8px" }}>📅 {days} day(s)</p>}
        {warning && <p style={{ color: C.gold, fontSize: "12px", marginBottom: "10px", background: C.gold+"11", padding: "8px 12px", borderRadius: "8px" }}>{warning}</p>}
        <button style={s.btn()} onClick={handleSubmit} disabled={!selectedStaff}>Submit Leave Request</button>
        {submitted && <span style={{ marginLeft: "14px", color: C.accentHex, fontSize: "13px" }}>✓ Submitted!</span>}
      </>)}
    </div>
  );
}

function AddStaffForm({ onAdd }) {
  const [name, setName] = useState("");
  const [salary, setSalary] = useState("");
  const [doj, setDoj] = useState("");
  const [role, setRole] = useState("Office Staff");

  const handleAdd = useCallback(async () => {
    if (!name.trim() || !salary) return;
    await onAdd({ name: name.trim(), salary: parseFloat(salary), doj: doj || getTodayStr(), role });
    setName(""); setSalary(""); setDoj(""); setRole("Office Staff");
  }, [name, salary, doj, role, onAdd]);

  return (
    <div style={s.card}>
      <p style={s.secTitle}>Add Staff Member</p>
      <div style={{ marginBottom: "12px" }}>
        <label style={s.label}>Full Name</label>
        <input style={s.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Priya Menon" autoComplete="off" autoCapitalize="words" />
      </div>
      <div style={{ ...s.grid3, marginBottom: "12px" }}>
        <div>
          <label style={s.label}>Role</label>
          <select style={s.select} value={role} onChange={e => setRole(e.target.value)}>
            {ROLES.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label style={s.label}>Base Salary (₹)</label>
          <input type="number" style={s.input} value={salary} onChange={e => setSalary(e.target.value)} placeholder="25000" inputMode="numeric" />
        </div>
        <div>
          <label style={s.label}>Date of Joining</label>
          <input type="date" style={s.input} value={doj} onChange={e => setDoj(e.target.value)} />
        </div>
      </div>
      <button style={s.btn()} onClick={handleAdd}>+ Add Staff</button>
      <p style={{ color: C.muted, fontSize: "11px", marginTop: "10px" }}>
        Office Staff: base + extra hrs ×₹200 &nbsp;|&nbsp; Junior Consultant: base only &nbsp;|&nbsp; Senior Consultant: base + sessions ×₹180
      </p>
    </div>
  );
}

function AdminPinScreen({ onUnlock }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const tryUnlock = useCallback(() => {
    if (pin === ADMIN_PIN) { onUnlock(); setError(false); }
    else setError(true);
  }, [pin, onUnlock]);
  return (
    <div style={{ ...s.wrap, maxWidth: "380px" }}>
      <div style={{ ...s.card, textAlign: "center", padding: "36px" }}>
        <div style={{ fontSize: "30px", marginBottom: "10px" }}>🔐</div>
        <p style={{ fontWeight: "700", fontSize: "17px", marginBottom: "4px" }}>Admin Access</p>
        <p style={{ color: C.muted, fontSize: "13px", marginBottom: "20px" }}>Enter your PIN</p>
        <input type="password" maxLength={6} placeholder="••••"
          style={{ ...s.input, textAlign: "center", fontSize: "22px", letterSpacing: "8px", marginBottom: "14px" }}
          value={pin} onChange={e => setPin(e.target.value)}
          onKeyDown={e => e.key === "Enter" && tryUnlock()} inputMode="numeric" />
        {error && <p style={{ color: C.red, fontSize: "12px", marginBottom: "10px" }}>Incorrect PIN</p>}
        <button style={{ ...s.btn(), width: "100%" }} onClick={tryUnlock}>Unlock</button>
      </div>
    </div>
  );
}

function PayrollEntryRow({ staffMember, month, year, existing, onSave }) {
  const isOffice = staffMember.role === "Office Staff";
  const isSenior = staffMember.role === "Senior Consultant";
  const [val, setVal] = useState(existing !== "" ? String(existing) : "");
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(async () => {
    await onSave(staffMember.id, month, year, parseFloat(val) || 0);
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }, [staffMember.id, month, year, val, onSave]);

  if (!isOffice && !isSenior) {
    // Junior consultant — no incentive
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 0", borderBottom: "1px solid #EEF5F6", flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <p style={{ margin: "0 0 2px", fontWeight: "700", fontSize: "13px" }}>{staffMember.name}</p>
          <p style={{ margin: 0, fontSize: "11px", color: C.muted }}>Junior Consultant · Base salary only</p>
        </div>
        <span style={s.badge(C.muted)}>No incentive</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 0", borderBottom: "1px solid #EEF5F6", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: "140px" }}>
        <p style={{ margin: "0 0 2px", fontWeight: "700", fontSize: "13px" }}>{staffMember.name}</p>
        <p style={{ margin: 0, fontSize: "11px", color: C.muted }}>{staffMember.role} · ₹{staffMember.salary?.toLocaleString()}/mo</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <label style={{ fontSize: "12px", color: C.muted, whiteSpace: "nowrap" }}>
          {isOffice ? "Extra hrs:" : "Sessions:"}
        </label>
        <input type="number" inputMode="numeric"
          style={{ ...s.input, width: "75px", fontSize: "14px" }}
          value={val} onChange={e => setVal(e.target.value)} placeholder="0" />
        <span style={{ fontSize: "12px", color: C.green, whiteSpace: "nowrap", fontWeight: "600" }}>
          +₹{((parseFloat(val)||0) * (isOffice ? 200 : 180)).toLocaleString()}
        </span>
        <button style={s.btn(C.accentHex, true)} onClick={handleSave}>Save</button>
        {saved && <span style={{ color: C.green, fontSize: "11px" }}>✓</span>}
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState("staff");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [staff, setStaff] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [payrollEntries, setPayrollEntries] = useState({});
  const [loading, setLoading] = useState(true);
  const [adminTab, setAdminTab] = useState("requests");
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth());
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [payrollMonth, setPayrollMonth] = useState(new Date().getMonth() === 0 ? 11 : new Date().getMonth() - 1);
  const [payrollYear, setPayrollYear] = useState(new Date().getMonth() === 0 ? new Date().getFullYear() - 1 : new Date().getFullYear());
  const [leaveStaffFilter, setLeaveStaffFilter] = useState("");
  const [leaveViewYear, setLeaveViewYear] = useState(new Date().getFullYear());
  const [leaveViewMonth, setLeaveViewMonth] = useState(new Date().getMonth());

  useEffect(() => {
    const unsubStaff = onSnapshot(query(collection(db, "staff"), orderBy("createdAt", "asc")), snap => setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubLeaves = onSnapshot(query(collection(db, "leaves"), orderBy("appliedOn", "desc")), snap => { setLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); });
    const unsubPayroll = onSnapshot(collection(db, "payrollEntries"), snap => {
      const e = {}; snap.docs.forEach(d => { e[d.id] = d.data(); }); setPayrollEntries(e);
    });
    return () => { unsubStaff(); unsubLeaves(); unsubPayroll(); };
  }, []);

  const handleSubmitLeave = useCallback(async (d) => { await addDoc(collection(db, "leaves"), d); }, []);
  const handleAddStaff = useCallback(async (d) => { await addDoc(collection(db, "staff"), { ...d, createdAt: new Date().toISOString() }); }, []);
  const handleUnlock = useCallback(() => setAdminUnlocked(true), []);
  const updateLeaveStatus = useCallback(async (id, status) => { await updateDoc(doc(db, "leaves", id), { status }); }, []);
  const deleteLeave = useCallback(async (id) => { await deleteDoc(doc(db, "leaves", id)); }, []);
  const removeStaff = useCallback(async (id) => { await deleteDoc(doc(db, "staff", id)); }, []);
  const savePayrollEntry = useCallback(async (staffId, month, year, value) => {
    const key = `${staffId}_${year}_${String(month).padStart(2,"0")}`;
    await setDoc(doc(db, "payrollEntries", key), { staffId, month, year, value });
  }, []);

  function getPayrollEntry(staffId, month, year) {
    const key = `${staffId}_${year}_${String(month).padStart(2,"0")}`;
    return payrollEntries[key]?.value ?? 0;
  }

  function calcPayroll(st, month, year) {
    const monthLeaves = leaves.filter(l =>
      l.staffId === st.id && l.status === "Approved" &&
      new Date(l.from).getMonth() === month && new Date(l.from).getFullYear() === year
    );
    const lopDays = monthLeaves.filter(l => l.type === "Loss of Pay").reduce((sum, l) => sum + l.days, 0);
    const totalLeaveDays = monthLeaves.reduce((sum, l) => sum + l.days, 0);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const lopDeduction = Math.round((lopDays / daysInMonth) * st.salary);
    const extraVal = getPayrollEntry(st.id, month, year);
    const incentive = st.role === "Office Staff" ? extraVal * 200 : st.role === "Senior Consultant" ? extraVal * 180 : 0;
    return { gross: st.salary, lopDays, lopDeduction, totalLeaveDays, extraVal, incentive, net: st.salary - lopDeduction + incentive };
  }

  function getMonthlyLeaveSummary(staffId) {
    return Array.from({ length: 12 }, (_, m) => {
      const monthLeaves = leaves.filter(l =>
        l.staffId === staffId && l.status === "Approved" &&
        new Date(l.from).getMonth() === m && new Date(l.from).getFullYear() === leaveViewYear
      );
      const row = { month: m, total: 0 };
      LEAVE_TYPES.forEach(t => { row[t] = 0; });
      monthLeaves.forEach(l => { row[l.type] = (row[l.type] || 0) + l.days; row.total += l.days; });
      return row;
    });
  }

  const pendingCount = leaves.filter(l => l.status === "Pending").length;
  const filteredLeaves = leaves.filter(l => { const d = new Date(l.from); return d.getMonth() === filterMonth && d.getFullYear() === filterYear; });
  const isSalaryDay = new Date().getDate() === 10;

  return (
    <div style={s.app}>
      <div style={s.header}>
        <div>
          <div style={s.logo}>Cloud Cuckoo Land</div>
          <div style={s.logoSub}>Office Management</div>
        </div>
        <div style={{ display: "flex", gap: "4px", background: "rgba(255,255,255,0.08)", padding: "4px", borderRadius: "10px" }}>
          <button style={s.toggle(view === "staff")} onClick={() => setView("staff")}>Staff</button>
          <button style={s.toggle(view === "admin")} onClick={() => setView("admin")}>
            Admin {pendingCount > 0 && <span style={{ background: C.red, color: "#fff", borderRadius: "10px", padding: "1px 6px", fontSize: "10px", marginLeft: "4px" }}>{pendingCount}</span>}
          </button>
        </div>
      </div>

      {view === "staff" && (
        <div style={s.wrap}>
          <LeaveForm staff={staff} leaves={leaves} onSubmit={handleSubmitLeave} />
        </div>
      )}

      {view === "admin" && !adminUnlocked && <AdminPinScreen onUnlock={handleUnlock} />}

      {view === "admin" && adminUnlocked && (
        <div style={s.wrap}>

          {isSalaryDay && (
            <div style={{ background: C.gold+"22", border: `1px solid ${C.gold}55`, borderRadius: "10px", padding: "12px 16px", marginBottom: "16px" }}>
              <p style={{ margin: 0, fontSize: "13px", fontWeight: "600", color: C.gold }}>💰 Today is the 10th — Salary Day! Enter extra hours / sessions in Payroll tab.</p>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "18px" }}>
            <div style={s.statCard(C.gold)}><p style={{ fontSize: "10px", color: C.muted, textTransform: "uppercase", margin: "0 0 4px" }}>Pending</p><p style={{ fontSize: "26px", fontWeight: "800", color: C.gold, margin: 0 }}>{pendingCount}</p></div>
            <div style={s.statCard(C.green)}><p style={{ fontSize: "10px", color: C.muted, textTransform: "uppercase", margin: "0 0 4px" }}>Approved</p><p style={{ fontSize: "26px", fontWeight: "800", color: C.green, margin: 0 }}>{leaves.filter(l => l.status === "Approved").length}</p></div>
            <div style={s.statCard(C.accentHex)}><p style={{ fontSize: "10px", color: C.muted, textTransform: "uppercase", margin: "0 0 4px" }}>Staff</p><p style={{ fontSize: "26px", fontWeight: "800", color: C.accentHex, margin: 0 }}>{staff.length}</p></div>
          </div>

          <div style={{ display: "flex", gap: "2px", borderBottom: "1px solid #D8EEEF", marginBottom: "18px", flexWrap: "wrap" }}>
            {["requests","staff","leaves","payroll"].map(t => (
              <button key={t} style={s.tab(adminTab === t)} onClick={() => setAdminTab(t)}>
                {t === "requests" ? `📋 Requests${pendingCount > 0 ? ` (${pendingCount})` : ""}` :
                 t === "staff" ? "👥 Staff" : t === "leaves" ? "📅 Leave Summary" : "💰 Payroll"}
              </button>
            ))}
          </div>

          {/* ── REQUESTS ── */}
          {adminTab === "requests" && (
            <div style={s.card}>
              <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "16px", flexWrap: "wrap" }}>
                <p style={{ ...s.secTitle, margin: 0 }}>Leave Requests</p>
                <select style={{ ...s.select, width: "auto" }} value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))}>
                  {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
                <input type="number" style={{ ...s.input, width: "85px" }} value={filterYear} onChange={e => setFilterYear(Number(e.target.value))} inputMode="numeric" />
              </div>
              {loading ? <p style={{ color: C.muted }}>Loading...</p> :
                filteredLeaves.length === 0 ? <p style={{ color: C.muted, fontSize: "14px" }}>No requests this period.</p> :
                filteredLeaves.map(l => {
                  const st = staff.find(x => x.id === l.staffId);
                  return (
                    <div key={l.id} style={{ ...s.row, alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: "180px" }}>
                        <p style={{ fontWeight: "700", fontSize: "14px", margin: "0 0 2px" }}>{st?.name || "Unknown"}</p>
                        <p style={{ color: C.muted, fontSize: "12px", margin: 0 }}>{l.type} · {l.from} → {l.to} · {l.days}d</p>
                        {l.reason && <p style={{ color: C.muted, fontSize: "11px", margin: "3px 0 0" }}>"{l.reason}"</p>}
                      </div>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                        <span style={s.badge(l.type === "Loss of Pay" ? C.red : C.accentHex)}>{l.type}</span>
                        <span style={s.badge(l.status === "Approved" ? C.green : l.status === "Rejected" ? C.red : C.gold)}>{l.status}</span>
                        {l.status === "Pending" && <>
                          <button style={s.btn(C.green, true)} onClick={() => updateLeaveStatus(l.id, "Approved")}>✓</button>
                          <button style={s.btn(C.red, true)} onClick={() => updateLeaveStatus(l.id, "Rejected")}>✗</button>
                        </>}
                        <button style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "16px" }} onClick={() => deleteLeave(l.id)}>🗑</button>
                      </div>
                    </div>
                  );
                })
              }
            </div>
          )}

          {/* ── STAFF ── */}
          {adminTab === "staff" && (
            <>
              <AddStaffForm onAdd={handleAddStaff} />
              <div style={s.card}>
                <p style={s.secTitle}>All Staff</p>
                {staff.length === 0 ? <p style={{ color: C.muted }}>No staff yet.</p> :
                  staff.map(st => (
                    <div key={st.id} style={{ ...s.row, alignItems: "center" }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: "0 0 2px", fontWeight: "700" }}>{st.name}</p>
                        <p style={{ margin: 0, fontSize: "12px", color: C.muted }}>₹{st.salary?.toLocaleString()}/mo · Joined {st.doj}</p>
                      </div>
                      <span style={s.badge(roleColor(st.role))}>{st.role}</span>
                      <button style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: "18px" }} onClick={() => removeStaff(st.id)}>✕</button>
                    </div>
                  ))
                }
              </div>
            </>
          )}

          {/* ── LEAVE SUMMARY ── */}
          {adminTab === "leaves" && (
            <div>
              <div style={{ ...s.card, marginBottom: "14px" }}>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ flex: 1, minWidth: "160px" }}>
                    <label style={s.label}>Staff Member</label>
                    <select style={s.select} value={leaveStaffFilter} onChange={e => setLeaveStaffFilter(e.target.value)}>
                      <option value="">— All Staff —</option>
                      {staff.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={s.label}>Year</label>
                    <input type="number" style={{ ...s.input, width: "90px" }} value={leaveViewYear} onChange={e => setLeaveViewYear(Number(e.target.value))} inputMode="numeric" />
                  </div>
                  <div>
                    <label style={s.label}>Month (detail)</label>
                    <select style={{ ...s.select, width: "auto" }} value={leaveViewMonth} onChange={e => setLeaveViewMonth(Number(e.target.value))}>
                      {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {(leaveStaffFilter ? staff.filter(st => st.id === leaveStaffFilter) : staff).map(st => {
                const summary = getMonthlyLeaveSummary(st.id);
                const annualTotal = summary.reduce((sum, r) => sum + r.total, 0);
                // Quarterly balances
                const currentYear = new Date().getFullYear();
                const quarters = [0,1,2,3].map(q => ({
                  q,
                  cl: { used: getQuarterLeaveDays(leaves, st.id, "Casual Leave", q, leaveViewYear), limit: QUARTERLY_LIMIT },
                  sl: { used: getQuarterLeaveDays(leaves, st.id, "Sick Leave", q, leaveViewYear), limit: QUARTERLY_LIMIT },
                }));

                return (
                  <div key={st.id} style={{ ...s.card, marginBottom: "18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                      <div>
                        <p style={{ margin: "0 0 2px", fontWeight: "700", fontSize: "15px" }}>{st.name}</p>
                        <p style={{ margin: 0, fontSize: "12px", color: C.muted }}>{st.role} · {leaveViewYear}</p>
                      </div>
                      <span style={{ ...s.badge(C.accentHex), fontSize: "12px" }}>{annualTotal} days used</span>
                    </div>

                    {/* Quarterly balance */}
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
                      {quarters.map(({ q, cl, sl }) => (
                        <div key={q} style={{ background: C.offwhite, borderRadius: "8px", padding: "8px 12px", border: "1px solid #D8EEEF", minWidth: "120px" }}>
                          <p style={{ margin: "0 0 4px", fontSize: "10px", color: C.muted, fontWeight: "700" }}>Q{q+1} ({MONTHS[q*3]}–{MONTHS[q*3+2]})</p>
                          <p style={{ margin: "0 0 2px", fontSize: "11px" }}>
                            CL: <strong style={{ color: cl.used >= cl.limit ? C.red : C.green }}>{cl.used}/{cl.limit}</strong>
                          </p>
                          <p style={{ margin: 0, fontSize: "11px" }}>
                            SL: <strong style={{ color: sl.used >= sl.limit ? C.red : C.green }}>{sl.used}/{sl.limit}</strong>
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Annual month-by-month table */}
                    <div style={{ overflowX: "auto", marginBottom: "14px" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                        <thead>
                          <tr>
                            <th style={s.th}>Month</th>
                            {LEAVE_TYPES.map(t => <th key={t} style={s.th}>{t}</th>)}
                            <th style={s.th}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summary.map((row, i) => (
                            <tr key={i} style={{ background: i % 2 === 0 ? C.white : C.offwhite }}>
                              <td style={{ ...s.td, fontWeight: "600", color: C.darkHex }}>{MONTHS[row.month]}</td>
                              {LEAVE_TYPES.map(t => (
                                <td key={t} style={{ ...s.td, color: row[t] > 0 ? leaveColor(t) : C.muted }}>
                                  {row[t] > 0 ? row[t] : "—"}
                                </td>
                              ))}
                              <td style={{ ...s.td, fontWeight: "700", color: row.total > 0 ? C.darkHex : C.muted }}>{row.total > 0 ? row.total : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: C.accentHex+"15" }}>
                            <td style={{ ...s.td, fontWeight: "700" }}>Total</td>
                            {LEAVE_TYPES.map(t => (
                              <td key={t} style={{ ...s.td, fontWeight: "700", color: leaveColor(t) }}>
                                {summary.reduce((sum, r) => sum + r[t], 0) || "—"}
                              </td>
                            ))}
                            <td style={{ ...s.td, fontWeight: "800", color: C.accentHex }}>{annualTotal}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Month detail */}
                    <div style={{ borderTop: "1px solid #D8EEEF", paddingTop: "12px" }}>
                      <p style={{ fontSize: "13px", fontWeight: "600", color: C.darkHex, marginBottom: "8px" }}>
                        {MONTHS[leaveViewMonth]} {leaveViewYear} — Detail
                      </p>
                      {leaves.filter(l =>
                        l.staffId === st.id && l.status === "Approved" &&
                        new Date(l.from).getMonth() === leaveViewMonth &&
                        new Date(l.from).getFullYear() === leaveViewYear
                      ).length === 0
                        ? <p style={{ color: C.muted, fontSize: "12px" }}>No approved leaves this month.</p>
                        : leaves.filter(l =>
                            l.staffId === st.id && l.status === "Approved" &&
                            new Date(l.from).getMonth() === leaveViewMonth &&
                            new Date(l.from).getFullYear() === leaveViewYear
                          ).map(l => (
                            <div key={l.id} style={{ display: "flex", gap: "8px", padding: "5px 0", borderBottom: "1px solid #EEF5F6", flexWrap: "wrap" }}>
                              <span style={s.badge(leaveColor(l.type))}>{l.type}</span>
                              <span style={{ fontSize: "12px" }}>{l.from} → {l.to} ({l.days}d)</span>
                              {l.reason && <span style={{ color: C.muted, fontSize: "11px" }}>"{l.reason}"</span>}
                            </div>
                          ))
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── PAYROLL ── */}
          {adminTab === "payroll" && (
            <div>
              <div style={{ ...s.card, marginBottom: "14px" }}>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                  <p style={{ ...s.secTitle, margin: 0 }}>Payroll for</p>
                  <select style={{ ...s.select, width: "auto" }} value={payrollMonth} onChange={e => setPayrollMonth(Number(e.target.value))}>
                    {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                  </select>
                  <input type="number" style={{ ...s.input, width: "85px" }} value={payrollYear} onChange={e => setPayrollYear(Number(e.target.value))} inputMode="numeric" />
                  <span style={{ fontSize: "11px", color: C.muted }}>Paid on 10th of following month</span>
                </div>
              </div>

              <div style={s.card}>
                <p style={{ ...s.secTitle, marginBottom: "4px" }}>Enter Extra Hours / Sessions</p>
                <p style={{ color: C.muted, fontSize: "12px", marginBottom: "14px" }}>
                  Office Staff ×₹200/hr &nbsp;·&nbsp; Senior Consultant ×₹180/session &nbsp;·&nbsp; Junior Consultant: base only
                </p>
                {staff.map(st => (
                  <PayrollEntryRow key={st.id} staffMember={st} month={payrollMonth} year={payrollYear}
                    existing={getPayrollEntry(st.id, payrollMonth, payrollYear)} onSave={savePayrollEntry} />
                ))}
              </div>

              <div style={s.card}>
                <p style={s.secTitle}>Payroll Summary — {MONTHS[payrollMonth]} {payrollYear}</p>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr>
                        {["Name","Role","Base (₹)","LOP Days","Deduction","Extra","Incentive","Net Pay (₹)"].map(h => (
                          <th key={h} style={s.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {staff.map(st => {
                        const p = calcPayroll(st, payrollMonth, payrollYear);
                        return (
                          <tr key={st.id} style={{ borderBottom: "1px solid #EEF5F6" }}>
                            <td style={{ ...s.td, fontWeight: "700" }}>{st.name}</td>
                            <td style={s.td}><span style={s.badge(roleColor(st.role))}>{st.role.replace(" Consultant","")}</span></td>
                            <td style={s.td}>{p.gross?.toLocaleString()}</td>
                            <td style={{ ...s.td, color: p.lopDays > 0 ? C.red : C.muted }}>{p.lopDays || "—"}</td>
                            <td style={{ ...s.td, color: p.lopDeduction > 0 ? C.red : C.muted }}>{p.lopDeduction > 0 ? `−₹${p.lopDeduction.toLocaleString()}` : "—"}</td>
                            <td style={s.td}>{p.extraVal > 0 ? `${p.extraVal} ${st.role === "Office Staff" ? "hrs" : "sessions"}` : "—"}</td>
                            <td style={{ ...s.td, color: p.incentive > 0 ? C.green : C.muted }}>{p.incentive > 0 ? `+₹${p.incentive.toLocaleString()}` : "—"}</td>
                            <td style={{ ...s.td, fontWeight: "800", color: C.green, fontSize: "14px" }}>₹{p.net?.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: "#E8F7F6" }}>
                        <td style={{ ...s.td, fontWeight: "700" }} colSpan={2}>TOTAL</td>
                        <td style={{ ...s.td, fontWeight: "700" }}>₹{staff.reduce((s,st) => s + calcPayroll(st,payrollMonth,payrollYear).gross,0).toLocaleString()}</td>
                        <td colSpan={3}></td>
                        <td style={{ ...s.td, fontWeight: "700", color: C.green }}>+₹{staff.reduce((s,st) => s + calcPayroll(st,payrollMonth,payrollYear).incentive,0).toLocaleString()}</td>
                        <td style={{ ...s.td, fontWeight: "800", color: C.green }}>₹{staff.reduce((s,st) => s + calcPayroll(st,payrollMonth,payrollYear).net,0).toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p style={{ color: C.muted, fontSize: "11px", marginTop: "10px" }}>Net = Base − LOP deduction + incentive</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
