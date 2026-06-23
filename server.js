const express = require("express");
const { google } = require("googleapis");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY
      ? process.env.GOOGLE_PRIVATE_KEY.split("\\n").join("\n")
      : "",
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const normalizar = (txt) => txt?.toString().toLowerCase().trim();

function colLetter(index) {
  let letter = "";
  while (index >= 0) {
    letter = String.fromCharCode((index % 26) + 65) + letter;
    index = Math.floor(index / 26) - 1;
  }
  return letter;
}

const BLOQUEADOS = [
  "id", "nombre", "fecha ult. actualizacion deuda", "fecha ult. pedido", 
  "clima", "deuda actualizada al", "deuda total", "deuda p1", "deuda p2", 
  "localidad", "provincia", "vendedor asignado"
];

// 🟢 RUTA PARA TRAER CLIENTES (MODIFICADA)
app.get("/clientes", async (req, res) => {
  // 👉 AGREGA ESTA LÍNEA para que el navegador no guarde los datos de ayer
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "DATOS!A1:Z",
    });
    const rows = response.data.values || [];
    const headers = rows[0];
    const data = rows.slice(1);
    const clientes = data.map((row) => {
      let obj = {};
      headers.forEach((header, i) => { obj[header] = row[i] || ""; });
      return obj;
    });
    res.json(clientes);
  } catch (error) {
    res.status(500).send("Error al leer clientes");
  }
});

// 🔵 RUTA PARA TRAER RECORDATORIOS
app.get("/recordatorios", async (req, res) => {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "recordatorios!A1:E",
    });
    const rows = response.data.values || [];
    if (rows.length === 0) return res.json([]);
    
    const headers = rows[0];
    const data = rows.slice(1);
    const recordatorios = data.map((row) => {
      let obj = {};
      headers.forEach((header, i) => { obj[header] = row[i] || ""; });
      return obj;
    });
    res.json(recordatorios);
  } catch (error) {
    console.log("ERROR RECS:", error);
    res.status(500).send("Error al leer recordatorios");
  }
});

