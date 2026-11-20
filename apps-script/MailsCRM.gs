/*******************************************************
 * MAILS DE DEUDAS + TRACKING DE APERTURAS
 *
 * Versión portable: funciona desde cualquier cuenta que
 * ejecute el script, sin editar constantes a mano.
 *
 * PRIMER USO (una sola vez por copia del archivo):
 *   1. Implementar > Nueva implementación > Aplicación web
 *        - Ejecutar como: Yo
 *        - Quién tiene acceso: Cualquier persona
 *   2. Menú "Buddies" > "Configurar tracking"
 *      (detecta la URL de la webapp y crea la hoja "Aperturas")
 *   3. Menú "Buddies" > "Enviar mails de deudas"
 *******************************************************/


//////////////////////////////
// CONFIG GENERAL
//////////////////////////////

const NOMBRE_HOJA_TRACKING = "Aperturas";
const NOMBRE_HOJA_DATOS = "GRAL";

// Claves guardadas en las propiedades del script (por cuenta / por copia)
const PROP_URL_WEBAPP = "URL_WEBAPP";
const PROP_SS_ID = "SS_ID";
const PROP_ALIAS = "ALIAS_ENVIO";

const ENCABEZADOS_TRACKING = [
  "Email",
  "Asunto",
  "ID mail",
  "Abierto",
  "Fecha apertura",
  "Fecha envío",
  "Enviado por"
];


//////////////////////////////
// MENÚ
//////////////////////////////

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Buddies")
    .addItem("Enviar mails de deudas", "enviarMailsDeudas")
    .addSeparator()
    .addItem("Configurar tracking", "configurarTracking")
    .addItem("Ver configuración", "verConfiguracion")
    .addToUi();
}


//////////////////////////////
// HELPERS DE ENTORNO
//////////////////////////////

const props_ = () => PropertiesService.getScriptProperties();

/** UI si existe (no existe al correr desde la webapp o un trigger). */
function ui_() {
  try {
    return SpreadsheetApp.getUi();
  } catch (e) {
    return null;
  }
}

function alerta_(mensaje) {
  const ui = ui_();
  if (ui) {
    ui.alert(mensaje);
  } else {
    Logger.log(mensaje);
  }
}

/** Spreadsheet del script, sirva o no getActive() (ej. dentro de doGet). */
function getSpreadsheet_() {
  const activo = SpreadsheetApp.getActive();
  if (activo) {
    // Se guarda el ID para que la webapp pueda abrirlo después
    if (props_().getProperty(PROP_SS_ID) !== activo.getId()) {
      props_().setProperty(PROP_SS_ID, activo.getId());
    }
    return activo;
  }

  const id = props_().getProperty(PROP_SS_ID);
  if (!id) {
    throw new Error(
      'No se pudo determinar la planilla. Ejecutá "Configurar tracking" desde el menú Buddies.'
    );
  }
  return SpreadsheetApp.openById(id);
}

/** Hoja de tracking; la crea con encabezados si no existe. */
function getHojaTracking_(ss) {
  const libro = ss || getSpreadsheet_();
  let hoja = libro.getSheetByName(NOMBRE_HOJA_TRACKING);

  if (!hoja) {
    hoja = libro.insertSheet(NOMBRE_HOJA_TRACKING);
    hoja
      .getRange(1, 1, 1, ENCABEZADOS_TRACKING.length)
      .setValues([ENCABEZADOS_TRACKING])
      .setFontWeight("bold");
    hoja.setFrozenRows(1);
  }

  if (hoja.getLastRow() === 0) {
    hoja
      .getRange(1, 1, 1, ENCABEZADOS_TRACKING.length)
      .setValues([ENCABEZADOS_TRACKING])
      .setFontWeight("bold");
  }

  return hoja;
}

/**
 * URL de la webapp de esta copia del script.
 * 1) La guardada en propiedades  2) La de la implementación activa
 * Devuelve "" si el script todavía no fue implementado.
 */
function getUrlWebApp_() {
  const guardada = (props_().getProperty(PROP_URL_WEBAPP) || "").trim();
  if (guardada) return guardada;

  let detectada = "";
  try {
    detectada = ScriptApp.getService().getUrl() || "";
  } catch (e) {
    detectada = "";
  }

  // Solo sirve la URL /exec (la /dev exige estar logueado y rompe el pixel)
  if (detectada && detectada.indexOf("/exec") !== -1) {
    props_().setProperty(PROP_URL_WEBAPP, detectada);
    return detectada;
  }

  return "";
}

