// ============================================================
// Portal Parqueadero de Motos UdeA
// ============================================================

// URL del backend (Render). El frontend vive en Vercel, en otro
// dominio, asi que todas las llamadas apuntan aqui. Para probar en
// local, cambia a 'http://localhost:3000'.
const API = 'https://parqueaderos-udea.onrender.com';

let usuarioActual = null;
let tablasDisponibles = [];
let tablaActual = null;
let registroEnEdicion = null;
let temporizadorDisp = null;

// fetch que siempre manda la cookie de sesion y no cachea.
// Antepone la URL del backend a las rutas que empiezan por /api o /auth.
function fetchAuth(url, opciones = {}) {
    const destino = url.startsWith('/api') || url.startsWith('/auth') ? API + url : url;
    return fetch(destino, { ...opciones, credentials: 'include', cache: 'no-store' });
}

function nombreLegible(texto) {
    return texto.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
function esColumnaBooleana(nombreColumna) {
    return /^(es_|tiene_|requiere_|enviada)/.test(nombreColumna);
}
function mostrarMensaje(idZona, texto, esError) {
    const zona = document.getElementById(idZona);
    if (!zona) return;
    zona.textContent = texto;
    zona.className = 'zona-mensaje' + (esError ? ' error' : '');
    zona.hidden = false;
    setTimeout(() => { zona.hidden = true; }, 4000);
}

// ---------- Arranque ----------
async function iniciar() {
    try {
        const resp = await fetchAuth('/auth/yo');
        if (!resp.ok) { mostrarLogin(); return; }
        usuarioActual = await resp.json();
        mostrarApp();
    } catch {
        mostrarLogin();
    }
}
function mostrarLogin() {
    document.getElementById('pantalla-login').hidden = false;
    document.getElementById('tablero').hidden = true;
}
function mostrarApp() {
    document.getElementById('pantalla-login').hidden = true;
    document.getElementById('tablero').hidden = false;
    document.getElementById('sesion-correo').textContent = usuarioActual.correo;
    document.getElementById('sesion-rol').textContent = usuarioActual.rol;

    const esEmpleado = usuarioActual.rol === 'empleado';
    document.querySelectorAll('.solo-empleado').forEach((el) => { el.hidden = !esEmpleado; });

    cambiarSeccion('disponibilidad');
    cargarDisponibilidad();
    iniciarAutoRefresco();

    try {
        if (esEmpleado) cargarTablasAdmin();
    } catch (e) {
        console.log('error cargando admin:', e);
    }
}

// ---------- Navegacion ----------
function cambiarSeccion(nombre) {
    document.querySelectorAll('.seccion').forEach((s) => { s.hidden = true; });
    document.querySelectorAll('.item-seccion').forEach((b) => b.classList.remove('activo'));
    document.getElementById('seccion-' + nombre).hidden = false;
    const boton = document.querySelector(`.item-seccion[data-seccion="${nombre}"]`);
    if (boton) boton.classList.add('activo');
    if (nombre === 'notificaciones') cargarNotificaciones();
}
document.querySelectorAll('.item-seccion').forEach((boton) => {
    boton.addEventListener('click', () => cambiarSeccion(boton.dataset.seccion));
});

// ---------- Logout ----------
document.getElementById('boton-logout').addEventListener('click', async () => {
    await fetchAuth('/auth/logout', { method: 'POST' });
    location.reload();
});

// ============================================================
// DISPONIBILIDAD
// ============================================================
async function cargarDisponibilidad() {
    try {
        const resp = await fetchAuth('/api/disponibilidad');
        if (!resp.ok) throw new Error('No se pudo cargar la disponibilidad');
        const p = await resp.json();
        pintarParqueadero(p);
    } catch (e) {
        mostrarMensaje('zona-mensaje-disp', e.message, true);
    }
}
function pintarParqueadero(p) {
    const cap = p.capacidad || 0;
    const dentro = p.dentro || 0;
    const disp = p.disponibles ?? 0;
    const pct = cap > 0 ? Math.round((dentro / cap) * 100) : 0;

    let nivel = 'ok';
    if (pct >= 90) nivel = 'lleno';
    else if (pct >= 70) nivel = 'medio';

    const tarjeta = document.getElementById('tarjeta-parqueadero');
    tarjeta.className = 'tarjeta-parqueadero-grande nivel-' + nivel;
    document.getElementById('pq-nombre').textContent = p.nombre || 'Parqueadero';
    document.getElementById('pq-disponibles').textContent = disp;
    document.getElementById('pq-detalle').textContent = `${dentro} / ${cap} ocupados`;
    document.getElementById('pq-barra').style.width = pct + '%';
}
document.getElementById('boton-refrescar').addEventListener('click', cargarDisponibilidad);
function iniciarAutoRefresco() {
    if (temporizadorDisp) clearInterval(temporizadorDisp);
    temporizadorDisp = setInterval(() => {
        const s = document.getElementById('seccion-disponibilidad');
        if (!s.hidden) cargarDisponibilidad();
    }, 10000);
}

// ============================================================
// PORTERIA
// ============================================================
function mostrarResultadoPorteria(data, esError) {
    const caja = document.getElementById('resultado-porteria');
    caja.hidden = false;
    caja.className = 'resultado-porteria' + (esError ? ' resultado-error' : ' resultado-ok');
    if (esError) {
        caja.innerHTML = `<strong>No se pudo procesar</strong><p>${data}</p>`;
    } else {
        caja.innerHTML = `<strong>${data.mensaje}</strong>
            <p>Dentro: ${data.dentro}</p>
            <p>Disponibles: ${data.disponibles}</p>`;
    }
}
async function enviarAccion(url, cuerpo) {
    try {
        const resp = await fetchAuth(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cuerpo)
        });
        const data = await resp.json();
        if (!resp.ok) { mostrarResultadoPorteria(data.error || 'Error', true); return; }
        mostrarResultadoPorteria(data, false);
        cargarDisponibilidad();
    } catch (e) {
        mostrarResultadoPorteria(e.message, true);
    }
}
document.getElementById('boton-entrada-tip').addEventListener('click', () => {
    const cedula = document.getElementById('tip-cedula').value.trim();
    if (!cedula) return mostrarMensaje('zona-mensaje-port', 'Ingresa la cédula', true);
    enviarAccion('/api/acceso/entrada-tip', { cedula });
});
document.getElementById('boton-entrada-manual').addEventListener('click', () => {
    const placa = document.getElementById('man-placa').value.trim();
    if (!placa) return mostrarMensaje('zona-mensaje-port', 'Ingresa la placa', true);
    enviarAccion('/api/acceso/entrada-manual', { placa });
});
document.getElementById('boton-salida').addEventListener('click', () => {
    const placa = document.getElementById('sal-placa').value.trim();
    if (!placa) return mostrarMensaje('zona-mensaje-port', 'Ingresa la placa', true);
    enviarAccion('/api/acceso/salida', { placa });
});

