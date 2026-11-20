const { google } = require("googleapis");
const { createHmac } = require("node:crypto");

function registerCommunications(app) {
  const verifier = new google.auth.OAuth2();
  const clientId = () => process.env.CRM_GOOGLE_CLIENT_ID || "";
  app.get("/comunicaciones/config", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ clientId: clientId() });
  });

  async function authorize(req, res, next) {
    res.set("Cache-Control", "no-store");
    const staff = (process.env.CRM_STAFF_EMAILS || "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
    if (!clientId() || !staff.length) return res.status(503).json({ error: "Falta configurar el acceso del equipo a comunicaciones." });
    const token = req.get("Authorization")?.match(/^Bearer (\S+)$/i)?.[1];
    try {
      const identity = (await verifier.verifyIdToken({ idToken: token || "", audience: clientId() })).getPayload();
      if (!identity?.email_verified || !staff.includes(identity.email?.toLowerCase())) {
        return res.status(403).json({ error: "Tu cuenta no tiene permiso para comunicaciones." });
      }
      req.staffEmail = identity.email;
      next();
    } catch {
      res.status(401).json({ error: "Volvé a autorizar tu cuenta de Google." });
    }
  }

  async function callScript(payload) {
    const url = process.env.CRM_MAIL_SCRIPT_URL;
    const key = process.env.CRM_MAIL_SCRIPT_KEY;
    if (!url || !key) throw new Error("Falta configurar el script de mails de BASE CRM.");
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "script.google.com" || !parsed.pathname.endsWith("/exec")) {
      throw new Error("La dirección configurada para el script de mails no es válida.");
    }
    const body = JSON.stringify(payload);
    const timestamp = String(Date.now());
    const signature = createHmac("sha256", key).update(timestamp + "." + body).digest("hex");
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, timestamp, signature }),
      signal: AbortSignal.timeout(90000),
    });
    if (!response.ok) throw new Error("El script de mails no respondió correctamente.");
    const result = await response.json();
    if (!result.ok) throw new Error(result.error || "No se pudo completar el envío.");
    return result;
  }

  app.get("/comunicaciones/estado", authorize, async (req, res) => {
    try {
      res.json(await callScript({ action: "status" }));
    } catch (error) {
      res.status(503).json({ error: error.message });
    }
  });

  app.post("/comunicaciones/deudas", authorize, async (req, res) => {
    const { clientId, batchId, cursor = 1 } = req.body || {};
    if (clientId !== undefined && (typeof clientId !== "string" || !clientId.trim() || clientId.length > 100)) {
      return res.status(400).json({ error: "El cliente no es válido." });
    }
    if (typeof batchId !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(batchId) ||
        !Number.isInteger(cursor) || cursor < 1) {
      return res.status(400).json({ error: "El envío no tiene una identificación válida." });
    }
    try {
      res.json(await callScript({ action: "send", clientId, batchId, cursor, staffEmail: req.staffEmail }));
    } catch (error) {
      res.status(503).json({ error: error.message + " Podés reintentar el mismo envío." });
    }
  });

  app.post("/comunicaciones/showroom", authorize, async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ error: "El cliente necesita un email válido." });
    }
    if (!process.env.SHOWROOM_CART_KEY) return res.status(503).json({ error: "Falta configurar el acceso al showroom." });
    try {
      const response = await fetch("https://buddies.com.ar/showroom/dev/wp-json/buddies/v1/crm/cart-status", {
        method: "POST", redirect: "error",
        headers: { "Content-Type": "application/json", "X-Buddies-CRM-Cart-Key": process.env.SHOWROOM_CART_KEY },
        body: JSON.stringify({ email }), signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (!["active_cart", "no_active_cart", "account_not_found"].includes(result.status)) throw new Error();
      res.json({ status: result.status, lastConnection: result.lastConnection || null });
    } catch {
      res.status(502).json({ error: "No se pudo comprobar el carrito. Reintentá en unos minutos." });
    }
  });
}
module.exports = { registerCommunications };
