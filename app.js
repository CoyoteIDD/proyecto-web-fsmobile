/**
 * Lógica Frontend - Visor de Stock e Inventario (FSMobile)
 * Autenticación mediante Google Identity Services (GIS),
 * restricción corporativa estricta (@index.com.py),
 * consumo de API de Google Apps Script, renderizado interactivo y exportación.
 */

// Constantes de configuración de Autenticación y Backend
const GOOGLE_CLIENT_ID = '69897615300-cvda0rts5fseiuf07n2r3kj2bvpv9k8v.apps.googleusercontent.com';
const ALLOWED_DOMAIN = '@index.com.py';
const STORAGE_KEY_AUTH = 'fsmobile_auth_user';

// Lista de correos con permisos de Administrador para exportación y descarga de datos
const ADMIN_EMAILS = [
  'jdelacueva@index.com.py',
  'iddserviciotecnico@index.com.py'
];

const API_URL = 'https://script.google.com/macros/s/AKfycbw4Q1dLzWyga-Ey7RuRJ4XhtxsdJy7KVZ8L1Bqt39aG1iCYBWIuRvqJHiesdBodC2O6/exec';
const DEFAULT_API_URL = API_URL;
const DEFAULT_SHEET = 'STOCK';

// Estado global de la aplicación
const state = {
  currentUser: null,
  rawRecords: [],
  filteredRecords: [],
  activeSheet: DEFAULT_SHEET,
  sortColumn: null,
  sortAscending: true
};

// Referencias del DOM
const elements = {
  // Autenticación y Perfil
  loginCard: document.getElementById('loginCard'),
  inventoryCard: document.getElementById('inventoryCard'),
  authAlertBox: document.getElementById('authAlertBox'),
  gSignInBtn: document.getElementById('gSignInBtn'),
  userWidget: document.getElementById('userWidget'),
  userAvatar: document.getElementById('userAvatar'),
  userName: document.getElementById('userName'),
  userEmail: document.getElementById('userEmail'),
  btnLogout: document.getElementById('btnLogout'),

  // Inventario y Datos
  btnFetch: document.getElementById('btnFetch'),
  statusBadge: document.getElementById('statusBadge'),
  alertBox: document.getElementById('alertBox'),
  searchInput: document.getElementById('searchInput'),
  btnExportCsv: document.getElementById('btnExportCsv'),
  btnExportJson: document.getElementById('btnExportJson'),
  tableContainer: document.getElementById('tableContainer'),
  emptyState: document.getElementById('emptyState'),
  dataTable: document.getElementById('dataTable'),
  tableHead: document.getElementById('tableHead'),
  tableBody: document.getElementById('tableBody')
};

// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', () => {
  // Enlazar eventos de acciones de usuario
  if (elements.btnFetch) elements.btnFetch.addEventListener('click', fetchData);
  if (elements.searchInput) elements.searchInput.addEventListener('input', handleSearch);
  if (elements.btnExportCsv) elements.btnExportCsv.addEventListener('click', exportToCsv);
  if (elements.btnExportJson) elements.btnExportJson.addEventListener('click', exportToJson);
  if (elements.btnLogout) elements.btnLogout.addEventListener('click', handleLogout);

  // Verificar si ya existe una sesión corporativa válida persistida en el navegador
  const hasValidSession = checkExistingSession();

  if (hasValidSession) {
    updateUIForAuthenticatedUser();
    fetchData();
  } else {
    updateUIForUnauthenticatedUser();
    initGoogleIdentityServices();
  }
});

/**
 * Decodifica de forma segura la carga útil (Payload) del JWT devuelto por Google Identity Services
 */
function decodeJwt(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Error al decodificar credencial JWT de Google:', error);
    return null;
  }
}

// Bandera para evitar inicializaciones duplicadas de Google Identity Services
let isGsiInitialized = false;

/**
 * Inicializa el cliente de Google Identity Services y renderiza el botón oficial de inicio de sesión
 */