// 🟠 RUTA PRINCIPAL (EDICIÓN + NUEVOS RECORDATORIOS)
app.post("/editar-cliente", async (req, res) => {
  try {
    let { id, datos } = req.body;

// --- LÓGICA PARA RESTAURAR AVISOS DE CLIENTES ---
    if (id === "RESTAURAR_AVISOS_CLIENTES") {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "DATOS!A1:Z",
      });
      const rows = response.data.values || [];
      const headers = rows[0];
      const colAvisosIdx = headers.findIndex(h => normalizar(h) === "avisos");
      
      if (colAvisosIdx !== -1) {
        const getColumnLetter = (index) => {
          let letter = "";
          while (index >= 0) {
            letter = String.fromCharCode((index % 26) + 65) + letter;
            index = Math.floor(index / 26) - 1;
          }
          return letter;
        };
        const letraColumna = getColumnLetter(colAvisosIdx);
        
        const updates = rows.slice(1).map((_, idx) => ({
          range: `DATOS!${letraColumna}${idx + 2}`,
          values: [["FALSE"]]
        }));

        if (updates.length > 0) {
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: { data: updates, valueInputOption: "USER_ENTERED" }
          });
        }
      }
      return res.send("Avisos Clientes Reseteados");
    }

    // --- LÓGICA PARA RESTAURAR RECLAMOS DE CLIENTES ---
    if (id === "RESTAURAR_RECLAMOS_CLIENTES") {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "DATOS!A1:Z",
      });
      const rows = response.data.values || [];
      const headers = rows[0];
      const colReclamosIdx = headers.findIndex(h => normalizar(h) === "reclamo");
      
      if (colReclamosIdx !== -1) {
        const getColumnLetter = (index) => {
          let letter = "";
          while (index >= 0) {
            letter = String.fromCharCode((index % 26) + 65) + letter;
            index = Math.floor(index / 26) - 1;
          }
          return letter;
        };
        const letraColumna = getColumnLetter(colReclamosIdx);
        
        const updates = rows.slice(1).map((_, idx) => ({
          range: `DATOS!${letraColumna}${idx + 2}`,
          values: [["FALSE"]]
        }));

        if (updates.length > 0) {
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: { data: updates, valueInputOption: "USER_ENTERED" }
          });
        }
      }
      return res.send("Reclamos Clientes Reseteados");
    }

    // --- LÓGICA PARA NUEVO RECORDATORIO ---
    if (id === "NUEVO_RECORDATORIO") {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: "recordatorios!A1",
        valueInputOption: "USER_ENTERED",
        resource: {
          values: [[datos.de, datos.para, datos.mensaje, datos.estado, datos.fecha]],
        },
      });
      return res.send("Recordatorio Creado");
    }

    // --- LÓGICA PARA COMPLETAR RECORDATORIO ---
    if (id === "ACTUALIZAR_RECORDATORIO") {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "recordatorios!A1:E",
      });
      const rows = response.data.values || [];
      // Buscamos la fila por fecha (que es nuestro ID único para mensajes)
      const filaIdx = rows.findIndex(r => r[4] === datos.fecha); 
      if (filaIdx !== -1) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `recordatorios!D${filaIdx + 1}`, // Columna D es el Estado
          valueInputOption: "USER_ENTERED",
          resource: { values: [[datos.estado]] },
        });
      }
      return res.send("Recordatorio Actualizado");
    }

    // --- LÓGICA ORIGINAL DE EDITAR CLIENTE ---
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "DATOS!A1:Z",
    });

    const rows = response.data.values || [];
    const headers = rows[0];
    const data = rows.slice(1);
    const idIndex = headers.findIndex(h => normalizar(h) === "id");
    const filaIndex = data.findIndex(row => normalizar(row[idIndex]) === normalizar(id || datos.id || datos.ID));

    if (filaIndex === -1) return res.status(404).send("No encontrado");

    const filaReal = filaIndex + 2;
    const updates = [];

headers.forEach((header, colIndex) => {
      const headerNorm = normalizar(header);
      if (BLOQUEADOS.includes(headerNorm)) return;
      
      // Buscar coincidencia en cabecera exacta, minúsculas o variaciones de capitalización
let valorDato = undefined;
      if (datos[header] !== undefined) valorDato = datos[header];
      else if (datos[headerNorm] !== undefined) valorDato = datos[headerNorm];
      else if (datos["Avisos"] !== undefined && headerNorm === "avisos") valorDato = datos["Avisos"];
      else if (datos["avisos"] !== undefined && headerNorm === "avisos") valorDato = datos["avisos"];
      else if (datos["RECLAMO"] !== undefined && headerNorm === "reclamo") valorDato = datos["RECLAMO"];
      else if (datos["reclamo"] !== undefined && headerNorm === "reclamo") valorDato = datos["reclamo"];

      if (valorDato === undefined) return;

      const getColumnLetter = (index) => {
        let letter = "";
        while (index >= 0) {
          letter = String.fromCharCode((index % 26) + 65) + letter;
          index = Math.floor(index / 26) - 1;
        }
        return letter;
      };

      updates.push({
        range: `DATOS!${getColumnLetter(colIndex)}${filaReal}`,
        values: [[valorDato]]
      });
    });

    if (updates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: { data: updates, valueInputOption: "USER_ENTERED" }
      });
    }

    res.send("OK");
  } catch (error) {
    console.log("ERROR:", error);
    res.status(500).send("Error procesando solicitud");
  }
});

// ─── HORARIOS ────────────────────────────────────────────────────────────────

const COLS_HORARIOS = ["id", "semana", "dia", "hora", "usuario", "actividad"];