/** Mail de la cuenta que está ejecutando. */
function getMailActivo_() {
  const email =
    Session.getActiveUser().getEmail() ||
    Session.getEffectiveUser().getEmail() ||
    "";
  return email;
}

/** Alias disponibles de la cuenta activa (incluye su propia dirección). */
function getAliasDisponibles_() {
  const propio = getMailActivo_();
  let aliases = [];
  try {
    aliases = GmailApp.getAliases() || [];
  } catch (e) {
    aliases = [];
  }
  return [propio].concat(aliases).filter(function (v, i, arr) {
    return v && arr.indexOf(v) === i;
  });
}


//////////////////////////////
// CONFIGURACIÓN
//////////////////////////////

function configurarTracking() {
  const ui = ui_();
  const ss = getSpreadsheet_();

  getHojaTracking_(ss);

  let url = getUrlWebApp_();

  if (!url && ui) {
    const r = ui.prompt(
      "URL de la aplicación web",
      "No se detectó una implementación activa.\n\n" +
        "Andá a Implementar > Nueva implementación > Aplicación web\n" +
        "(Ejecutar como: Yo — Acceso: Cualquier persona)\n\n" +
        "y pegá acá la URL que termina en /exec:",
      ui.ButtonSet.OK_CANCEL
    );

    if (r.getSelectedButton() === ui.Button.OK) {
      const texto = r.getResponseText().trim();
      if (texto.indexOf("/exec") !== -1) {
        props_().setProperty(PROP_URL_WEBAPP, texto);
        url = texto;
      } else if (texto) {
        alerta_("⚠️ La URL debe terminar en /exec. No se guardó.");
      }
    }
  }

  alerta_(
    "Configuración guardada\n\n" +
      "Cuenta: " + getMailActivo_() + "\n" +
      "Planilla: " + ss.getName() + "\n" +
      "Hoja de tracking: " + NOMBRE_HOJA_TRACKING + "\n" +
      "Webapp: " + (url || "SIN CONFIGURAR (se enviará sin pixel de apertura)")
  );
}

function verConfiguracion() {
  alerta_(
    "Cuenta activa: " + getMailActivo_() + "\n" +
      "Alias guardado: " + (props_().getProperty(PROP_ALIAS) || "—") + "\n" +
      "Webapp: " + (getUrlWebApp_() || "sin configurar") + "\n" +
      "Cuota de mails restante hoy: " + MailApp.getRemainingDailyQuota()
  );
}

/** Borra la config de esta copia (útil al duplicar el archivo). */
function reiniciarConfiguracion() {
  props_().deleteProperty(PROP_URL_WEBAPP);
  props_().deleteProperty(PROP_SS_ID);
  props_().deleteProperty(PROP_ALIAS);
  alerta_("Configuración reiniciada.");
}


//////////////////////////////
// ENVÍO CON TRACKING
//////////////////////////////

/**
 * @param {string} destinatario
 * @param {string} asunto
 * @param {string} cuerpoHTML
 * @param {{alias:string, usarFrom:boolean, urlWebApp:string, hoja:Sheet}} ctx
 */
function enviarMailConTracking_(destinatario, asunto, cuerpoHTML, ctx) {
  const idUnico = Utilities.getUuid();

  let pixelHTML = "";
  if (ctx.urlWebApp) {
    const urlPixel = ctx.urlWebApp + "?id=" + encodeURIComponent(idUnico);
    pixelHTML =
      '<img src="' + urlPixel + '" width="1" height="1" alt="" style="display:none;">';
  }

  const opciones = {
    htmlBody: cuerpoHTML + pixelHTML,
    name: "Buddies Mayorista",
    replyTo: ctx.alias
  };

  // "from" solo es válido si el alias pertenece a la cuenta que ejecuta
  if (ctx.usarFrom) {
    opciones.from = ctx.alias;
  }

  GmailApp.sendEmail(destinatario, asunto, "", opciones);

  ctx.hoja.appendRow([
    destinatario,
    asunto,
    idUnico,
    "NO",
    "",
    new Date(),
    ctx.alias
  ]);

  return idUnico;
}