function initGoogleIdentityServices() {
  const setupGsi = () => {
    if (window.google?.accounts?.id) {
      try {
        if (!isGsiInitialized) {
          google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true
          });
          isGsiInitialized = true;
        }

        if (elements.gSignInBtn) {
          elements.gSignInBtn.innerHTML = '';
          google.accounts.id.renderButton(elements.gSignInBtn, {
            theme: 'outline',
            size: 'large',
            type: 'standard',
            shape: 'rectangular',
            text: 'signin_with',
            logo_alignment: 'left',
            width: 280
          });
        }

        // Si el usuario no está autenticado, solicitar One Tap si el navegador lo permite
        if (!state.currentUser) {
          google.accounts.id.prompt();
        }
        return true;
      } catch (err) {
        console.error('Error al inicializar Google Identity Services:', err);
        return false;
      }
    }
    return false;
  };

  // Reintento en caso de que el script externo de Google cargue de manera asíncrona
  if (!setupGsi()) {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (setupGsi() || attempts >= 25) {
        clearInterval(interval);
      }
    }, 200);
  }
}

/**
 * Manejador de la credencial recibida tras el inicio de sesión con Google
 */
function handleCredentialResponse(response) {
  hideAuthAlert();

  if (!response || !response.credential) {
    showAuthAlert('No se recibieron credenciales válidas desde el servicio de Google.');
    return;
  }

  const payload = decodeJwt(response.credential);
  if (!payload || !payload.email) {
    showAuthAlert('No se pudo verificar la información del perfil en la credencial de Google.');
    return;
  }

  const email = payload.email.trim().toLowerCase();

  // Validación estricta del dominio corporativo: debe terminar estrictamente en @index.com.py
  if (!email.endsWith(ALLOWED_DOMAIN.toLowerCase())) {
    showAuthAlert(
      `Acceso denegado: El correo "${escapeHtml(payload.email)}" no pertenece al dominio corporativo autorizado (${ALLOWED_DOMAIN}). Por favor, inicia sesión con tu cuenta corporativa de Index.`
    );
    clearSession();
    return;
  }

  // Estructura de la sesión autenticada
  const user = {
    email: payload.email,
    displayName: payload.name || payload.email.split('@')[0],
    name: payload.name || payload.email.split('@')[0],
    picture: payload.picture || '',
    token: response.credential,
    exp: payload.exp // Tiempo de expiración en segundos Unix
  };

  saveSession(user);
  state.currentUser = user;

  // Registrar auditoría inmediatamente al detectar usuario de @index.com.py
  registrarAuditoria(user.email, user.displayName);

  updateUIForAuthenticatedUser();
  fetchData();
}

/**
 * Envía la auditoría inmediatamente al detectar usuario autenticado de @index.com.py
 */
function registrarAuditoria(email, name) {
  const API_URL = "https://script.google.com/macros/s/AKfycbw4Q1dLzWyga-Ey7RuRJ4XhtxsdJy7KVZ8L1Bqt39aG1iCYBWIuRvqJHiesdBodC2O6/exec";
  
  const formData = new URLSearchParams();
  formData.append('correo', email);
  formData.append('nombre', name || email);

  fetch(API_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: formData.toString()
  })
  .then(() => console.log("Auditoría enviada con éxito"))
  .catch(err => console.error("Error enviando auditoría:", err));
}

// Alias de compatibilidad
const logVisitToAudit = (user) => registrarAuditoria(user?.email, user?.displayName || user?.name);

/**
 * Verifica la validez y expiración de una sesión guardada en localStorage
 */
function checkExistingSession() {
  try {
    const rawData = localStorage.getItem(STORAGE_KEY_AUTH);
    if (!rawData) return false;

    const user = JSON.parse(rawData);
    if (!user || !user.email) {
      clearSession();
      return false;
    }

    // Regla estricta: debe pertenecer a @index.com.py
    if (!user.email.toLowerCase().endsWith(ALLOWED_DOMAIN.toLowerCase())) {
      clearSession();
      return false;
    }

    // Verificar si el token ha expirado
    if (user.exp && (user.exp * 1000) <= Date.now()) {
      console.warn('La sesión guardada ha expirado. Se requiere nuevo inicio de sesión.');
      clearSession();
      return false;
    }

    if (!user.displayName && user.name) {
      user.displayName = user.name;
    }

    state.currentUser = user;

    // Registrar auditoría inmediatamente al detectar y restaurar sesión corporativa
    registrarAuditoria(user.email, user.displayName);

    return true;
  } catch (err) {
    console.warn('Error al verificar sesión existente:', err);
    clearSession();
    return false;
  }
}

/**
 * Guarda la sesión del usuario en localStorage
 */
function saveSession(userData) {
  try {
    localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(userData));
  } catch (err) {
    console.error('Error al guardar sesión en localStorage:', err);
  }
}

/**
 * Limpia la sesión del usuario del almacenamiento y del estado en memoria
 */
