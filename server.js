const http = require("http");
const Database = require("better-sqlite3");
const path = require("path");

const PORT = process.env.PORT || 3099;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "registrations.db");
// Multiple admin users
const ADMINS = [
  { email: "kdrivas1989@gmail.com", password: "Bogus714*" },
  { email: "curtbartholomew@hotmail.com", password: "uscpa2026" },
];
const crypto = require("crypto");

// Session store in SQLite (survives restarts)
function createSession(remember) {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO session (token, remember, created_at) VALUES (?, ?, ?)").run(token, remember ? 1 : 0, Date.now());
  return token;
}
function isValidSession(token) {
  if (!token) return false;
  const session = db.prepare("SELECT * FROM session WHERE token = ?").get(token);
  if (!session) return false;
  const maxAge = session.remember ? 2592000000 : 86400000;
  if (Date.now() - session.created_at > maxAge) { db.prepare("DELETE FROM session WHERE token = ?").run(token); return false; }
  return true;
}
function deleteSession(token) {
  if (token) db.prepare("DELETE FROM session WHERE token = ?").run(token);
}
function getCookie(req, name) {
  const header = req.headers.cookie || "";
  const match = header.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"));
  return match ? match[1] : null;
}

function getLoginHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>USCPA Export - Login</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a1a; color: #ededed; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .login { background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 12px; padding: 32px; width: 360px; }
    h1 { color: #00d4ff; font-size: 22px; margin-bottom: 6px; }
    .sub { color: #888; font-size: 13px; margin-bottom: 24px; }
    label { display: block; color: #aaa; font-size: 12px; margin-bottom: 4px; margin-top: 14px; }
    input { width: 100%; padding: 10px 14px; border-radius: 8px; border: 1px solid #2a2a4a; background: #16213e; color: #ededed; font-size: 14px; }
    input:focus { outline: none; border-color: #00d4ff; }
    button { width: 100%; margin-top: 20px; padding: 12px; border-radius: 8px; border: none; background: #00d4ff; color: #000; font-weight: 700; font-size: 14px; cursor: pointer; }
    button:hover { opacity: 0.9; }
    .err { color: #ff6b6b; font-size: 12px; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="login">
    <h1>USCPA Export</h1>
    <p class="sub">Sign in to access registration data</p>
    <form method="POST" action="/login">
      <label>Email</label>
      <input name="email" type="email" placeholder="Email" required>
      <label>Password</label>
      <input name="password" type="password" placeholder="Password" required>
      <label style="display:flex;align-items:center;gap:8px;margin-top:16px;cursor:pointer"><input type="checkbox" name="remember" value="1" checked> <span style="font-size:13px;color:#aaa">Remember me</span></label>
      <button type="submit">Sign In</button>
    </form>
  </div>
</body>
</html>`;
}

// WooCommerce credentials
const WC_API_URL = "https://swoopleague.com";
const WC_CONSUMER_KEY = "ck_094770442eeedcd99d96da6711ce57171b568388";
const WC_CONSUMER_SECRET = "cs_354183e905402122379286042090a99104534c59";

// 2026 product ID → event mapping
const PRODUCT_MAP = {
  9879: { name: "Meet #1 Registration 2026", type: "meet", date: "2026-03-07", location: "Skydive City, Zephyrhills, FL" },
  9883: { name: "Meet #2 Registration 2026", type: "meet", date: "2026-04-11", location: "Skydive Sebastian, Sebastian, FL" },
  9888: { name: "Meet #3 Registration 2026", type: "meet", date: "2026-05-16", location: "Skydive Paraclete XP, Raeford, NC" },
  9892: { name: "Meet #4 Registration 2026", type: "meet", date: "2026-06-13", location: "West Tennessee Skydiving, Memphis, TN" },
  9900: { name: "Meet #5 Registration 2026", type: "meet", date: "2026-09-20", location: "Skydive City, Zephyrhills, FL" },
  9904: { name: "Pilots of the Caribbean 2026", type: "freestyle", date: "2026-07-11", location: "Skydive Beaufort, Beaufort, NC" },
  9877: { name: "League Registration 2026", type: "league", date: null, location: null },
  9878: { name: "Team Registration 2026", type: "team", date: null, location: null },
};

// Event info lookup by name
const EVENT_INFO = {};
for (const [, v] of Object.entries(PRODUCT_MAP)) {
  EVENT_INFO[v.name] = { date: v.date, location: v.location, type: v.type };
}

const COUNTRY_MAP = {
  US: "USA", CA: "CAN", GB: "GBR", AU: "AUS", NZ: "NZL", ZA: "RSA",
  DE: "GER", FR: "FRA", ES: "ESP", IT: "ITA", NL: "NED", BE: "BEL",
  CH: "SUI", AT: "AUT", SE: "SWE", NO: "NOR", DK: "DEN", FI: "FIN",
  PL: "POL", CZ: "CZE", RU: "RUS", JP: "JPN", KR: "KOR", CN: "CHN",
  IN: "IND", BR: "BRA", AR: "ARG", MX: "MEX", CO: "COL", CL: "CHI",
  AE: "UAE", IL: "ISR", SG: "SGP", MY: "MAS", TH: "THA", PH: "PHI",
  PT: "POR", IE: "IRL", HR: "CRO", BH: "BRN", QA: "QAT", KW: "KUW",
  OM: "OMA", BG: "BUL", HU: "HUN", SI: "SLO",
};

function convertCountry(code) {
  if (!code) return "USA";
  return COUNTRY_MAP[code.toUpperCase()] || code.toUpperCase();
}

function getMeta(metaData, key) {
  if (!metaData) return "";
  const m = metaData.find((m) => m.key === key);
  return m ? String(m.value || "").trim() : "";
}

// ── Database ──────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS registration (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    country TEXT,
    event TEXT NOT NULL,
    event_type TEXT NOT NULL,
    membership TEXT,
    comp_class TEXT,
    wing_type TEXT,
    wing_size TEXT,
    wing_loading TEXT,
    degree_of_turn TEXT,
    price_paid TEXT,
    order_date TEXT,
    synced_at TEXT NOT NULL DEFAULT (datetime('now')),
    source TEXT NOT NULL DEFAULT 'woocommerce',
    payment_method TEXT,
    UNIQUE(order_id, event)
  );

  CREATE TABLE IF NOT EXISTS session (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    remember INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    synced_at TEXT NOT NULL DEFAULT (datetime('now')),
    orders_fetched INTEGER NOT NULL DEFAULT 0,
    new_registrations INTEGER NOT NULL DEFAULT 0
  );
`);

// Migrate existing DBs
const cols = db.prepare("PRAGMA table_info(registration)").all().map(c => c.name);
if (!cols.includes("source")) db.exec("ALTER TABLE registration ADD COLUMN source TEXT NOT NULL DEFAULT 'woocommerce'");
if (!cols.includes("payment_method")) db.exec("ALTER TABLE registration ADD COLUMN payment_method TEXT");
if (!cols.includes("team_name")) db.exec("ALTER TABLE registration ADD COLUMN team_name TEXT");

const insertReg = db.prepare(`
  INSERT OR IGNORE INTO registration (order_id, name, email, country, event, event_type, membership, comp_class, wing_type, wing_size, wing_loading, degree_of_turn, price_paid, order_date)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertManual = db.prepare(`
  INSERT INTO registration (order_id, name, email, country, event, event_type, membership, comp_class, wing_type, wing_size, wing_loading, degree_of_turn, price_paid, order_date, source, payment_method, team_name)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'manual', ?, ?)
`);

const insertSync = db.prepare(`
  INSERT INTO sync_log (orders_fetched, new_registrations) VALUES (?, ?)
`);

function getAllFromDB() {
  return db.prepare("SELECT * FROM registration ORDER BY order_id DESC").all();
}

function getLastSync() {
  return db.prepare("SELECT * FROM sync_log ORDER BY id DESC LIMIT 1").get();
}

// ── WooCommerce Sync ─────────────────────────────────────
async function syncFromWC() {
  let totalFetched = 0;
  let newCount = 0;
  let page = 1;

  while (true) {
    const url = new URL(`${WC_API_URL}/wp-json/wc/v3/orders`);
    url.searchParams.set("consumer_key", WC_CONSUMER_KEY);
    url.searchParams.set("consumer_secret", WC_CONSUMER_SECRET);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));
    url.searchParams.set("status", "processing,completed");
    url.searchParams.set("after", "2025-12-01T00:00:00");

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`WC API error: ${res.status}`);

    const orders = await res.json();
    if (orders.length === 0) break;

    for (const order of orders) {
      const name = getMeta(order.meta_data, "first_and_last_name");
      const email = order.billing?.email?.toLowerCase().trim() || "";
      const country = convertCountry(order.billing?.country);

      for (const item of order.line_items) {
        const product = PRODUCT_MAP[item.product_id];
        if (!product) continue;

        totalFetched++;
        const membership = getMeta(item.meta_data, "membership");
        const compClass = getMeta(item.meta_data, "comp-class").toLowerCase();

        const result = insertReg.run(
          order.id,
          name || email,
          email,
          country,
          product.name,
          product.type,
          membership === "Non-Member" ? "Non-Member" : "Member",
          compClass || null,
          getMeta(item.meta_data, "wing-1") || null,
          getMeta(item.meta_data, "wing-1-size") || null,
          getMeta(item.meta_data, "wing-1-loading") || null,
          getMeta(item.meta_data, "degree-of-turn") || null,
          item.total || "0",
          order.date_created
        );
        if (result.changes > 0) newCount++;
      }
    }

    page++;
  }

  insertSync.run(totalFetched, newCount);
  return { totalFetched, newCount };
}

// ── CSV Generation ───────────────────────────────────────
function escapeCSV(val) {
  const str = val == null ? "" : String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateAllCSV(registrations, eventFilter) {
  const filtered = eventFilter
    ? registrations.filter((r) => r.event === eventFilter)
    : registrations;

  const headers = [
    "Name", "Email", "Event", "Membership", "Class", "Wing Type", "Wing Size",
    "Wing Loading", "Degree of Turn", "Country", "Price", "Order #", "Date",
  ];

  const rows = filtered.map((r) =>
    [
      r.name, r.email, r.event, r.membership, r.comp_class, r.wing_type,
      r.wing_size, r.wing_loading, r.degree_of_turn, r.country, r.price_paid,
      r.order_id, r.order_date,
    ].map(escapeCSV).join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

function generateInTimeCSV(registrations, eventFilter) {
  const filtered = registrations.filter(
    (r) => (r.event_type === "meet" || r.event_type === "freestyle") &&
           (!eventFilter || r.event === eventFilter)
  );

  const classBase = { sport: 100, intermediate: 200, advanced: 300, pro: 400 };
  const classAbbrev = { sport: "SPT", intermediate: "INT", advanced: "ADV", pro: "OPEN" };

  const byEvent = {};
  for (const r of filtered) {
    if (!byEvent[r.event]) byEvent[r.event] = [];
    byEvent[r.event].push(r);
  }

  const rows = [];
  for (const [eventName, regs] of Object.entries(byEvent)) {
    const classBuckets = {};
    for (const r of regs) {
      const cls = r.comp_class || "intermediate";
      if (!classBuckets[cls]) classBuckets[cls] = [];
      classBuckets[cls].push(r);
    }

    for (const [cls, clsRegs] of Object.entries(classBuckets)) {
      const base = classBase[cls] || 200;
      const abbrev = classAbbrev[cls] || cls.toUpperCase();
      const countrySeen = {};
      let nextNo = base;

      for (const r of clsRegs) {
        const country = r.country || "USA";
        if (!(country in countrySeen)) {
          countrySeen[country] = nextNo;
          nextNo++;
        }
        const teamNo = countrySeen[country];

        const meetMatch = eventName.match(/#(\d+)/);
        const meetNum = meetMatch ? meetMatch[1] : "1";
        const year = new Date().getFullYear();
        const teamName = country === "USA"
          ? `${year} ${meetNum} ${abbrev}`
          : `${country} ${year} ${meetNum} ${abbrev}`;

        const fullName = r.name || "";
        const lastSpace = fullName.lastIndexOf(" ");
        const firstName = lastSpace > 0 ? fullName.substring(0, lastSpace) : fullName;
        const surname = lastSpace > 0 ? fullName.substring(lastSpace + 1) : "";

        const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
        rows.push(
          [q(country), q(teamNo), q(teamName), q(firstName), q(surname), q(""), q("")].join(",")
        );
      }
    }
  }

  const header = "Nation,TeamNo,TeamName,TeamMemberFirstName,TeamMemberSurname,IsVideographer,AssociationNo";
  return [header, ...rows].join("\n");
}

// ── HTML ─────────────────────────────────────────────────
function getCompetitorsHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>USCPA 2026 Competitors</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a1a; color: #ededed; }
    .container { max-width: 1000px; margin: 0 auto; padding: 30px 20px; }
    h1 { color: #00d4ff; font-size: 32px; text-align: center; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 2px; }
    .subtitle { color: #888; font-size: 14px; text-align: center; margin-bottom: 40px; }
    .event { background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 12px; margin-bottom: 24px; overflow: hidden; }
    .event-header { padding: 20px 24px; border-bottom: 1px solid #2a2a4a; }
    .event-name { font-size: 20px; font-weight: 700; color: #00d4ff; }
    .event-meta { color: #888; font-size: 13px; margin-top: 4px; }
    .event-meta span { margin-right: 16px; }
    .class-section { padding: 16px 24px; border-bottom: 1px solid #1a1a3a; }
    .class-section:last-child { border-bottom: none; }
    .class-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; padding: 3px 10px; border-radius: 4px; display: inline-block; }
    .class-sport { background: #28a74522; color: #28a745; }
    .class-intermediate { background: #ffc10722; color: #ffc107; }
    .class-advanced { background: #ff69b422; color: #ff69b4; }
    .class-pro { background: #00d4ff22; color: #00d4ff; }
    .comp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px; }
    .comp-card { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: #0d1525; border-radius: 6px; }
    .comp-flag { font-size: 11px; color: #888; background: #16213e; padding: 2px 8px; border-radius: 3px; font-weight: 600; }
    .comp-name { font-size: 14px; font-weight: 500; }
    .comp-wing { font-size: 11px; color: #666; }
    .comp-team { font-size: 11px; color: #00d4ff; }
    .empty { text-align: center; padding: 80px 20px; color: #555; }
    .count { color: #666; font-size: 12px; margin-left: 8px; font-weight: 400; }
    .loading { text-align: center; padding: 80px; color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <h1>USCPA Competitions 2026</h1>
    <p class="subtitle">United States Canopy Piloting Association &mdash; Registered Competitors</p>
    <div style="text-align:center;margin-bottom:30px">
      <a href="https://scoring.kd-evolution.com/results" target="_blank" style="color:#00d4ff;font-size:13px;text-decoration:none;border:1px solid #2a2a4a;padding:8px 20px;border-radius:8px;display:inline-block">View Live Scoring &amp; Results →</a>
    </div>
    <div id="content"><div class="loading">Loading competitors...</div></div>
  </div>
  <script>
    (async () => {
      try {
        const res = await fetch('/api/competitors');
        const events = await res.json();
        const content = document.getElementById('content');

        if (events.length === 0) {
          content.innerHTML = '<div class="empty">No events are live yet. Competitor lists are published on the day of each event.</div>';
          return;
        }

        const classOrder = ['pro', 'advanced', 'intermediate', 'sport', ''];
        const classLabels = { pro: 'Pro / Open', advanced: 'Advanced', intermediate: 'Intermediate', sport: 'Sport', '': 'Unclassified' };
        const classCSS = { pro: 'class-pro', advanced: 'class-advanced', intermediate: 'class-intermediate', sport: 'class-sport', '': 'class-sport' };

        let html = '';
        for (const evt of events) {
          const date = new Date(evt.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

          // Group by class
          const byClass = {};
          for (const c of evt.competitors) {
            const cls = c.compClass || '';
            if (!byClass[cls]) byClass[cls] = [];
            byClass[cls].push(c);
          }

          html += '<div class="event">';
          html += '<div class="event-header">';
          html += '<div class="event-name">' + evt.name.replace(' Registration 2026', '').replace(' 2026', '') + '<span class="count">' + evt.competitors.length + ' competitors</span></div>';
          html += '<div class="event-meta"><span>' + date + '</span><span>' + (evt.location || '') + '</span></div>';
          html += '</div>';

          for (const cls of classOrder) {
            const comps = byClass[cls];
            if (!comps || comps.length === 0) continue;

            // Sort by country then name
            comps.sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));

            html += '<div class="class-section">';
            html += '<div class="class-label ' + (classCSS[cls] || '') + '">' + (classLabels[cls] || cls) + ' (' + comps.length + ')</div>';
            html += '<div class="comp-grid">';
            for (const c of comps) {
              html += '<div class="comp-card">';
              html += '<span class="comp-flag">' + c.country + '</span>';
              html += '<div><div class="comp-name">' + c.name + '</div>';
              if (c.wingType) html += '<div class="comp-wing">' + c.wingType + (c.wingSize ? ' ' + c.wingSize : '') + '</div>';
              if (c.teamName) html += '<div class="comp-team">Team: ' + c.teamName + '</div>';
              html += '</div></div>';
            }
            html += '</div></div>';
          }

          html += '</div>';
        }

        content.innerHTML = html;
      } catch (e) {
        document.getElementById('content').innerHTML = '<div class="empty">Failed to load competitors</div>';
      }
    })();
  </script>
</body>
</html>`;
}

function getHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>USCPA WooCommerce Export</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a1a; color: #ededed; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    h1 { color: #00d4ff; font-size: 28px; margin-bottom: 5px; }
    .subtitle { color: #888; font-size: 14px; margin-bottom: 20px; }
    .sync-info { color: #555; font-size: 12px; margin-bottom: 15px; }
    .sync-info span { color: #888; }
    .controls { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; align-items: center; }
    button { padding: 10px 20px; border-radius: 8px; border: none; font-weight: 700; font-size: 13px; cursor: pointer; transition: opacity 0.2s; }
    button:hover { opacity: 0.85; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-sync { background: #00d4ff; color: #000; }
    .btn-csv { background: #ffc107; color: #000; }
    .btn-intime { background: #28a745; color: #fff; }
    .tabs { display: flex; gap: 2px; border-bottom: 1px solid #2a2a4a; margin-bottom: 20px; overflow-x: auto; }
    .tab { padding: 10px 18px; font-size: 13px; font-weight: 500; color: #888; cursor: pointer; border: none; background: none; border-bottom: 2px solid transparent; transition: all 0.2s; white-space: nowrap; }
    .tab:hover { color: #ccc; }
    .tab.active { color: #00d4ff; border-bottom-color: #00d4ff; }
    .tab .tab-count { background: #2a2a4a; color: #aaa; font-size: 10px; padding: 1px 6px; border-radius: 8px; margin-left: 6px; }
    .tab.active .tab-count { background: #00d4ff33; color: #00d4ff; }
    .stats { display: flex; gap: 15px; margin-bottom: 20px; }
    .stat { background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 10px; padding: 15px 20px; min-width: 120px; }
    .stat-label { color: #888; font-size: 11px; text-transform: uppercase; }
    .stat-value { font-size: 24px; font-weight: 700; margin-top: 4px; }
    .stat-value.cyan { color: #00d4ff; }
    .stat-value.gold { color: #ffc107; }
    .stat-value.green { color: #28a745; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 10px 12px; color: #888; font-weight: 500; border-bottom: 1px solid #2a2a4a; background: #16213e; position: sticky; top: 0; }
    td { padding: 8px 12px; border-bottom: 1px solid #1a1a2e; }
    tr:hover td { background: rgba(255,255,255,0.02); }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .badge-meet { background: #00d4ff22; color: #00d4ff; }
    .badge-league { background: #ffc10722; color: #ffc107; }
    .badge-team { background: #28a74522; color: #28a745; }
    .badge-freestyle { background: #ff69b422; color: #ff69b4; }
    .empty { text-align: center; padding: 60px; color: #555; }
    .table-wrap { background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 10px; overflow: auto; max-height: 70vh; }
    .error { background: #ff000015; border: 1px solid #ff000050; color: #ff6b6b; padding: 12px; border-radius: 8px; margin-bottom: 15px; font-size: 13px; }
    .toast { position: fixed; bottom: 20px; right: 20px; background: #1a1a2e; border: 1px solid #28a745; color: #28a745; padding: 12px 20px; border-radius: 8px; font-size: 13px; display: none; z-index: 100; }
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 50; display: none; align-items: center; justify-content: center; }
    .modal-overlay.open { display: flex; }
    .modal { background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 12px; padding: 24px; width: 90%; max-width: 600px; max-height: 90vh; overflow-y: auto; }
    .modal h2 { color: #00d4ff; font-size: 20px; margin-bottom: 16px; }
    .modal label { display: block; color: #aaa; font-size: 12px; margin-bottom: 4px; margin-top: 12px; }
    .modal input, .modal select { width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid #2a2a4a; background: #16213e; color: #ededed; font-size: 13px; }
    .modal input:focus, .modal select:focus { outline: none; border-color: #00d4ff; }
    .modal .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .modal .actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; }
    .btn-add { background: #ff69b4; color: #000; }
    .btn-cancel { background: #333; color: #aaa; }
    .btn-save { background: #28a745; color: #fff; }
    .badge-manual { background: #ff69b422; color: #ff69b4; }
    .editable { cursor: pointer; border-bottom: 1px dashed #333; padding-bottom: 1px; }
    .editable:hover { border-bottom-color: #00d4ff; color: #00d4ff; }
    .edit-input { padding: 4px 8px; border-radius: 4px; border: 1px solid #00d4ff; background: #16213e; color: #ededed; font-size: 13px; width: 100%; }
  </style>
</head>
<body>
  <div class="container">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <h1>USCPA WooCommerce Export</h1>
        <p class="subtitle">Pull 2026 registrations from swoopleague.com and export CSV files</p>
      </div>
      <a href="/logout" style="color:#888;font-size:12px;text-decoration:none;border:1px solid #333;padding:6px 14px;border-radius:6px">Sign Out</a>
    </div>
    <div class="sync-info" id="syncInfo"></div>

    <div id="error"></div>

    <div class="controls">
      <button class="btn-sync" id="syncBtn" onclick="syncData()">Sync from WooCommerce</button>
      <button class="btn-add" onclick="openManual()">+ Manual Entry</button>
      <button class="btn-csv" onclick="downloadCSV('all')">Download CSV</button>
      <button class="btn-intime" onclick="downloadCSV('intime')">Download InTime CSV</button>
    </div>

    <div class="tabs" id="tabs" style="display:none"></div>

    <div class="stats" id="stats" style="display:none">
      <div class="stat"><div class="stat-label">Registrations</div><div class="stat-value cyan" id="statTotal">0</div></div>
      <div class="stat"><div class="stat-label">Meet Entries</div><div class="stat-value gold" id="statMeets">0</div></div>
      <div class="stat"><div class="stat-label">League Members</div><div class="stat-value green" id="statLeague">0</div></div>
      <div class="stat"><div class="stat-label">Competitors</div><div class="stat-value" id="statPeople">0</div></div>
    </div>

    <div class="table-wrap">
      <div class="empty" id="emptyMsg">Loading...</div>
      <table id="dataTable" style="display:none">
        <thead>
          <tr>
            <th>Name</th><th>Email</th><th>Event</th><th>Class</th>
            <th>Wing</th><th>Team</th><th>Country</th><th>Price</th><th>Order</th>
          </tr>
        </thead>
        <tbody id="tableBody"></tbody>
      </table>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <div class="modal-overlay" id="manualModal">
    <div class="modal" style="max-width:700px">
      <h2>Manual Registration</h2>
      <p style="color:#888;font-size:12px;margin-bottom:16px">Register one or more competitors for multiple events with a single entry (e.g. military team paying cash for the whole season).</p>

      <!-- Events Selection -->
      <label style="margin-top:0">Select Events *</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;margin-bottom:16px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;background:#16213e;padding:6px 12px;border-radius:6px;border:1px solid #2a2a4a;font-size:12px">
          <input type="checkbox" id="mSelectAll" onchange="toggleAllEvents(this.checked)"> <strong style="color:#ffc107">All Meets + League</strong>
        </label>
        <label class="evt-cb" style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;background:#16213e;padding:6px 12px;border-radius:6px;border:1px solid #2a2a4a;font-size:12px">
          <input type="checkbox" value="Meet #1 Registration 2026" class="mEvt"> Meet #1
        </label>
        <label class="evt-cb" style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;background:#16213e;padding:6px 12px;border-radius:6px;border:1px solid #2a2a4a;font-size:12px">
          <input type="checkbox" value="Meet #2 Registration 2026" class="mEvt"> Meet #2
        </label>
        <label class="evt-cb" style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;background:#16213e;padding:6px 12px;border-radius:6px;border:1px solid #2a2a4a;font-size:12px">
          <input type="checkbox" value="Meet #3 Registration 2026" class="mEvt"> Meet #3
        </label>
        <label class="evt-cb" style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;background:#16213e;padding:6px 12px;border-radius:6px;border:1px solid #2a2a4a;font-size:12px">
          <input type="checkbox" value="Meet #4 Registration 2026" class="mEvt"> Meet #4
        </label>
        <label class="evt-cb" style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;background:#16213e;padding:6px 12px;border-radius:6px;border:1px solid #2a2a4a;font-size:12px">
          <input type="checkbox" value="Meet #5 Registration 2026" class="mEvt"> Meet #5
        </label>
        <label class="evt-cb" style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;background:#16213e;padding:6px 12px;border-radius:6px;border:1px solid #2a2a4a;font-size:12px">
          <input type="checkbox" value="Pilots of the Caribbean 2026" class="mEvt"> Freestyle
        </label>
        <label class="evt-cb" style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;background:#16213e;padding:6px 12px;border-radius:6px;border:1px solid #2a2a4a;font-size:12px">
          <input type="checkbox" value="League Registration 2026" class="mEvt"> League
        </label>
        <label class="evt-cb" style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;background:#16213e;padding:6px 12px;border-radius:6px;border:1px solid #2a2a4a;font-size:12px">
          <input type="checkbox" value="Team Registration 2026" class="mEvt" onchange="toggleTeamName()"> Team
        </label>
      </div>

      <!-- Payment Info -->
      <div class="row">
        <div>
          <label>Payment Method</label>
          <select id="mPayment">
            <option value="cash">Cash</option>
            <option value="check">Check</option>
            <option value="venmo">Venmo</option>
            <option value="zelle">Zelle</option>
            <option value="comp">Comp / Free</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label>Total Amount Paid</label>
          <input id="mPrice" placeholder="e.g. 2000.00">
        </div>
      </div>

      <!-- Competitors -->
      <div style="margin-top:20px;border-top:1px solid #2a2a4a;padding-top:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <label style="margin:0;font-size:14px;color:#00d4ff;font-weight:700">Competitors</label>
          <button class="btn-add" style="padding:6px 14px;font-size:12px" onclick="addManualComp()">+ Add Competitor</button>
        </div>
        <div id="manualComps"></div>
      </div>

      <div id="manualError" style="color:#ff6b6b;font-size:12px;margin-top:8px"></div>
      <div class="actions">
        <button class="btn-cancel" onclick="closeManual()">Cancel</button>
        <button class="btn-save" onclick="saveManual()">Save All Registrations</button>
      </div>
    </div>
  </div>

  <script>
    let allData = [];
    let activeTab = "";

    // Load cached data on page open
    loadCached();

    async function loadCached() {
      try {
        const res = await fetch("/api/data");
        if (!res.ok) throw new Error(await res.text());
        const result = await res.json();
        allData = result.registrations;
        if (allData.length > 0) {
          buildTabs();
          renderTable();
          updateStats();
          document.getElementById("stats").style.display = "flex";
          document.getElementById("tabs").style.display = "flex";
        } else {
          document.getElementById("emptyMsg").textContent = 'No data yet. Click "Sync from WooCommerce" to pull registrations.';
        }
        if (result.lastSync) {
          document.getElementById("syncInfo").innerHTML = 'Last sync: <span>' + new Date(result.lastSync.synced_at + 'Z').toLocaleString() + '</span> (' + result.lastSync.new_registrations + ' new)';
        }
      } catch (e) {
        document.getElementById("emptyMsg").textContent = "Failed to load cached data";
      }
    }

    async function syncData() {
      const btn = document.getElementById("syncBtn");
      btn.disabled = true;
      btn.textContent = "Syncing...";
      document.getElementById("error").innerHTML = "";

      try {
        const res = await fetch("/api/sync", { method: "POST" });
        if (!res.ok) throw new Error(await res.text());
        const result = await res.json();

        // Reload data from DB
        await loadCached();

        // Show toast
        const toast = document.getElementById("toast");
        toast.textContent = result.newCount > 0
          ? result.newCount + " new registration(s) added!"
          : "Already up to date. No new registrations.";
        toast.style.display = "block";
        setTimeout(() => toast.style.display = "none", 4000);
      } catch (e) {
        document.getElementById("error").innerHTML = '<div class="error">' + e.message + '</div>';
      } finally {
        btn.disabled = false;
        btn.textContent = "Sync from WooCommerce";
      }
    }

    function buildTabs() {
      const tabsEl = document.getElementById("tabs");
      const events = [...new Set(allData.map(r => r.event))];
      const order = { meet: 1, freestyle: 2, league: 3, team: 4 };
      const eventInfo = events.map(e => {
        const r = allData.find(d => d.event === e);
        return { name: e, type: r?.event_type || "meet", count: allData.filter(d => d.event === e).length };
      }).sort((a, b) => (order[a.type] || 5) - (order[b.type] || 5));

      const shortName = (name) => name.replace(' Registration 2026', '').replace(' 2026', '');

      let html = '<button class="tab active" data-event="" onclick="setTab(this)">All<span class="tab-count">' + allData.length + '</span></button>';
      eventInfo.forEach(e => {
        const escaped = e.name.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
        html += '<button class="tab" data-event="' + escaped + '" onclick="setTab(this)">' + shortName(e.name) + '<span class="tab-count">' + e.count + '</span></button>';
      });
      tabsEl.innerHTML = html;
    }

    function setTab(el) {
      activeTab = el.dataset.event;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      el.classList.add('active');
      renderTable();
      updateStats();
    }

    function getFiltered() {
      return activeTab ? allData.filter(r => r.event === activeTab) : allData;
    }

    function renderTable() {
      const filtered = getFiltered();
      const tbody = document.getElementById("tableBody");
      const table = document.getElementById("dataTable");
      const empty = document.getElementById("emptyMsg");

      if (filtered.length === 0) {
        table.style.display = "none";
        empty.textContent = allData.length ? "No registrations for this event" : "No data loaded";
        empty.style.display = "block";
        return;
      }

      empty.style.display = "none";
      table.style.display = "table";

      const badgeClass = (type) => {
        if (type === "meet") return "badge-meet";
        if (type === "league") return "badge-league";
        if (type === "team") return "badge-team";
        return "badge-freestyle";
      };

      tbody.innerHTML = filtered.map(r => \`<tr>
        <td><span class="editable" onclick="editField(this,\${r.id},'name')">\${r.name}</span></td>
        <td style="color:#888">\${r.email}</td>
        <td><span class="badge \${badgeClass(r.event_type)}">\${r.event.replace(' Registration 2026','').replace(' 2026','')}</span></td>
        <td>\${r.comp_class || ''}</td>
        <td>\${r.wing_type ? r.wing_type + ' ' + (r.wing_size || '') : ''}</td>
        <td><span class="editable" onclick="editField(this,\${r.id},'team_name')">\${r.team_name || '<span style=color:#555>—</span>'}</span></td>
        <td><span class="editable" onclick="editField(this,\${r.id},'country')">\${r.country || ''}</span></td>
        <td>$\${r.price_paid || '0'}</td>
        <td style="color:#888">#\${r.order_id}</td>
      </tr>\`).join("");
    }

    function updateStats() {
      const filtered = getFiltered();
      document.getElementById("statTotal").textContent = filtered.length;
      document.getElementById("statMeets").textContent = filtered.filter(r => r.event_type === "meet" || r.event_type === "freestyle").length;
      document.getElementById("statLeague").textContent = filtered.filter(r => r.event_type === "league").length;
      document.getElementById("statPeople").textContent = new Set(filtered.map(r => r.email)).size;
    }

    function editField(el, id, field) {
      const current = el.textContent === 'click to set' ? '' : el.textContent;
      const td = el.parentElement;
      td.innerHTML = '<input class="edit-input" value="' + current.replace(/"/g, '&quot;') + '" onblur="saveField(this,' + id + ',\\'' + field + '\\')" onkeydown="if(event.key===\\'Enter\\')this.blur();if(event.key===\\'Escape\\'){this.dataset.cancel=\\'1\\';this.blur();}">';
      td.querySelector('input').focus();
    }

    async function saveField(input, id, field) {
      if (input.dataset.cancel) {
        await loadCached();
        return;
      }
      const value = input.value.trim();
      try {
        const res = await fetch('/api/update', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ id, field, value })
        });
        if (!res.ok) throw new Error(await res.text());
        await loadCached();
      } catch(e) {
        alert('Failed to save: ' + e.message);
        await loadCached();
      }
    }

    function downloadCSV(type) {
      if (!allData.length) { alert("No data. Sync first."); return; }
      const params = new URLSearchParams({ type, event: activeTab });
      window.location.href = "/api/csv?" + params.toString();
    }

    let manualCompCount = 0;

    function openManual() {
      document.getElementById("manualModal").classList.add("open");
      document.getElementById("manualError").textContent = "";
      document.getElementById("manualComps").innerHTML = "";
      document.getElementById("mSelectAll").checked = false;
      document.querySelectorAll(".mEvt").forEach(cb => cb.checked = false);
      document.getElementById("mPrice").value = "";
      manualCompCount = 0;
      addManualComp(); // Start with one competitor
    }

    function closeManual() {
      document.getElementById("manualModal").classList.remove("open");
    }

    function toggleTeamName() {
      const teamChecked = document.querySelector('.mEvt[value="Team Registration 2026"]')?.checked;
      document.querySelectorAll('.mc-team-row').forEach(el => {
        el.style.display = teamChecked ? 'block' : 'none';
      });
    }

    function toggleAllEvents(checked) {
      const meets = ["Meet #1 Registration 2026","Meet #2 Registration 2026","Meet #3 Registration 2026","Meet #4 Registration 2026","Meet #5 Registration 2026","League Registration 2026"];
      document.querySelectorAll(".mEvt").forEach(cb => {
        if (meets.includes(cb.value)) cb.checked = checked;
      });
    }

    function addManualComp() {
      const idx = manualCompCount++;
      const div = document.createElement("div");
      div.style.cssText = "background:#0d1525;border:1px solid #2a2a4a;border-radius:8px;padding:12px;margin-bottom:10px;position:relative";
      const teamChecked = document.querySelector('.mEvt[value="Team Registration 2026"]')?.checked;
      div.innerHTML = \`
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="color:#aaa;font-size:11px;font-weight:600">COMPETITOR \${idx + 1}</span>
          \${idx > 0 ? '<button onclick="this.closest(\\'div\\').remove()" style="background:none;border:none;color:#ff6b6b;cursor:pointer;font-size:11px">Remove</button>' : ''}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <input class="mc-name" placeholder="Full name *" style="padding:7px 10px;border-radius:6px;border:1px solid #2a2a4a;background:#16213e;color:#ededed;font-size:13px">
          <input class="mc-email" type="email" placeholder="Email (optional)" style="padding:7px 10px;border-radius:6px;border:1px solid #2a2a4a;background:#16213e;color:#ededed;font-size:13px">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
          <select class="mc-class" style="padding:7px 10px;border-radius:6px;border:1px solid #2a2a4a;background:#16213e;color:#ededed;font-size:13px">
            <option value="">Comp Class...</option>
            <option value="sport">Sport</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
            <option value="pro">Pro</option>
          </select>
          <select class="mc-country" style="padding:7px 10px;border-radius:6px;border:1px solid #2a2a4a;background:#16213e;color:#ededed;font-size:13px">
            <option value="USA">United States</option>
            <option value="CAN">Canada</option>
            <option value="GBR">United Kingdom</option>
            <option value="AUS">Australia</option>
            <option value="GER">Germany</option>
            <option value="FRA">France</option>
            <option value="BRA">Brazil</option>
            <option value="ARG">Argentina</option>
            <option value="MEX">Mexico</option>
            <option value="ISR">Israel</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div class="mc-team-row" style="margin-top:8px;display:\${teamChecked ? 'block' : 'none'}">
          <input class="mc-team" placeholder="Team name" style="width:100%;padding:7px 10px;border-radius:6px;border:1px solid #2a2a4a;background:#16213e;color:#ededed;font-size:13px">
        </div>
      \`;
      document.getElementById("manualComps").appendChild(div);
    }

    async function saveManual() {
      const events = Array.from(document.querySelectorAll(".mEvt:checked")).map(cb => cb.value);
      if (events.length === 0) {
        document.getElementById("manualError").textContent = "Select at least one event.";
        return;
      }

      const compDivs = document.getElementById("manualComps").children;
      const competitors = [];
      for (const div of compDivs) {
        const name = div.querySelector(".mc-name").value.trim();
        const email = div.querySelector(".mc-email").value.trim();
        if (!name) {
          document.getElementById("manualError").textContent = "All competitors need a name.";
          return;
        }
        competitors.push({
          name,
          email,
          comp_class: div.querySelector(".mc-class").value,
          country: div.querySelector(".mc-country").value,
          team_name: div.querySelector(".mc-team")?.value.trim() || "",
        });
      }

      const body = {
        competitors,
        events,
        price_paid: document.getElementById("mPrice").value.trim() || "0",
        payment_method: document.getElementById("mPayment").value,
      };

      try {
        const res = await fetch("/api/manual", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(await res.text());
        const result = await res.json();
        closeManual();
        await loadCached();
        const toast = document.getElementById("toast");
        toast.textContent = result.count + " registration(s) added for " + competitors.length + " competitor(s)";
        toast.style.display = "block";
        setTimeout(() => toast.style.display = "none", 4000);
      } catch (e) {
        document.getElementById("manualError").textContent = e.message;
      }
    }
  </script>
</body>
</html>`;
}

// ── HTTP Server ──────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Login page
  if (url.pathname === "/login" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(getLoginHTML());
    return;
  }

  // Login POST
  if (url.pathname === "/login" && req.method === "POST") {
    const body = await new Promise((resolve) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => resolve(data));
    });
    const params = new URLSearchParams(body);
    const email = params.get("email")?.trim().toLowerCase();
    const password = params.get("password");

    const validUser = ADMINS.find(a => a.email.toLowerCase() === email && a.password === password);
    if (validUser) {
      const remember = params.get("remember") === "1";
      const token = createSession(remember);
      const maxAge = remember ? 2592000 : 86400;
      res.writeHead(302, {
        Location: "/",
        "Set-Cookie": `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`,
      });
      res.end();
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(getLoginHTML().replace("</form>", '<p class="err">Invalid email or password</p></form>'));
    }
    return;
  }

  // Logout
  if (url.pathname === "/logout") {
    const token = getCookie(req, "session");
    deleteSession(token);
    res.writeHead(302, {
      Location: "/login",
      "Set-Cookie": "session=; Path=/; HttpOnly; Max-Age=0",
    });
    res.end();
    return;
  }

  // Public competitors page (no login required)
  if (url.pathname === "/competitors" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(getCompetitorsHTML());
    return;
  }

  // Public API for competitors (only returns events on/after their date)
  if (url.pathname === "/api/competitors" && req.method === "GET") {
    const today = new Date().toISOString().split("T")[0];
    const allRegs = getAllFromDB();

    // Group by event, only include events where date <= today
    const events = {};
    for (const r of allRegs) {
      const info = EVENT_INFO[r.event];
      if (!info || !info.date) continue; // skip league/team (no date)
      if (info.date > today) continue; // not yet public

      if (!events[r.event]) {
        events[r.event] = {
          name: r.event,
          date: info.date,
          location: info.location,
          type: info.type,
          competitors: [],
        };
      }

      // Only add to competitor list if it's a meet/freestyle entry
      if (r.event_type === "meet" || r.event_type === "freestyle") {
        events[r.event].competitors.push({
          name: r.name,
          country: r.country || "USA",
          compClass: r.comp_class || "",
          wingType: r.wing_type || "",
          wingSize: r.wing_size || "",
          teamName: r.team_name || "",
        });
      }
    }

    // Sort events by date
    const sorted = Object.values(events).sort((a, b) => a.date.localeCompare(b.date));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(sorted));
    return;
  }

  // Auth check for all other routes
  const sessionToken = getCookie(req, "session");
  if (!isValidSession(sessionToken)) {
    if (url.pathname === "/" || url.pathname.startsWith("/api/")) {
      if (url.pathname.startsWith("/api/")) {
        res.writeHead(401, { "Content-Type": "text/plain" });
        res.end("Unauthorized");
      } else {
        res.writeHead(302, { Location: "/login" });
        res.end();
      }
      return;
    }
  }

  if (url.pathname === "/" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(getHTML());
    return;
  }

  // Return cached data from DB
  if (url.pathname === "/api/data" && req.method === "GET") {
    const registrations = getAllFromDB();
    const lastSync = getLastSync();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ registrations, lastSync }));
    return;
  }

  // Sync new data from WooCommerce into DB
  if (url.pathname === "/api/sync" && req.method === "POST") {
    try {
      const result = await syncFromWC();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(e.message);
    }
    return;
  }

  // Manual registration (multiple competitors × multiple events)
  if (url.pathname === "/api/manual" && req.method === "POST") {
    try {
      const body = await new Promise((resolve, reject) => {
        let data = "";
        req.on("data", (c) => (data += c));
        req.on("end", () => { try { resolve(JSON.parse(data)); } catch { reject(new Error("Invalid JSON")); } });
      });

      const { competitors, events, price_paid, payment_method } = body;
      if (!competitors?.length || !events?.length) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("At least one competitor and one event are required");
        return;
      }

      const eventTypes = {
        "Meet #1 Registration 2026": "meet", "Meet #2 Registration 2026": "meet",
        "Meet #3 Registration 2026": "meet", "Meet #4 Registration 2026": "meet",
        "Meet #5 Registration 2026": "meet", "Pilots of the Caribbean 2026": "freestyle",
        "League Registration 2026": "league", "Team Registration 2026": "team",
      };

      const maxManual = db.prepare("SELECT MIN(order_id) as m FROM registration WHERE source = 'manual'").get();
      let manualId = Math.min((maxManual?.m || 0) - 1, -1);
      let count = 0;

      for (const comp of competitors) {
        const hasLeague = events.includes("League Registration 2026");
        for (const event of events) {
          insertManual.run(
            manualId,
            comp.name,
            (comp.email || "").toLowerCase().trim(),
            comp.country || "USA",
            event,
            eventTypes[event] || "meet",
            hasLeague ? "Member" : "Non-Member",
            comp.comp_class || null,
            null, null, null, null,
            price_paid || "0",
            payment_method || "cash",
            comp.team_name || null
          );
          count++;
        }
        manualId--;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, count }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(e.message);
    }
    return;
  }

  // Update a field on a registration
  if (url.pathname === "/api/update" && req.method === "POST") {
    try {
      const body = await new Promise((resolve, reject) => {
        let data = "";
        req.on("data", (c) => (data += c));
        req.on("end", () => { try { resolve(JSON.parse(data)); } catch { reject(new Error("Invalid JSON")); } });
      });

      const allowed = ["name", "country", "team_name", "comp_class", "email"];
      if (!allowed.includes(body.field)) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Field not editable");
        return;
      }

      db.prepare(`UPDATE registration SET ${body.field} = ? WHERE id = ?`).run(body.value || null, body.id);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(e.message);
    }
    return;
  }

  // CSV export from DB (no WC fetch needed)
  if (url.pathname === "/api/csv" && req.method === "GET") {
    const data = getAllFromDB();
    const type = url.searchParams.get("type") || "all";
    const eventFilter = url.searchParams.get("event") || "";

    let csv, filename;
    if (type === "intime") {
      csv = generateInTimeCSV(data, eventFilter);
      const safeName = eventFilter
        ? eventFilter.replace(/[^a-zA-Z0-9]/g, "_")
        : "all_events";
      filename = `${safeName}_intime.csv`;
    } else {
      csv = generateAllCSV(data, eventFilter);
      const safeName = eventFilter
        ? eventFilter.replace(/[^a-zA-Z0-9]/g, "_")
        : "all_registrations";
      filename = `${safeName}.csv`;
    }

    res.writeHead(200, {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
    res.end(csv);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  const count = db.prepare("SELECT COUNT(*) as c FROM registration").get().c;
  console.log(`\nUSCPA WooCommerce Export Tool`);
  console.log(`Running at http://localhost:${PORT}`);
  console.log(`Database: ${DB_PATH} (${count} registrations cached)\n`);
});
