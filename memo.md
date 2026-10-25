# MEMORIA DE PROYECTO: CASO PICHÓN (Web App + Google Sheets / AppSheet)

## 1. INFORMACIÓN GENERAL
- **Nombre del Caso:** Caso Pichón
- **Ruta del Proyecto:** `/home/jorge/Documentos/Proyecto Web FSMobile`
- **Spreadsheet ID:** `1XeUuWM83dJZr161vsxCtwmO5uG0Yad5ipZ0PbTozE54`
- **Pestaña por Defecto:** `STOCK`
- **API Web App Desplegada:** `https://script.google.com/macros/s/AKfycbw4Q1dLzWyga-Ey7RuRJ4XhtxsdJy7KVZ8L1Bqt39aG1iCYBWIuRvqJHiesdBodC2O6/exec`
- **Objetivo:** Desarrollar una página web conectada a las planillas electrónicas de AppSheet/Google Sheets para la visualización y extracción de datos.
- **Arquitectura:** Opción A (Google Apps Script como Web App API JSON + Frontend HTML/JS con fetch).

## 2. ESTRUCTURA DE ARCHIVOS
- `memo.md`: Memoria de contexto y decisiones del proyecto.
- `api.gs`: Código del Google Apps Script (Backend API).
- `index.html`: Interfaz web principal.
- `app.js`: Lógica de consumo de API y renderizado de datos.

## 3. REGISTRO DE AVANCES Y DECISIONES
- **Fase 1 (Inicialización):** Estructura del proyecto creada y metodología de memoria registrada.
- **Fase 2 (Backend con Google Apps Script):**
  - Implementación de [`api.gs`](file:///home/jorge/Documentos/Proyecto%20Web%20FSMobile/api.gs) con función [`doGet(e)`](file:///home/jorge/Documentos/Proyecto%20Web%20FSMobile/api.gs#L20-L100).
  - Apertura de planilla mediante `SpreadsheetApp.openById` con ID configurable por constante o parámetro `?id=`.
  - Lectura de datos por pestaña según parámetro `?sheet=...` (fallback a la primera hoja y reporte de hojas disponibles si hay error).
  - Conversión automática de fila de encabezados a claves de objetos JSON, descarte de filas vacías y serialización de fechas a ISO string.
  - Respuestas JSON estructuradas (`status`, `sheet`, `totalRows`, `data`) con `ContentService.createTextOutput` y `MimeType.JSON` compatibles con CORS.
- **Fase 3 (Frontend Web: Interfaz y Consumo de Datos):**
  - Creación de [`index.html`](file:///home/jorge/Documentos/Proyecto%20Web%20FSMobile/index.html): estructura semántica, diseño responsivo adaptado a dispositivos móviles y escritorio, barra de métricas, alertas contextuales y controles de extracción.
  - Creación de [`app.js`](file:///home/jorge/Documentos/Proyecto%20Web%20FSMobile/app.js):
    - Consumo asíncrono vía `fetch` con seguimiento de redirección (`redirect: 'follow'`) requerido por Google Apps Script.
    - Persistencia de configuración (URL y pestaña) en `localStorage`.
    - Renderizado dinámico de columnas y filas a partir del esquema devuelto por el backend.
    - Búsqueda y filtrado en tiempo real en todos los campos.
    - Ordenamiento interactivo por columnas (alfanumérico y numérico).
    - Extracción y descarga de datos a formatos CSV (con BOM UTF-8 compatible con Microsoft Excel) y JSON.
- **Fase 4 (Conexión Real con Backend y Datos de STOCK):**
  - Establecido en [`api.gs`](file:///home/jorge/Documentos/Proyecto%20Web%20FSMobile/api.gs#L9-L10) el ID de planilla `1XeUuWM83dJZr161vsxCtwmO5uG0Yad5ipZ0PbTozE54` y la pestaña `STOCK` por defecto.
  - Despliegue de la API Web App en Google Apps Script y registro de la URL de producción: `https://script.google.com/macros/s/AKfycbw4Q1dLzWyga-Ey7RuRJ4XhtxsdJy7KVZ8L1Bqt39aG1iCYBWIuRvqJHiesdBodC2O6/exec`.
  - Configuración de la constante predeterminada `DEFAULT_API_URL` en [`app.js`](file:///home/jorge/Documentos/Proyecto%20Web%20FSMobile/app.js) y en [`index.html`](file:///home/jorge/Documentos/Proyecto%20Web%20FSMobile/index.html).
  - Conexión verificada: El frontend ahora realiza la consulta directa y automática a la base de datos de `STOCK` sin necesidad de configuración manual adicional por parte del usuario.
- **Fase 5 (Refinamiento de Interfaz y Experiencia de Usuario):**
  - Cambio del título principal a "Stock e Inventario" en cabecera y etiqueta `<title>`.
  - Eliminación de la tarjeta técnica de configuración de API y selector de pestaña, manteniendo las credenciales y parámetros de conexión integrados internamente en [`app.js`](file:///home/jorge/Documentos/Proyecto%20Web%20FSMobile/app.js#L8-L9).
  - Activación de carga automática al abrir la aplicación y adición del botón "🔄 Actualizar" en la barra de acciones.
  - Simplificación de métricas en [`index.html`](file:///home/jorge/Documentos/Proyecto%20Web%20FSMobile/index.html): eliminación de "Hoja activa" y "Última sincronización", conservando exclusivamente el indicador de registros totales y filtrados.





