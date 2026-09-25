// Vercel Serverless Function — /api/millpulse-installer
//
// Password-protected download of the MillPulse installer (MillPulse-Setup.bat).
// Linked from the password-protected page on factory-automation.ca (Wix), so
// the installer is locked twice: Wix hides the button, and this endpoint
// won't hand over the file without the password either (browser login box).
//
// Env var (Vercel → Settings → Environment Variables):
//   INSTALLER_PASSWORD  — the download password. Change it anytime; takes
//                         effect on the next deploy/redeploy.
// The username field in the login box is ignored — only the password counts.

const crypto = require('crypto');
const installer = require('./_installerContent');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function passwordFrom(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Basic\s+(.+)$/i);
  if (!m) return null;
  const decoded = Buffer.from(m[1], 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  return i === -1 ? decoded : decoded.slice(i + 1);
}

const page = (title, text) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title></head><body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:520px;margin:60px auto;padding:0 18px;color:#16202a"><h2>${title}</h2><p>${text}</p><p style="color:#5b6773;font-size:13px">Factory Automation · factory-automation.ca</p></body></html>`;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const expected = process.env.INSTALLER_PASSWORD;
  if (!expected) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(503).send(page('Download unavailable', 'The installer download is not set up yet (INSTALLER_PASSWORD is missing on the server).'));
  }
  const given = passwordFrom(req);
  if (given == null || !safeEqual(given, expected)) {
    if (given != null) await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    res.setHeader('WWW-Authenticate', 'Basic realm="MillPulse installer", charset="UTF-8"');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(401).send(page('Password required', 'This download is for Factory Automation technicians. Enter the installer password when your browser asks (any username).'));
  }
  const buf = Buffer.from(installer.base64, 'base64');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${installer.filename}"`);
  res.setHeader('Content-Length', String(buf.length));
  return res.status(200).send(buf);
};
