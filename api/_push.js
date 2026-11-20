// Phone push notifications for Devon (2026-11-20).
// Devices subscribe from Axis CRM ("🔔 Phone alerts" on Fleet); rows live in
// push_subscriptions. Tapping a notification opens /?fleet=<SERIAL>, which
// lands on that machine's report in Fleet. Best-effort: never throws.
const webpush = require("web-push");

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const APP_URL = "https://axiscrm.vercel.app";

let ready = null;
function setup() {
  if (ready !== null) return ready;
  const pub = process.env.PUSH_VAPID_PUBLIC, priv = process.env.PUSH_VAPID_PRIVATE;
  if (!pub || !priv) return (ready = false);
  webpush.setVapidDetails("mailto:factoryautomation@outlook.com", pub, priv);
  return (ready = true);
}

async function customerNameFor(serial) {
  try {
    const m = await fetch(`${SUPABASE_URL}/rest/v1/machines?serial=eq.${encodeURIComponent(serial)}&select=nickname,customers(company)`, { headers: H }).then(r => r.json());
    const row = Array.isArray(m) ? m[0] : null;
    return (row && row.customers && row.customers.company) || (row && row.nickname) || "";
  } catch { return ""; }
}

// payload: { title, body, serial?, url?, tag? }
async function sendPushAll(payload) {
  if (!setup()) return { skipped: "push keys not configured" };
  let subs = [];
  try { subs = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?select=endpoint,p256dh,auth`, { headers: H }).then(r => r.json()); }
  catch (e) { return { error: "could not load subscriptions" }; }
  if (!Array.isArray(subs) || !subs.length) return { sent: 0 };
  const url = payload.url || (payload.serial ? `${APP_URL}/?fleet=${encodeURIComponent(payload.serial)}` : APP_URL);
  const data = JSON.stringify({ title: payload.title, body: payload.body, url, tag: payload.tag || payload.serial || "axiscrm" });
  let sent = 0;
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data, { TTL: 60 * 60 * 24 });
      sent++;
      fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: "PATCH", headers: H, body: JSON.stringify({ last_ok_at: new Date().toISOString() }) }).catch(() => {});
    } catch (e) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) { // phone unsubscribed / app removed
        await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: "DELETE", headers: H }).catch(() => {});
      } else console.error("push failed:", e && (e.statusCode || e.message));
    }
  }));
  return { sent };
}

module.exports = { sendPushAll, customerNameFor };
