/**
 * BACKEND API - CASO PICHÓN (Google Apps Script)
 * 
 * Este script actúa como endpoint API para leer datos de Google Sheets
 * y servirlos en formato JSON con soporte para peticiones web (CORS).
 */

// Constantes por defecto de la base de datos (Caso Pichón)
const DEFAULT_SPREADSHEET_ID = "1XeUuWM83dJZr161vsxCtwmO5uG0Yad5ipZ0PbTozE54";
const DEFAULT_SHEET_NAME = "STOCK";

/**
 * Función principal que atiende peticiones HTTP GET.
 * Parámetros admitidos en URL:
 *   - sheet: (Opcional, por defecto 'STOCK') Nombre de la hoja/pestaña a consultar.
 *   - id: (Opcional) ID de la planilla si se desea sobreescribir la por defecto.
 * 
 * Ejemplo de llamada:
 *   https://script.google.com/macros/s/.../exec?sheet=STOCK
 */
function doGet(e) {
  try {
    // Manejar ejecuciones de prueba directas desde el editor de Google Apps Script
    const params = (e && e.parameter) ? e.parameter : {};
    const spreadsheetId = params.id || DEFAULT_SPREADSHEET_ID;

    if (!spreadsheetId) {
      return jsonResponse({
        status: "error",
        message: "Spreadsheet ID no configurado."
      });
    }

    const ss = SpreadsheetApp.openById(spreadsheetId);
    const targetSheetName = params.sheet || DEFAULT_SHEET_NAME;
    const sheet = ss.getSheetByName(targetSheetName);

    if (!sheet) {
      const availableSheets = ss.getSheets().map(s => s.getName());
      return jsonResponse({
        status: "error",
        message: `La pestaña '${targetSheetName}' no existe.`,
        availableSheets: availableSheets
      });
    }

    const values = sheet.getDataRange().getValues();

    if (!values || values.length === 0) {
      return jsonResponse({
        status: "success",
        sheet: sheet.getName(),
        totalRows: 0,
        data: []
      });
    }

    // Encabezados en la primera fila
    const headers = values[0];
    const data = [];

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      // Ignorar filas totalmente vacías
      const hasContent = row.some(cell => cell !== "" && cell !== null && cell !== undefined);
      if (!hasContent) continue;

      const rowObj = {};
      headers.forEach((header, colIndex) => {
        const key = header ? String(header).trim() : `col_${colIndex + 1}`;
        let cellVal = row[colIndex];
        
        // Manejo de fechas para serialización JSON limpia
        if (cellVal instanceof Date) {
          cellVal = cellVal.toISOString();
        }

        rowObj[key] = (cellVal !== undefined && cellVal !== null) ? cellVal : "";
      });

      data.push(rowObj);
    }

    return jsonResponse({
      status: "success",
      sheet: sheet.getName(),
      totalRows: data.length,
      data: data
    });

  } catch (error) {
    return jsonResponse({
      status: "error",
      message: error.toString()
    });
  }
}

/**
 * Función que atiende peticiones HTTP POST para registro de auditoría en la pestaña LOGS.
 */
function doPost(e) {
  try {
    const spreadsheetId = DEFAULT_SPREADSHEET_ID;
    const ss = SpreadsheetApp.openById(spreadsheetId);
    let logSheet = ss.getSheetByName("LOGS");

    // Crear la pestaña LOGS si aún no existe
    if (!logSheet) {
      logSheet = ss.insertSheet("LOGS");
      logSheet.appendRow(["FECHA_HORA", "EMAIL", "NOMBRE", "ACCION", "USER_AGENT"]);
    }

    let data = {};
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (err) {
        data = e.parameter || {};
      }
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    const timestamp = data.timestamp || new Date().toISOString();
    const email = data.correo || data.email || "";
    const name = data.nombre || data.displayName || data.name || "";
    const action = data.action || "LOGIN";
    const userAgent = data.userAgent || "";

    logSheet.appendRow([timestamp, email, name, action, userAgent]);

    return jsonResponse({
      status: "success",
      message: "Registro en LOGS exitoso."
    });
  } catch (error) {
    return jsonResponse({
      status: "error",
      message: error.toString()
    });
  }
}

/**
 * Función auxiliar para empaquetar y devolver respuestas en formato JSON con soporte CORS.
 */
function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
