// POST /api/push-test — sends a test notification to every subscribed device
// (the "Send test" button next to 🔔 Phone alerts in Fleet).
const { sendPushAll } = require("./_push");
module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const serial = (req.body && req.body.serial) || null;
  const r = await sendPushAll({ serial, tag: "test", title: "🔔 Axis CRM alerts are on",
    body: serial ? `Test — tap to open ${serial} in Fleet.` : "Test — you'll get one of these for each new correction." });
  res.status(200).json(r);
};