app.get("/horarios", async (req, res) => {
  const { semana } = req.query;
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "HORARIOS!A1:F",
    });
    const rows = response.data.values || [];
    if (rows.length <= 1) return res.json({ horarios: [] });
    const horarios = rows.slice(1)
      .filter(row => !semana || row[1] === semana)
      .map(row => {
        const obj = {};
        COLS_HORARIOS.forEach((col, i) => { obj[col] = row[i] || ""; });
        return obj;
      });
    res.json({ horarios });
  } catch (err) {
    console.error("GET /horarios error:", err);
    res.status(500).send("Error leyendo horarios");
  }
});

app.post("/horarios", async (req, res) => {
  const { semana, dia, hora, usuario, actividad } = req.body;
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "HORARIOS!A1:F",
    });
    const rows = response.data.values || [];

    // Asegurar encabezados
    if (rows.length === 0 || !rows[0][0]) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: "HORARIOS!A1:F1",
        valueInputOption: "USER_ENTERED",
        resource: { values: [COLS_HORARIOS] },
      });
    }

    // Buscar fila existente
    const filaIdx = rows.findIndex((row, i) =>
      i > 0 && row[1] === semana && row[2] === dia && row[3] === hora && row[4] === usuario
    );

    if (filaIdx !== -1) {
      if (!actividad || actividad.trim() === "") {
        // Borrar contenido de la fila (dejar vacía)
        await sheets.spreadsheets.values.clear({
          spreadsheetId: SPREADSHEET_ID,
          range: `HORARIOS!A${filaIdx + 1}:F${filaIdx + 1}`,
        });
      } else {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `HORARIOS!F${filaIdx + 1}`,
          valueInputOption: "USER_ENTERED",
          resource: { values: [[actividad]] },
        });
      }
    } else if (actividad && actividad.trim() !== "") {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: "HORARIOS!A1",
        valueInputOption: "USER_ENTERED",
        resource: { values: [[id, semana, dia, hora, usuario, actividad]] },
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("POST /horarios error:", err);
    res.status(500).send("Error guardando horario");
  }
});

// ─── CHECKLIST / TAREAS ──────────────────────────────────────────────────────

const COLS_CHECKLIST = ["id", "usuario", "texto", "hecha", "creado_por", "fecha"];

async function getSheetId(title) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = (meta.data.sheets || []).find((s) => s.properties.title === title);
  return sheet ? sheet.properties.sheetId : null;
}

app.get("/checklist", async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "CHECKLIST!A1:F",
    });
    const rows = response.data.values || [];
    if (rows.length <= 1) return res.json({ tareas: [] });
    const tareas = rows
      .slice(1)
      .filter((row) => row[0] && row[2]) // tiene id y texto
      .map((row) => {
        const obj = {};
        COLS_CHECKLIST.forEach((col, i) => { obj[col] = row[i] || ""; });
        return obj;
      });
    res.json({ tareas });
  } catch (err) {
    console.error("GET /checklist error:", err);
    res.status(500).send("Error leyendo checklist");
  }
});

