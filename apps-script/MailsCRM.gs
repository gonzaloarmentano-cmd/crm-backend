function doPost(e) {
  return crmCommunicationsDoPost_(e);
}

function crmDebtAmount_(valor) {
    if (valor === null || valor === undefined || valor === "") return NaN;
    if (typeof valor === "number") return valor;
    const s = String(valor).trim();
    const soloDigitos = s.replace(/\s/g, "").replace(/^\$/, "");
    if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(soloDigitos)) {
      return parseFloat(soloDigitos.replace(/\./g, "").replace(",", "."));
    }
    if (/^\d+(,\d+)?$/.test(soloDigitos)) {
      return parseFloat(soloDigitos.replace(",", "."));
    }
    const n = parseFloat(soloDigitos.replace(/,/g, ""));
    return isNaN(n) ? NaN : n;
  }

function crmDebtRows_(ss) {
  const rows = ss.getSheetByName("GRAL").getDataRange().getValues().slice(1);
  const clients = rows.filter(row => String(row[0] ?? "").trim()).map(row => ({
    id: String(row[0]).trim(), nombre: String(row[1] || ""),
    email: String(row[7] || "").trim(), total: crmDebtAmount_(row[4]),
    parte1: crmDebtAmount_(row[2]), parte2: crmDebtAmount_(row[3]),
  }));
  if (new Set(clients.map(c => c.id)).size !== clients.length) {
    throw new Error("Hay IDs de clientes duplicados en GRAL.");
  }
  return clients;
}

function crmDebtSelection_(clients, clientId) {
  const selected = clientId === undefined ? clients : clients.filter(c => c.id === clientId);
  if (clientId !== undefined && !selected.length) throw new Error("No se encontró el cliente en BASE CRM.");
  const eligible = [];
  const skipped = [];
  for (const client of selected) {
    const validEmail = client.email.length <= 254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(client.email);
    const minimum = clientId === undefined ? 10000 : 0;
    const reason = !Number.isFinite(client.total) || client.total <= minimum
      ? (clientId === undefined ? "La deuda no supera $10.000." : "El cliente no tiene deuda pendiente.")
      : !validEmail ? "El cliente no tiene un email válido." : "";
    if (reason) skipped.push({ id: client.id, reason });
    else eligible.push(client);
  }
  return { eligible, skipped };
}

function crmDebtFingerprint_(eligible, skipped) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify({ eligible, skipped }))
    .map(byte => ("0" + ((byte + 256) % 256).toString(16)).slice(-2)).join("");
}

