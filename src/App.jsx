import React, { useState, useEffect, useMemo, useCallback } from "react";
import './index.css'

const API_BASE = import.meta.env.VITE_API_URL || ""

// ── Odisha HED house palette ──────────────────────────────────────────────
const C = {
  navy: "#0D2B55",
  navySoft: "#1B3A6B",
  saffron: "#BF360C",
  gold: "#F9A825",
  green: "#2E7D32",
  slate: "#607D8B",
  paper: "#FAF7F0",
  paperEdge: "#EFE9DA",
  ink: "#1A1A1A",
  line: "#D9D0BE",
};

const serif = "'Cambria', 'Georgia', 'Times New Roman', serif";
const sans = "'Nirmala UI', 'Segoe UI', system-ui, sans-serif";

const STATUSES = ["Not Started", "In Progress", "Completed"];
const PRIORITIES = ["High", "Medium", "Low"];

const STATUS_COLOR = {
  "Not Started": C.slate,
  "In Progress": C.gold,
  Completed: C.green,
  Overdue: C.saffron,
};

const DEFAULT_SECTIONS = [
  "Establishment",
  "Budget & Finance",
  "SAMS / Admissions",
  "University Section",
  "Legislation",
  "NSS Cell",
  "Scheme Implementation",
];

const todayISO = () => new Date().toISOString().slice(0, 10);

function isOverdue(t) {
  return t.status !== "Completed" && t.deadline && t.deadline < todayISO();
}

function effectiveStatus(t) {
  return isOverdue(t) ? "Overdue" : t.status;
}