function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY_AUTH);
  } catch (err) {
    console.error('Error al remover sesión:', err);
  }
  state.currentUser = null;
  state.rawRecords = [];
  state.filteredRecords = [];

  if (window.google?.accounts?.id) {
    google.accounts.id.disableAutoSelect();
  }
}

/**
 * Cierre de sesión solicitado por el usuario
 */
function handleLogout() {
  clearSession();
  updateUIForUnauthenticatedUser();
  initGoogleIdentityServices();
}

/**
 * Verifica si el usuario actual tiene permisos de Administrador para exportación
 */
function isUserAdmin(user = state.currentUser) {
  if (!user || !user.email) return false;
  const emailNorm = user.email.trim().toLowerCase();
  return ADMIN_EMAILS.some(admin => admin.toLowerCase() === emailNorm);
}

/**
 * Controla la visibilidad y disponibilidad de los botones de descarga de datos.
 * Ambos botones solo son visibles y funcionales para los administradores autorizados.
 */
function updateDownloadButtonsState() {
  const isAdmin = isUserAdmin();
  const hasData = state.rawRecords && state.rawRecords.length > 0;

  if (elements.btnExportCsv) {
    elements.btnExportCsv.style.display = isAdmin ? 'inline-flex' : 'none';
    elements.btnExportCsv.disabled = !isAdmin || !hasData;
  }

  if (elements.btnExportJson) {
    elements.btnExportJson.style.display = isAdmin ? 'inline-flex' : 'none';
    elements.btnExportJson.disabled = !isAdmin || !hasData;
  }
}

/**
 * Actualiza la interfaz de usuario para el estado AUTENTICADO
 */
function updateUIForAuthenticatedUser() {
  hideAuthAlert();
  if (elements.loginCard) elements.loginCard.style.display = 'none';
  if (elements.inventoryCard) elements.inventoryCard.style.display = 'block';

  // Mostrar datos del usuario en la cabecera
  if (elements.userWidget) {
    elements.userWidget.style.display = 'flex';
    if (elements.userName) elements.userName.textContent = state.currentUser?.name || 'Usuario';
    if (elements.userEmail) elements.userEmail.textContent = state.currentUser?.email || '';
    if (elements.userAvatar) {
      if (state.currentUser?.picture) {
        elements.userAvatar.src = state.currentUser.picture;
        elements.userAvatar.style.display = 'inline-block';
      } else {
        elements.userAvatar.style.display = 'none';
      }
    }
  }

  // Restricción de descargas: solo administradores autorizados
  updateDownloadButtonsState();

  if (elements.statusBadge) {
    elements.statusBadge.textContent = isUserAdmin() ? 'Admin' : 'Autenticado';
    elements.statusBadge.style.background = '#e8f0fe';
    elements.statusBadge.style.color = '#1a73e8';
  }
}

/**
 * Actualiza la interfaz de usuario para el estado NO AUTENTICADO
 */
function updateUIForUnauthenticatedUser() {
  if (elements.inventoryCard) elements.inventoryCard.style.display = 'none';
  if (elements.loginCard) elements.loginCard.style.display = 'block';
  if (elements.userWidget) elements.userWidget.style.display = 'none';
  updateDownloadButtonsState();

  if (elements.statusBadge) {
    elements.statusBadge.textContent = 'Acceso Restringido';
    elements.statusBadge.style.background = '#f1f3f4';
    elements.statusBadge.style.color = '#5f6368';
  }
}

/**
 * Muestra alertas en la pantalla de autenticación
 */
function showAuthAlert(message) {
  if (elements.authAlertBox) {
    elements.authAlertBox.innerHTML = message;
    elements.authAlertBox.className = 'alert alert-error visible';
  }
}

function hideAuthAlert() {
  if (elements.authAlertBox) {
    elements.authAlertBox.className = 'alert';
    elements.authAlertBox.innerHTML = '';
  }
}

/**
 * Petición de datos al backend (Google Apps Script Web App)
 * Requiere que el usuario esté autenticado previamente con su cuenta corporativa.
 */