//////////////////////////////
// WEBAPP → REGISTRA APERTURA
//////////////////////////////

function doGet(e) {
  const pixel = () => {
    const pngBytes = [
      0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,
      0x00,0x00,0x00,0x0d,0x49,0x48,0x44,0x52,
      0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,
      0x08,0x06,0x00,0x00,0x00,0x1f,0x15,0xc4,
      0x89,0x00,0x00,0x00,0x0a,0x49,0x44,0x41,
      0x54,0x78,0xda,0x63,0x00,0x01,0x00,0x00,
      0x05,0x00,0x01,0x0d,0x0a,0x2d,0xb4,0x00,
      0x00,0x00,0x00,0x49,0x45,0x4e,0x44,0xae,
      0x42,0x60,0x82
    ];
    const blob = Utilities.newBlob(pngBytes, "image/png", "p.png");
    return ContentService.createBinaryOutput(blob).setMimeType(
      ContentService.MimeType.PNG
    );
  };

  try {
    if (!e || !e.parameter || !e.parameter.id) return pixel();

    const idMail = String(e.parameter.id);
    const hoja = getHojaTracking_();
    const data = hoja.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][2]) === idMail) {
        // Solo registra la PRIMERA apertura
        if (String(data[i][3]).toUpperCase() !== "SI") {
          hoja.getRange(i + 1, 4).setValue("SI");
          hoja.getRange(i + 1, 5).setValue(new Date());
        }
        break;
      }
    }
  } catch (err) {
    Logger.log("doGet: " + err);
  }

  return pixel();
}


//////////////////////////////
// ENVÍO DE MAILS DE DEUDAS
//////////////////////////////