function crmDebtSend_(client) {
  const { nombre, email, total, parte1, parte2 } = client;
  const fmt = n => Number.isFinite(n) ? n.toLocaleString("es-AR", {minimumFractionDigits: 2, maximumFractionDigits: 2}) : "";
  const parte1Fmt = "$ " + fmt(parte1);
  const parte2Fmt = "$ " + fmt(parte2);
  const totalFmt = "$ " + fmt(total);
  const today = Utilities.formatDate(new Date(), "America/Argentina/Buenos_Aires", "dd/MM/yyyy");
  const aliases = [Session.getEffectiveUser().getEmail(), ...GmailApp.getAliases()].filter(Boolean);
  const configured = PropertiesService.getScriptProperties().getProperty("ALIAS_ENVIO");
  const alias = aliases.includes(configured) ? configured : aliases.find(value => /@buddies\.com\.ar$/i.test(value)) || aliases[0];
  if (!alias) throw new Error("No hay una cuenta remitente disponible.");
    const cuerpoHTML = `
<p>Hola ${nombre.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")},</p>

<p>Te adjuntamos el detalle de tu saldo pendiente de pago a la fecha. Si realizaste un pago recientemente, por favor desestimá este mensaje.</p>

<p>Si el saldo informado no coincide con tus registros, respondé a este correo y a la brevedad nos pondremos en contacto para revisarlo.</p>

<ul>
  <li><b>Parte 1:</b> ${parte1Fmt}</li>
  <li><b>Parte 2:</b> ${parte2Fmt}</li>
  <li><b>Deuda total pendiente:</b> ${totalFmt}</li>
</ul>

<p><b>Las cuentas al día de la fecha para enviar pagos de Parte 1 son las siguientes:</b></p>

<table style="border-collapse: collapse; width: 100%; max-width: 600px; text-align: center; font-family: Arial, sans-serif;">
  <tr>
    <td style="padding: 15px; border: 1px solid #ddd;">
      <b>BANCO SANTANDER RIO</b><br><br>
      DALMATEX SA<br>
      CBU 0720026720000002723668<br>
      CUENTA CC en Pesos 026-027236/6<br>
      CUIT 30-70775245-5<br>
      Alias: PELOTA.VIDRIO.FIRMA
    </td>
  </tr>

  <tr>
    <td style="padding: 15px; border: 1px solid #ddd;">
      <b>BANCO GALICIA DALMATEX</b><br><br>
      Número de cuenta: 0011254-7 028-6<br>
      CUIT: 30-70775245-5<br>
      Razón Social: DALMATEX SA<br>
      CBU: 0070028320000011254762
    </td>
  </tr>

  <tr>
    <td style="padding: 15px; border: 1px solid #ddd;">
      <b>BANCO CREDICOOP</b><br><br>
      Número de cuenta: CC$ 191-050-001467/1<br>
      Titular: DALMATEX SA<br>
      CUIT: 30-70775245-5<br>
      CBU: 19100506-55005000146714<br>
      Alias: CASCO.PAN.CAJA
    </td>
  </tr>

  <tr>
    <td style="padding: 15px; border: 1px solid #ddd;">
      <b>BANCO FRANCES</b><br><br>
      DALMATEX SA<br>
      CTA CTE EN PESOS 328-312845/6<br>
      CBU 0170328120000031284563<br>
      CUIT 30-70775245-5
    </td>
  </tr>
</table>

<p>Saludos cordiales,<br>
<b>Equipo Buddies Mayorista</b></p>
    `;

  const options = { htmlBody: cuerpoHTML, name: "Buddies Mayorista", replyTo: alias };
  if (GmailApp.getAliases().includes(alias)) options.from = alias;
  GmailApp.sendEmail(email, "Saldo Buddies correspondiente al " + today, "", options);
}