async function fetchData() {
  hideAlert();

  // Control de seguridad adicional: no consultar datos si no hay usuario autenticado
  if (!state.currentUser) {
    showAlert('Debes iniciar sesión con una cuenta corporativa @index.com.py para consultar el stock.', 'error');
    updateUIForUnauthenticatedUser();
    return;
  }

  setLoading(true);

  try {
    const fetchUrl = new URL(DEFAULT_API_URL);
    fetchUrl.searchParams.set('sheet', DEFAULT_SHEET);

    const response = await fetch(fetchUrl.toString(), {
      method: 'GET',
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status} - ${response.statusText}`);
    }

    const result = await response.json();

    if (result.status === 'error') {
      let msg = result.message || 'Error desconocido al consultar el inventario.';
      if (result.availableSheets && result.availableSheets.length > 0) {
        msg += ` Hojas disponibles: ${result.availableSheets.join(', ')}`;
      }
      throw new Error(msg);
    }

    // Datos obtenidos exitosamente
    state.rawRecords = result.data || [];
    state.filteredRecords = [...state.rawRecords];
    state.activeSheet = result.sheet || DEFAULT_SHEET;
    state.sortColumn = null;

    // Habilitar controles interactivos
    if (elements.searchInput) {
      elements.searchInput.disabled = false;
      elements.searchInput.value = '';
    }

    // Actualizar disponibilidad y visibilidad de descargas según permisos de Administrador
    updateDownloadButtonsState();

    renderTable();

    if (elements.statusBadge) {
      elements.statusBadge.textContent = 'Actualizado';
      elements.statusBadge.style.background = '#ceead6';
      elements.statusBadge.style.color = '#0d652d';
    }

  } catch (error) {
    console.error('Error fetching stock data:', error);
    showAlert(
      `No se pudo cargar la información de inventario: ${error.message}. ` +
      `Verifica la conexión a internet o los permisos de la Web App en Apps Script.`,
      'error'
    );
    if (elements.statusBadge) {
      elements.statusBadge.textContent = 'Error';
      elements.statusBadge.style.background = '#fad2cf';
      elements.statusBadge.style.color = '#c5221f';
    }
  } finally {
    setLoading(false);
  }
}

/**
 * Obtiene las columnas visibles para la interfaz, omitiendo la columna técnica 'ID' y la columna '#'
 * y garantizando 'CODIGO' como la primera columna visible de la tabla.
 */
function getVisibleColumns(records) {
  if (!records || records.length === 0) return [];
  const allColumns = Array.from(new Set(records.flatMap(r => Object.keys(r))));

  // Omitir columna técnica 'ID' y columna '#'
  const columns = allColumns.filter(col => {
    const colNorm = col.trim().toUpperCase();
    return colNorm !== 'ID' && colNorm !== '#' && colNorm !== 'Nº' && colNorm !== 'N°';
  });

  // Posicionar CODIGO como primera columna visible
  const codigoIndex = columns.findIndex(col => col.trim().toUpperCase() === 'CODIGO');
  if (codigoIndex > 0) {
    const [codigoCol] = columns.splice(codigoIndex, 1);
    columns.unshift(codigoCol);
  } else if (codigoIndex === -1) {
    const partialIndex = columns.findIndex(col => col.trim().toUpperCase().includes('CODIGO') || col.trim().toUpperCase() === 'COD');
    if (partialIndex > 0) {
      const [codigoCol] = columns.splice(partialIndex, 1);
      columns.unshift(codigoCol);
    }
  }
  return columns;
}

/**
 * Renderiza la tabla dinámica según las columnas recibidas
 */
function renderTable() {
  const records = state.filteredRecords;

  if (!records || records.length === 0) {
    elements.dataTable.style.display = 'none';
    elements.emptyState.style.display = 'block';
    elements.emptyState.innerHTML = state.rawRecords.length === 0 
      ? '<p>No se encontraron registros de inventario en la base de datos.</p>' 
      : '<p>Ningún registro coincide con el filtro de búsqueda.</p>';
    return;
  }

  elements.emptyState.style.display = 'none';
  elements.dataTable.style.display = 'table';

  // Obtener columnas visibles omitiendo 'ID' y garantizando 'CODIGO' al inicio
  const columns = getVisibleColumns(records);

  // Renderizar cabecera con indicadores de ordenamiento (comienza directamente con CODIGO)
  elements.tableHead.innerHTML = `
    <tr>
      ${columns.map(col => `
        <th data-column="${escapeHtml(col)}" title="Clic para ordenar">
          ${escapeHtml(col)}
          <span class="sort-icon">${getSortIndicator(col)}</span>
        </th>
      `).join('')}
    </tr>
  `;

  // Asignar eventos de ordenamiento a cada columna
  elements.tableHead.querySelectorAll('th[data-column]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-column');
      handleSort(col);
    });
  });

  // Renderizar filas de datos (sin columna '#', primera columna es CODIGO)
  elements.tableBody.innerHTML = records.map(row => `
    <tr>
      ${columns.map(col => `
        <td title="${escapeHtml(String(row[col] ?? ''))}">${escapeHtml(String(row[col] ?? ''))}</td>
      `).join('')}
    </tr>
  `).join('');
}

/**
 * Ordenamiento de columnas (ascendente / descendente)
 */
function handleSort(column) {
  if (state.sortColumn === column) {
    state.sortAscending = !state.sortAscending;
  } else {
    state.sortColumn = column;
    state.sortAscending = true;
  }

  state.filteredRecords.sort((a, b) => {
    const valA = (a[column] ?? '').toString().toLowerCase();
    const valB = (b[column] ?? '').toString().toLowerCase();

    // Comparación numérica si ambos valores son números válidos
    const numA = parseFloat(valA);
    const numB = parseFloat(valB);
    if (!isNaN(numA) && !isNaN(numB)) {
      return state.sortAscending ? numA - numB : numB - numA;
    }

    if (valA < valB) return state.sortAscending ? -1 : 1;
    if (valA > valB) return state.sortAscending ? 1 : -1;
    return 0;
  });

  renderTable();
}

function getSortIndicator(column) {
  if (state.sortColumn !== column) return '↕';
  return state.sortAscending ? '▲' : '▼';
}

/**
 * Filtro de búsqueda en tiempo real
 */
function handleSearch(e) {
  const query = e.target.value.toLowerCase().trim();

  if (!query) {
    state.filteredRecords = [...state.rawRecords];
  } else {
    state.filteredRecords = state.rawRecords.filter(row => {
      return Object.values(row).some(val => 
        String(val).toLowerCase().includes(query)
      );
    });
  }

  renderTable();
}

/**
 * Exportación de datos a formato CSV (con soporte UTF-8 y compatibilidad Excel)
 * Exclusivo para administradores autorizados.
 */
function exportToCsv() {
  if (!isUserAdmin()) {
    showAlert('Permiso denegado: La descarga de archivos CSV está reservada para administradores autorizados.', 'error');
    return;
  }

  const records = state.filteredRecords.length > 0 ? state.filteredRecords : state.rawRecords;
  if (!records || records.length === 0) return;

  const columns = getVisibleColumns(records);
  
  const csvRows = [];
  csvRows.push(columns.map(formatCsvCell).join(','));

  records.forEach(row => {
    const line = columns.map(col => formatCsvCell(row[col] ?? '')).join(',');
    csvRows.push(line);
  });

  const csvString = '\uFEFF' + csvRows.join('\r\n'); // BOM para Excel
  downloadBlob(csvString, `${state.activeSheet || 'stock'}_${getDateStamp()}.csv`, 'text/csv;charset=utf-8;');
}

function formatCsvCell(cell) {
  const str = String(cell);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Exportación de datos en formato JSON
 * Exclusivo para administradores autorizados.
 */
function exportToJson() {
  if (!isUserAdmin()) {
    showAlert('Permiso denegado: La descarga de archivos JSON está reservada para administradores autorizados.', 'error');
    return;
  }

  const records = state.filteredRecords.length > 0 ? state.filteredRecords : state.rawRecords;
  if (!records || records.length === 0) return;

  const jsonString = JSON.stringify(records, null, 2);
  downloadBlob(jsonString, `${state.activeSheet || 'stock'}_${getDateStamp()}.json`, 'application/json');
}

/**
 * Descarga de archivo Blob en el navegador
 */
function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getDateStamp() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
}

/**
 * Helpers UI
 */
function setLoading(isLoading) {
  if (elements.btnFetch) {
    elements.btnFetch.disabled = isLoading;
    if (isLoading) {
      elements.btnFetch.innerHTML = '<span class="spinner"></span> Sincronizando...';
    } else {
      elements.btnFetch.innerHTML = '<span>🔄 Actualizar</span>';
    }
  }
  if (elements.statusBadge && isLoading) {
    elements.statusBadge.textContent = 'Cargando...';
    elements.statusBadge.style.background = '#feefe3';
    elements.statusBadge.style.color = '#b06000';
  }
}

function showAlert(message, type = 'error') {
  if (elements.alertBox) {
    elements.alertBox.className = `alert alert-${type} visible`;
    elements.alertBox.textContent = message;
  }
}

function hideAlert() {
  if (elements.alertBox) {
    elements.alertBox.className = 'alert';
    elements.alertBox.textContent = '';
  }
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}
