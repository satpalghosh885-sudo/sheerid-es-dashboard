import React, { useState as S } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Ticket,
  ShieldCheck,
  Users,
  Settings,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Bell,
  ChevronDown,
  Plus,
  Download,
  Clock,
  MoreHorizontal,
  Check,
  X,
  Activity,
  ArrowRight,
  Command,
  LogOut,
} from "lucide-react";
import "./style.css";
const criteria = [
  "Greeting",
  "Intro",
  "Closing",
  "Empathy",
  "Tone",
  "Readability",
  "Spelling and Grammar",
  "Solution",
  "Comprehension",
  "Client Name",
  "Segment",
  "Full Path",
  "Redaction",
];
const statusNames = ["Solved", "Pending", "New", "Escalated", "Closed"];
const statusColors = ["#277859", "#e4b665", "#b7c7ec", "#c88e7c", "#7b96a2"];
const dateKey = (v) =>
  new Date(v).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
async function api(path, method = "GET", body) {
  const res = await fetch("/api" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event("signed-out"));
    throw Error(data.error || "Request failed");
  }
  return data;
}
const Store = React.createContext(null);
function useStore(key) {
  const ctx = React.useContext(Store);
  const field = {
    "sheer-tickets": "tickets",
    "sheer-users": "users",
    "sheer-reviews": "reviews",
    "sheer-settings": "settings",
  }[key];
  return [
    ctx.data[field],
    (next) => {
      const old = ctx.data[field],
        value = typeof next === "function" ? next(old) : next;
      ctx.mutate(async () => {
        if (field === "settings") await api("/settings", "PUT", value);
        else if (field === "tickets") {
          const added = value.find((t) => !old.some((o) => o.id === t.id));
          if (added) await api("/tickets", "POST", added);
          else {
            const changed = value.find((t) =>
              old.some((o) => o.id === t.id && o.status !== t.status),
            );
            if (changed)
              await api("/tickets/" + encodeURIComponent(changed.id), "PATCH", {
                status: changed.status,
              });
          }
        } else if (field === "users") {
          const added = value.find((u) => !old.some((o) => o.id === u.id));
          if (added) await api("/users", "POST", added);
          else {
            const changed = value.find((u) =>
              old.some(
                (o) =>
                  o.id === u.id && (o.role !== u.role || o.active !== u.active),
              ),
            );
            if (changed)
              await api("/users/" + changed.id, "PATCH", {
                role: changed.role,
                active: changed.active,
              });
          }
        } else if (field === "reviews")
          await api("/reviews", "POST", value[value.length - 1]);
      });
    },
  ];
}
function Root() {
  const [data, D] = S(null),
    [ready, J] = S(false),
    [error, H] = S(""),
    [busy, Z] = S(false),
    [message, G] = S("");
  const refresh = async () => {
    try {
      D(await api("/state"));
      H("");
    } catch (e) {
      D(null);
    } finally {
      J(true);
    }
  };
  React.useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    const out = () => D(null);
    window.addEventListener("signed-out", out);
    return () => {
      clearInterval(id);
      window.removeEventListener("signed-out", out);
    };
  }, []);
  async function mutate(fn) {
    if (busy) return;
    Z(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      G(e.message);
      setTimeout(() => G(""), 6000);
    } finally {
      Z(false);
    }
  }
  if (!ready)
    return (
      <div className="loginpage">
        <p>Connecting to your workspace…</p>
      </div>
    );
  if (!data)
    return (
      <div className="loginpage">
        <div className="loginbox">
          <div className="brand">
            <span className="brandmark">s✓</span>
            <b>
              SheerID <span className="es">ES</span>
            </b>
          </div>
          <h1>Welcome to your workspace.</h1>
          <p>Sign in to the iMerit SheerID ES Production Tool.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const d = new FormData(e.target);
              Z(true);
              try {
                await api("/login", "POST", {
                  email: d.get("email"),
                  password: d.get("password"),
                });
                await refresh();
              } catch (err) {
                H(err.message);
              } finally {
                Z(false);
              }
            }}
          >
            <label>
              Work email
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            {error && (
              <p role="alert" className="loginerror">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in securely"}
            </button>
          </form>
          <small>
            Need access or a password reset? Contact your workspace
            administrator.
          </small>
        </div>
      </div>
    );
  return (
    <Store.Provider value={{ data, mutate }}>
      <App user={data.user} />
      {busy && <div className="saving">Saving…</div>}
      {message && (
        <div role="alert" className="toast error">
          {message}
        </div>
      )}
    </Store.Provider>
  );
}
const time = (v) =>
  v
    ? new Date(v).toLocaleTimeString("en-GB", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const mins = (t) => (t.stop ? (t.stop - t.start) / 60000 : 0);
const initials = (n) =>
  n
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("");
function App({ user }) {
  const [page, P] = S("Overview"),
    [tickets, T] = useStore("sheer-tickets"),
    [users, U] = useStore("sheer-users"),
    [reviews, R] = useStore("sheer-reviews"),
    [settings, F] = useStore("sheer-settings"),
    [search, Q] = S(""),
    [status, V] = S("All statuses"),
    [period, B] = S("Today"),
    [modal, M] = S(null),
    [resetUser, ZU] = S(null),
    [toast, N] = S(""),
    [exportOpen, E] = S(false),
    [tick, K] = S(Date.now());
  React.useEffect(() => {
    const id = setInterval(() => K(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const me = user,
    admin = me?.role === "Admin",
    qc = admin || me?.role === "QC Reviewer";
  function notice(s) {
    N(s);
    setTimeout(() => N(""), 4000);
  }
  const visible = tickets.filter(
    (t) =>
      (period !== "Today" || dateKey(t.start) === dateKey(Date.now())) &&
      (admin || qc || t.user_id === me.id),
  );
  const reportDays = Math.max(
    1,
    new Set(visible.map((t) => dateKey(t.start))).size,
  );
  const done = visible.filter((t) => t.stop),
    solved = visible.filter((t) => t.status === "Solved"),
    avg = done.length ? done.reduce((a, t) => a + mins(t), 0) / done.length : 0;
  const team = users
    .filter((u) => u.active || visible.some((t) => t.user_id === u.id))
    .map((u) => {
      let ts = visible.filter((t) => t.user_id === u.id),
        finished = ts.filter((t) => t.stop),
        rev = reviews.filter((r) => ts.some((t) => t.id === r.ticket));
      return {
        ...u,
        count: finished.length,
        avg: finished.length
          ? finished.reduce((a, t) => a + mins(t), 0) / finished.length
          : 0,
        util:
          (finished.length /
            ((((settings.hourly || 10) * settings.shift) / 60) * reportDays)) *
          100,
        quality: rev.length
          ? rev.reduce((a, r) => a + r.score, 0) / rev.length
          : null,
      };
    });
  const util =
    (done.length /
      ((((settings.hourly || 10) * settings.shift) / 60) *
        reportDays *
        (admin || qc
          ? Math.max(
              1,
              users.filter(
                (u) => u.active || visible.some((t) => t.user_id === u.id),
              ).length,
            )
          : 1))) *
    100;
  const scopedReviews = reviews.filter((r) =>
    visible.some((t) => t.id === r.ticket),
  );
  const quality = scopedReviews.length
    ? scopedReviews.reduce((a, r) => a + r.score, 0) / scopedReviews.length
    : null;
  let filtered = visible.filter(
    (t) =>
      (status === "All statuses" || t.status === status) &&
      `${t.id} ${t.operator} ${t.client}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  function transition(id, s) {
    T((ts) =>
      ts.map((t) =>
        t.id === id
          ? { ...t, status: s, stop: s === "New" ? null : t.stop || Date.now() }
          : t,
      ),
    );
  }
  async function exportData(format) {
    let rows = filtered.map((t) => ({
      "Ticket ID": t.id,
      Operator: t.operator,
      Client: t.client,
      Status: t.status,
      Start: new Date(t.start).toISOString(),
      Stop: t.stop ? new Date(t.stop).toISOString() : "",
      "TPT (min)": t.stop ? mins(t).toFixed(2) : "",
      Notes: t.notes,
    }));
    if (page === "Team")
      rows = team.map((u) => ({
        Name: u.name,
        Role: u.role,
        "Tickets processed": u.count,
        "Average TPT": u.avg.toFixed(2),
        "Utilization %": u.util.toFixed(2),
        "Quality %": u.quality ?? "",
      }));
    if (page === "Quality control")
      rows = reviews
        .filter((r) => visible.some((t) => t.id === r.ticket))
        .map((r) => ({
          Ticket: r.ticket,
          Reviewer: r.reviewer,
          "Score %": r.score.toFixed(2),
          Feedback: r.feedback,
          ...Object.fromEntries(criteria.map((c, i) => [c, r.ratings[i]])),
        }));
    if (format === "PDF") {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF();
      doc.setFontSize(17);
      doc.text("SheerID-ES Production Report", 14, 20);
      doc.setFontSize(9);
      rows.forEach((r, i) => {
        if (i && i % 35 === 0) doc.addPage();
        doc.text(
          Object.values(r).slice(0, 4).join(" | "),
          14,
          32 + (i % 35) * 7,
        );
      });
      doc.save("sheerid-es-report.pdf");
    } else {
      const { default: ExcelJS } = await import("exceljs");
      const book = new ExcelJS.Workbook(),
        sheet = book.addWorksheet("Production");
      const keys = Object.keys(rows[0] || { "Ticket ID": "" });
      sheet.columns = keys.map((key) => ({ header: key, key, width: 24 }));
      rows.forEach((row) =>
        sheet.addRow(
          Object.fromEntries(
            Object.entries(row).map(([k, v]) => [
              k,
              typeof v === "string" && /^[=+@\-\t\r]/.test(v) ? "'" + v : v,
            ]),
          ),
        ),
      );
      const data =
        format === "Excel"
          ? await book.xlsx.writeBuffer()
          : await book.csv.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([data], {
          type:
            format === "Excel"
              ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              : "text/csv",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download =
        "sheerid-es-report." + (format === "Excel" ? "xlsx" : "csv");
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    E(false);
    notice("Report exported");
  }
  return (
    <div className="app">
      <aside>
        <div className="brand">
          <span className="brandmark">
            s<span>✓</span>
          </span>
          <b>
            SheerID<span className="es">ES</span>
          </b>
        </div>
        <div className="workspace">
          <span className="merit">iM</span>
          <div>
            <b>iMerit workspace</b>
            <small>Production management</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="navlabel">WORKSPACE</div>
        <nav>
          {[
            [LayoutDashboard, "Overview"],
            [Ticket, "Production"],
            [ShieldCheck, "Quality control"],
            [Users, "Team"],
            [Settings, "Settings"],
          ]
            .filter(([I, n]) => n !== "Settings" || admin)
            .map(([I, n]) => (
              <button
                className={page === n ? "active" : ""}
                onClick={() => {
                  P(n);
                  Q("");
                }}
                key={n}
              >
                <I size={19} />
                {n}
                {n === "Production" && (
                  <span className="navcount">
                    {visible.filter((t) => t.status === "New").length}
                  </span>
                )}
              </button>
            ))}
        </nav>
        <div className="sidecard">
          <span className="live-dot" />
          SHARED WORKSPACE
          <div>
            Your team's work.
            <br />
            One clear picture.
          </div>
          <small>
            Secure sign-in.
            <br />
            One shared team workspace.
          </small>
        </div>
        <div className="sidefoot">
          <span className="avatar">{initials(me.name)}</span>
          <div>
            <b>{me.name}</b>
            <small>{me.role}</small>
          </div>
          <button
            className="iconbutton"
            title="Sign out"
            aria-label="Sign out"
            onClick={async () => {
              await api("/logout", "POST", {});
              window.dispatchEvent(new Event("signed-out"));
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            Workspace <span>/</span>
            <b>{page}</b>
          </div>
          <div className="topright">
            <span className="environment">
              <i /> Team workspace
            </span>
            <button
              className="iconbutton"
              onClick={() => notice("You’re all caught up.")}
              aria-label="Notifications"
            >
              <Bell size={18} />
              <em />
            </button>
            <button
              className="avatar small"
              title="Change password"
              aria-label="Change password"
              onClick={() => M("password")}
            >
              {initials(me.name)}
            </button>
          </div>
        </header>
        <div className="content">
          <div className="heading">
            <div>
              <div className="eyebrow">SHEERID ES · PRODUCTION TOOL</div>
              <h1>
                {page === "Overview"
                  ? "A clear view of your team."
                  : page === "Production"
                    ? "Every ticket. Every minute."
                    : page === "Quality control"
                      ? "Quality in every interaction."
                      : page === "Team"
                        ? "Meet your team."
                        : "Make it work your way."}
              </h1>
              <p>
                {page === "Overview"
                  ? "Track productivity, monitor quality, and keep your team moving forward."
                  : page === "Production"
                    ? "Manage tickets and track handling time, from start to finish."
                    : page === "Quality control"
                      ? "Review tickets against your weighted quality scorecard."
                      : page === "Team"
                        ? "Individual performance and workspace access, in one place."
                        : "Manage your production targets and quality standards."}
              </p>
            </div>
            <div className="actions">
              <div className="exportwrap">
                <button className="button" onClick={() => E(!exportOpen)}>
                  <Download size={16} /> Export report <ChevronDown size={14} />
                </button>
                {exportOpen && (
                  <div className="dropdown">
                    {["Excel", "CSV", "PDF"].map((f) => (
                      <button key={f} onClick={() => exportData(f)}>
                        {f}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button className="button primary" onClick={() => M("ticket")}>
                <Plus size={17} />
                New ticket
              </button>
            </div>
          </div>
          <div className="filterbar">
            <div className="tabs">
              {["All time", "Today"].map((p) => (
                <button
                  className={period === p ? "selected" : ""}
                  onClick={() => B(p)}
                  key={p}
                >
                  {p}
                </button>
              ))}
            </div>
            <span className="updated">
              <span className="live-dot" /> Live updates{" "}
              <span className="sep">|</span>{" "}
              {new Date(tick).toLocaleDateString("en-GB", {
                timeZone: "Asia/Kolkata",
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
          {page === "Overview" && (
            <>
              <div className="stats">
                {[
                  {
                    label: "Tickets processed",
                    value: done.length,
                    icon: Ticket,
                    sub: `${solved.length} solved tickets`,
                    hint: "Across selected period",
                    positive: true,
                  },
                  {
                    label: "Average TPT",
                    value: avg.toFixed(1),
                    unit: "min",
                    icon: Clock,
                    sub: `${avg <= settings.best ? "Within" : "Above"} target`,
                    hint: `Target: ${settings.best} min per ticket`,
                    positive: avg <= settings.best,
                  },
                  {
                    label: "Team utilization",
                    value: util.toFixed(1),
                    unit: "%",
                    icon: Activity,
                    sub: `${reportDays} day(s) · ${settings.shift / 60} productive hours/day`,
                    hint: `Actual ÷ expected (${(((settings.hourly || 10) * settings.shift) / 60) * reportDays}/person)`,
                    positive: true,
                  },
                  {
                    label: "Quality score",
                    value: quality === null ? "—" : quality.toFixed(1),
                    unit: quality === null ? "" : "%",
                    icon: ShieldCheck,
                    sub: scopedReviews.length
                      ? `${scopedReviews.length} completed reviews`
                      : "Awaiting first review",
                    hint: "Based on weighted QC reviews",
                    positive: true,
                  },
                ].map((s, i) => (
                  <div className="stat" key={s.label}>
                    <div className="statlabel">
                      {s.label}
                      <s.icon size={18} />
                    </div>
                    <div className="statvalue">
                      {s.value}
                      <span>{s.unit}</span>
                    </div>
                    <div
                      className={
                        "statbottom " + (s.positive ? "green" : "amber")
                      }
                    >
                      <span>
                        {s.positive ? (
                          <ArrowUpRight size={14} />
                        ) : (
                          <ArrowDownRight size={14} />
                        )}{" "}
                        {s.sub}
                      </span>
                    </div>
                    <small>{s.hint}</small>
                  </div>
                ))}
              </div>
              <div className="charts">
                <section className="panel trend">
                  <div className="panelhead">
                    <div>
                      <h2>Production overview</h2>
                      <p>Ticket activity throughout the day</p>
                    </div>
                    <span className="legend">
                      <i /> Processed tickets
                    </span>
                  </div>
                  <Chart tickets={visible} />
                </section>
                <section className="panel statuspanel">
                  <div className="panelhead">
                    <div>
                      <h2>Ticket breakdown</h2>
                      <p>A snapshot of current statuses</p>
                    </div>
                    <MoreHorizontal size={19} />
                  </div>
                  <div
                    className="donut"
                    style={{
                      background: visible.length ? `conic-gradient(${statusNames.map((name,i)=>{const start=statusNames.slice(0,i).reduce((sum,n)=>sum+visible.filter(t=>t.status===n).length,0)/visible.length*100;const end=start+visible.filter(t=>t.status===name).length/visible.length*100;return `${statusColors[i]} ${start}% ${end}%`}).join(',')})` : '#edf1ed',
                    }}
                  >
                    <div>
                      <strong>{visible.length}</strong>
                      <small>Total tickets</small>
                    </div>
                  </div>
                  <div className="statuslegend">
                    {statusNames.map((s, i) => (
                      <div key={s}>
                        <span>
                          <i
                            style={{
                              background: statusColors[i],
                            }}
                          />
                          {s}
                        </span>
                        <b>{visible.filter((t) => t.status === s).length}</b>
                        <small>
                          {Math.round(
                            (visible.filter((t) => t.status === s).length /
                              Math.max(visible.length, 1)) *
                              100,
                          )}
                          %
                        </small>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
              <section className="panel">
                <div className="panelhead">
                  <div>
                    <h2>
                      Team performance{" "}
                      <span className="pill">{team.length} members</span>
                    </h2>
                    <p>A closer look at your team's impact</p>
                  </div>
                  <button className="textbutton" onClick={() => P("Team")}>
                    View team <ArrowRight size={15} />
                  </button>
                </div>
                <TeamTable team={team} compact />
              </section>
            </>
          )}
          {page === "Production" && (
            <section className="panel">
              <div className="panelhead">
                <h2>
                  Ticket workspace{" "}
                  <span className="pill">{filtered.length} tickets</span>
                </h2>
                <div className="actions">
                  <label className="search">
                    <Search size={16} />
                    <input
                      placeholder="Search tickets or operators"
                      value={search}
                      onChange={(e) => Q(e.target.value)}
                    />
                  </label>
                  <select value={status} onChange={(e) => V(e.target.value)}>
                    {[
                      "All statuses",
                      "New",
                      "Pending",
                      "Solved",
                      "Escalated",
                      "Closed",
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Ticket ID",
                        "Operator / Client",
                        "Start",
                        "Stop",
                        "TPT",
                        "Status",
                      ].map((s) => (
                        <th key={s}>{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <b>{t.id}</b>
                        </td>
                        <td>
                          {t.operator}
                          <small>{t.client}</small>
                        </td>
                        <td>{time(t.start)}</td>
                        <td>{time(t.stop)}</td>
                        <td>
                          <span className="mono">
                            {t.stop
                              ? mins(t).toFixed(1)
                              : ((tick - t.start) / 60000).toFixed(1)}{" "}
                            min
                          </span>
                          {!t.stop && (
                            <small className="green">● In progress</small>
                          )}
                        </td>
                        <td>
                          <select
                            className={"badge " + t.status.toLowerCase()}
                            value={t.status}
                            disabled={!admin && t.user_id !== me.id}
                            onChange={(e) => transition(t.id, e.target.value)}
                          >
                            {[
                              "New",
                              "Pending",
                              "Solved",
                              "Escalated",
                              "Closed",
                            ].map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filtered.length && (
                  <div className="empty">No tickets match your filters.</div>
                )}
              </div>
            </section>
          )}
          {page === "Team" && (
            <section className="panel">
              <div className="panelhead">
                <div>
                  <h2>People & performance</h2>
                  <p>
                    Utilization uses a {settings.shift / 60}-hour available
                    shift per person.
                  </p>
                </div>
                {admin && (
                  <button className="button primary" onClick={() => M("user")}>
                    <Plus size={16} />
                    Add member
                  </button>
                )}
              </div>
              <TeamTable team={team} />
              {admin && (
                <div className="members">
                  {users.map((u) => (
                    <div className="member" key={u.id}>
                      <span className="avatar">{initials(u.name)}</span>
                      <div>
                        <b>{u.name}</b>
                        <small>{u.email}</small>
                      </div>
                      <select
                        disabled={u.id === me.id}
                        value={u.role}
                        onChange={(e) =>
                          U((us) =>
                            us.map((x) =>
                              x.id === u.id
                                ? { ...x, role: e.target.value }
                                : x,
                            ),
                          )
                        }
                      >
                        {["Admin", "QC Reviewer", "Operator"].map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                      <button
                        className="button"
                        onClick={() => {
                          ZU(u);
                          M("reset");
                        }}
                      >
                        Reset password
                      </button>
                      <button
                        disabled={u.id === me.id}
                        className="button"
                        onClick={() =>
                          U((us) =>
                            us.map((x) =>
                              x.id === u.id ? { ...x, active: !x.active } : x,
                            ),
                          )
                        }
                      >
                        {u.active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
          {page === "Quality control" && (
            <section className="panel">
              <div className="panelhead">
                <div>
                  <h2>Quality reviews</h2>
                  <p>
                    13 weighted criteria ·{" "}
                    {settings.weights.reduce((a, b) => a + b, 0)} total points
                  </p>
                </div>
                {qc && (
                  <button
                    className="button primary"
                    onClick={() => M("review")}
                  >
                    <Plus size={16} />
                    New review
                  </button>
                )}
              </div>
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ticket</th>
                      <th>Reviewer</th>
                      <th>Score</th>
                      <th>Date</th>
                      <th>Feedback</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviews
                      .filter((r) => visible.some((t) => t.id === r.ticket))
                      .map((r, i) => (
                        <tr key={i}>
                          <td>{r.ticket}</td>
                          <td>{r.reviewer}</td>
                          <td>
                            <span className="badge solved">
                              {r.score.toFixed(1)}%
                            </span>
                          </td>
                          <td>{new Date(r.date).toLocaleDateString()}</td>
                          <td>{r.feedback}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!reviews.length && (
                  <div className="empty">
                    <ShieldCheck size={34} />
                    <h3>Your quality story starts here</h3>
                    <p>
                      Complete your first ticket review to see weighted quality
                      scores.
                    </p>
                    {qc && (
                      <button className="button" onClick={() => M("review")}>
                        Review a ticket <ArrowRight size={15} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}
          {page === "Settings" && admin && (
            <section className="panel settings">
              <h2>Production standards</h2>
              <p>These settings apply to the shared team workspace.</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  let d = new FormData(e.target);
                  F({
                    best: +d.get("best"),
                    shift: +d.get("shift"),
                    hourly: +d.get("hourly"),
                    weights: criteria.map((_, i) => +d.get("w" + i)),
                  });
                }}
              >
                <div className="formgrid">
                  <label>
                    Best TPT (minutes)
                    <input
                      name="best"
                      type="number"
                      min="0.1"
                      step="0.1"
                      defaultValue={settings.best}
                      required
                    />
                  </label>
                  <label>
                    Productive shift (minutes)
                    <input
                      name="shift"
                      type="number"
                      min="1"
                      defaultValue={settings.shift}
                      required
                    />
                  </label>
                  <label>
                    Expected tickets per productive hour
                    <input
                      name="hourly"
                      type="number"
                      min="1"
                      required
                      defaultValue={settings.hourly || 10}
                    />
                  </label>
                </div>
                <h3>Quality scoring weights</h3>
                <p>
                  Each criterion is rated from 0 to 5. Weighted scores are
                  normalized to 100%.
                </p>
                <div className="weightgrid">
                  {criteria.map((c, i) => (
                    <label key={c}>
                      {c}
                      <input
                        name={"w" + i}
                        type="number"
                        min="0"
                        max="100"
                        required
                        defaultValue={settings.weights[i]}
                      />
                    </label>
                  ))}
                </div>
                <button className="button primary">Save settings</button>
              </form>
              <div className="callout">
                <ShieldCheck size={20} />
                <div>
                  <b>Deployment & access</b>
                  <p>
                    Permissions are enforced by the server. Changes to member
                    access revoke their existing sessions. Suggested deployment
                    name: sheerid-es-production-tool.
                  </p>
                </div>
              </div>
            </section>
          )}
          <div className="footer">
            <span>
              <span className="mini-logo">s✓</span> SheerID ES <span>×</span>{" "}
              iMerit
            </span>
            <span>Built for better everyday performance.</span>
            <span>Shared workspace · Secure access</span>
          </div>
        </div>
      </main>
      {toast && (
        <div className="toast">
          <Check size={17} />
          {toast}
        </div>
      )}
      {modal && (
        <div className="overlay" onClick={() => M(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="close iconbutton" onClick={() => M(null)}>
              <X size={20} />
            </button>
            <h2>
              {modal === "ticket"
                ? "Start a new ticket"
                : modal === "user"
                  ? "Add a team member"
                  : modal === "password"
                    ? "Change your password"
                    : modal === "reset"
                      ? "Reset member password"
                      : "Review a ticket"}
            </h2>
            <p>
              {modal === "ticket"
                ? "The timer starts as soon as you create the ticket."
                : modal === "user"
                  ? "Set their workspace role and access."
                  : modal === "password"
                    ? "Use at least 12 characters. Other sessions will be signed out."
                    : modal === "reset"
                      ? `Set a new password for ${resetUser?.name}. All their sessions will be revoked.`
                      : "Rate each criterion from 0 (missed) to 5 (fully met)."}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.target);
                if (modal === "reset") {
                  api("/users/" + resetUser.id + "/password", "POST", {
                    password: d.get("password"),
                  })
                    .then(() => {
                      M(null);
                      notice("Member password reset");
                    })
                    .catch((e) => notice(e.message));
                  return;
                }
                if (modal === "password") {
                  api("/password", "POST", {
                    current: d.get("current"),
                    password: d.get("password"),
                  })
                    .then(() => {
                      M(null);
                      notice("Password changed");
                    })
                    .catch((e) => notice(e.message));
                  return;
                }
                if (modal === "ticket") {
                  const id = d.get("id").trim();
                  if (
                    tickets.some((t) => t.id.toLowerCase() === id.toLowerCase())
                  )
                    return notice("This ticket ID already exists");
                  T((ts) => [
                    {
                      id,
                      operator: me.name,
                      client: d.get("client"),
                      notes: d.get("notes"),
                      status: "New",
                      start: Date.now(),
                      stop: null,
                    },
                    ...ts,
                  ]);
                  P("Production");
                } else if (modal === "user") {
                  if (
                    users.some(
                      (u) =>
                        u.email.toLowerCase() === d.get("email").toLowerCase(),
                    )
                  )
                    return notice("A member with that email already exists");
                  U((us) => [
                    ...us,
                    {
                      id: Date.now(),
                      name: d.get("name").trim(),
                      email: d.get("email"),
                      role: d.get("role"),
                      password: d.get("password"),
                      active: true,
                    },
                  ]);
                } else {
                  const ratings = criteria.map((_, i) => +d.get("r" + i)),
                    total = settings.weights.reduce((a, b) => a + b, 0);
                  if (!total) return notice("Set a nonzero QC weight first");
                  R((rs) => [
                    ...rs,
                    {
                      ticket: d.get("ticket"),
                      reviewer: me.name,
                      date: Date.now(),
                      ratings,
                      score:
                        (ratings.reduce(
                          (a, r, i) => a + (r / 5) * settings.weights[i],
                          0,
                        ) /
                          total) *
                        100,
                      feedback: d.get("feedback"),
                    },
                  ]);
                }
                M(null);
              }}
            >
              {modal === "ticket" ? (
                <>
                  <label>
                    Ticket ID
                    <input
                      name="id"
                      placeholder="e.g. ES-6050123"
                      required
                      pattern=".*\S.*"
                    />
                  </label>
                  <label>
                    Client / account
                    <input name="client" placeholder="e.g. Spotify" required />
                  </label>
                  <label>
                    Notes
                    <textarea
                      name="notes"
                      placeholder="Optional context for this ticket"
                    />
                  </label>
                  <div className="callout">
                    <Clock size={18} />
                    <span>
                      Changing New to another status records the stop time.
                      Returning to New resumes the elapsed timer from the
                      original start.
                    </span>
                  </div>
                </>
              ) : modal === "user" ? (
                <>
                  <label>
                    Full name
                    <input name="name" required pattern=".*\S.*" />
                  </label>
                  <label>
                    Email address
                    <input name="email" type="email" required />
                  </label>
                  <label>
                    Initial password
                    <input
                      name="password"
                      type="password"
                      minLength="12"
                      maxLength="256"
                      autoComplete="new-password"
                      required
                    />
                  </label>
                  <label>
                    Role
                    <select name="role">
                      <option>Operator</option>
                      <option>QC Reviewer</option>
                      <option>Admin</option>
                    </select>
                  </label>
                </>
              ) : modal === "password" ? (
                <>
                  <label>
                    Current password
                    <input
                      name="current"
                      type="password"
                      autoComplete="current-password"
                      required
                    />
                  </label>
                  <label>
                    New password
                    <input
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      minLength="12"
                      maxLength="256"
                      required
                    />
                  </label>
                </>
              ) : modal === "reset" ? (
                <label>
                  New password
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength="12"
                    maxLength="256"
                    required
                  />
                </label>
              ) : (
                <>
                  <label>
                    Ticket
                    <select aria-label="Ticket" name="ticket" required>
                      <option value="">Select a completed ticket</option>
                      {visible
                        .filter((t) => t.stop)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.id} · {t.operator}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="ratinggrid">
                    {criteria.map((c, i) => (
                      <label key={c}>
                        {c}
                        <small>{settings.weights[i]} points</small>
                        <select name={"r" + i} defaultValue="5">
                          {[0, 1, 2, 3, 4, 5].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <label>
                    Feedback
                    <textarea
                      name="feedback"
                      placeholder="Coaching notes and observations"
                    />
                  </label>
                </>
              )}
              <button className="button primary full">
                {modal === "ticket"
                  ? "Start ticket & timer"
                  : modal === "user"
                    ? "Add member"
                    : modal === "password"
                      ? "Change password"
                      : modal === "reset"
                        ? "Reset password"
                        : "Save quality review"}
                <ArrowRight size={16} />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
function TeamTable({ team, compact }) {
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>Team member</th>
            <th>Tickets processed</th>
            <th>Avg. TPT</th>
            <th>Utilization</th>
            <th>Quality score</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {team.slice(0, compact ? 5 : 1000).map((u, i) => (
            <tr key={u.id}>
              <td>
                <div className="person">
                  <span className={"avatar color" + (i % 4)}>
                    {initials(u.name)}
                  </span>
                  <div>
                    <b>{u.name}</b>
                    <small>{u.role}</small>
                  </div>
                </div>
              </td>
              <td>
                <b>{u.count}</b>
              </td>
              <td>
                {u.avg.toFixed(1)} <span className="muted">min</span>
              </td>
              <td>
                <div className="util">
                  <div>
                    <i style={{ width: Math.min(u.util, 100) + "%" }} />
                  </div>
                  <span>{u.util.toFixed(1)}%</span>
                </div>
              </td>
              <td>
                {u.quality === null ? (
                  <span className="muted">Not reviewed</span>
                ) : (
                  <b>{u.quality.toFixed(1)}%</b>
                )}
              </td>
              <td>
                <span className={"badge " + (u.active ? "solved" : "")} >
                  <i /> {u.active ? "Active" : "Inactive"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Chart({ tickets }) {
  const hours = Array.from(
      { length: 9 },
      (_, i) =>
        (Number(
          new Intl.DateTimeFormat("en-GB", {
            hour: "numeric",
            hourCycle: "h23",
            timeZone: "Asia/Kolkata",
          }).format(new Date()),
        ) -
          8 +
          i +
          24) %
        24,
    ),
    counts = hours.map(
      (h) =>
        tickets.filter(
          (t) =>
            t.stop &&
            Number(
              new Intl.DateTimeFormat("en-GB", {
                hour: "numeric",
                hourCycle: "h23",
                timeZone: "Asia/Kolkata",
              }).format(new Date(t.stop)),
            ) === h,
        ).length,
    ),
    max = Math.max(4, ...counts);
  return (
    <div className="chart">
      <div className="yaxis">
        {[
          max,
          Math.round(max * 0.75),
          Math.round(max * 0.5),
          Math.round(max * 0.25),
          0,
        ].map((v, i) => (
          <span key={i}>{v}</span>
        ))}
      </div>
      <div className="plot">
        <div className="gridlines">
          {[0, 1, 2, 3, 4].map((i) => (
            <i key={i} />
          ))}
        </div>
        <div className="bars">
          {hours.map((h, i) => (
            <div className="barcol" key={h}>
              <div
                className="bar"
                title={`${h}:00 · ${counts[i]} tickets`}
                style={{ height: Math.max(2, (counts[i] / max) * 100) + "%" }}
              />
              <span>
                {h > 12 ? h - 12 : h}
                {h >= 12 ? "pm" : "am"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<Root />);