function enviarMailsDeudas(opciones) {
  const crm = opciones && opciones.crm === true;
  const ui = crm ? null : ui_();
  const ss = getSpreadsheet_();
  const hoja = ss.getSheetByName(NOMBRE_HOJA_DATOS);

  if (!hoja) {
    alerta_('No se encontró la hoja "' + NOMBRE_HOJA_DATOS + '".');
    return;
  }

  const hojaTracking = getHojaTracking_(ss);
  const urlWebApp = getUrlWebApp_();

  if (!urlWebApp) {
    const msg =
      "⚠️ No hay una aplicación web configurada en esta cuenta.\n\n" +
      "Los mails se van a enviar SIN pixel de apertura.\n\n" +
      "Para activar el tracking: Implementar > Nueva implementación > " +
      "Aplicación web, y después ejecutá «Configurar tracking».";

    if (ui) {
      const seguir = ui.alert(msg + "\n\n¿Enviar igual?", ui.ButtonSet.YES_NO);
      if (seguir !== ui.Button.YES) return;
    } else {
      Logger.log(msg);
    }
  }

  // --- ALIAS DE ENVÍO ---
  const disponibles = getAliasDisponibles_();
  const guardado = props_().getProperty(PROP_ALIAS);
  const sugerido =
    (guardado && disponibles.indexOf(guardado) !== -1 && guardado) ||
    disponibles.filter(function (a) {
      return /buddies\.com\.ar$/i.test(a);
    })[0] ||
    disponibles[0] ||
    "";

  let alias = sugerido;

  if (ui) {
    const r = ui.prompt(
      "Alias de envío",
      "Cuenta actual: " + getMailActivo_() + "\n\n" +
        "Direcciones disponibles:\n" + disponibles.join("\n") + "\n\n" +
        "Dejá vacío para usar: " + sugerido,
      ui.ButtonSet.OK_CANCEL
    );

    if (r.getSelectedButton() !== ui.Button.OK) {
      alerta_("🚫 Envío cancelado por el usuario.");
      return;
    }

    alias = r.getResponseText().trim() || sugerido;
  }

  if (!alias) {
    alerta_("No se pudo determinar una dirección de envío.");
    return;
  }

  props_().setProperty(PROP_ALIAS, alias);

  const usarFrom = disponibles.indexOf(alias) !== -1;

  if (!usarFrom && ui) {
    const seguir = ui.alert(
      '"' + alias + '" no es una dirección ni un alias de esta cuenta (' +
        getMailActivo_() + ").\n\n" +
        "El mail saldrá desde la cuenta actual y ese alias se usará solo como " +
        "dirección de respuesta.\n\n¿Continuar?",
      ui.ButtonSet.YES_NO
    );
    if (seguir !== ui.Button.YES) return;
  }

  const ctx = {
    alias: alias,
    usarFrom: usarFrom,
    urlWebApp: urlWebApp,
    hoja: hojaTracking
  };

  // --- DATOS ---
  const datos = hoja.getDataRange().getValues();
  if (crm) {
    const ids = datos.slice(1).map(row => String(row[0] || "").trim());
    const nonempty = ids.filter(Boolean);
    if (new Set(nonempty).size !== nonempty.length) throw new Error("Hay IDs de clientes duplicados en GRAL. Revisalos antes de enviar.");
    if (opciones.clientId && !ids.includes(opciones.clientId)) throw new Error("No se encontró el ID del cliente en GRAL.");
  }
  const hoy = Utilities.formatDate(
    new Date(),
    ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone(),
    "dd/MM/yyyy"
  );
  const regexMail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const problemas = [];
  let enviados = 0;
  let siguiente = null;
  const enviadosCRM = [];
  let candidatos = 0;

  let cuota = MailApp.getRemainingDailyQuota();

  // --- FUNCIONES AUXILIARES ---
  function parseNumero(valor) {
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

  function formatearNumero(num) {
    if (isNaN(num) || num === null) return "";
    return Number(num).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // --- RECORRER FILAS ---
  for (let i = crm ? opciones.cursor : 1; i < datos.length; i++) {
    if (crm && opciones.clientId && String(datos[i][0]).trim() !== opciones.clientId) continue;
    const nombre = String(datos[i][1] || "");
    const parte1Raw = datos[i][2];
    const parte2Raw = datos[i][3];
    const totalRaw = datos[i][4];
    const emailRaw = datos[i][7];

    const total = parseNumero(totalRaw);
    if (isNaN(total) || total <= (crm && !opciones.clientId ? 10000 : crm ? 0 : 200)) continue;

    const email = emailRaw ? String(emailRaw).trim() : "";
    if (!email) {
      problemas.push(nombre + " (sin mail)");
      continue;
    }
    if (!regexMail.test(email)) {
      problemas.push(nombre + " (" + email + ") - Mail inválido");
      continue;
    }

    if (crm && candidatos >= 5) { siguiente = i; break; }
    candidatos++;
    if (cuota <= 0) {
      problemas.push(
        "⛔ Se agotó la cuota diaria de envío. Quedó pendiente desde la fila " +
          (i + 1) + " en adelante."
      );
      break;
    }

    const parte1Fmt = "$ " + formatearNumero(parseNumero(parte1Raw));
    const parte2Fmt = "$ " + formatearNumero(parseNumero(parte2Raw));
    const totalFmt = "$ " + formatearNumero(total);

    const asunto = "Saldo Buddies correspondiente al " + hoy;

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

    try {
      enviarMailConTracking_(email, asunto, cuerpoHTML, ctx);
      enviados++;
      if (crm) enviadosCRM.push({ id: String(datos[i][0]).trim(), sentAt: new Date().toISOString() });
      cuota--;
    } catch (error) {
      const detalle = (error && error.message) || "Error desconocido";
      problemas.push(nombre + " (" + email + ") - Error: " + detalle);
    }
  }

  SpreadsheetApp.flush();

  let resumen =
    "Envío finalizado\n\n" +
    "Enviados: " + enviados + "\n" +
    "Desde: " + alias + (usarFrom ? "" : " (solo como responder-a)") + "\n" +
    "Tracking: " + (urlWebApp ? "activo" : "desactivado");

  if (problemas.length > 0) {
    resumen += "\n\n⚠️ Problemas:\n\n" + problemas.join("\n");
  }

  if (crm) return { ok: true, sent: enviadosCRM, problems: problemas, nextCursor: siguiente };
  alerta_(resumen);
}

// Puente privado para el servidor del CRM. Se agrega al proyecto de BASE CRM.
// CRM_MAIL_SCRIPT_KEY se configura en Propiedades del script y en Render.
function doPost(e) {
  const json = value => ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
  try {
    const envelope = JSON.parse(e.postData.contents);
    const key = props_().getProperty("CRM_MAIL_SCRIPT_KEY");
    if (!key || typeof envelope.body !== "string" || !/^\d{13}$/.test(envelope.timestamp) ||
        Math.abs(Date.now() - Number(envelope.timestamp)) > 120000) throw new Error("Solicitud no autorizada.");
    const expected = Utilities.computeHmacSha256Signature(envelope.timestamp + "." + envelope.body, key)
      .map(value => ("0" + ((value + 256) % 256).toString(16)).slice(-2)).join("");
    if (typeof envelope.signature !== "string" || envelope.signature.length !== expected.length) throw new Error("Solicitud no autorizada.");
    let different = 0;
    for (let i = 0; i < expected.length; i++) different |= expected.charCodeAt(i) ^ envelope.signature.charCodeAt(i);
    if (different) throw new Error("Solicitud no autorizada.");
    const request = JSON.parse(envelope.body);
    if (request.action === "status") {
      const ss = getSpreadsheet_();
      const tracking = getHojaTracking_(ss).getDataRange().getValues();
      const dates = {};
      tracking.slice(1).forEach(row => {
        const email = String(row[0] || "").trim().toLowerCase();
        const date = row[5] instanceof Date ? row[5] : new Date(row[5]);
        if (email && !isNaN(date.getTime()) && (!dates[email] || date.toISOString() > dates[email])) dates[email] = date.toISOString();
      });
      const clients = {};
      ss.getSheetByName(NOMBRE_HOJA_DATOS).getDataRange().getValues().slice(1).forEach(row => {
        const id = String(row[0] || "").trim();
        if (id) clients[id] = { email: String(row[7] || "").trim(), sentAt: dates[String(row[7] || "").trim().toLowerCase()] || null };
      });
      return json({ ok: true, clients: clients });
    }
    if (request.action !== "send" || !/^[a-zA-Z0-9-]{16,80}$/.test(request.batchId) ||
        !Number.isInteger(request.cursor) || request.cursor < 1 ||
        (request.clientId !== undefined && (typeof request.clientId !== "string" || !request.clientId.trim()))) {
      throw new Error("Solicitud inválida.");
    }
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(1000)) throw new Error("Hay otro envío en curso. Reintentá.");
    try {
      const ss = getSpreadsheet_();
      let journal = ss.getSheetByName("Envios CRM");
      if (!journal) {
        journal = ss.insertSheet("Envios CRM");
        journal.appendRow(["Solicitud", "Estado", "Resultado", "Fecha", "Usuario"]);
      }
      let batches = ss.getSheetByName("Lotes CRM");
      if (!batches) {
        batches = ss.insertSheet("Lotes CRM");
        batches.appendRow(["Lote", "Orden de clientes", "Fecha"]);
      }
      const order = JSON.stringify(ss.getSheetByName(NOMBRE_HOJA_DATOS).getDataRange().getValues().slice(1).map(row => String(row[0] || "").trim()));
      const previous = batches.getDataRange().getValues().find(row => row[0] === request.batchId);
      if (previous && previous[1] !== order) throw new Error("Cambió el orden de clientes durante el envío. Revisá Envios CRM antes de iniciar otro lote.");
      if (!previous) batches.appendRow([request.batchId, order, new Date()]);
      const requestId = request.batchId + ":" + request.cursor + ":" + (request.clientId || "todos");
      const rows = journal.getDataRange().getValues();
      const index = rows.findIndex((row, i) => i > 0 && row[0] === requestId);
      if (index >= 0) {
        if (rows[index][1] === "COMPLETADO") return json(JSON.parse(rows[index][2]));
        throw new Error("Este envío requiere revisión en Envios CRM antes de repetirse.");
      }
      journal.appendRow([requestId, "EN CURSO", "", new Date(), request.staffEmail || ""]);
      const rowNumber = journal.getLastRow();
      SpreadsheetApp.flush();
      const result = enviarMailsDeudas({ crm: true, clientId: request.clientId, cursor: request.cursor });
      if (!result) throw new Error("No se pudo preparar el envío. Revisá la configuración de BASE CRM.");
      journal.getRange(rowNumber, 2, 1, 2).setValues([["COMPLETADO", JSON.stringify(result)]]);
      SpreadsheetApp.flush();
      return json(result);
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return json({ ok: false, error: error.message || "No se pudo procesar la solicitud." });
  }
}