app.post("/checklist", async (req, res) => {
  const { action } = req.body;
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "CHECKLIST!A1:F",
    });
    const rows = response.data.values || [];

    // Asegurar encabezados
    if (rows.length === 0 || !rows[0][0]) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: "CHECKLIST!A1:F1",
        valueInputOption: "USER_ENTERED",
        resource: { values: [COLS_CHECKLIST] },
      });
    }

    if (action === "crear") {
      const { usuario, texto, creado_por } = req.body;
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      const fecha = new Date().toLocaleDateString("es-AR");
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: "CHECKLIST!A1",
        valueInputOption: "USER_ENTERED",
        resource: { values: [[id, usuario, texto, "FALSE", creado_por || usuario, fecha]] },
      });
      return res.json({ ok: true, id });
    }

    if (action === "toggle") {
      const { id, hecha } = req.body;
      const filaIdx = rows.findIndex((row, i) => i > 0 && row[0] === id);
      if (filaIdx !== -1) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `CHECKLIST!D${filaIdx + 1}`,
          valueInputOption: "USER_ENTERED",
          resource: { values: [[hecha ? "TRUE" : "FALSE"]] },
        });
      }
      return res.json({ ok: true });
    }

    if (action === "borrar" || action === "borrar_completadas") {
      const sheetId = await getSheetId("CHECKLIST");
      let filasABorrar = [];
      if (action === "borrar") {
        const { id } = req.body;
        const idx = rows.findIndex((row, i) => i > 0 && row[0] === id);
        if (idx !== -1) filasABorrar.push(idx);
      } else {
        const { usuario } = req.body;
        rows.forEach((row, i) => {
          if (i > 0 && row[0] && row[3] === "TRUE" && (!usuario || row[1] === usuario)) {
            filasABorrar.push(i);
          }
        });
      }
      // Borrar de abajo hacia arriba para no desfasar índices
      filasABorrar.sort((a, b) => b - a);
      const requests = filasABorrar.map((idx) => ({
        deleteDimension: {
          range: { sheetId, dimension: "ROWS", startIndex: idx, endIndex: idx + 1 },
        },
      }));
      if (requests.length > 0 && sheetId != null) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: { requests },
        });
      }
      return res.json({ ok: true, borradas: requests.length });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("POST /checklist error:", err);
    res.status(500).send("Error guardando checklist");
  }
});

// ─── CONTACTOS ───────────────────────────────────────────────────────────────
// Tab "Contactos": A id | B fecha | C nombre | D localidad | E provincia |
// F mail | G telefono | H marcas | I fecha contacto | J vendedor |
// K Z(oculto) | L Agregar info. | M Info. agregada: | N Avisos

app.get("/contactos", async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Contactos!A1:N",
    });
    const rows = response.data.values || [];
    if (rows.length <= 1) return res.json([]);
    const headers = rows[0];
    const idxVendedor = headers.indexOf("Vendedor Asignado");
    const idxOculto = headers.indexOf("Z");
    const idxTexto = headers.indexOf("Agregar info.");
    const idxFechaInfo = headers.indexOf("Info. agregada:");
    const idxAvisos = headers.indexOf("Avisos");

    const contactos = rows.slice(1).filter((r) => r[0]).map((row) => ({
      id: row[0], nombre: row[2] || "", localidad: row[3] || "", provincia: row[4] || "",
      mail: row[5] || "", telefono: row[6] || "", marcas: row[7] || "",
      fecha: row[8] || "",
      vendedor: idxVendedor !== -1 ? String(row[idxVendedor] || "").trim() : "",
      oculto: idxOculto !== -1 ? (row[idxOculto] === "TRUE" || row[idxOculto] === true) : false,
      info: idxTexto !== -1 ? (row[idxTexto] || "") : "",
      fechaInfo: idxFechaInfo !== -1 ? (row[idxFechaInfo] || "") : "",
      Avisos: idxAvisos !== -1 ? String(row[idxAvisos] || "FALSE").trim().toUpperCase() : "FALSE",
      tipo: "contacto",
    }));
    res.json(contactos);
  } catch (err) {
    console.error("GET /contactos error:", err);
    res.status(500).send("Error leyendo contactos");
  }
});

