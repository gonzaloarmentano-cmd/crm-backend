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

// 🔍 DEBUG (AGREGÁ ESTO)
console.log("ENV VARIABLES:");
console.log("SPREADSHEET_ID:", process.env.SPREADSHEET_ID);
console.log("EMAIL:", process.env.GOOGLE_CLIENT_EMAIL);
console.log("KEY OK:", !!process.env.GOOGLE_PRIVATE_KEY);

const normalizar = (txt) => txt?.toString().toLowerCase().trim();

const BLOQUEADOS = [
  "id",
  "nombre",
  "fecha ult. actualizacion deuda",
  "fecha ult. pedido",
  "clima",
  "deuda actualizada al",
  "deuda total",
  "deuda p1",
  "deuda p2",
  "localidad",
  "provincia",
  "vendedor asignado"
];

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
    console.log("ERROR GET:", error);
    res.status(500).send("Error al leer Google Sheets");
  }
});

app.post("/editar-cliente", async (req, res) => {
  try {
    let { id, datos } = req.body;

    if (!id && datos) {
      id = datos.ID || datos.id;
    }

    if (!id) {
      return res.status(400).send("ID no definido");
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "DATOS!A1:Z",
    });

    const rows = response.data.values || [];
    const headers = rows[0];
    const data = rows.slice(1);

    const idIndex = headers.findIndex(h => normalizar(h) === "id");

    if (idIndex === -1) {
      return res.status(400).send("No existe columna ID");
    }

    const filaIndex = data.findIndex(row =>
      normalizar(row[idIndex]) === normalizar(id)
    );

    if (filaIndex === -1) {
      return res.status(404).send("Cliente no encontrado");
    }

    const filaReal = filaIndex + 2;

    let nuevaFila = [...data[filaIndex]];

    headers.forEach((header, colIndex) => {
      const headerNorm = normalizar(header);

      if (!BLOQUEADOS.includes(headerNorm)) {
  if (datos[header] !== undefined) {
    nuevaFila[colIndex] = datos[header];
  }
}

// 🔥 FORZAR UPDATE DE FECHA SI VIENE
if (headerNorm === "fecha info. agregada" && datos["FECHA INFO. AGREGADA"]) {
  nuevaFila[colIndex] = datos["FECHA INFO. AGREGADA"];
}
    });

    const getColumnLetter = (index) => {
      let letter = "";
      while (index >= 0) {
        letter = String.fromCharCode((index % 26) + 65) + letter;
        index = Math.floor(index / 26) - 1;
      }
      return letter;
    };

const updates = [];

headers.forEach((header, colIndex) => {
  const headerNorm = normalizar(header);

  // ❌ no tocar bloqueados
  if (BLOQUEADOS.includes(headerNorm)) return;

  // ❌ si no viene dato, no hacer nada
  if (datos[header] === undefined) return;

  // ✅ armar update individual
  const colLetter = getColumnLetter(colIndex);

  updates.push({
    range: `DATOS!${colLetter}${filaReal}`,
    values: [[datos[header]]]
  });
});

// 🔥 ejecutar todos los updates
if (updates.length > 0) {
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    resource: {
      data: updates,
      valueInputOption: "USER_ENTERED"
    }
  });
}

    res.send("OK");

  } catch (error) {
    console.log("ERROR EDITANDO:", error);
    res.status(500).send("Error al guardar");
  }
});

app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto " + PORT);
});

// cambio para forzar deploy