function crmCommunicationsDoPost_(e) {
  const json = value => ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
  try {
    const envelope = JSON.parse(e.postData.contents);
    const props = PropertiesService.getScriptProperties();
    const key = props.getProperty("CRM_MAIL_SCRIPT_KEY");
    if (!key || typeof envelope.body !== "string" || !/^\d{13}$/.test(envelope.timestamp) ||
        Math.abs(Date.now() - Number(envelope.timestamp)) > 120000) throw new Error("Solicitud no autorizada.");
    const expected = Utilities.computeHmacSha256Signature(envelope.timestamp + "." + envelope.body, key)
      .map(byte => ("0" + ((byte + 256) % 256).toString(16)).slice(-2)).join("");
    if (typeof envelope.signature !== "string" || envelope.signature.length !== expected.length) throw new Error("Solicitud no autorizada.");
    let different = 0;
    for (let i = 0; i < expected.length; i++) different |= expected.charCodeAt(i) ^ envelope.signature.charCodeAt(i);
    if (different) throw new Error("Solicitud no autorizada.");

    const request = JSON.parse(envelope.body);
    const ss = SpreadsheetApp.openById("14rq0UjNf00O7-QHnNCjvNH8UvuAKk6irtONsMZnlUNI");
    const clients = crmDebtRows_(ss);
    const journalName = "Registro mails de deuda CRM";
    const journal = ss.getSheetByName(journalName);
    const history = journal ? journal.getDataRange().getValues().slice(1) : [];
    if (request.action === "status") {
      const dates = new Map();
      for (const row of history) {
        if (row[2] !== "ENVIADO" || !(row[5] instanceof Date)) continue;
        const date = row[5].toISOString();
        const id = String(row[1]);
        if (!dates.has(id) || date > dates.get(id)) dates.set(id, date);
      }
      return json({ ok: true, clients: Object.fromEntries(clients.map(c => [c.id, { email: c.email, sentAt: dates.get(c.id) || null }])) });
    }

    if (!["preview", "send"].includes(request.action) ||
        (request.clientId !== undefined && (typeof request.clientId !== "string" || !request.clientId.trim()))) {
      throw new Error("Solicitud inválida.");
    }
    const selection = crmDebtSelection_(clients, request.clientId);
    if (request.action === "preview") {
      const { eligible, skipped } = selection;
      const fingerprint = crmDebtFingerprint_(eligible, skipped);
      const client = request.clientId === undefined ? undefined : eligible[0];
      return json({ ok: true, count: eligible.length, omitted: skipped.length, fingerprint,
        client: client && { email: client.email, total: client.total }, reason: request.clientId && skipped[0]?.reason });
    }

    if (!/^[a-zA-Z0-9-]{16,80}$/.test(request.batchId) || !/^[a-f0-9]{64}$/.test(request.fingerprint) ||
        !Number.isInteger(request.cursor) || request.cursor < 1) throw new Error("Solicitud inválida.");
    const testRecipient = (props.getProperty("CRM_MAIL_TEST_RECIPIENT") || "").trim().toLowerCase();

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(1000)) throw new Error("Hay otro envío en curso. Reintentá la misma solicitud.");
    try {
      const batches = ss.getSheetByName("Lotes de deuda CRM") || ss.insertSheet("Lotes de deuda CRM");
      if (!batches.getLastRow()) batches.appendRow(["Solicitud", "Resultado"]);
      const pageKey = request.batchId + ":" + request.cursor;
      const batchRows = batches.getDataRange().getValues();
      const completed = batchRows.find(row => row[0] === pageKey);
      if (completed) return json(JSON.parse(completed[1]));
      const { eligible, skipped } = crmDebtSelection_(crmDebtRows_(ss), request.clientId);
      if (testRecipient && (!request.clientId || eligible.some(c => c.email.toLowerCase() !== testRecipient))) {
        throw new Error("En modo de prueba solo se permite el envío individual al destinatario autorizado.");
      }
      if (crmDebtFingerprint_(eligible, skipped) !== request.fingerprint) throw new Error("Cambiaron los datos desde la confirmación. Revisá y volvé a confirmar.");
      const log = ss.getSheetByName(journalName) || ss.insertSheet(journalName);
      if (!log.getLastRow()) log.appendRow(["Solicitud", "Cliente", "Estado", "Destinatario", "Importe", "Fecha envío", "Motivo", "Operador"]);
      const prior = new Map(log.getDataRange().getValues().slice(1).map(row => [row[0], row]));
      const offset = request.cursor - 1;
      const page = eligible.slice(offset, offset + 5);
      const sent = [];
      const failures = [];
      for (const client of page) {
        const id = client.id;
        const sendKey = request.batchId + ":" + id;
        const saved = prior.get(sendKey);
        if (saved) {
          if (saved[2] === "ENVIADO") sent.push({ id, sentAt: new Date(saved[5]).toISOString() });
          else failures.push({ id, reason: saved[6] || "Entrega sin confirmar. Revisá el registro antes de reenviar." });
          continue;
        }
        log.appendRow([sendKey, id, "EN CURSO", client.email, client.total, "", "", request.staffEmail]);
        const row = log.getLastRow();
        SpreadsheetApp.flush();
        try {
          crmDebtSend_(client);
        } catch (error) {
          const reason = String(error.message || error);
          log.getRange(row, 3).setValue("FALLÓ");
          log.getRange(row, 7).setValue(reason);
          failures.push({ id, reason });
          continue;
        }
        const sentAt = new Date();
        log.getRange(row, 3, 1, 4).setValues([["ENVIADO", client.email, client.total, sentAt]]);
        SpreadsheetApp.flush();
        sent.push({ id, sentAt: sentAt.toISOString() });
      }
      const result = { ok: true, sent, failures, omitted: request.cursor === 1 ? skipped.length : 0,
        nextCursor: offset + page.length < eligible.length ? offset + page.length + 1 : null };
      batches.appendRow([pageKey, JSON.stringify(result)]);
      SpreadsheetApp.flush();
      return json(result);
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return json({ ok: false, error: error.message || "No se pudo procesar la solicitud." });
  }
}