// ============================================================
// NOTIFICACIONES
// ============================================================
async function cargarNotificaciones() {
    try {
        const resp = await fetchAuth('/api/notificacion');
        if (!resp.ok) return;
        const filas = await resp.json();
        pintarNotificaciones(filas);
    } catch (e) {
        console.log('error notif:', e);
    }
}
function pintarNotificaciones(filas) {
    const cuerpo = document.getElementById('cuerpo-notif');
    const vacio = document.getElementById('notif-vacio');
    cuerpo.innerHTML = '';
    if (!filas || filas.length === 0) { vacio.hidden = false; return; }
    vacio.hidden = true;
    // ordenar por fecha desc (vienen por id)
    filas.slice().reverse().forEach((n) => {
        const fecha = n.fecha_hora ? new Date(n.fecha_hora).toLocaleString('es-CO') : '—';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${fecha}</td>
            <td>${n.id_tipo_notificacion ?? '—'}</td>
            <td>${n.id_persona ?? '—'}</td>
            <td>${n.mensaje || '—'}</td>
            <td>${n.enviada ? 'Sí' : 'No'}</td>`;
        cuerpo.appendChild(tr);
    });
}
document.getElementById('boton-refrescar-notif').addEventListener('click', cargarNotificaciones);

// ============================================================
// ADMIN (CRUD 16 tablas)
// ============================================================
async function cargarTablasAdmin() {
    try {
        const resp = await fetchAuth('/api/_meta/tablas');
        if (!resp.ok) throw new Error('No se pudo cargar la lista de tablas');
        tablasDisponibles = await resp.json();
        const lista = document.getElementById('lista-tablas');
        lista.innerHTML = '';
        tablasDisponibles.forEach((tabla) => {
            const boton = document.createElement('button');
            boton.className = 'item-tabla';
            boton.textContent = nombreLegible(tabla.ruta);
            boton.addEventListener('click', () => seleccionarTabla(tabla, boton));
            lista.appendChild(boton);
        });
    } catch (e) {
        mostrarMensaje('zona-mensaje', e.message, true);
    }
}
function seleccionarTabla(tabla, boton) {
    tablaActual = tabla;
    document.querySelectorAll('.item-tabla').forEach((b) => b.classList.remove('activo'));
    boton.classList.add('activo');
    document.getElementById('titulo-tabla').textContent = nombreLegible(tabla.ruta);
    document.getElementById('subtitulo-tabla').textContent = `${tabla.columnas.length} campos · /api/${tabla.ruta}`;
    document.getElementById('boton-nuevo').hidden = false;
    cargarRegistros();
}
async function cargarRegistros() {
    if (!tablaActual) return;
    try {
        const resp = await fetchAuth(`/api/${tablaActual.ruta}`);
        if (!resp.ok) throw new Error('Error al consultar los registros');
        pintarTabla(await resp.json());
    } catch (e) {
        mostrarMensaje('zona-mensaje', e.message, true);
    }
}
function pintarTabla(filas) {
    const columnas = ['id', ...tablaActual.columnas];
    document.getElementById('cabecera-tabla').innerHTML = '<tr>' +
        columnas.map((c) => `<th>${nombreLegible(c)}</th>`).join('') + '</tr>';
    const cuerpo = document.getElementById('cuerpo-tabla');
    cuerpo.innerHTML = '';
    const tabla = document.getElementById('tabla-datos');
    const vacio = document.getElementById('estado-vacio');
    if (filas.length === 0) { tabla.hidden = true; vacio.hidden = false; return; }
    tabla.hidden = false; vacio.hidden = true;
    filas.forEach((fila) => {
        const tr = document.createElement('tr');
        tr.innerHTML = columnas.map((col) => {
            const v = fila[col];
            if (col === 'id') return `<td class="celda-id">${v}</td>`;
            if (v === null || v === undefined || v === '') return '<td class="celda-vacia">—</td>';
            return `<td>${String(v)}</td>`;
        }).join('');
        tr.addEventListener('click', () => abrirPanel(fila));
        cuerpo.appendChild(tr);
    });
}
function construirCampos(valores) {
    const cont = document.getElementById('campos-formulario');
    cont.innerHTML = '';
    tablaActual.columnas.forEach((columna) => {
        const contenedor = document.createElement('div');
        contenedor.className = 'campo';
        const label = document.createElement('label');
        label.textContent = nombreLegible(columna);
        label.setAttribute('for', 'campo-' + columna);
        contenedor.appendChild(label);
        let input;
        if (esColumnaBooleana(columna)) {
            input = document.createElement('select');
            input.innerHTML = `<option value="">Sin definir</option><option value="true">Sí</option><option value="false">No</option>`;
            if (valores && valores[columna] !== null && valores[columna] !== undefined) input.value = String(valores[columna]);
        } else {
            input = document.createElement('input');
            input.type = 'text';
            if (valores && valores[columna] !== null && valores[columna] !== undefined) input.value = valores[columna];
        }
        input.id = 'campo-' + columna;
        input.name = columna;
        contenedor.appendChild(input);
        cont.appendChild(contenedor);
    });
}
function abrirPanel(registro) {
    registroEnEdicion = registro || null;
    document.getElementById('panel-titulo').textContent = registro ? `Editando #${registro.id}` : 'Nuevo registro';
    document.getElementById('boton-eliminar').hidden = !registro;
    construirCampos(registro);
    document.getElementById('panel-lateral').hidden = false;
}
function cerrarPanel() {
    document.getElementById('panel-lateral').hidden = true;
    registroEnEdicion = null;
}
document.getElementById('boton-nuevo').addEventListener('click', () => abrirPanel(null));
document.getElementById('panel-cerrar').addEventListener('click', cerrarPanel);
document.getElementById('panel-fondo').addEventListener('click', cerrarPanel);

function leerValoresFormulario() {
    const datos = {};
    tablaActual.columnas.forEach((columna) => {
        const input = document.getElementById('campo-' + columna);
        let valor = input.value;
        if (valor === '') return;
        if (esColumnaBooleana(columna)) valor = valor === 'true';
        datos[columna] = valor;
    });
    return datos;
}
document.getElementById('formulario-registro').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = leerValoresFormulario();
    const esEdicion = Boolean(registroEnEdicion);
    const url = esEdicion ? `/api/${tablaActual.ruta}/${registroEnEdicion.id}` : `/api/${tablaActual.ruta}`;
    try {
        const resp = await fetchAuth(url, {
            method: esEdicion ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });
        const r = await resp.json();
        if (!resp.ok) throw new Error(r.error || 'Error al guardar');
        mostrarMensaje('zona-mensaje', esEdicion ? 'Registro actualizado' : 'Registro creado', false);
        cerrarPanel(); cargarRegistros();
    } catch (err) {
        mostrarMensaje('zona-mensaje', err.message, true);
    }
});
document.getElementById('boton-eliminar').addEventListener('click', async () => {
    if (!registroEnEdicion) return;
    if (!confirm(`¿Eliminar el registro #${registroEnEdicion.id}?`)) return;
    try {
        const resp = await fetchAuth(`/api/${tablaActual.ruta}/${registroEnEdicion.id}`, { method: 'DELETE' });
        const r = await resp.json();
        if (!resp.ok) throw new Error(r.error || 'Error al eliminar');
        mostrarMensaje('zona-mensaje', 'Registro eliminado', false);
        cerrarPanel(); cargarRegistros();
    } catch (err) {
        mostrarMensaje('zona-mensaje', err.message, true);
    }
});

// Arranque cuando el HTML este listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
} else {
    iniciar();
}