app.post("/contactos", async (req, res) => {
  const { action } = req.body;
  try {
    // CREAR
    if (action === "crear") {
      const { nombre, localidad, provincia, mail, telefono, marcas, fecha, vendedor, oculto } = req.body;
      const id = Date.now().toString(36) + "_contacto";
      const ocultoVal = (oculto === true || oculto === "true" || oculto === "TRUE") ? "TRUE" : "FALSE";
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: "Contactos!A1",
        valueInputOption: "USER_ENTERED",
        resource: {
          values: [[id, new Date().toLocaleDateString("es-AR"), nombre, localidad, provincia,
            mail, telefono, marcas, fecha, vendedor, ocultoVal, "", "", "FALSE"]],
        },
      });
      return res.json({ ok: true, id });
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Contactos!A1:N",
    });
    const rows = response.data.values || [];
    const headers = rows[0] || [];
    const idxOculto = headers.indexOf("Z");
    const idxTexto = headers.indexOf("Agregar info.");
    const idxFechaInfo = headers.indexOf("Info. agregada:");
    const idxAvisos = headers.indexOf("Avisos");

    // RESTAURAR AVISOS (todos los contactos a FALSE)
    if (action === "restaurar_avisos") {
      if (idxAvisos !== -1 && rows.length > 1) {
        const col = colLetter(idxAvisos);
        const updates = rows.slice(1).map((_, idx) => ({
          range: `Contactos!${col}${idx + 2}`,
          values: [["FALSE"]],
        }));
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: { data: updates, valueInputOption: "USER_ENTERED" },
        });
      }
      return res.json({ ok: true });
    }

    const filaIdx = rows.findIndex((row, i) => i > 0 && String(row[0]).trim() === String(req.body.id).trim());

    // ELIMINAR
    if (action === "eliminar") {
      const sheetId = await getSheetId("Contactos");
      if (filaIdx > 0 && sheetId != null) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: {
            requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: filaIdx, endIndex: filaIdx + 1 } } }],
          },
        });
      }
      return res.json({ ok: true });
    }

    if (filaIdx === -1) return res.json({ ok: false, error: "no_encontrado" });
    const fila = filaIdx + 1; // número de fila en A1

    // OCULTAR
    if (action === "ocultar") {
      const col = colLetter(idxOculto !== -1 ? idxOculto : 10);
      const ocultoVal = (req.body.oculto === true || req.body.oculto === "true" || req.body.oculto === "TRUE") ? "TRUE" : "FALSE";
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `Contactos!${col}${fila}`,
        valueInputOption: "USER_ENTERED",
        resource: { values: [[ocultoVal]] },
      });
      return res.json({ ok: true });
    }

    // AGREGAR INFO / AVISOS
    if (action === "agregar_info") {
      const updates = [];
      if (req.body.avisos !== undefined && idxAvisos !== -1)
        updates.push({ range: `Contactos!${colLetter(idxAvisos)}${fila}`, values: [[String(req.body.avisos).toUpperCase()]] });
      if (req.body.info !== undefined)
        updates.push({ range: `Contactos!${colLetter(idxTexto !== -1 ? idxTexto : 11)}${fila}`, values: [[req.body.info]] });
      if (req.body.fechaInfo)
        updates.push({ range: `Contactos!${colLetter(idxFechaInfo !== -1 ? idxFechaInfo : 12)}${fila}`, values: [[req.body.fechaInfo]] });
      if (updates.length)
        await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SPREADSHEET_ID, resource: { data: updates, valueInputOption: "USER_ENTERED" } });
      return res.json({ ok: true });
    }

    // EDITAR
    if (action === "editar") {
      let d = req.body.datos || {};
      if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { d = {}; } }
      const updates = [
        { range: `Contactos!C${fila}`, values: [[d.NOMBRE || d.nombre || ""]] },
        { range: `Contactos!D${fila}`, values: [[d.LOCALIDAD || d.localidad || ""]] },
        { range: `Contactos!E${fila}`, values: [[d.PROVINCIA || d.provincia || ""]] },
        { range: `Contactos!F${fila}`, values: [[d.mail || ""]] },
        { range: `Contactos!G${fila}`, values: [[d.telefono || ""]] },
        { range: `Contactos!H${fila}`, values: [[d.marcas || ""]] },
        { range: `Contactos!J${fila}`, values: [[d["VENDEDOR ASIGNADO"] || d.vendedor || ""]] },
      ];
      await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SPREADSHEET_ID, resource: { data: updates, valueInputOption: "USER_ENTERED" } });
      return res.json({ ok: true });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("POST /contactos error:", err);
    res.status(500).send("Error guardando contacto");
  }
});

app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto " + PORT);
});