const express = require("express");
const { google } = require("googleapis");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// 🔐 AUTENTICACIÓN
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, '\n'),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

// 🔑 TU ID DE SHEET
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// 🔧 NORMALIZAR TEXTO
const normalizar = (txt) => txt?.toString().toLowerCase().trim();

// 🔒 CAMPOS QUE NO SE EDITAN
const BLOQUEADOS = [
  "id",
  "nombre",
  "fecha ult. actualizacion deuda",
  "fecha ult. pedido",
  "deuda total",
  "deuda p1",
  "deuda p2",
  "localidad",
  "provincia",
  "vendedor asignado"
];

// ===================================
// 📥 TRAER CLIENTES
// ===================================
app.get("/clientes", async (req, res) => {
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
      headers.forEach((header, i) => {
        obj[header] = row[i] || "";
      });
      return obj;
    });

    res.json(clientes);

  } catch (error) {
    console.log("❌ ERROR GET:", error);
    res.status(500).send("Error al leer Google Sheets");
  }
});

// ===================================
// ✏️ EDITAR CLIENTE POR ID
// ===================================
app.post("/editar-cliente", async (req, res) => {
  try {
    let { id, datos } = req.body;

    console.log("👉 BODY:", req.body);

    // 👉 tomar ID desde donde venga
    if (!id && datos) {
      id = datos.ID || datos.id;
    }

    console.log("👉 ID:", id);

    if (!id) {
      return res.status(400).send("ID no definido");
    }

    // 👉 traer datos
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "DATOS!A1:Z",
    });

    const rows = response.data.values || [];
    const headers = rows[0];
    const data = rows.slice(1);

    console.log("👉 HEADERS:", headers);

    // 👉 encontrar columna ID
    const idIndex = headers.findIndex(h => normalizar(h) === "id");

    if (idIndex === -1) {
      return res.status(400).send("No existe columna ID");
    }

    console.log("👉 ID index:", idIndex);

    // 👉 encontrar fila
    const filaIndex = data.findIndex(row =>
      normalizar(row[idIndex]) === normalizar(id)
    );

    console.log("👉 fila encontrada:", filaIndex);

    if (filaIndex === -1) {
      return res.status(404).send("Cliente no encontrado");
    }

    const filaReal = filaIndex + 2;

    // 👉 copiar fila actual
    let nuevaFila = [...data[filaIndex]];

    // 👉 actualizar SOLO campos permitidos
    headers.forEach((header, colIndex) => {
      const headerNorm = normalizar(header);

      if (!BLOQUEADOS.includes(headerNorm)) {
        if (datos[header] !== undefined) {
          nuevaFila[colIndex] = datos[header];
        }
      }
    });

    // 👉 convertir número a letra columna
    const getColumnLetter = (index) => {
      let letter = "";
      while (index >= 0) {
        letter = String.fromCharCode((index % 26) + 65) + letter;
        index = Math.floor(index / 26) - 1;
      }
      return letter;
    };

    const lastColumn = getColumnLetter(headers.length - 1);

    // 👉 guardar fila completa
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `DATOS!A${filaReal}:${lastColumn}${filaReal}`,
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [nuevaFila],
      },
    });

    console.log("✅ Guardado correcto");

    res.send("OK");

  } catch (error) {
    console.log("❌ ERROR EDITANDO:", error);
    res.status(500).send("Error al guardar");
  }
});

// ===================================
app.listen(PORT, () => {
  console.log("🚀 Servidor corriendo en puerto " + PORT);
});