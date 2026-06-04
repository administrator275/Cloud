import { useState, useEffect } from "react";
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, orderBy
} from "firebase/firestore";
import { db } from "./firebase";

const ADMIN_PIN = "1234"; // ← Change this to your preferred PIN

const LEAVE_TYPES = ["Casual Leave", "Sick Leave", "Earned Leave", "Loss of Pay"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getTodayStr() {
  return new Date().toISOString().split("T")[0];
}

function calcLeaveDays(from, to) {
  const a = new Date(from), b = new Date(to);
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

const C = {
  dark: "0B3D49", mid: "0D6E83", accent: "02B3A0",
  light: "#E8F7F6", white: "#FFFFFF", offwhite: "#F4FAFB",
  text: "#1A2E35", muted: "#5A7A85", gold: "#E8A020", red: "#D94F3D",
  darkHex: "#0B3D49", midHex: "#0D6E83", accentHex: "#02B3A0",
};

export default function App() {
  const [view, setView] = useState("staff");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  const [staff, setStaff] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Firestore real-time listeners ──
  useEffect(() => {
    const unsubStaff = onSnapshot(
      query(collection(db, "staff"), orderBy("createdAt", "asc")),
      snap => setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubLeaves = onSnapshot(
      query(collection(db, "leaves"), orderBy("appliedOn", "desc")),
      snap => {
        setLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }
    );
    return () => { unsubStaff(); unsubLeaves(); };
  }, []);

  // ── Staff form state ──
  const [selectedStaff, setSelectedStaff] = useState("");
  const [leaveType, setLeaveType] = useState("Casual Leave");
  const [fromDate, setFromDate] = useState(getTodayStr());
  const [toDate, setToDate] = useState(getTodayStr());
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // ── Admin state ──
  const [adminTab, setAdminTab] = useState("requests");
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffSalary, setNewStaffSalary] = useState("");
  const [newStaffDOJ, setNewStaffDOJ] = useState("");
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth());
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [payrollMonth, setPayrollMonth] = useState(new Date().getMonth());
  const [payrollYear, setPayrollYear] = useState(new Date().getFullYear());

  async function submitLeave() {
    if (!selectedStaff || !fromDate || !toDate) return;
    const days = calcLeaveDays(fromDate, toDate);
    await addDoc(collection(db, "leaves"), {
      staffId: selectedStaff,
      type: leaveType,
      from: fromDate,
      to: toDate,
      days,
      reason,
      status: "Pending",
      appliedOn: getTodayStr(),
    });
    setSubmitted(true);
    setReason("");
    setTimeout(() => setSubmitted(false), 3000);
  }

  async function updateLeaveStatus(id, status) {
    await updateDoc(doc(db, "leaves", id), { status });
  }

  async function deleteLeave(id) {
    await deleteDoc(doc(db, "leaves", id));
  }

  async function addStaff() {
    if (!newStaffName.trim() || !newStaffSalary) return;
    await addDoc(collection(db, "staff"), {
      name: newStaffName.trim(),
      salary: parseFloat(newStaffSalary),
      doj: newStaffDOJ || getTodayStr(),
      createdAt: new Date().toISOString(),
    });
    setNewStaffName(""); setNewStaffSalary(""); setNewStaffDOJ("");
  }

  async function removeStaff(id) {
    await deleteDoc(doc(db, "staff", id));
  }

  function getStaffLeaves(staffId, year) {
    const approved = leaves.filter(l =>
      l.staffId === staffId && l.status === "Approved" &&
      new Date(l.from).getFullYear() === year
    );
    const summary = {};
    LEAVE_TYPES.forEach(t => summary[t] = 0);
    approved.forEach(l => { summary[l.type] = (summary[l.type] || 0) + l.days; });
    return summary;
  }

  function getPayroll(staffId, month, year) {
    const s = staff.find(x => x.id === staffId);
    if (!s) return null;
    const monthLeaves = leaves.filter(l =>
      l.staffId === staffId && l.status === "Approved" &&
      new Date(l.from).getMonth() === month &&
      new Date(l.from).getFullYear() === year
    );
    const totalLeaveDays = monthLeaves.reduce((sum, l) => sum + l.days, 0);
    const lopDays = monthLeaves.filter(l => l.type === "Loss of Pay").reduce((sum, l) => sum + l.days, 0);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const deduction = Math.round((lopDays / daysInMonth) * s.salary);
    return { gross: s.salary, lopDays, deduction, net: s.salary - deduction, totalLeaveDays };
  }

  function unlockAdmin() {
    if (pinInput === ADMIN_PIN) { setAdminUnlocked(true); setPinError(false); }
    else setPinError(true);
  }

  const pendingCount = leaves.filter(l => l.status === "Pending").length;

  // ── Styles ──
  const s = {
    app:      { minHeight: "100vh", background: C.offwhite, color: C.text, fontFamily: "'DM Sans','Segoe UI',sans-serif" },
    header:   { background: C.darkHex, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" },
    logo:     { fontSize: "17px", fontWeight: "700", color: C.white, letterSpacing: "-0.3px" },
    logoSub:  { fontSize: "10px", color: C.accentHex, letterSpacing: "2px", textTransform: "uppercase" },
    toggle:   (a) => ({ padding: "7px 18px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: "600", background: a ? C.accentHex : "transparent", color: a ? "#fff" : "#aaa" }),
    wrap:     { maxWidth: "860px", margin: "0 auto", padding: "24px 16px" },
    card:     { background: C.white, border: "1px solid #D8EEEF", borderRadius: "14px", padding: "22px", marginBottom: "18px" },
    label:    { display: "block", fontSize: "11px", color: C.muted, marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600" },
    input:    { width: "100%", background: C.offwhite, border: "1px solid #C8E0E4", borderRadius: "8px", padding: "10px 12px", color: C.text, fontSize: "14px", outline: "none", boxSizing: "border-box" },
    select:   { width: "100%", background: C.offwhite, border: "1px solid #C8E0E4", borderRadius: "8px", padding: "10px 12px", color: C.text, fontSize: "14px", outline: "none", boxSizing: "border-box" },
    btn:      (bg = C.accentHex) => ({ padding: "10px 20px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: "600", background: bg, color: "#fff" }),
    grid2:    { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" },
    grid3:    { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" },
    tab:      (a) => ({ padding: "8px 18px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: "600", background: a ? C.white : "transparent", color: a ? C.darkHex : C.muted, borderBottom: a ? `2px solid ${C.accentHex}` : "2px solid transparent" }),
    badge:    (col) => ({ display: "inline-block", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "700", background: col + "22", color: col }),
    row:      { display: "flex", alignItems: "center", gap: "10px", padding: "11px 0", borderBottom: "1px solid #E8F0F2", flexWrap: "wrap" },
    secTitle: { fontSize: "15px", fontWeight: "700", marginBottom: "14px", color: C.darkHex },
    statCard: (col) => ({ background: col + "18", border: `1px solid ${col}40`, borderRadius: "12px", padding: "16px 18px" }),
  };

  // ── Staff View ──
  const StaffView = () => (
    <div style={s.wrap}>
      <div style={s.card}>
        <p style={s.secTitle}>🌿 Apply for Leave</p>
        {staff.length === 0 ? (
          <p style={{ color: C.muted, fontSize: "14px" }}>No staff added yet. Ask admin to add staff first.</p>
        ) : (
          <>
            <div style={{ marginBottom: "12px" }}>
              <label style={s.label}>Your Name</label>
              <select style={s.select} value={selectedStaff} onChange={e => setSelectedStaff(e.target.value)}>
                <option value="">— Select your name —</option>
                {staff.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
              </select>
            </div>
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
            <div style={{ marginBottom: "16px" }}>
              <label style={s.label}>Reason (optional)</label>
              <input type="text" style={s.input} value={reason} onChange={e => setReason(e.target.value)} placeholder="Brief reason..." />
            </div>
            {fromDate && toDate && <p style={{ color: C.muted, fontSize: "13px", marginBottom: "12px" }}>📅 {calcLeaveDays(fromDate, toDate)} day(s)</p>}
            <button style={s.btn()} onClick={submitLeave} disabled={!selectedStaff}>Submit Leave Request</button>
            {submitted && <span style={{ marginLeft: "14px", color: C.accentHex, fontSize: "13px" }}>✓ Submitted!</span>}
          </>
        )}
      </div>

      {selectedStaff && (
        <div style={s.card}>
          <p style={s.secTitle}>My Leave History</p>
          {leaves.filter(l => l.staffId === selectedStaff).length === 0
            ? <p style={{ color: C.muted, fontSize: "14px" }}>No leaves yet.</p>
            : leaves.filter(l => l.staffId === selectedStaff).map(l => (
              <div key={l.id} style={s.row}>
                <span style={s.badge(l.type === "Loss of Pay" ? C.red : l.type === "Sick Leave" ? C.gold : C.accentHex)}>{l.type}</span>
                <span style={{ fontSize: "13px" }}>{l.from} → {l.to} ({l.days}d)</span>
                {l.reason && <span style={{ color: C.muted, fontSize: "12px" }}>{l.reason}</span>}
                <span style={{ marginLeft: "auto", ...s.badge(l.status === "Approved" ? "#16a34a" : l.status === "Rejected" ? C.red : C.gold) }}>{l.status}</span>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );

  // ── Admin PIN ──
  const AdminPin = () => (
    <div style={{ ...s.wrap, maxWidth: "380px" }}>
      <div style={{ ...s.card, textAlign: "center", padding: "36px" }}>
        <div style={{ fontSize: "30px", marginBottom: "10px" }}>🔐</div>
        <p style={{ fontWeight: "700", fontSize: "17px", marginBottom: "4px" }}>Admin Access</p>
        <p style={{ color: C.muted, fontSize: "13px", marginBottom: "20px" }}>Enter your PIN</p>
        <input
          type="password" maxLength={6} placeholder="••••"
          style={{ ...s.input, textAlign: "center", fontSize: "22px", letterSpacing: "8px", marginBottom: "14px" }}
          value={pinInput} onChange={e => setPinInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && unlockAdmin()}
        />
        {pinError && <p style={{ color: C.red, fontSize: "12px", marginBottom: "10px" }}>Incorrect PIN</p>}
        <button style={{ ...s.btn(), width: "100%" }} onClick={unlockAdmin}>Unlock</button>
        <p style={{ color: C.muted, fontSize: "11px", marginTop: "14px" }}>Default PIN: 1234</p>
      </div>
    </div>
  );

  // ── Admin View ──
  const AdminView = () => {
    const filteredLeaves = leaves.filter(l => {
      const d = new Date(l.from);
      return d.getMonth() === filterMonth && d.getFullYear() === filterYear;
    });

    return (
      <div style={s.wrap}>
        {/* Stats */}
        <div style={{ ...s.grid3, marginBottom: "18px" }}>
          <div style={s.statCard(C.gold)}><p style={{ fontSize: "10px", color: C.muted, textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 4px" }}>Pending</p><p style={{ fontSize: "26px", fontWeight: "800", color: C.gold, margin: 0 }}>{leaves.filter(l => l.status === "Pending").length}</p></div>
          <div style={s.statCard("#16a34a")}><p style={{ fontSize: "10px", color: C.muted, textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 4px" }}>Approved</p><p style={{ fontSize: "26px", fontWeight: "800", color: "#16a34a", margin: 0 }}>{leaves.filter(l => l.status === "Approved").length}</p></div>
          <div style={s.statCard(C.accentHex)}><p style={{ fontSize: "10px", color: C.muted, textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 4px" }}>Staff</p><p style={{ fontSize: "26px", fontWeight: "800", color: C.accentHex, margin: 0 }}>{staff.length}</p></div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "4px", borderBottom: "1px solid #D8EEEF", marginBottom: "18px" }}>
          {["requests", "staff", "payroll"].map(t => (
            <button key={t} style={s.tab(adminTab === t)} onClick={() => setAdminTab(t)}>
              {t === "requests" ? `📋 Requests${pendingCount > 0 ? ` (${pendingCount})` : ""}` : t === "staff" ? "👥 Staff" : "💰 Payroll"}
            </button>
          ))}
        </div>

        {/* REQUESTS */}
        {adminTab === "requests" && (
          <div style={s.card}>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "16px", flexWrap: "wrap" }}>
              <p style={{ ...s.secTitle, margin: 0 }}>Leave Requests</p>
              <select style={{ ...s.select, width: "auto" }} value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <input type="number" style={{ ...s.input, width: "85px" }} value={filterYear} onChange={e => setFilterYear(Number(e.target.value))} />
            </div>
            {loading ? <p style={{ color: C.muted }}>Loading...</p> :
              filteredLeaves.length === 0 ? <p style={{ color: C.muted, fontSize: "14px" }}>No requests this period.</p> :
              filteredLeaves.map(l => {
                const st = staff.find(x => x.id === l.staffId);
                return (
                  <div key={l.id} style={{ ...s.row, alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: "180px" }}>
                      <p style={{ fontWeight: "700", fontSize: "14px", margin: "0 0 3px" }}>{st?.name || "Unknown"}</p>
                      <p style={{ color: C.muted, fontSize: "12px", margin: 0 }}>{l.type} · {l.from} → {l.to} · {l.days}d</p>
                      {l.reason && <p style={{ color: C.muted, fontSize: "11px", margin: "3px 0 0" }}>"{l.reason}"</p>}
                    </div>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                      <span style={s.badge(l.status === "Approved" ? "#16a34a" : l.status === "Rejected" ? C.red : C.gold)}>{l.status}</span>
                      {l.status === "Pending" && <>
                        <button style={{ ...s.btn("#16a34a"), padding: "5px 10px", fontSize: "11px" }} onClick={() => updateLeaveStatus(l.id, "Approved")}>✓ Approve</button>
                        <button style={{ ...s.btn(C.red), padding: "5px 10px", fontSize: "11px" }} onClick={() => updateLeaveStatus(l.id, "Rejected")}>✗ Reject</button>
                      </>}
                      <button style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "16px" }} onClick={() => deleteLeave(l.id)}>🗑</button>
                    </div>
                  </div>
                );
              })
            }
          </div>
        )}

        {/* STAFF */}
        {adminTab === "staff" && (
          <>
            <div style={s.card}>
              <p style={s.secTitle}>Add Staff Member</p>
              <div style={{ ...s.grid3, marginBottom: "12px" }}>
                <div><label style={s.label}>Full Name</label><input style={s.input} value={newStaffName} onChange={e => setNewStaffName(e.target.value)} placeholder="Priya Menon" /></div>
                <div><label style={s.label}>Monthly Salary (₹)</label><input type="number" style={s.input} value={newStaffSalary} onChange={e => setNewStaffSalary(e.target.value)} placeholder="25000" /></div>
                <div><label style={s.label}>Date of Joining</label><input type="date" style={s.input} value={newStaffDOJ} onChange={e => setNewStaffDOJ(e.target.value)} /></div>
              </div>
              <button style={s.btn()} onClick={addStaff}>+ Add Staff</button>
            </div>
            <div style={s.card}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                <p style={{ ...s.secTitle, margin: 0 }}>Annual Leave Summary</p>
                <input type="number" style={{ ...s.input, width: "90px" }} value={filterYear} onChange={e => setFilterYear(Number(e.target.value))} />
              </div>
              {staff.length === 0 ? <p style={{ color: C.muted, fontSize: "14px" }}>No staff yet.</p> :
                staff.map(st => {
                  const sl = getStaffLeaves(st.id, filterYear);
                  return (
                    <div key={st.id} style={{ background: C.offwhite, borderRadius: "10px", padding: "14px", marginBottom: "10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                        <div>
                          <p style={{ fontWeight: "700", margin: "0 0 2px" }}>{st.name}</p>
                          <p style={{ color: C.muted, fontSize: "12px", margin: 0 }}>₹{st.salary?.toLocaleString()}/mo · Joined {st.doj}</p>
                        </div>
                        <button style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: "18px" }} onClick={() => removeStaff(st.id)}>✕</button>
                      </div>
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        {LEAVE_TYPES.map(t => (
                          <div key={t} style={{ textAlign: "center", background: C.white, borderRadius: "8px", padding: "7px 12px", border: "1px solid #D8EEEF" }}>
                            <p style={{ fontSize: "18px", fontWeight: "800", margin: "0 0 2px", color: t === "Loss of Pay" ? C.red : t === "Sick Leave" ? C.gold : C.accentHex }}>{sl[t]}</p>
                            <p style={{ fontSize: "9px", color: C.muted, margin: 0 }}>{t}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              }
            </div>
          </>
        )}

        {/* PAYROLL */}
        {adminTab === "payroll" && (
          <div style={s.card}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px", flexWrap: "wrap" }}>
              <p style={{ ...s.secTitle, margin: 0 }}>💰 Monthly Payroll</p>
              <select style={{ ...s.select, width: "auto" }} value={payrollMonth} onChange={e => setPayrollMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <input type="number" style={{ ...s.input, width: "85px" }} value={payrollYear} onChange={e => setPayrollYear(Number(e.target.value))} />
            </div>
            {staff.length === 0 ? <p style={{ color: C.muted }}>No staff yet.</p> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr>
                      {["Name","Gross (₹)","Leave Days","LOP Days","Deduction (₹)","Net Pay (₹)"].map(h => (
                        <th key={h} style={{ padding: "8px 10px", borderBottom: "1px solid #D8EEEF", textAlign: "left", fontSize: "10px", color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map(st => {
                      const p = getPayroll(st.id, payrollMonth, payrollYear);
                      return (
                        <tr key={st.id} style={{ borderBottom: "1px solid #EEF5F6" }}>
                          <td style={{ padding: "11px 10px", fontWeight: "700" }}>{st.name}</td>
                          <td style={{ padding: "11px 10px" }}>{p.gross.toLocaleString()}</td>
                          <td style={{ padding: "11px 10px" }}>{p.totalLeaveDays}</td>
                          <td style={{ padding: "11px 10px", color: p.lopDays > 0 ? C.red : C.muted }}>{p.lopDays}</td>
                          <td style={{ padding: "11px 10px", color: p.deduction > 0 ? C.red : C.muted }}>−{p.deduction.toLocaleString()}</td>
                          <td style={{ padding: "11px 10px", fontWeight: "800", color: "#16a34a" }}>₹{p.net.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "#E8F7F6" }}>
                      <td style={{ padding: "11px 10px", fontWeight: "700" }}>TOTAL</td>
                      <td style={{ padding: "11px 10px", fontWeight: "700" }}>₹{staff.reduce((sum, st) => sum + getPayroll(st.id, payrollMonth, payrollYear).gross, 0).toLocaleString()}</td>
                      <td colSpan={2}></td>
                      <td style={{ padding: "11px 10px", fontWeight: "700", color: C.red }}>−₹{staff.reduce((sum, st) => sum + getPayroll(st.id, payrollMonth, payrollYear).deduction, 0).toLocaleString()}</td>
                      <td style={{ padding: "11px 10px", fontWeight: "800", color: "#16a34a" }}>₹{staff.reduce((sum, st) => sum + getPayroll(st.id, payrollMonth, payrollYear).net, 0).toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
                <p style={{ color: C.muted, fontSize: "11px", marginTop: "12px" }}>* Only Loss of Pay leaves deduct from salary.</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

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
      {view === "staff" && <StaffView />}
      {view === "admin" && (!adminUnlocked ? <AdminPin /> : <AdminView />)}
    </div>
  );
}