export default function App() {
  const [role, setRole] = useState("secretary");
  const [officerSection, setOfficerSection] = useState("");
  const [targets, setTargets] = useState([]);
  const [sections, setSections] = useState(DEFAULT_SECTIONS);
  const [loading, setLoading] = useState(true);
  const [saveNote, setSaveNote] = useState("");

  const [filterSection, setFilterSection] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [showAdd, setShowAdd] = useState(false);

  const flashSave = useCallback((ok) => {
    setSaveNote(ok ? "Saved" : "Save failed — check connection");
    setTimeout(() => setSaveNote(""), 1800);
  }, []);

  // ── Database Fetching ───────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [targetsRes, sectionsRes] = await Promise.all([
          fetch(`${API_BASE}/targets`),
          fetch(`${API_BASE}/sections`),
        ]);
        
        const targetsData = await targetsRes.json();
        const sectionsData = await sectionsRes.json();

        setTargets(Array.isArray(targetsData) ? targetsData : []);
        
        // Map section objects from DB [{id: 1, name: "Est..."}, ...] to flat array of strings
        if (Array.isArray(sectionsData) && sectionsData.length > 0) {
          setSections(sectionsData.map(s => s.name));
        } else {
          setSections(DEFAULT_SECTIONS);
        }
      } catch (error) {
        console.error("Failed to load data:", error);
        flashSave(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [flashSave]);

  // ── Database Mutations ──────────────────────────────────────────────────
  const addTarget = async (t) => {
    try {
      const res = await fetch(`${API_BASE}/targets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(t),
      });
      if (res.ok) {
        const data = await res.json();
        // Drizzle insert returning() often returns an array, so we grab the first item
        const newTarget = Array.isArray(data) ? data[0] : data; 
        setTargets((list) => [newTarget, ...list]);
        flashSave(true);
      } else throw new Error("Failed to add");
    } catch (e) {
      flashSave(false);
    }
  };

  const updateTarget = async (id, patch) => {
    const updatedFields = { ...patch, updatedAt: new Date().toISOString() };
    
    // Optimistic update for UI feel
    setTargets((list) =>
      list.map((t) => (t.id === id ? { ...t, ...updatedFields } : t))
    );

    try {
      const res = await fetch(`${API_BASE}/targets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedFields),
      });
      if (!res.ok) throw new Error("Failed to update");
      flashSave(true);
    } catch (e) {
      flashSave(false);
    }
  };

  const deleteTarget = async (id) => {
    // Optimistic update
    setTargets((list) => list.filter((t) => t.id !== id));

    try {
      const res = await fetch(`${API_BASE}/targets/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      flashSave(true);
    } catch (e) {
      flashSave(false);
    }
  };

  const addSection = async (name) => {
    try {
      const res = await fetch(`${API_BASE}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setSections((prev) => [...prev, name]);
        flashSave(true);
      } else throw new Error("Failed to add section");
    } catch (e) {
      flashSave(false);
    }
  };

  // ── Derived State & Rendering ───────────────────────────────────────────
  const visible = useMemo(() => {
    let v = targets;
    if (role === "officer" && officerSection)
      v = v.filter((t) => t.section === officerSection);
    if (filterSection !== "All") v = v.filter((t) => t.section === filterSection);
    if (filterStatus !== "All")
      v = v.filter((t) => effectiveStatus(t) === filterStatus);
    return v;
  }, [targets, role, officerSection, filterSection, filterStatus]);

  const scope = useMemo(() => {
    if (role === "officer" && officerSection)
      return targets.filter((t) => t.section === officerSection);
    if (filterSection !== "All")
      return targets.filter((t) => t.section === filterSection);
    return targets;
  }, [targets, role, officerSection, filterSection]);

  const stats = useMemo(() => {
    const s = { total: scope.length, Completed: 0, "In Progress": 0, "Not Started": 0, Overdue: 0 };
    scope.forEach((t) => {
      if (isOverdue(t)) s.Overdue++;
      if (s[t.status] !== undefined) s[t.status]++;
    });
    return s;
  }, [scope]);

  const bySection = useMemo(() => {
    return sections
      .map((name) => {
        const items = targets.filter((t) => t.section === name);
        const done = items.filter((t) => t.status === "Completed").length;
        const over = items.filter(isOverdue).length;
        return { name, total: items.length, done, over, pct: items.length ? Math.round((done / items.length) * 100) : 0 };
      })
      .filter((r) => r.total > 0);
  }, [targets, sections]);

  const copySummary = () => {
    const lines = [
      "HIGHER EDUCATION DEPARTMENT — TARGET STATUS",
      `As on ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`,
      "",
      `Total targets: ${stats.total}  |  Completed: ${stats.Completed}  |  In Progress: ${stats["In Progress"]}  |  Not Started: ${stats["Not Started"]}  |  Overdue: ${stats.Overdue}`,
      "",
      "Section-wise:",
      ...bySection.map((r) => `  • ${r.name}: ${r.done}/${r.total} done (${r.pct}%)${r.over ? `, ${r.over} overdue` : ""}`),
    ];
    navigator.clipboard?.writeText(lines.join("\n"));
    setSaveNote("Summary copied");
    setTimeout(() => setSaveNote(""), 1800);
  };

  if (loading)
    return (
      <div style={{ fontFamily: sans, background: C.paper, minHeight: "100vh", display: "grid", placeItems: "center", color: C.navy }}>
        Loading the register…
      </div>
    );

  return (
    <div style={{ fontFamily: sans, background: C.paper, minHeight: "100vh", color: C.ink }}>
      {/* Header */}
      <header style={{ background: C.navy, color: "#fff", borderBottom: `4px solid ${C.gold}` }}>
        <div className="mx-auto px-5 py-4" style={{ maxWidth: 1080 }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: 0.3, lineHeight: 1.15 }}>
                Higher Education Department
              </div>
              <div style={{ fontSize: 12.5, color: C.gold, letterSpacing: 1.5, textTransform: "uppercase", marginTop: 2 }}>
                Target &amp; Progress Register · Government of Odisha
              </div>
            </div>
            <RoleToggle role={role} setRole={setRole} />
          </div>
        </div>
      </header>

      <main className="mx-auto px-5 py-6" style={{ maxWidth: 1080 }}>
        {/* Officer section picker */}
        {role === "officer" && (
          <div className="mb-5 p-4 rounded" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>
              Which section are you updating for?
            </label>
            <select
              value={officerSection}
              onChange={(e) => setOfficerSection(e.target.value)}
              className="mt-2 w-full px-3 py-2 rounded"
              style={{ border: `1px solid ${C.line}`, fontFamily: sans, fontSize: 14 }}
            >
              <option value="">— Select your section —</option>
              {sections.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}

        {(role === "secretary" || officerSection) && (
          <>
            {/* Stat cards */}
            <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
              <Stat label="Total targets" value={stats.total} color={C.navy} />
              <Stat label="Completed" value={stats.Completed} color={C.green} />
              <Stat label="In progress" value={stats["In Progress"]} color={C.gold} dark />
              <Stat label="Not started" value={stats["Not Started"]} color={C.slate} />
              <Stat label="Overdue" value={stats.Overdue} color={C.saffron} />
            </div>

            {/* Section progress (secretary view or all) */}
            {role === "secretary" && bySection.length > 0 && (
              <section className="mb-6 p-5 rounded" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
                <div className="flex items-center justify-between mb-4">
                  <h2 style={{ fontFamily: serif, fontSize: 17, color: C.navy }}>Section-wise progress</h2>
                  <button onClick={copySummary} style={btnGhost}>Copy status summary</button>
                </div>
                <div className="flex flex-col gap-3">
                  {bySection.map((r) => (
                    <div key={r.name}>
                      <div className="flex items-baseline justify-between mb-1">
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{r.name}</span>
                        <span style={{ fontSize: 12.5, color: C.slate }}>
                          {r.done}/{r.total} done{r.over ? ` · ${r.over} overdue` : ""}
                        </span>
                      </div>
                      <div style={{ height: 10, background: C.paperEdge, borderRadius: 6, overflow: "hidden" }}>
                        <div style={{ width: `${r.pct}%`, height: "100%", background: r.pct === 100 ? C.green : C.navy, transition: "width .4s ease" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Controls */}
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div className="flex gap-2 flex-wrap items-center">
                {role === "secretary" && (
                  <FilterSelect label="Section" value={filterSection} onChange={setFilterSection} options={["All", ...sections]} />
                )}
                <FilterSelect
                  label="Status"
                  value={filterStatus}
                  onChange={setFilterStatus}
                  options={["All", ...STATUSES, "Overdue"]}
                />
              </div>
              {role === "secretary" && (
                <button onClick={() => setShowAdd((v) => !v)} style={btnPrimary}>
                  {showAdd ? "Close" : "+ Add target"}
                </button>
              )}
            </div>

            {/* Add form */}
            {role === "secretary" && showAdd && (
              <AddTarget
                sections={sections}
                onAdd={(t) => { addTarget(t); setShowAdd(false); }}
                onAddSection={addSection}
              />
            )}

            {/* Target list */}
            {visible.length === 0 ? (
              <div className="p-8 text-center rounded" style={{ background: "#fff", border: `1px dashed ${C.line}`, color: C.slate }}>
                {targets.length === 0
                  ? "No targets yet. As Secretary, add the first target assigned to a section."
                  : "Nothing matches this filter."}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {visible.map((t) => (
                  <TargetRow
                    key={t.id}
                    t={t}
                    role={role}
                    onUpdate={updateTarget}
                    onDelete={deleteTarget}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Save toast */}
      {saveNote && (
        <div style={{ position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)", background: C.navy, color: "#fff", padding: "8px 16px", borderRadius: 20, fontSize: 13, boxShadow: "0 4px 14px rgba(0,0,0,.2)" }}>
          {saveNote}
        </div>
      )}

      <footer className="mx-auto px-5 py-6" style={{ maxWidth: 1080 }}>
        <p style={{ fontSize: 11.5, color: C.slate, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
          Live register. Data is synced with the central database and persists between sessions.
          For department-wide rollout with officer logins, host through OCAC.
        </p>
      </footer>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────
function RoleToggle({ role, setRole }) {
  const opt = (id, label) => (
    <button
      onClick={() => setRole(id)}
      style={{
        padding: "6px 14px",
        fontSize: 13,
        fontWeight: 600,
        border: "none",
        cursor: "pointer",
        background: role === id ? C.gold : "transparent",
        color: role === id ? C.navy : "#fff",
        borderRadius: 6,
      }}
    >
      {label}
    </button>
  );
  return (
    <div style={{ display: "flex", gap: 2, background: C.navySoft, padding: 3, borderRadius: 8 }}>
      {opt("secretary", "Monitor")}
      {opt("officer", "Section update")}
    </div>
  );
}

function Stat({ label, value, color, dark }) {
  return (
    <div className="rounded p-4" style={{ background: "#fff", border: `1px solid ${C.line}`, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontFamily: serif, fontSize: 30, lineHeight: 1, color }}>{value}</div>
      <div style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.8, color: C.slate, marginTop: 6 }}>{label}</div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label style={{ fontSize: 12.5, color: C.slate, display: "flex", alignItems: "center", gap: 6 }}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: "5px 8px", fontFamily: sans, fontSize: 13, color: C.ink, background: "#fff" }}
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function AddTarget({ sections, onAdd, onAddSection }) {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [section, setSection] = useState(sections[0] || "");
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [newSection, setNewSection] = useState("");

  // Ensure default section selects accurately if data arrives late
  useEffect(() => {
    if (sections.length && !section) setSection(sections[0]);
  }, [sections, section]);

  const submit = () => {
    if (!title.trim()) return;
    onAdd({
      title: title.trim(),
      detail: detail.trim(),
      section,
      deadline: deadline || null, // Allow empty deadline
      priority,
      status: "Not Started",
      remarks: "",
      assignedDate: todayISO()
    });
    setTitle(""); setDetail(""); setDeadline(""); setPriority("Medium");
  };

  const input = { border: `1px solid ${C.line}`, borderRadius: 6, padding: "8px 10px", fontFamily: sans, fontSize: 14, width: "100%", boxSizing: "border-box" };

  return (
    <div className="mb-5 p-5 rounded" style={{ background: "#fff", border: `1px solid ${C.gold}` }}>
      <h3 style={{ fontFamily: serif, fontSize: 16, color: C.navy, marginBottom: 12 }}>New target</h3>
      <div className="flex flex-col gap-3">
        <input style={input} placeholder="Target / task assigned" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea style={{ ...input, minHeight: 60, resize: "vertical" }} placeholder="Details (optional)" value={detail} onChange={(e) => setDetail(e.target.value)} />
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div>
            <Lbl>Section</Lbl>
            <select style={input} value={section} onChange={(e) => setSection(e.target.value)}>
              {sections.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <Lbl>Deadline</Lbl>
            <input type="date" style={input} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <div>
            <Lbl>Priority</Lbl>
            <select style={input} value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={submit} style={btnPrimary}>Add target</button>
          <span style={{ width: 1, height: 22, background: C.line }} />
          <input style={{ ...input, width: 180 }} placeholder="New section name" value={newSection} onChange={(e) => setNewSection(e.target.value)} />
          <button
            onClick={() => { if (newSection.trim()) { onAddSection(newSection.trim()); setSection(newSection.trim()); setNewSection(""); } }}
            style={btnGhost}
          >
            Add section
          </button>
        </div>
      </div>
    </div>
  );
}

function Lbl({ children }) {
  return <div style={{ fontSize: 11.5, color: C.slate, marginBottom: 4, fontWeight: 600 }}>{children}</div>;
}

function TargetRow({ t, role, onUpdate, onDelete }) {
  const [remarkDraft, setRemarkDraft] = useState(t.remarks || "");
  const [editingRemark, setEditingRemark] = useState(false);
  const es = effectiveStatus(t);
  const over = isOverdue(t);

  return (
    <div className="rounded p-4" style={{ background: "#fff", border: `1px solid ${C.line}`, borderLeft: `4px solid ${STATUS_COLOR[es]}` }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>{t.title}</span>
            {t.priority === "High" && (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: C.saffron, border: `1px solid ${C.saffron}`, borderRadius: 4, padding: "1px 6px", textTransform: "uppercase" }}>
                High
              </span>
            )}
          </div>
          {t.detail && <div style={{ fontSize: 13, color: "#444", marginTop: 4 }}>{t.detail}</div>}
          <div style={{ fontSize: 12, color: C.slate, marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <span>{t.section}</span>
            {t.deadline && (
              <span style={{ color: over ? C.saffron : C.slate, fontWeight: over ? 600 : 400 }}>
                Due {new Date(t.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                {over ? " · overdue" : ""}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
          <StatusPill status={es} />
          <div style={{ display: "flex", gap: 4 }}>
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => onUpdate(t.id, { status: s })}
                title={s}
                style={{
                  fontSize: 11.5,
                  padding: "3px 8px",
                  borderRadius: 5,
                  cursor: "pointer",
                  border: `1px solid ${t.status === s ? STATUS_COLOR[s] : C.line}`,
                  background: t.status === s ? STATUS_COLOR[s] : "#fff",
                  color: t.status === s ? (s === "In Progress" ? C.navy : "#fff") : C.slate,
                  fontWeight: t.status === s ? 700 : 400,
                }}
              >
                {s === "Not Started" ? "To do" : s === "In Progress" ? "Doing" : "Done"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Remarks */}
      <div className="mt-3" style={{ borderTop: `1px dashed ${C.line}`, paddingTop: 10 }}>
        {editingRemark ? (
          <div className="flex gap-2 items-center">
            <input
              autoFocus
              value={remarkDraft}
              onChange={(e) => setRemarkDraft(e.target.value)}
              placeholder="Progress note / reason for delay"
              style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 6, padding: "6px 10px", fontFamily: sans, fontSize: 13 }}
            />
            <button onClick={() => { onUpdate(t.id, { remarks: remarkDraft }); setEditingRemark(false); }} style={btnPrimary}>Save note</button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span style={{ fontSize: 13, color: t.remarks ? "#333" : C.slate, fontStyle: t.remarks ? "normal" : "italic" }}>
              {t.remarks || "No progress note yet."}
            </span>
            <button onClick={() => { setRemarkDraft(t.remarks || ""); setEditingRemark(true); }} style={btnGhost}>
              {t.remarks ? "Edit note" : "Add note"}
            </button>
          </div>
        )}
        {role === "secretary" && (
          <div className="mt-2 text-right">
            <button onClick={() => onDelete(t.id)} style={{ ...btnGhost, color: C.saffron, borderColor: "transparent" }}>Remove target</button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  return (
    <span style={{ fontSize: 11.5, fontWeight: 700, color: "#fff", background: STATUS_COLOR[status], padding: "3px 10px", borderRadius: 20, letterSpacing: 0.3 }}>
      {status}
    </span>
  );
}

// ── Button styles ─────────────────────────────────────────────────────────
const btnPrimary = { background: C.navy, color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: sans };
const btnGhost = { background: "#fff", color: C.navy, border: `1px solid ${C.line}`, borderRadius: 6, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: sans };