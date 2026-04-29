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
      if (datos[header] === undefined) return;

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
        values: [[datos[header]]]
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

app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto " + PORT);
});