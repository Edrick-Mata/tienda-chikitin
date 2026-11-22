/*   Panel de la aplicacion  */
"use strict";

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => Number(n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const fecha = iso => iso ? new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—";
const norm = s => String(s == null ? "" : s).toLowerCase();

const ICONS = {
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
    box: '<path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6"/>',
    users: '<path d="M16 20v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M9.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 20v-2a4 4 0 00-3-3.9M16 3.1a3.5 3.5 0 010 6.8"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    cart: '<path d="M3 4h2l2.4 11h10.2L20 8H6"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
    mail: '<path d="M3 5h18v14H3zM3 7l9 6 9-6"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>'
};
const ic = n => `<svg class="ic" viewBox="0 0 24 24">${ICONS[n]}</svg>`;

const ROLES = { admin: "Administrador", supervisor: "Supervisor", cajero: "Cajero", comprador: "Comprador" };
const PLURAL = { admin: "Administradores", supervisor: "Supervisores", cajero: "Cajeros", comprador: "Compradores" };
const MENU = {
    admin: [["panel", "Panel", "chart"], ["inventario", "Inventario", "box"], ["ventas", "Ventas", "receipt"], ["usuarios", "Usuarios", "users"], ["correos", "Correos", "mail"], ["historial", "Historial", "clock"], ["perfil", "Mi perfil", "user"]],
    supervisor: [["panel", "Panel", "chart"], ["inventario", "Inventario", "box"], ["ventas", "Ventas", "receipt"], ["usuarios", "Usuarios", "users"], ["correos", "Correos", "mail"], ["historial", "Historial", "clock"], ["perfil", "Mi perfil", "user"]],
    cajero: [["caja", "Caja", "cash"], ["inventario", "Inventario", "box"], ["ventas", "Ventas", "receipt"], ["perfil", "Mi perfil", "user"]],
    comprador: [["catalogo", "Catálogo", "box"], ["carrito", "Carrito", "cart"], ["compras", "Mis compras", "receipt"], ["perfil", "Mi perfil", "user"]]
};

const S = { u: null, vista: "", q: "", cat: "", bajo: false, carrito: [], recargar: null, buscar: null, pendiente: false, imgRel: {}, prods: [],
    tk: { q: "", estado: "", tipo: "", metodo: "", mios: true } };

const esAdmin = () => S.u.rol === "admin";
const esStaff = () => S.u.rol === "admin" || S.u.rol === "supervisor" || S.u.rol === "cajero";
const veCostos = () => S.u.rol === "admin" || S.u.rol === "supervisor";

/* ---------------- Utilidades de interfaz ---------------- */
function toast(msg, tipo = "") {
    const t = document.createElement("div");
    t.className = "toast " + tipo;
    t.textContent = msg;
    $("#toasts").appendChild(t);
    setTimeout(() => t.remove(), 4500);
}
const intentar = async f => { try { return await f(); } catch (e) { toast(e.message, "error"); } };

function modal(html) {
    const d = $("#modal");
    d.innerHTML = html;
    if (!d.open) d.showModal();
    return d;
}
const cerrarModal = () => { const d = $("#modal"); if (d.open) d.close(); };

function csv(nombre, filas) {
    const txt = filas.map(f => f.map(v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"').join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + txt], { type: "text/csv;charset=utf-8" }));
    a.download = nombre;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const estadoStock = p => p.stock === 0 ? '<span class="badge mal">Agotado</span>'
    : p.stock <= p.minimo ? '<span class="badge warn">Stock bajo</span>' : '<span class="badge ok">Disponible</span>';

/* Precio vigente: si el administrador puso una oferta, es el precio de oferta */
const pv = p => (p.oferta ? p.oferta.precio : p.precio);
const htmlPrecio = p => p.oferta
    ? `<span class="precio-of"><s>${money(p.precio)}</s><strong>${money(p.oferta.precio)}</strong><span class="badge oferta">${p.oferta.tipo === "porcentaje" ? "−" + p.oferta.valor + " %" : "OFERTA"}</span></span>`
    : money(p.precio);
const fechaCorta = iso => iso ? new Date(iso).toLocaleDateString("es-MX") : "—";
/* NUEVO: imágenes de los productos que otros usan como origen ({pid: imagen}); se piden aparte para no repetirlas en cada producto */
async function cargarImgRel() { try { S.imgRel = await DB.imagenesRelacionadas(); } catch (_) {} }

/* Reduce una imagen y la devuelve como texto (data URL) para guardarla en la base de datos */
function imagenADataURL(file, max = 600, calidad = 0.78) {
    return new Promise((ok, err) => {
        if (!file) return ok(undefined);
        if (!file.type.startsWith("image/")) return err(new Error("El archivo debe ser una imagen."));
        const r = new FileReader();
        r.onerror = () => err(new Error("No se pudo leer la imagen."));
        r.onload = () => {
            const img = new Image();
            img.onerror = () => err(new Error("Imagen no válida."));
            img.onload = () => {
                const k = Math.min(1, max / Math.max(img.width, img.height));
                const c = document.createElement("canvas");
                c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
                const g = c.getContext("2d");
                g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
                g.drawImage(img, 0, 0, c.width, c.height);
                ok(c.toDataURL("image/jpeg", calidad));
            };
            img.src = r.result;
        };
        r.readAsDataURL(file);
    });
}

/* Imagen del producto; si no tiene, una ilustración por categoría */
const EMOJI = { "Periféricos": "⌨️", "Pantallas": "🖥️", "Audio": "🎧", "Cables": "🔌", "Almacenamiento": "💾", "Accesorios": "🎒" };
const cacheImg = new Map();
function imgProd(p) {
    if (p.imagen) return p.imagen;
    if (p.imagenDe && S.imgRel[p.imagenDe]) return S.imgRel[p.imagenDe];   // NUEVO: imagen de otro producto de su subcategoría
    let v = cacheImg.get(p.categoria);
    if (!v) {
        const ini = (p.categoria || "?").slice(0, 3).toUpperCase();
        const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='300' height='200'><rect width='100%' height='100%' fill='#2a2a2f'/><text x='50%' y='52%' font-size='72' text-anchor='middle' dominant-baseline='middle'>" +
            (EMOJI[p.categoria] || "📦") + "</text><text x='50%' y='90%' font-size='16' fill='#f79239' text-anchor='middle' font-family='sans-serif'>" + ini + "</text></svg>";
        v = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
        cacheImg.set(p.categoria, v);
    }
    return v;
}
const avatar = (u, grande) => u.foto ? `<img class="avatar${grande ? " grande" : ""}" src="${esc(u.foto)}" alt="">` : `<div class="avatar${grande ? " grande" : ""}">${ic("user")}</div>`;

/* Lista paginada generica  */
function paginado(cont, { render, tam = 25 }) {
    let items = [], pag = 1;
    const pintar = () => {
        const n = Math.max(1, Math.ceil(items.length / tam));
        if (pag > n) pag = n;
        const sl = items.slice((pag - 1) * tam, pag * tam);
        const pager = n > 1 ? `<div class="pager"><button class="btn-ghost btn-sm" data-pg="${pag - 1}" ${pag <= 1 ? "disabled" : ""}>‹ Anterior</button><span>Página ${pag} de ${n} · ${items.length} resultados</span><button class="btn-ghost btn-sm" data-pg="${pag + 1}" ${pag >= n ? "disabled" : ""}>Siguiente ›</button></div>` : "";
        cont.innerHTML = render(sl, items) + pager;
    };
    cont.addEventListener("click", e => { const b = e.target.closest("[data-pg]"); if (b && !b.disabled) { pag = Number(b.dataset.pg); pintar(); } });
    return { set(nuevos, reiniciar = true) { items = nuevos; if (reiniciar) pag = 1; pintar(); } };
}
const tabla = (cont, { cab, fila, tam = 25, vacio = "No hay resultados." }) => paginado(cont, {
    tam, render: (sl, todos) => todos.length
        ? `<div class="tabla-wrap"><table><thead><tr>${cab}</tr></thead><tbody>${sl.map(fila).join("")}</tbody></table></div>`
        : `<div class="tabla-wrap"><div class="vacio">${vacio}</div></div>`
});

function barras(filas, fmt = String) {
    const max = Math.max(1, ...filas.map(f => f.val));
    return filas.length ? `<div class="barras">${filas.map(f => `<div class="barra"><span title="${esc(f.etq)}">${esc(f.etq)}</span><div class="pista"><div class="rell" style="width:${Math.max(1, Math.round(f.val / max * 100))}%"></div></div><b>${esc(f.txt != null ? f.txt : fmt(f.val))}</b></div>`).join("")}</div>`
        : '<p class="muted">Sin datos todavía.</p>';
}

function filtrarProductos(prods) {
    const q = norm(S.q).trim();
    return prods.filter(p =>
        (!q || norm(p.id).includes(q) || norm(p.nombre).includes(q) || norm(p.categoria).includes(q)) &&
        (!S.cat || p.categoria === S.cat) && (!S.bajo || p.stock <= p.minimo));
}
const categorias = prods => [...new Set(prods.map(p => p.categoria).filter(Boolean))].sort();
const opcionesCat = prods => '<option value="">Todas</option>' + categorias(prods).map(c => `<option ${c === S.cat ? "selected" : ""}>${esc(c)}</option>`).join("");

function buscarProducto(prods, texto) {
    const t = norm(texto).trim();
    if (!t) return { error: "Escribe el ID o el nombre del producto." };
    const r = prods.find(p => norm(p.id) === t) || prods.find(p => norm(p.nombre) === t);
    if (r) return { prod: r };
    const parc = prods.filter(p => norm(p.nombre).includes(t) || norm(p.id).includes(t));
    if (parc.length === 1) return { prod: parc[0] };
    if (parc.length > 1) return { error: "Varias coincidencias: " + parc.slice(0, 5).map(p => p.id + " " + p.nombre).join(", ") + ". Sé más específico." };
    return { error: "No se encontró ningún producto con ese ID o nombre." };
}

/* Carrito */
const claveCarrito = () => "tpos_carrito_" + S.u.id;
function guardarCarrito() {
    try { localStorage.setItem(claveCarrito(), JSON.stringify(S.carrito)); } catch (_) {}
    const n = S.carrito.reduce((a, c) => a + c.cantidad, 0);
    document.querySelectorAll(".n-carrito").forEach(e => (e.textContent = n || ""));
}
function agregarAlCarrito(prod, cant) {
    if (!Number.isSafeInteger(cant) || cant <= 0) return toast("Introduce una cantidad válida.", "error");
    const ya = S.carrito.find(c => c.pid === prod.pid);
    const total = (ya ? ya.cantidad : 0) + cant;
    if (total > prod.stock) return toast(`Solo hay ${prod.stock} pieza(s) de "${prod.nombre}" disponibles.`, "error");
    if (ya) ya.cantidad = total; else S.carrito.push({ pid: prod.pid, cantidad: cant });
    guardarCarrito();
    toast(`${cant} × ${prod.nombre} agregado al carrito.`, "ok");
}

/*Ticket */
function htmlTicket(t) {
    const pago = t.metodoPago === "tarjeta" ? "Tarjeta" + (t.tarjeta4 ? " •••• " + t.tarjeta4 : "")
        : t.metodoPago === "transferencia" ? "Transferencia" : t.metodoPago === "efectivo" ? "Efectivo" : "—";
    return `<div class="ticket">
        <div class="t-head"><strong>TIENDACHIKITIN</strong>Ticket de compra</div>
        ${t.estado === "anulado" ? '<div class="anulado">TICKET ANULADO</div>' : ""}
        <dl>
            <dt>Folio</dt><dd>${esc(t.folio)}</dd>
            <dt>Fecha</dt><dd>${esc(fecha(t.fecha))}</dd>
            <dt>Cliente</dt><dd>${esc(t.comprador)}</dd>
            <dt>Tipo</dt><dd>${t.tipo === "presencial" ? "Presencial" : "En línea"}</dd>
            ${t.tipo === "presencial" ? `<dt>Cajero</dt><dd>${esc(t.cajero)}</dd>` : ""}
            <dt>Pago</dt><dd>${esc(pago)}</dd>
            ${t.referencia ? `<dt>Referencia</dt><dd>${esc(t.referencia)}</dd>` : ""}
            ${t.metodoPago === "efectivo" ? `<dt>Recibido</dt><dd>${money(t.recibido)}</dd><dt>Cambio</dt><dd>${money(t.cambio)}</dd>` : ""}
        </dl>
        <table>
            <tr><th>Cant</th><th>Producto</th><th class="num">P.Unit</th><th class="num">Importe</th></tr>
            ${t.lineas.map(l => `<tr><td>${l.cantidad}</td><td>${esc(l.nombre)}<br><small>${esc(l.id)}</small>${l.oferta ? `<br><small>Oferta (antes ${money(l.precioLista)})</small>` : ""}</td><td class="num">${money(l.precio)}</td><td class="num">${money(l.subtotal)}</td></tr>`).join("")}
        </table>
        <div class="t-total"><span>TOTAL</span><span>${money(t.total)}</span></div>
        <div class="t-iva"><span>IVA incluido (16%)</span><span>${money(t.iva)}</span></div>
        <div class="t-pie">¡Gracias por su compra!</div>
    </div>`;
}

function mostrarTicket(t, puedeAnular = false) {
    modal(`<div class="modal-head"><h3>Ticket ${esc(t.folio)}</h3><button class="icon-btn" data-cerrar aria-label="Cerrar">${ic("x")}</button></div>
        <div style="height:12px"></div>
        ${htmlTicket(t)}
        <div class="modal-foot">
            ${puedeAnular && t.estado === "activo" ? '<button class="btn-danger" id="btnAnular">Anular ticket</button>' : ""}
            <button class="btn-ghost" data-cerrar>Cerrar</button>
            <button class="btn" id="btnImprimir">Imprimir</button>
        </div>`);
    $("#btnImprimir").onclick = () => window.print();
    const a = $("#btnAnular");
    if (a) a.onclick = async () => {
        if (!confirm("¿Anular este ticket? Las piezas regresarán al inventario.")) return;
        await intentar(async () => {
            await DB.anularTicket(t.folio);
            cerrarModal();
            toast("Ticket anulado y stock restaurado.", "ok");
            if (S.recargar) S.recargar();
        });
    };
}

/* Pago simulado */
const luhn = n => { let s = 0, alt = false; for (let i = n.length - 1; i >= 0; i--) { let d = +n[i]; if (alt) { d *= 2; if (d > 9) d -= 9; } s += d; alt = !alt; } return s % 10 === 0; };

function pedirPago(total, alConfirmar) {
    let metodo = "tarjeta";
    modal(`<form id="fPago" novalidate>
        <div class="modal-head"><h3>Pago · ${money(total)}</h3><button type="button" class="icon-btn" data-cerrar aria-label="Cerrar">${ic("x")}</button></div>
        <div class="modal-body">
            <div class="simulado">Pago <b>simulado</b>: no se hace ningún cargo real y nunca se guarda el número completo de la tarjeta. Prueba con <code>4242 4242 4242 4242</code>.</div>
            <div class="tabs"><button type="button" class="btn-ghost sel" data-m="tarjeta">💳 Tarjeta</button><button type="button" class="btn-ghost" data-m="transferencia">🏦 Transferencia</button></div>
            <div id="bxTarjeta">
                <div class="campo"><label>Número de tarjeta</label><input id="pNum" inputmode="numeric" autocomplete="off" maxlength="23" placeholder="0000 0000 0000 0000"></div>
                <div class="campo"><label>Nombre del titular</label><input id="pTit" maxlength="40" autocomplete="off"></div>
                <div class="fila2">
                    <div class="campo"><label>Vence (MM/AA)</label><input id="pVence" inputmode="numeric" maxlength="5" placeholder="12/29" autocomplete="off"></div>
                    <div class="campo"><label>CVV</label><input id="pCvv" type="password" inputmode="numeric" maxlength="4" autocomplete="off"></div>
                </div>
            </div>
            <div id="bxTransf" class="oculto">
                <p>Transfiere <b>${money(total)}</b> a la cuenta simulada:</p>
                <p><code>CLABE 000 000 0000000000 0</code><br>Beneficiario: Tiendachikitin</p>
                <p class="muted">Al confirmar se genera automáticamente una referencia SPEI para tu ticket.</p>
            </div>
        </div>
        <div class="modal-foot"><button type="button" class="btn-ghost" data-cerrar>Cancelar</button><button class="btn" type="submit" id="btnConfPago">Confirmar pago</button></div>
    </form>`);
    $("#fPago .tabs").onclick = e => {
        const b = e.target.closest("[data-m]"); if (!b) return;
        metodo = b.dataset.m;
        document.querySelectorAll("#fPago .tabs button").forEach(x => x.classList.toggle("sel", x === b));
        $("#bxTarjeta").classList.toggle("oculto", metodo !== "tarjeta");
        $("#bxTransf").classList.toggle("oculto", metodo !== "transferencia");
    };
    $("#pNum").oninput = e => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 19).replace(/(.{4})/g, "$1 ").trim(); };
    $("#pVence").oninput = e => { let v = e.target.value.replace(/\D/g, "").slice(0, 4); if (v.length > 2) v = v.slice(0, 2) + "/" + v.slice(2); e.target.value = v; };
    $("#fPago").onsubmit = async e => {
        e.preventDefault();
        const btn = $("#btnConfPago");
        try {
            let pago = { metodo };
            if (metodo === "tarjeta") {
                const num = $("#pNum").value.replace(/\D/g, "");
                if (num.length < 13 || !luhn(num)) throw new Error("El número de tarjeta no es válido.");
                if ($("#pTit").value.trim().length < 3) throw new Error("Escribe el nombre del titular.");
                const m = $("#pVence").value.match(/^(\d{2})\/(\d{2})$/);
                const hoy = new Date();
                if (!m || +m[1] < 1 || +m[1] > 12 || (2000 + +m[2]) * 12 + +m[1] < hoy.getFullYear() * 12 + hoy.getMonth() + 1) throw new Error("La fecha de vencimiento no es válida.");
                if (!/^\d{3,4}$/.test($("#pCvv").value)) throw new Error("El CVV no es válido.");
                pago.ult4 = num.slice(-4);
            }
            btn.disabled = true; btn.textContent = "Procesando pago…";
            await new Promise(r => setTimeout(r, 900));
            await alConfirmar(pago);
        } catch (err) { toast(err.message, "error"); btn.disabled = false; btn.textContent = "Confirmar pago"; }
    };
}

const VISTAS = {};

/* stats */
VISTAS.panel = async () => {
    const pintar = (prods, tks, us) => {
        const act = tks.filter(t => t.estado === "activo");
        const dia = d => new Date(d).toLocaleDateString("en-CA");
        const hoyK = dia(new Date());
        const deHoy = act.filter(t => dia(t.fecha) === hoyK);
        const suma = a => a.reduce((s, t) => s + t.total, 0);
        const bajos = prods.filter(p => p.stock > 0 && p.stock <= p.minimo), agotados = prods.filter(p => p.stock === 0);
        const valorInv = prods.reduce((s, p) => s + p.precio * p.stock, 0), costoInv = prods.reduce((s, p) => s + (p.costo || 0) * p.stock, 0);
        const utilidad = act.reduce((s, t) => s + t.lineas.reduce((a, l) => a + (l.precio - (l.costo || 0)) * l.cantidad, 0), 0);

        const dias = [];
        for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); dias.push(dia(d)); }
        const porDia = dias.map(k => { const v = suma(act.filter(t => dia(t.fecha) === k)); return { etq: k.slice(5), val: v, txt: money(v) }; });

        const acum = (arr, clave, valor) => { const m = {}; arr.forEach(x => { const k = clave(x); m[k] = (m[k] || 0) + valor(x); }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
        const porMetodo = acum(act, t => t.metodoPago || "—", t => t.total).map(([k, v]) => ({ etq: k, val: v, txt: money(v) }));
        const lineas = act.flatMap(t => t.lineas);
        const porCat = acum(lineas, l => l.categoria, l => l.subtotal).map(([k, v]) => ({ etq: k, val: v, txt: money(v) }));
        const stockCat = acum(prods, p => p.categoria, p => p.stock).map(([k, v]) => ({ etq: k, val: v, txt: v + " pzas" }));
        const topProd = acum(lineas, l => l.nombre + " (" + l.id + ")", l => l.cantidad).slice(0, 5).map(([k, v]) => ({ etq: k, val: v, txt: v + " pzas" }));
        const topComp = acum(act.filter(t => t.uid != null), t => t.comprador, t => t.total).slice(0, 5).map(([k, v]) => ({ etq: k, val: v, txt: money(v) }));
        const online = act.filter(t => t.tipo !== "presencial").length;

        $("#vista").innerHTML = `
            <div class="titulo-fila"><h1>Panel de estadísticas ${S.u.rol === "supervisor" ? '<span class="chip solo-lectura">Solo lectura</span>' : ""}</h1></div>
            <div class="stats">
                <div class="stat"><small>Ventas de hoy</small><strong>${money(suma(deHoy))}</strong></div>
                <div class="stat"><small>Tickets de hoy</small><strong>${deHoy.length}</strong></div>
                <div class="stat"><small>Ventas totales</small><strong>${money(suma(act))}</strong></div>
                <div class="stat"><small>Utilidad estimada</small><strong>${money(utilidad)}</strong></div>
                <div class="stat"><small>Valor del inventario (venta)</small><strong>${money(valorInv)}</strong></div>
                <div class="stat"><small>Costo del inventario</small><strong>${money(costoInv)}</strong></div>
                <div class="stat"><small>Productos / unidades</small><strong>${prods.length} / ${prods.reduce((s, p) => s + p.stock, 0)}</strong></div>
                <div class="stat ${bajos.length ? "alerta" : ""}"><small>Stock bajo</small><strong>${bajos.length}</strong></div>
                <div class="stat ${agotados.length ? "alerta" : ""}"><small>Agotados</small><strong>${agotados.length}</strong></div>
                <div class="stat"><small>Usuarios</small><strong>${us.length}</strong></div>
                <div class="stat"><small>Ventas en línea / presenciales</small><strong>${online} / ${act.length - online}</strong></div>
                <div class="stat"><small>Tickets anulados</small><strong>${tks.length - act.length}</strong></div>
            </div>
            <div class="dos-col">
                <div class="card"><h2>Ventas de los últimos 7 días</h2>${barras(porDia)}</div>
                <div class="card"><h2>Ventas por método de pago</h2>${barras(porMetodo)}</div>
                <div class="card"><h2>Ventas por categoría</h2>${barras(porCat)}</div>
                <div class="card"><h2>Existencias por categoría</h2>${barras(stockCat)}</div>
                <div class="card"><h2>Productos más vendidos</h2>${barras(topProd)}</div>
                <div class="card"><h2>Mejores compradores</h2>${barras(topComp)}</div>
                <div class="card"><h2>Stock bajo o agotado</h2>
                    ${bajos.length + agotados.length ? `<ul class="lista-simple">${[...agotados, ...bajos].slice(0, 8).map(p => `<li><span>${esc(p.nombre)} <code>${esc(p.id)}</code></span><span>${estadoStock(p)} ${p.stock} / mín. ${p.minimo}</span></li>`).join("")}</ul>${bajos.length + agotados.length > 8 ? '<p class="muted"><a href="#inventario">Ver todos en Inventario</a></p>' : ""}` : '<p class="muted">Todo el inventario está en niveles normales.</p>'}
                </div>
                <div class="card"><h2>Últimos tickets</h2>
                    ${tks.length ? `<ul class="lista-simple">${tks.slice(0, 6).map(t => `<li><span><a href="#ventas">${esc(t.folio)}</a> · ${esc(t.comprador)} · ${esc(fecha(t.fecha))}</span><span>${t.estado === "anulado" ? '<span class="badge mal">Anulado</span> ' : ""}${money(t.total)}</span></li>`).join("")}</ul>` : '<p class="muted">Aún no hay tickets.</p>'}
                </div>
            </div>`;
    };
    const cargar = async () => { const [p, t, u] = await Promise.all([DB.productos(), DB.tickets(), DB.usuarios()]); pintar(p, t, u); };
    await cargar();
    S.recargar = () => intentar(cargar);
};

/* inventario */
VISTAS.inventario = async () => {
    const admin = esAdmin(), costos = veCostos();
    let prods = await DB.productos();
    S.prods = prods;     // NUEVO: los formularios de imagen necesitan la lista para ofrecer productos parecidos
    $("#vista").innerHTML = `
        <div class="titulo-fila"><h1>Inventario ${admin ? "" : `<span class="chip solo-lectura">${costos ? "Solo lectura · puedes gestionar imágenes" : "Solo lectura"}</span>`}</h1>
            <div class="acciones">
                ${costos ? '<button class="btn-ghost" id="btnCsv">Exportar CSV</button>' : ""}
                ${admin ? '<button class="btn" id="btnNuevo">+ Nuevo producto</button>' : ""}
            </div>
        </div>
        <div class="chips" id="resumen"></div>
        <div class="filtros">
            <div class="ancho"><label>Buscar</label><input id="qVista" placeholder="ID, nombre o categoría" value="${esc(S.q)}"></div>
            <div><label>Categoría</label><select id="catVista"></select></div>
            <label class="check"><input type="checkbox" id="bajoVista" ${S.bajo ? "checked" : ""}> Solo stock bajo</label>
        </div>
        <div id="lista"></div>`;

    const cab = `<th></th><th>ID</th><th>Producto</th><th>Categoría</th><th class="num">Precio</th>${costos ? '<th class="num">Costo</th>' : ""}<th class="num">Stock</th>${costos ? '<th class="num">Mín.</th><th class="num">Vendidos</th>' : ""}<th>Estado</th>${costos ? "<th>Alta</th><th>Actualizado</th><th></th>" : ""}`;
    const T = tabla($("#lista"), {
        cab, vacio: "No hay productos que coincidan.",
        fila: p => `<tr><td><img class="thumb" src="${esc(imgProd(p))}" alt="" loading="lazy"></td>
            <td><code>${esc(p.id)}</code></td><td>${esc(p.nombre)}${p.descripcion ? `<br><small class="muted">${esc(p.descripcion.slice(0, 60))}${p.descripcion.length > 60 ? "…" : ""}</small>` : ""}</td><td>${esc(p.categoria)}</td>
            <td class="num">${htmlPrecio(p)}</td>${costos ? `<td class="num">${money(p.costo)}</td>` : ""}
            <td class="num"><strong>${p.stock}</strong></td>${costos ? `<td class="num">${p.minimo}</td><td class="num">${p.vendidos || 0}</td>` : ""}
            <td>${estadoStock(p)}</td>${costos ? `<td class="muted">${esc(fechaCorta(p.alta))}</td><td class="muted">${esc(fecha(p.actualizado))}</td>` : ""}
            ${costos ? `<td class="acc">${admin ? `<button class="btn-ghost btn-sm" data-act="stock" data-pid="${p.pid}">Stock</button><button class="btn-ghost btn-sm" data-act="editar" data-pid="${p.pid}">Editar</button><button class="btn-ghost btn-sm" data-act="oferta" data-pid="${p.pid}">${p.oferta ? "Oferta ✓" : "Oferta"}</button>` : ""}<button class="btn-ghost btn-sm" data-act="lotes" data-pid="${p.pid}">Lotes</button><button class="btn-ghost btn-sm" data-act="imagenes" data-pid="${p.pid}">Imágenes</button>${admin ? `<button class="btn-danger btn-sm" data-act="borrar" data-pid="${p.pid}">Eliminar</button>` : ""}</td>` : ""}</tr>`
    });
    const aplicar = (reiniciar = true) => {
        T.set(filtrarProductos(prods), reiniciar);
        $("#resumen").innerHTML = `<span class="chip">Productos: <b>${prods.length}</b></span><span class="chip">Unidades: <b>${prods.reduce((s, p) => s + p.stock, 0)}</b></span><span class="chip">Stock bajo: <b>${prods.filter(p => p.stock > 0 && p.stock <= p.minimo).length}</b></span><span class="chip">Agotados: <b>${prods.filter(p => p.stock === 0).length}</b></span>`;
    };
    $("#catVista").innerHTML = opcionesCat(prods);
    aplicar();

    const recargar = async () => { prods = await DB.productos(); S.prods = prods; $("#catVista").innerHTML = opcionesCat(prods); aplicar(false); };
    S.recargar = () => intentar(recargar);
    S.buscar = () => { $("#qVista").value = S.q; aplicar(); };
    $("#qVista").oninput = e => { S.q = e.target.value; $("#q").value = S.q; aplicar(); };
    $("#catVista").onchange = e => { S.cat = e.target.value; aplicar(); };
    $("#bajoVista").onchange = e => { S.bajo = e.target.checked; aplicar(); };

    if (costos) $("#btnCsv").onclick = () => csv("inventario.csv", [
        ["ID", "Producto", "Categoría", "Descripción", "Precio", "Costo", "Stock", "Mínimo", "Vendidos", "Fecha de alta", "Precio de oferta", "Actualizado"],
        ...prods.map(p => [p.id, p.nombre, p.categoria, p.descripcion, p.precio, p.costo, p.stock, p.minimo, p.vendidos, p.alta, p.oferta ? p.oferta.precio : "", p.actualizado])
    ]);
    if (admin) $("#btnNuevo").onclick = () => formProducto(null, categorias(prods), recargar);
    if (costos) {
        $("#lista").addEventListener("click", async e => {
            const b = e.target.closest("[data-act]");
            if (!b) return;
            const prod = prods.find(p => p.pid === Number(b.dataset.pid));
            if (!prod) return;
            if (b.dataset.act === "lotes") return modalLotes(prod);
            if (b.dataset.act === "imagenes") return formImagenes(prod, recargar);
            if (!admin) return;
            if (b.dataset.act === "stock") formStock(prod, recargar);
            if (b.dataset.act === "editar") formProducto(prod, categorias(prods), recargar);
            if (b.dataset.act === "oferta") formOferta(prod, recargar);
            if (b.dataset.act === "borrar") {
                if (!confirm(`¿Eliminar "${prod.nombre}" del inventario? Esta acción no se puede deshacer.`)) return;
                await intentar(async () => { await DB.eliminarProducto(prod.pid); toast("Producto eliminado.", "ok"); await recargar(); });
            }
        });
    }
};

/* NUEVO: productos de la misma subcategoría que tienen imagen propia (candidatos para "usar su imagen") */
function candidatosImagen(sub, pid) {
    const k = String(sub || "").trim().toLowerCase();
    if (!k) return [];
    return S.prods.filter(x => x.pid !== pid && x.imagen && String(x.subcategoria || "").trim().toLowerCase() === k);
}
/* NUEVO: cuadrícula para elegir de qué producto parecido se toma la imagen (sel = pid elegido o null) */
function htmlParecidos(cands, sel) {
    if (!cands.length) return '<p class="nota-form">Aún no hay otros productos con imagen en esta subcategoría.</p>';
    return `<div class="rel-grid">
        <button type="button" class="rel-item ${sel ? "" : "sel"}" data-rel=""><span class="rel-ning">Ninguno</span></button>
        ${cands.map(x => `<button type="button" class="rel-item ${sel === x.pid ? "sel" : ""}" data-rel="${x.pid}" title="${esc(x.nombre)}"><img src="${esc(x.imagen)}" alt=""><small>${esc(x.nombre)}</small></button>`).join("")}
    </div>`;
}
const subcategorias = lista => [...new Set(lista.map(p => (p.subcategoria || "").trim()).filter(Boolean))].sort();

function formProducto(p, cats, alGuardar) {
    const nuevo = !p;
    p = p || { id: "", nombre: "", categoria: "", subcategoria: "", descripcion: "", precio: "", costo: "", stock: 0, minimo: 5, imagen: "", imagenDe: null };
    let imagen;                       // undefined = sin cambios; "" = quitar; otro = imagen nueva
    let rel = p.imagenDe || null;     // NUEVO: pid del producto parecido cuya imagen se usa
    let relManual = !nuevo;           // NUEVO: si el usuario ya decidió (evita sugerir otra vez)
    const hoyISO = new Date().toLocaleDateString("en-CA");
    modal(`<form id="fp" novalidate>
        <div class="modal-head"><h3>${nuevo ? "Nuevo producto" : "Editar producto"}</h3><button type="button" class="icon-btn" data-cerrar aria-label="Cerrar">${ic("x")}</button></div>
        <div class="modal-body"><div class="form-grid">
            <div class="campo"><label>ID</label><input id="fId" value="${esc(p.id)}" maxlength="30" required></div>
            <div class="campo"><label>Categoría</label><input id="fCat" list="dlCats" value="${esc(p.categoria)}" maxlength="40"><datalist id="dlCats">${cats.map(c => `<option value="${esc(c)}">`).join("")}</datalist></div>
            <div class="campo ancho"><label>Subcategoría (agrupa productos parecidos, p. ej. «Computadoras»)</label><input id="fSub" list="dlSubs" value="${esc(p.subcategoria || "")}" maxlength="40" placeholder="Opcional"><datalist id="dlSubs">${subcategorias(S.prods).map(c => `<option value="${esc(c)}">`).join("")}</datalist></div>
            <div class="campo ancho"><label>Nombre</label><input id="fNom" value="${esc(p.nombre)}" maxlength="80" required></div>
            <div class="campo ancho"><label>Descripción</label><textarea id="fDes" maxlength="500">${esc(p.descripcion)}</textarea></div>
            <div class="campo"><label>Precio de venta</label><input id="fPre" type="number" min="0.01" step="0.01" value="${esc(p.precio)}" required></div>
            <div class="campo"><label>Costo</label><input id="fCos" type="number" min="0" step="0.01" value="${esc(p.costo)}" required></div>
            <div class="campo"><label>Stock</label><input id="fSto" type="number" min="0" step="1" value="${esc(p.stock)}" required></div>
            <div class="campo"><label>Stock mínimo (alerta)</label><input id="fMin" type="number" min="0" step="1" value="${esc(p.minimo)}" required></div>
            <div class="campo"><label>Fecha de alta ${nuevo ? "(después no se puede cambiar)" : "(no se puede modificar)"}</label>${nuevo ? `<input id="fAlta" type="date" value="${hoyISO}" max="${hoyISO}" required>` : `<input value="${esc(fechaCorta(p.alta))}" disabled>`}</div>
            <div class="campo ancho"><label>Imagen</label>
                <div class="u-cell"><img class="thumb grande" id="fPrev" src="${esc(imgProd(p))}" alt=""><div><input id="fImg" type="file" accept="image/*"><button type="button" class="btn-ghost btn-sm" id="fQuitar" style="margin-top:6px">Quitar imagen</button></div></div>
            </div>
            <div class="campo ancho" id="fRelBox"><label>O usar la imagen de un producto parecido (misma subcategoría)</label><div id="fRel"></div></div>
        </div></div>
        <div class="modal-foot"><button type="button" class="btn-ghost" data-cerrar>Cancelar</button><button class="btn" type="submit">Guardar</button></div>
    </form>`);
    /* NUEVO: imagen propia (subida) > imagen de un producto parecido > ilustración por defecto */
    const tieneProp = () => (imagen !== undefined ? !!imagen : !!p.imagen);
    const refrescar = () => {
        const cands = candidatosImagen($("#fSub").value, p.pid);
        if (rel && !cands.some(x => x.pid === rel)) rel = null;                       // cambió de subcategoría: la relación ya no aplica
        if (!relManual && !rel && !tieneProp() && cands.length) rel = cands[0].pid;   // producto nuevo: se sugiere automáticamente uno parecido
        const origen = cands.find(x => x.pid === rel);
        $("#fRelBox").style.display = $("#fSub").value.trim() && !tieneProp() ? "" : "none";
        $("#fRel").innerHTML = htmlParecidos(cands, rel);
        $("#fRel").querySelectorAll("[data-rel]").forEach(b => b.onclick = () => { rel = b.dataset.rel ? Number(b.dataset.rel) : null; relManual = true; refrescar(); });
        $("#fPrev").src = (imagen !== undefined ? imagen : p.imagen) || (origen && origen.imagen) || imgProd({ categoria: $("#fCat").value.trim() });
    };
    $("#fImg").onchange = async e => intentar(async () => { const v = await imagenADataURL(e.target.files[0], 600); if (v) { imagen = v; rel = null; refrescar(); } });
    $("#fQuitar").onclick = () => { imagen = ""; $("#fImg").value = ""; relManual = false; refrescar(); };
    $("#fSub").oninput = () => { relManual = false; refrescar(); };
    refrescar();
    $("#fp").onsubmit = async e => {
        e.preventDefault();
        await intentar(async () => {
            await DB.guardarProducto({
                pid: p.pid, id: $("#fId").value, nombre: $("#fNom").value, categoria: $("#fCat").value, subcategoria: $("#fSub").value, descripcion: $("#fDes").value,
                precio: Number($("#fPre").value), costo: Number($("#fCos").value), stock: Number($("#fSto").value), minimo: Number($("#fMin").value),
                imagen, imagenDe: tieneProp() ? null : rel, alta: nuevo ? $("#fAlta").value : undefined
            }, nuevo);
            cerrarModal();
            toast(nuevo ? "Producto agregado." : "Producto actualizado.", "ok");
            await cargarImgRel();
            await alGuardar();
        });
    };
}

function formStock(p, alGuardar) {
    modal(`<form id="fs" novalidate>
        <div class="modal-head"><h3>Ajustar stock</h3><button type="button" class="icon-btn" data-cerrar aria-label="Cerrar">${ic("x")}</button></div>
        <div class="modal-body">
            <p><strong>${esc(p.nombre)}</strong> <code>${esc(p.id)}</code><br><span class="muted">Existencias actuales: ${p.stock}</span></p>
            <div class="campo"><label>Tipo de movimiento</label><select id="sTipo"><option value="1">Entrada (suma piezas)</option><option value="-1">Salida / merma (resta piezas)</option></select></div>
            <div class="campo"><label>Cantidad</label><input id="sCant" type="number" min="1" step="1" required></div>
            <div class="campo" id="bxCosto"><label>Costo unitario de este lote (opcional)</label><input id="sCosto" type="number" min="0" step="0.01" placeholder="Vacío = costo actual del producto"></div>
            <p class="nota-form">PEPS: cada entrada crea un lote nuevo y las salidas y ventas descuentan primero del lote más antiguo.</p>
            <div class="campo"><label>Nota (opcional)</label><input id="sNota" maxlength="120" placeholder="Ej. Reabasto de proveedor, producto dañado"></div>
        </div>
        <div class="modal-foot"><button type="button" class="btn-ghost" data-cerrar>Cancelar</button><button class="btn" type="submit">Aplicar</button></div>
    </form>`);
    $("#sTipo").onchange = () => $("#bxCosto").classList.toggle("oculto", $("#sTipo").value !== "1");
    $("#fs").onsubmit = async e => {
        e.preventDefault();
        await intentar(async () => {
            await DB.ajustarStock(p.pid, Number($("#sTipo").value) * Number($("#sCant").value), $("#sNota").value.trim(), $("#sCosto").value);
            cerrarModal(); toast("Stock actualizado.", "ok"); await alGuardar();
        });
    };
}

/* ---------- Ofertas (solo el administrador) ---------- */
function formOferta(p, alGuardar) {
    const libre = !p.vendidoNormal;     // NUEVO: se puede poner/cambiar/quitar a voluntad mientras no se haya vendido a precio normal
    modal(`<form id="fo" novalidate>
        <div class="modal-head"><h3>Oferta · ${esc(p.nombre)}</h3><button type="button" class="icon-btn" data-cerrar aria-label="Cerrar">${ic("x")}</button></div>
        <div class="modal-body">
            <p style="margin-top:0">Precio normal: <b>${money(p.precio)}</b>${p.oferta ? `<br>Oferta actual: <b class="acento">${money(p.oferta.precio)}</b>${p.oferta.tipo === "porcentaje" ? ` (−${p.oferta.valor} %)` : ""}` : ""}</p>
            ${libre ? `
            <div class="campo"><label>Tipo de oferta</label><select id="oTipo"><option value="porcentaje">Porcentaje de descuento</option><option value="precio">Precio especial</option></select></div>
            <div class="campo"><label id="oEtq">Descuento (%)</label><input id="oValor" type="number" min="0.01" step="0.01" required></div>
            <p class="nota-form" id="oVista"></p>
            <p class="nota-form">El cajero verá la oferta y las ventas se cobrarán al precio de oferta. Puedes ponerla, cambiarla o quitarla cuando quieras mientras el producto no se haya vendido a precio normal (ideal para productos de baja demanda).</p>`
            : `<div class="error-msg">Este producto ya tuvo ventas a precio normal, así que no puede ponerse en oferta.${p.oferta ? " Su oferta actual sigue activa hasta que la quites." : ""}</div>`}
        </div>
        <div class="modal-foot"><button type="button" class="btn-ghost" data-cerrar>Cerrar</button>
            ${p.oferta ? '<button type="button" class="btn-danger" id="oQuitar">Quitar oferta</button>' : ""}
            ${libre ? '<button class="btn" type="submit">Guardar oferta</button>' : ""}</div>
    </form>`);
    if (libre) {
        const calc = () => {
            const t = $("#oTipo").value, v = Number($("#oValor").value);
            $("#oEtq").textContent = t === "porcentaje" ? "Descuento (%)" : "Precio de oferta ($)";
            const precio = t === "porcentaje" ? Math.round(p.precio * (1 - v / 100) * 100) / 100 : v;
            $("#oVista").textContent = v > 0 && precio > 0 && precio < p.precio ? "Se venderá a " + money(precio) + "." : "";
        };
        $("#oTipo").onchange = calc; $("#oValor").oninput = calc;
        if (p.oferta) { $("#oTipo").value = p.oferta.tipo; $("#oValor").value = p.oferta.valor; }
        calc();
        $("#fo").onsubmit = e => {
            e.preventDefault();
            intentar(async () => {
                await DB.ponerOferta({ pid: p.pid, tipo: $("#oTipo").value, valor: Number($("#oValor").value) });
                cerrarModal(); toast("Oferta guardada.", "ok"); await alGuardar();
            });
        };
    }
    const q = $("#oQuitar");
    if (q) q.onclick = () => {
        if (!confirm("¿Quitar la oferta de \"" + p.nombre + "\"? Volverá a su precio normal.")) return;
        intentar(async () => { await DB.quitarOferta(p.pid); cerrarModal(); toast("Oferta quitada.", "ok"); await alGuardar(); });
    };
}

/* ---------- Lotes PEPS (admin / supervisor) ---------- */
function modalLotes(p) {
    const lotes = p.lotes || [];
    const sig = lotes.find(l => l.restante > 0);
    modal(`<div class="modal-head"><h3>Lotes · ${esc(p.nombre)}</h3><button class="icon-btn" data-cerrar aria-label="Cerrar">${ic("x")}</button></div>
        <div class="modal-body">
            <p class="muted" style="margin-top:0">PEPS (primeras entradas, primeras salidas): las ventas y salidas descuentan primero del lote más antiguo que aún tenga piezas. Alta del producto: <b>${esc(fechaCorta(p.alta))}</b>.</p>
            <div class="tabla-wrap"><table style="min-width:0"><thead><tr><th>Lote</th><th>Ingreso</th><th class="num">Entró</th><th class="num">Quedan</th><th class="num">Costo</th><th></th></tr></thead><tbody>
            ${lotes.length ? lotes.map(l => `<tr class="${sig && l.lid === sig.lid ? "lote-sig" : ""}"><td>#${l.lid}</td><td>${esc(fechaCorta(l.fecha))}</td><td class="num">${l.cantidad}</td><td class="num"><strong>${l.restante}</strong></td><td class="num">${money(l.costo)}</td>
                <td>${l.restante === 0 ? '<span class="badge mal">Agotado</span>' : sig && l.lid === sig.lid ? '<span class="badge warn">Sale primero</span>' : '<span class="badge ok">En espera</span>'}</td></tr>`).join("") : '<tr><td colspan="6" class="vacio">Sin lotes todavía.</td></tr>'}
            </tbody></table></div>
        </div>
        <div class="modal-foot"><button class="btn-ghost" data-cerrar>Cerrar</button></div>`);
}

/* ---------- Imágenes del producto y de la categoría (admin / supervisor) ---------- */
async function formImagenes(p, alGuardar) {
    let r;
    try { r = await DB.galeria(p.pid); } catch (e) { return toast(e.message, "error"); }
    let principal = r.imagen, galeria = r.galeria.slice(), tp = false, tg = false;
    let rel = p.imagenDe || null, tr = false;      // NUEVO: producto parecido cuya imagen se usa (tr = cambió)
    const MAX = 6;
    const pintar = () => {
        modal(`<div class="modal-head"><h3>Imágenes · ${esc(p.nombre)}</h3><button type="button" class="icon-btn" data-cerrar aria-label="Cerrar">${ic("x")}</button></div>
        <div class="modal-body">
            <label>Imagen principal</label>
            <div class="u-cell"><img class="thumb grande" src="${esc(imgProd({ categoria: p.categoria, imagen: principal, imagenDe: rel }))}" alt=""><div><input id="gPrin" type="file" accept="image/*"><button type="button" class="btn-ghost btn-sm" id="gQuitarPrin" style="margin-top:6px">Quitar imagen propia</button></div></div>
            ${p.subcategoria ? `<div id="gRelBox" ${principal ? 'class="oculto"' : ""}><label style="margin-top:10px">O usar la imagen de un producto parecido (subcategoría «${esc(p.subcategoria)}»)</label>${htmlParecidos(candidatosImagen(p.subcategoria, p.pid), rel)}</div>` : '<p class="nota-form">Asigna una subcategoría al producto (Editar) para poder usar la imagen de un producto parecido.</p>'}
            <label style="margin-top:14px">Galería (${galeria.length}/${MAX}) · imágenes extra que se muestran en el detalle del producto</label>
            <div class="gal-edit">${galeria.map((g, i) => `<div class="gal-item"><img src="${esc(g)}" alt=""><button type="button" data-qi="${i}" aria-label="Quitar imagen">×</button></div>`).join("")}</div>
            <input id="gAgregar" type="file" accept="image/*" multiple ${galeria.length >= MAX ? "disabled" : ""}>
        </div>
        <div class="modal-foot"><button type="button" class="btn-ghost" data-cerrar>Cancelar</button><button type="button" class="btn" id="gGuardar">Guardar</button></div>`);
        $("#gPrin").onchange = e => intentar(async () => { const v = await imagenADataURL(e.target.files[0], 600); if (v) { principal = v; tp = true; rel = null; tr = true; pintar(); } });
        $("#gQuitarPrin").onclick = () => { principal = ""; tp = true; pintar(); };
        document.querySelectorAll("#gRelBox [data-rel]").forEach(b => b.onclick = () => { rel = b.dataset.rel ? Number(b.dataset.rel) : null; tr = true; pintar(); });
        $("#gAgregar").onchange = e => intentar(async () => {
            for (const f of [...e.target.files].slice(0, MAX - galeria.length)) { const v = await imagenADataURL(f, 600); if (v) { galeria.push(v); tg = true; } }
            pintar();
        });
        document.querySelectorAll("#modal [data-qi]").forEach(b => b.onclick = () => { galeria.splice(Number(b.dataset.qi), 1); tg = true; pintar(); });
        $("#gGuardar").onclick = () => intentar(async () => {
            if (!tp && !tg && !tr) return cerrarModal();
            await DB.guardarImagenes({ pid: p.pid, imagen: tp ? principal : undefined, galeria: tg ? galeria : undefined, imagenDe: (tr || tp) ? (principal ? null : rel) : undefined });
            cerrarModal(); toast("Imágenes guardadas.", "ok"); await cargarImgRel(); await alGuardar();
        });
    };
    pintar();
}

/* ---------- Catálogo (comprador) ---------- */
function detalleProducto(p) {
    modal(`<img class="detalle-img" id="dImg" src="${esc(imgProd(p))}" alt="${esc(p.nombre)}">
        <div class="galeria oculto" id="dGal" style="padding:0 20px"></div>
        <div class="modal-head"><h3>${esc(p.nombre)}</h3><button class="icon-btn" data-cerrar aria-label="Cerrar">${ic("x")}</button></div>
        <div class="modal-body">
            <small class="muted">${esc(p.categoria)} · <code>${esc(p.id)}</code></small>
            <div class="precio" style="font-size:24px;font-weight:700;color:var(--accent);margin:6px 0">${htmlPrecio(p)}</div>
            <p>${esc(p.descripcion || "Sin descripción.")}</p>
            <div>${estadoStock(p)} <span class="muted">${p.stock} en stock</span></div>
        </div>
        <div class="modal-foot"><input id="dCant" type="number" min="1" max="${p.stock}" value="1" style="width:80px" ${p.stock === 0 ? "disabled" : ""}><button class="btn" id="dAdd" ${p.stock === 0 ? "disabled" : ""}>Agregar al carrito</button></div>`);
    $("#dAdd").onclick = () => { agregarAlCarrito(p, Number($("#dCant").value)); cerrarModal(); };
    if (p.nGaleria) intentar(async () => {        // imágenes extra que el administrador o supervisor eligió mostrar
        const g = (await DB.galeria(p.pid)).galeria;
        if (!g.length || !$("#dGal")) return;
        const todas = [imgProd(p), ...g];
        $("#dGal").classList.remove("oculto");
        $("#dGal").innerHTML = todas.map((s, i) => `<img src="${esc(s)}" data-i="${i}" class="${i === 0 ? "sel" : ""}" alt="">`).join("");
        $("#dGal").onclick = e => {
            const im = e.target.closest("img"); if (!im) return;
            $("#dImg").src = todas[Number(im.dataset.i)];
            $("#dGal").querySelectorAll("img").forEach(x => x.classList.toggle("sel", x === im));
        };
    });
}

VISTAS.catalogo = async () => {
    let prods = await DB.productos();
    $("#vista").innerHTML = `
        <div class="titulo-fila"><h1>Catálogo</h1></div>
        <div class="card">
            <h2>Compra rápida</h2>
            <form class="rapido" id="fRapido" autocomplete="off">
                <div><label>ID o nombre del producto</label><input id="rId" list="dlProd" placeholder="Ej. PER-001 o Teclado Básico"></div>
                <div><label>Cantidad</label><input id="rCant" type="number" min="1" step="1" value="1"></div>
                <button class="btn" type="submit">Agregar al carrito</button>
            </form>
            <datalist id="dlProd"></datalist>
        </div>
        <div class="filtros">
            <div class="ancho"><label>Buscar</label><input id="qVista" placeholder="ID, nombre o categoría" value="${esc(S.q)}"></div>
            <div><label>Categoría</label><select id="catVista"></select></div>
        </div>
        <div id="lista"></div>`;

    const G = paginado($("#lista"), {
        tam: 24,
        render: (sl, todos) => todos.length ? `<div class="grid-prod">${sl.map(p => `<div class="prod">
            <img class="prod-img clic" data-ver="${p.pid}" src="${esc(imgProd(p))}" alt="${esc(p.nombre)}" loading="lazy">
            <small class="muted">${esc(p.categoria)} · <code>${esc(p.id)}</code></small>
            <h3 class="clic" data-ver="${p.pid}">${esc(p.nombre)}</h3>
            <p class="desc">${esc(p.descripcion)}</p>
            <div class="precio">${htmlPrecio(p)}</div>
            <div>${estadoStock(p)} <span class="muted">${p.stock} en stock</span></div>
            <div class="fila"><input type="number" min="1" max="${p.stock}" step="1" value="1" ${p.stock === 0 ? "disabled" : ""} aria-label="Cantidad"><button class="btn" data-add="${p.pid}" ${p.stock === 0 ? "disabled" : ""}>Agregar</button></div></div>`).join("")}</div>`
            : '<div class="card vacio">No hay productos que coincidan.</div>'
    });
    const aplicar = (reiniciar = true) => G.set(filtrarProductos(prods), reiniciar);
    const llenar = () => {
        $("#catVista").innerHTML = opcionesCat(prods);
        $("#dlProd").innerHTML = prods.map(p => `<option value="${esc(p.id)}">${esc(p.nombre)}</option>`).join("");
    };
    llenar(); aplicar();

    S.recargar = () => intentar(async () => { prods = await DB.productos(); llenar(); aplicar(false); });
    S.buscar = () => { $("#qVista").value = S.q; aplicar(); };
    $("#qVista").oninput = e => { S.q = e.target.value; $("#q").value = S.q; aplicar(); };
    $("#catVista").onchange = e => { S.cat = e.target.value; aplicar(); };

    $("#lista").addEventListener("click", e => {
        const v = e.target.closest("[data-ver]");
        if (v) return detalleProducto(prods.find(p => p.pid === Number(v.dataset.ver)));
        const b = e.target.closest("[data-add]");
        if (!b) return;
        agregarAlCarrito(prods.find(p => p.pid === Number(b.dataset.add)), Number(b.parentElement.querySelector("input").value));
    });
    $("#fRapido").onsubmit = async e => {
        e.preventDefault();
        await intentar(async () => {
            prods = await DB.productos();
            const r = buscarProducto(prods, $("#rId").value);
            if (r.error) return toast(r.error, "error");
            agregarAlCarrito(r.prod, Number($("#rCant").value));
            $("#rId").value = ""; $("#rCant").value = 1; $("#rId").focus();
        });
    };
};

/* ---------- Carrito (comprador) ---------- */
VISTAS.carrito = async () => {
    let mapa = new Map((await DB.productos()).map(p => [p.pid, p]));
    const pintar = () => {
        const lineas = S.carrito.map(c => ({ ...c, p: mapa.get(c.pid) }));
        const total = lineas.reduce((s, l) => s + (l.p ? pv(l.p) * l.cantidad : 0), 0);
        const problema = lineas.some(l => !l.p || l.cantidad > l.p.stock);
        $("#vista").innerHTML = `
            <div class="titulo-fila"><h1>Carrito</h1>
                <div class="acciones">${lineas.length ? '<button class="btn-ghost" id="btnVaciar">Vaciar carrito</button>' : ""}<a class="btn-outline btn" href="#catalogo" style="color:var(--text)">Seguir comprando</a></div>
            </div>
            ${lineas.length ? `
            <div class="tabla-wrap"><table>
                <tr><th></th><th>ID</th><th>Producto</th><th class="num">Precio</th><th>Cantidad</th><th class="num">Importe</th><th></th></tr>
                ${lineas.map(l => l.p ? `<tr>
                    <td><img class="thumb" src="${esc(imgProd(l.p))}" alt=""></td>
                    <td><code>${esc(l.p.id)}</code></td><td>${esc(l.p.nombre)}${l.cantidad > l.p.stock ? `<br><span class="badge mal">Solo hay ${l.p.stock}</span>` : ""}</td>
                    <td class="num">${htmlPrecio(l.p)}</td>
                    <td><div class="cant-ctl"><button class="btn-ghost" data-menos="${l.pid}">−</button><input type="number" min="1" step="1" value="${l.cantidad}" data-cant="${l.pid}"><button class="btn-ghost" data-mas="${l.pid}">+</button></div></td>
                    <td class="num">${money(pv(l.p) * l.cantidad)}</td>
                    <td class="acc"><button class="btn-danger btn-sm" data-quitar="${l.pid}">Quitar</button></td></tr>`
                    : `<tr><td></td><td colspan="5"><span class="badge mal">Un producto ya no está disponible</span></td><td class="acc"><button class="btn-danger btn-sm" data-quitar="${l.pid}">Quitar</button></td></tr>`).join("")}
            </table></div>
            <div class="card" style="margin-top:16px">
                <div class="total-box"><span>Total a pagar</span><span>${money(total)}</span></div>
                <p class="muted" style="text-align:right;margin:0 4px 14px">IVA incluido</p>
                <div style="text-align:right"><button class="btn" id="btnPagar" ${problema ? "disabled" : ""}>Pagar y generar ticket</button></div>
                ${problema ? '<p class="muted" style="text-align:right;margin:8px 0 0">Corrige las cantidades marcadas para continuar.</p>' : ""}
            </div>` : '<div class="card vacio">Tu carrito está vacío. <a href="#catalogo">Ir al catálogo</a></div>'}`;
    };
    pintar();
    S.recargar = () => intentar(async () => { mapa = new Map((await DB.productos()).map(p => [p.pid, p])); if (!$("#modal").open) pintar(); });

    const v = $("#vista");
    v.onclick = e => {
        const b = e.target.closest("button");
        if (!b) return;
        const ajustar = (pid, d) => {
            const c = S.carrito.find(x => x.pid === pid), p = mapa.get(pid);
            if (!c) return;
            c.cantidad = Math.max(1, c.cantidad + d);
            if (p && c.cantidad > p.stock) { c.cantidad = Math.max(1, p.stock); toast(`Máximo disponible: ${p.stock}.`, "error"); }
            guardarCarrito(); pintar();
        };
        if (b.dataset.mas) ajustar(Number(b.dataset.mas), 1);
        if (b.dataset.menos) ajustar(Number(b.dataset.menos), -1);
        if (b.dataset.quitar) { S.carrito = S.carrito.filter(c => c.pid !== Number(b.dataset.quitar)); guardarCarrito(); pintar(); }
        if (b.id === "btnVaciar") { S.carrito = []; guardarCarrito(); pintar(); }
        if (b.id === "btnPagar") {
            const total = S.carrito.reduce((s, c) => s + (mapa.get(c.pid) ? pv(mapa.get(c.pid)) * c.cantidad : 0), 0);
            pedirPago(total, async pago => {
                const t = await DB.crearTicket({ items: S.carrito.map(c => ({ pid: c.pid, cantidad: c.cantidad })), pago });
                S.carrito = []; guardarCarrito();
                toast("¡Compra realizada!", "ok");
                mostrarTicket(t);
                mapa = new Map((await DB.productos()).map(p => [p.pid, p]));
                pintar();
            });
        }
    };
    v.onchange = e => {
        const i = e.target.closest("[data-cant]");
        if (!i) return;
        const c = S.carrito.find(x => x.pid === Number(i.dataset.cant)), n = Number(i.value), p = mapa.get(c.pid);
        if (!Number.isSafeInteger(n) || n < 1) { toast("Cantidad no válida.", "error"); return pintar(); }
        c.cantidad = p ? Math.min(n, p.stock) : n;
        if (p && n > p.stock) toast(`Máximo disponible: ${p.stock}.`, "error");
        guardarCarrito(); pintar();
    };
};

/* ---------- Caja (cajero): venta presencial ---------- */
VISTAS.caja = async () => {
    let prods = await DB.productos();
    let m = new Map(prods.map(p => [p.pid, p]));
    let lineas = [];
    const total = () => lineas.reduce((s, l) => s + pv(m.get(l.pid)) * l.cantidad, 0);

    $("#vista").innerHTML = `
        <div class="titulo-fila"><h1>Caja · venta presencial</h1></div>
        <div class="caja-grid">
            <div>
                <div class="card">
                    <form id="fScan" autocomplete="off">
                        <label>Escanea el código de barras o escribe el ID / nombre</label>
                        <input id="scan" list="dlScan" placeholder="Ej. PAN-024">
                        <datalist id="dlScan"></datalist>
                    </form>
                    <button class="btn-ghost btn-sm" id="btnCamara" style="margin-top:8px">Usar cámara</button>
                    <video id="cam" class="oculto" playsinline muted style="width:100%;margin-top:8px;border-radius:6px"></video>
                </div>
                <div class="card scan-card" id="ultimo"><span class="muted">Aún no se ha escaneado ningún producto.</span></div>
                <div id="ticketCaja"></div>
            </div>
            <div class="card">
                <h2>Cobro</h2>
                <div class="total-box"><span>Total</span><span id="cTotal">$0.00</span></div>
                <div class="campo"><label>Cliente (opcional)</label><input id="cCliente" placeholder="Mostrador" maxlength="40"></div>
                <div class="campo"><label>¿Con qué pagó?</label>
                    <select id="cMetodo"><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="transferencia">Transferencia</option></select></div>
                <div class="campo" id="bxEfectivo"><label>Efectivo recibido</label><input id="cRecibido" type="number" min="0" step="0.01"><p class="muted" id="cCambio">Cambio: $0.00</p></div>
                <div class="campo oculto" id="bxRef"><label>Referencia / autorización (opcional)</label><input id="cRef" maxlength="40"></div>
                <button class="btn" id="btnCobrar" style="width:100%">Cobrar y generar ticket</button>
                <button class="btn-ghost" id="btnLimpiar" style="width:100%;margin-top:8px">Cancelar venta</button>
            </div>
        </div>`;
    const llenar = () => { $("#dlScan").innerHTML = prods.map(p => `<option value="${esc(p.id)}">${esc(p.nombre)}</option>`).join(""); };
    llenar();

    const actualizarCambio = () => {
        const mt = $("#cMetodo").value;
        $("#bxEfectivo").classList.toggle("oculto", mt !== "efectivo");
        $("#bxRef").classList.toggle("oculto", mt === "efectivo");
        $("#cCambio").textContent = "Cambio: " + money(Math.max(0, Number($("#cRecibido").value || 0) - total()));
    };
    const pintarLineas = () => {
        lineas = lineas.filter(l => m.has(l.pid));
        $("#ticketCaja").innerHTML = lineas.length ? `<div class="tabla-wrap"><table>
            <tr><th>Cant</th><th>Producto</th><th class="num">P.Unit</th><th class="num">Importe</th><th></th></tr>
            ${lineas.map(l => { const p = m.get(l.pid); return `<tr><td><input type="number" min="1" max="${p.stock}" value="${l.cantidad}" data-qty="${l.pid}" style="width:64px;padding:6px"></td><td>${esc(p.nombre)}<br><code>${esc(p.id)}</code></td>
                <td class="num">${htmlPrecio(p)}</td><td class="num">${money(pv(p) * l.cantidad)}</td>
                <td class="acc"><button class="btn-danger btn-sm" data-quitar="${l.pid}" aria-label="Quitar">×</button></td></tr>`; }).join("")}
        </table></div>` : '<div class="tabla-wrap"><div class="vacio">Sin productos en la venta.</div></div>';
        $("#cTotal").textContent = money(total());
        actualizarCambio();
    };
    const escanear = texto => {
        const box = $("#ultimo");
        const r = buscarProducto(prods, texto);
        if (r.error) { box.innerHTML = `<strong style="color:var(--danger)">✗ ${esc(r.error)}</strong>`; return toast(r.error, "error"); }
        const p = r.prod, l = lineas.find(x => x.pid === p.pid);
        if ((l ? l.cantidad : 0) + 1 > p.stock) {
            box.innerHTML = `<strong style="color:var(--danger)">✗ Sin existencias suficientes de ${esc(p.nombre)} (hay ${p.stock})</strong>`;
            return toast(`Sin existencias suficientes de "${p.nombre}".`, "error");
        }
        if (l) l.cantidad++; else lineas.push({ pid: p.pid, cantidad: 1 });
        box.innerHTML = `<img class="thumb grande" src="${esc(imgProd(p))}" alt="">
            <div><small class="muted">✔ Producto escaneado</small><h3>${esc(p.nombre)}</h3>
            <code>${esc(p.id)}</code> · ${htmlPrecio(p)}${p.oferta ? '<div class="banner-oferta">🏷 ¡Producto en oferta!</div>' : ""}<span class="muted">En la venta: ${lineas.find(x => x.pid === p.pid).cantidad} · Stock: ${p.stock}</span></div>`;
        pintarLineas();
    };

    S.recargar = () => intentar(async () => { prods = await DB.productos(); m = new Map(prods.map(p => [p.pid, p])); llenar(); lineas.forEach(l => { const p = m.get(l.pid); if (p && l.cantidad > p.stock) l.cantidad = Math.max(1, p.stock); }); pintarLineas(); });

    $("#fScan").onsubmit = e => { e.preventDefault(); const i = $("#scan"); if (i.value.trim()) escanear(i.value); i.value = ""; i.focus(); };
    $("#ticketCaja").addEventListener("click", e => { const b = e.target.closest("[data-quitar]"); if (b) { lineas = lineas.filter(l => l.pid !== Number(b.dataset.quitar)); pintarLineas(); } });
    $("#ticketCaja").addEventListener("change", e => {
        const i = e.target.closest("[data-qty]"); if (!i) return;
        const l = lineas.find(x => x.pid === Number(i.dataset.qty)), p = m.get(l.pid), n = Number(i.value);
        if (!Number.isSafeInteger(n) || n < 1) toast("Cantidad no válida.", "error");
        else if (n > p.stock) { toast(`Máximo disponible: ${p.stock}.`, "error"); l.cantidad = p.stock; } else l.cantidad = n;
        pintarLineas();
    });
    $("#cMetodo").onchange = actualizarCambio;
    $("#cRecibido").oninput = actualizarCambio;
    $("#btnLimpiar").onclick = () => { lineas = []; pintarLineas(); $("#scan").focus(); };

    $("#btnCobrar").onclick = async e => {
        if (!lineas.length) return toast("Escanea al menos un producto.", "error");
        const b = e.currentTarget; b.disabled = true;
        await intentar(async () => {
            const t = await DB.crearTicket({
                cliente: $("#cCliente").value, items: lineas.map(l => ({ pid: l.pid, cantidad: l.cantidad })),
                pago: { metodo: $("#cMetodo").value, recibido: Number($("#cRecibido").value), referencia: $("#cRef").value }
            });
            lineas = [];
            prods = await DB.productos(); m = new Map(prods.map(p => [p.pid, p]));
            $("#cRecibido").value = ""; $("#cRef").value = ""; $("#cCliente").value = "";
            $("#ultimo").innerHTML = '<span class="muted">Venta registrada. Escanea el siguiente producto.</span>';
            pintarLineas();
            toast("Venta registrada.", "ok");
            mostrarTicket(t);
        });
        b.disabled = false;
    };

    $("#btnCamara").onclick = async () => {
        if (!("BarcodeDetector" in window)) return toast("Este navegador no escanea con cámara. Usa una pistola lectora o escribe el ID.", "error");
        try {
            const det = new BarcodeDetector(), v = $("#cam");
            v.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            v.classList.remove("oculto"); await v.play();
            let ult = "", t0 = 0;
            const loop = async () => {
                if (!document.body.contains(v)) { v.srcObject.getTracks().forEach(t => t.stop()); return; }
                const c = await det.detect(v).catch(() => []);
                if (c[0] && (c[0].rawValue !== ult || Date.now() - t0 > 2000)) { ult = c[0].rawValue; t0 = Date.now(); escanear(ult); }
                requestAnimationFrame(loop);
            };
            loop();
        } catch (_) { toast("No se pudo abrir la cámara.", "error"); }
    };
    pintarLineas();
    $("#scan").focus();
};

/* ---------- Ventas / Mis compras ---------- */
function vistaTickets(tksIniciales, modo) {      // modo: "staff" | "cajero" | "comprador"
    const staff = modo !== "comprador", puedeAnular = esAdmin();
    let tks = tksIniciales;
    const f = S.tk;
    const resumen = t => { const a = t.lineas.map(l => l.cantidad + "× " + l.nombre); return esc(a.slice(0, 2).join(", ")) + (a.length > 2 ? ` <span class="muted">+${a.length - 2} más</span>` : ""); };

    $("#vista").innerHTML = `
        <div class="titulo-fila"><h1>${staff ? "Registro de ventas" : "Mis compras"} ${modo === "staff" && !puedeAnular ? '<span class="chip solo-lectura">Solo lectura</span>' : ""}</h1>
            ${staff && modo === "staff" ? '<div class="acciones"><button class="btn-ghost" id="btnCsv">Exportar CSV</button></div>' : ""}
        </div>
        <div class="chips" id="resumen"></div>
        <div class="filtros">
            <div class="ancho"><label>Buscar</label><input id="qTk" placeholder="${staff ? "Folio, comprador, cajero o producto" : "Folio o producto"}" value="${esc(f.q)}"></div>
            <div><label>Estado</label><select id="estTk"><option value="">Todos</option><option value="activo">Activos</option><option value="anulado">Anulados</option></select></div>
            ${staff ? `<div><label>Tipo</label><select id="tipoTk"><option value="">Todos</option><option value="presencial">Presencial</option><option value="online">En línea</option></select></div>` : ""}
            <div><label>Pago</label><select id="metTk"><option value="">Todos</option><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="transferencia">Transferencia</option></select></div>
            ${modo === "cajero" ? `<label class="check"><input type="checkbox" id="miosTk" ${f.mios ? "checked" : ""}> Solo mis ventas</label>` : ""}
        </div>
        <div id="lista"></div>`;
    $("#estTk").value = f.estado; $("#metTk").value = f.metodo;
    if (staff) $("#tipoTk").value = f.tipo;

    const T = tabla($("#lista"), {
        cab: `<th>Folio</th><th>Fecha</th>${staff ? "<th>Tipo</th><th>Comprador</th><th>Cajero</th>" : ""}<th>Productos</th><th>Pago</th><th class="num">Total</th><th>Estado</th><th></th>`,
        vacio: "No hay tickets que mostrar.",
        fila: t => `<tr><td><code>${esc(t.folio)}</code></td><td>${esc(fecha(t.fecha))}</td>
            ${staff ? `<td>${t.tipo === "presencial" ? "Presencial" : "En línea"}</td><td>${esc(t.comprador)}</td><td>${esc(t.cajero || "—")}</td>` : ""}
            <td>${resumen(t)}</td><td>${esc(t.metodoPago || "—")}</td><td class="num">${money(t.total)}</td>
            <td>${t.estado === "activo" ? '<span class="badge ok">Activo</span>' : '<span class="badge mal">Anulado</span>'}</td>
            <td class="acc"><button class="btn-ghost btn-sm" data-ver="${esc(t.folio)}">Ver ticket</button></td></tr>`
    });
    const filtrados = () => {
        const q = norm(f.q).trim();
        return tks.filter(t =>
            (!q || norm(t.folio).includes(q) || norm(t.comprador).includes(q) || norm(t.cajero).includes(q) || t.lineas.some(l => norm(l.nombre).includes(q) || norm(l.id).includes(q))) &&
            (!f.estado || t.estado === f.estado) && (!f.tipo || !staff || t.tipo === f.tipo) && (!f.metodo || t.metodoPago === f.metodo) &&
            (modo !== "cajero" || !f.mios || t.cajero === S.u.usuario));
    };
    const aplicar = (reiniciar = true) => {
        const lista = filtrados(), act = lista.filter(t => t.estado === "activo");
        const propios = tks.filter(t => t.estado === "activo");
        $("#resumen").innerHTML = staff
            ? `<span class="chip">Tickets: <b>${lista.length}</b></span><span class="chip">Total vendido (activos): <b>${money(act.reduce((s, t) => s + t.total, 0))}</b></span><span class="chip">Artículos: <b>${act.reduce((s, t) => s + t.lineas.reduce((a, l) => a + l.cantidad, 0), 0)}</b></span>`
            : `<span class="chip">Compras realizadas: <b>${propios.length}</b></span><span class="chip">Total gastado: <b>${money(propios.reduce((s, t) => s + t.total, 0))}</b></span>`;
        T.set(lista, reiniciar);
    };
    aplicar();

    S.recargar = () => intentar(async () => { tks = await DB.tickets(); aplicar(false); });
    $("#qTk").oninput = e => { f.q = e.target.value; aplicar(); };
    $("#estTk").onchange = e => { f.estado = e.target.value; aplicar(); };
    $("#metTk").onchange = e => { f.metodo = e.target.value; aplicar(); };
    if (staff) $("#tipoTk").onchange = e => { f.tipo = e.target.value; aplicar(); };
    if (modo === "cajero") $("#miosTk").onchange = e => { f.mios = e.target.checked; aplicar(); };
    $("#lista").addEventListener("click", e => { const b = e.target.closest("[data-ver]"); if (b) mostrarTicket(tks.find(t => t.folio === b.dataset.ver), puedeAnular); });
    if (modo === "staff") $("#btnCsv").onclick = () => csv("ventas.csv", [
        ["Folio", "Fecha", "Tipo", "Comprador", "Cajero", "Estado", "Pago", "Referencia", "ID producto", "Producto", "Cantidad", "Precio unitario", "Importe", "Total del ticket"],
        ...tks.flatMap(t => t.lineas.map(l => [t.folio, t.fecha, t.tipo, t.comprador, t.cajero, t.estado, t.metodoPago, t.referencia, l.id, l.nombre, l.cantidad, l.precio, l.subtotal, t.total]))
    ]);
}
VISTAS.ventas = async () => vistaTickets(await DB.tickets(), S.u.rol === "cajero" ? "cajero" : "staff");
VISTAS.compras = async () => vistaTickets(await DB.tickets(), "comprador");

/* ---------- Usuarios (admin edita; supervisor solo ve) ---------- */
VISTAS.usuarios = async () => {
    const admin = esAdmin();
    let us = await DB.usuarios();
    let q = "", rol = "";
    $("#vista").innerHTML = `
        <div class="titulo-fila"><h1>Usuarios ${admin ? "" : '<span class="chip solo-lectura">Solo lectura</span>'}</h1>
            ${admin ? '<div class="acciones"><button class="btn-ghost" id="btnCorreoNuevo">✉ Enviar correo</button><button class="btn" id="btnNuevoU">+ Nuevo usuario</button></div>' : ""}
        </div>
        <div class="chips" id="resumen"></div>
        <div class="filtros">
            <div class="ancho"><label>Buscar</label><input id="qU" placeholder="Usuario o correo"></div>
            <div><label>Rol</label><select id="rolU"><option value="">Todos</option>${Object.entries(ROLES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
        </div>
        <div id="lista"></div>`;
    const T = tabla($("#lista"), {
        cab: `<th>Usuario</th><th>Correo</th><th>Contraseña</th><th>Rol</th><th class="num">Compras</th><th class="num">Gastado</th><th>Registro</th>${admin ? "<th></th>" : ""}`,
        vacio: "No hay usuarios que coincidan.",
        fila: u => `<tr><td><div class="u-cell">${avatar(u)}<div><b>${esc(u.usuario)}</b>${u.id === S.u.id ? ' <span class="badge rol">tú</span>' : ""}</div></div></td>
            <td>${esc(u.correo || "—")}<br>${u.correoVerificado ? '<span class="badge ok">Verificado</span>' : '<span class="badge warn">Sin verificar</span>'}</td>
            <td><span class="pw-mask" title="Se guarda cifrada: no es posible mostrarla">••••••••</span><br><small class="muted">cambiada ${esc(fecha(u.pwCambio))}</small></td>
            <td><span class="badge rol">${ROLES[u.rol]}</span></td>
            <td class="num">${u.compras ? `<button class="link-btn" data-compras="${esc(u.usuario)}">${u.compras}</button>` : 0}</td><td class="num">${money(u.gastado)}</td>
            <td class="muted">${esc(fecha(u.creado))}</td>
            ${admin ? `<td class="acc"><button class="btn-ghost btn-sm" data-ed="${u.id}">Editar</button><button class="btn-ghost btn-sm" data-mail="${u.id}">✉</button>${u.id === S.u.id ? "" : `<button class="btn-danger btn-sm" data-del="${u.id}">Eliminar</button>`}</td>` : ""}</tr>`
    });
    const aplicar = (reiniciar = true) => {
        const t = norm(q).trim();
        T.set(us.filter(u => (!t || norm(u.usuario).includes(t) || norm(u.correo).includes(t)) && (!rol || u.rol === rol)), reiniciar);
        $("#resumen").innerHTML = `<span class="chip">Usuarios: <b>${us.length}</b></span>` + Object.entries(ROLES).map(([k, v]) => `<span class="chip">${PLURAL[k] || v}: <b>${us.filter(u => u.rol === k).length}</b></span>`).join("");
    };
    aplicar();
    const recargar = async () => { us = await DB.usuarios(); aplicar(false); };
    S.recargar = () => intentar(recargar);
    $("#qU").oninput = e => { q = e.target.value; aplicar(); };
    $("#rolU").onchange = e => { rol = e.target.value; aplicar(); };

    $("#lista").addEventListener("click", async e => {
        const c = e.target.closest("[data-compras]");
        if (c) { S.tk = { q: c.dataset.compras, estado: "activo", tipo: "", metodo: "", mios: false }; location.hash = "#ventas"; return; }
        if (!admin) return;
        const ed = e.target.closest("[data-ed]"), ml = e.target.closest("[data-mail]"), del = e.target.closest("[data-del]");
        if (ed) formUsuario(us.find(u => u.id === Number(ed.dataset.ed)), recargar);
        if (ml) formCorreo(us, Number(ml.dataset.mail), recargar);
        if (del) {
            const u = us.find(x => x.id === Number(del.dataset.del));
            if (!confirm(`¿Eliminar al usuario "${u.usuario}"? Sus tickets se conservarán.`)) return;
            await intentar(async () => { await DB.eliminarUsuario(u.id); toast("Usuario eliminado.", "ok"); await recargar(); });
        }
    });
    if (admin) {
        $("#btnNuevoU").onclick = () => formUsuario(null, recargar);
        $("#btnCorreoNuevo").onclick = () => formCorreo(us, us[0] && us[0].id, recargar);
    }
};

function formUsuario(u, alGuardar) {
    const nuevo = !u;
    u = u || { usuario: "", correo: "", rol: "comprador", foto: "" };
    let foto;
    modal(`<form id="fu" novalidate>
        <div class="modal-head"><h3>${nuevo ? "Nuevo usuario" : "Editar usuario"}</h3><button type="button" class="icon-btn" data-cerrar aria-label="Cerrar">${ic("x")}</button></div>
        <div class="modal-body">
            ${nuevo ? "" : `<div class="u-cell" style="margin-bottom:14px"><div id="uPrev">${avatar(u, true)}</div><div><input id="uFoto" type="file" accept="image/*"><button type="button" class="btn-ghost btn-sm" id="uQuitar" style="margin-top:6px">Quitar foto</button></div></div>`}
            <div class="campo"><label>Usuario</label><input id="uNom" value="${esc(u.usuario)}" maxlength="20" autocapitalize="none" required></div>
            <div class="campo"><label>Correo ${nuevo ? "" : "(si lo cambias, se pedirá verificarlo)"}</label><input id="uMail" type="email" value="${esc(u.correo)}" required></div>
            <div class="campo"><label>Rol / permisos</label><select id="uRol">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${u.rol === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
            <div class="campo"><label>${nuevo ? "Contraseña (mín. 6)" : "Nueva contraseña (déjalo vacío para no cambiarla)"}</label><input id="uPass" type="password" autocomplete="new-password" ${nuevo ? "required" : ""}></div>
        </div>
        <div class="modal-foot"><button type="button" class="btn-ghost" data-cerrar>Cancelar</button><button class="btn" type="submit">${nuevo ? "Crear" : "Guardar"}</button></div>
    </form>`);
    if (!nuevo) {
        $("#uFoto").onchange = e => intentar(async () => { foto = await imagenADataURL(e.target.files[0], 256); if (foto) $("#uPrev").innerHTML = avatar({ foto }, true); });
        $("#uQuitar").onclick = () => { foto = ""; $("#uPrev").innerHTML = avatar({ foto: "" }, true); };
    }
    $("#fu").onsubmit = async e => {
        e.preventDefault();
        await intentar(async () => {
            const d = { usuario: $("#uNom").value, correo: $("#uMail").value, rol: $("#uRol").value };
            if (nuevo) await DB.crearUsuario({ ...d, contrasena: $("#uPass").value });
            else {
                await DB.editarUsuario({ ...d, id: u.id, foto });
                if ($("#uPass").value) await DB.restablecerClave({ id: u.id, nueva: $("#uPass").value });
            }
            cerrarModal(); toast(nuevo ? "Usuario creado." : "Usuario actualizado.", "ok"); await alGuardar();
        });
    };
}

function formCorreo(us, idInicial, alGuardar) {
    modal(`<form id="fc" novalidate>
        <div class="modal-head"><h3>Enviar correo</h3><button type="button" class="icon-btn" data-cerrar aria-label="Cerrar">${ic("x")}</button></div>
        <div class="modal-body">
            <div class="campo"><label>Destinatario</label><select id="cPara">${us.map(u => `<option value="${u.id}" ${u.id === idInicial ? "selected" : ""}>${esc(u.usuario)} · ${esc(u.correo || "sin correo")}</option>`).join("")}</select></div>
            <div class="campo"><label>Asunto</label><input id="cAsunto" maxlength="120" required></div>
            <div class="campo"><label>Mensaje</label><textarea id="cCuerpo" maxlength="3000" required></textarea></div>
        </div>
        <div class="modal-foot"><button type="button" class="btn-ghost" data-cerrar>Cancelar</button><button class="btn" type="submit">Enviar</button></div>
    </form>`);
    $("#fc").onsubmit = async e => {
        e.preventDefault();
        await intentar(async () => {
            await DB.enviarCorreoUsuario({ id: Number($("#cPara").value), asunto: $("#cAsunto").value, cuerpo: $("#cCuerpo").value });
            cerrarModal(); toast("Correo enviado.", "ok"); await alGuardar();
        });
    };
}

/* ---------- Correos enviados (admin / supervisor) ---------- */
VISTAS.correos = async () => {
    const admin = esAdmin();
    let lista = await DB.correos();
    $("#vista").innerHTML = `
        <div class="titulo-fila"><h1>Correos ${admin ? "" : '<span class="chip solo-lectura">Solo lectura</span>'}</h1>
            ${admin ? '<div class="acciones"><button class="btn" id="btnRedactar">✉ Redactar correo</button></div>' : ""}
        </div>
        <p class="muted">Registro de los correos que genera el sistema (verificación, recuperación, cambios de correo) y los que envía el administrador. Los códigos no se guardan.</p>
        <div id="lista"></div>`;
    const T = tabla($("#lista"), {
        cab: "<th>Fecha</th><th>Para</th><th>Tipo</th><th>Asunto</th><th>Estado</th><th>Origen</th>", vacio: "Aún no se ha enviado ningún correo.",
        fila: c => `<tr><td>${esc(fecha(c.fecha))}</td><td>${esc(c.para)}</td><td><span class="badge rol">${esc(c.tipo)}</span></td>
            <td>${esc(c.asunto)}${c.tipo === "admin" ? `<br><small class="muted">${esc(c.cuerpo.slice(0, 80))}</small>` : ""}</td>
            <td>${c.estado === "enviado" ? '<span class="badge ok">Enviado</span>' : c.estado === "error" ? '<span class="badge mal">Error</span>' : c.estado === "simulado" ? '<span class="badge warn">Simulado</span>' : '<span class="badge warn">Generado</span>'}</td><td>${esc(c.por)}</td></tr>`
    });
    T.set(lista);
    S.recargar = () => intentar(async () => { lista = await DB.correos(); T.set(lista, false); });
    if (admin) $("#btnRedactar").onclick = () => intentar(async () => { const us = await DB.usuarios(); formCorreo(us, us[0] && us[0].id, S.recargar); });
};

/* ---------- Historial de cambios al inventario (admin / supervisor) ---------- */
VISTAS.historial = async () => {
    let mv = await DB.movimientos();
    let q = "", tipo = "";
    const TIPOS = ["Alta", "Baja", "Edición", "Entrada", "Salida", "Corrección", "Venta", "Anulación", "Oferta", "Oferta quitada"];
    $("#vista").innerHTML = `
        <div class="titulo-fila"><h1>Historial del inventario</h1></div>
        <p class="muted">Cada cambio queda registrado: productos añadidos o eliminados, cambios de nombre, ID, precio o descripción, y todo lo que sube o baja el stock.</p>
        <div class="filtros">
            <div class="ancho"><label>Buscar</label><input id="qH" placeholder="Producto, ID, usuario o nota"></div>
            <div><label>Tipo de movimiento</label><select id="tipoH"><option value="">Todos</option>${TIPOS.map(t => `<option>${t}</option>`).join("")}</select></div>
        </div>
        <div id="lista"></div>`;
    const T = tabla($("#lista"), {
        cab: '<th>Fecha</th><th>Usuario</th><th>Movimiento</th><th>Producto</th><th class="num">Stock</th><th>Detalle</th>', vacio: "No hay movimientos.", tam: 30,
        fila: m => {
            const d = m.cantidad, cls = d > 0 ? "ok" : d < 0 ? "mal" : "";
            const stock = m.stockAntes == null ? "—" : `${m.stockAntes} → ${m.stockDespues}` + (d ? ` <span class="badge ${cls}">${d > 0 ? "+" : ""}${d}</span>` : "");
            const det = (m.cambios && m.cambios.length ? `<ul class="detalle-cambios">${m.cambios.map(c => `<li>${esc(c)}</li>`).join("")}</ul>` : "") + (m.nota ? `<span class="muted">${esc(m.nota)}</span>` : "");
            return `<tr><td>${esc(fecha(m.fecha))}</td><td>${esc(m.usuario)}</td><td><span class="badge rol">${esc(m.tipo)}</span></td>
                <td>${esc(m.producto)} <code>${esc(m.productoId)}</code></td><td class="num">${stock}</td><td>${det}</td></tr>`;
        }
    });
    const aplicar = (reiniciar = true) => {
        const t = norm(q).trim();
        T.set(mv.filter(m => (!tipo || m.tipo === tipo) && (!t || norm(m.producto).includes(t) || norm(m.productoId).includes(t) || norm(m.usuario).includes(t) || norm(m.nota).includes(t) || (m.cambios || []).some(c => norm(c).includes(t)))), reiniciar);
    };
    aplicar();
    S.recargar = () => intentar(async () => { mv = await DB.movimientos(); aplicar(false); });
    $("#qH").oninput = e => { q = e.target.value; aplicar(); };
    $("#tipoH").onchange = e => { tipo = e.target.value; aplicar(); };
};

/* ---------- Mi perfil (todos los roles) ---------- */
VISTAS.perfil = async () => {
    const u = S.u;
    let foto;
    const pintar = () => {
        $("#vista").innerHTML = `
        <div class="titulo-fila"><h1>Mi perfil</h1></div>
        ${esStaff() && !u.correoVerificado ? '<div class="error-msg">Como personal de la tienda debes verificar tu correo para usar el sistema.</div>' : ""}
        <div class="dos-col">
            <div class="card"><h2>Datos de la cuenta</h2>
                <form id="fPerfil" novalidate>
                    <div id="pPrev" class="perfil-foto">${avatar(u, true)}</div>
                    <div class="campo"><label>Foto de perfil</label><input id="pArchivo" type="file" accept="image/*"></div>
                    <div class="campo"><label>Nombre de usuario</label><input id="pNombre" value="${esc(u.usuario)}" maxlength="20" autocapitalize="none" required></div>
                    <p class="muted">Rol: <b>${ROLES[u.rol]}</b> · Miembro desde ${esc(fecha(u.creado))}</p>
                    <button class="btn" type="submit">Guardar cambios</button>
                    <button class="btn-ghost" type="button" id="pQuitar">Quitar foto</button>
                </form>
            </div>
            <div class="card"><h2>Cambiar contraseña</h2>
                <form id="fPass" novalidate>
                    <div class="campo"><label>Contraseña actual</label><input id="cpActual" type="password" autocomplete="current-password" required></div>
                    <div class="campo"><label>Contraseña nueva (mín. 6)</label><input id="cpNueva" type="password" autocomplete="new-password" required></div>
                    <button class="btn" type="submit">Actualizar contraseña</button>
                </form>
            </div>
        </div>
        <div class="card"><h2>Correo ${u.correoVerificado ? '<span class="badge ok">Verificado</span>' : '<span class="badge warn">Sin verificar</span>'}</h2>
            <p>${esc(u.correo || "Sin correo registrado")}</p>
            ${!u.correoVerificado && u.correo ? `<div class="campo"><button class="btn-ghost" id="btnCodigo">Enviar código de verificación</button></div>
                <div class="fila2"><div class="campo"><label>Código recibido</label><input id="pCodigo" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></div><div class="campo" style="align-self:end"><button class="btn" id="btnVerificar">Verificar correo</button></div></div>` : ""}
            <h3 style="margin-top:18px">Cambiar de correo</h3>
            <p class="muted">${u.correoVerificado ? "Por seguridad, enviaremos un código al correo <b>actual</b> para confirmar el cambio." : "Tu correo actual no está verificado, así que el cambio es directo y después deberás verificar el nuevo."}</p>
            ${u.cambioCorreoPendiente ? `<div class="fila2"><div class="campo"><label>Código enviado a tu correo actual</label><input id="ccCodigo" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></div><div class="campo" style="align-self:end"><button class="btn" id="btnConfCambio">Confirmar cambio</button></div></div>` : ""}
            <div class="fila2"><div class="campo"><label>${u.cambioCorreoPendiente ? "¿Otro correo nuevo? Solicita de nuevo" : "Correo nuevo"}</label><input id="nuevoCorreo" type="email" maxlength="120"></div><div class="campo" style="align-self:end"><button class="btn-ghost" id="btnSolCambio">${u.correoVerificado ? "Enviar código al correo actual" : "Cambiar correo"}</button></div></div>
        </div>`;
        enlazar();
    };
    const refrescar = async () => { S.u = await DB.perfil(); Object.assign(u, S.u); construirNav(); renderAviso(); pintar(); };

    function enlazar() {
        $("#pArchivo").onchange = e => intentar(async () => { foto = await imagenADataURL(e.target.files[0], 256, 0.8); if (foto) $("#pPrev").innerHTML = avatar({ foto }, true); });
        $("#pQuitar").onclick = () => { foto = ""; $("#pPrev").innerHTML = avatar({ foto: "" }, true); };
        $("#fPerfil").onsubmit = e => { e.preventDefault(); intentar(async () => { await DB.actualizarPerfil({ usuario: $("#pNombre").value, foto }); foto = undefined; toast("Perfil actualizado.", "ok"); await refrescar(); }); };
        $("#fPass").onsubmit = e => { e.preventDefault(); intentar(async () => { await DB.cambiarContrasena({ actual: $("#cpActual").value, nueva: $("#cpNueva").value }); e.target.reset(); toast("Contraseña actualizada.", "ok"); }); };
        const cod = $("#btnCodigo");
        if (cod) {
            cod.onclick = () => intentar(async () => { await DB.enviarCodigoVerificacion(); toast("Te enviamos un código. Vence en 10 minutos.", "ok"); });
            $("#btnVerificar").onclick = () => intentar(async () => { await DB.confirmarCorreo($("#pCodigo").value); toast("Correo verificado.", "ok"); await refrescar(); if (location.hash !== "#perfil" || esStaff()) ir(); });
        }
        $("#btnSolCambio").onclick = () => intentar(async () => {
            const r = await DB.solicitarCambioCorreo($("#nuevoCorreo").value);
            toast(r.aplicado ? "Correo actualizado. Verifícalo con el código que te enviamos." : "Te enviamos un código al correo actual.", "ok");
            await refrescar();
        });
        const cc = $("#btnConfCambio");
        if (cc) cc.onclick = () => intentar(async () => { await DB.confirmarCambioCorreo($("#ccCodigo").value); toast("Correo cambiado. Verifica el nuevo con el código que te enviamos.", "ok"); await refrescar(); });
    }
    pintar();
};

/* =========================================================
   Navegación e inicio
   ========================================================= */
function construirNav() {
    const items = MENU[S.u.rol];
    $("#navLinks").innerHTML = items.map(([id, t]) => `<a href="#${id}" data-v="${id}" class="${id === S.vista ? "activo" : ""}">${t}${id === "carrito" ? '<span class="badge-n n-carrito"></span>' : ""}</a>`).join("");
    $("#drawerLista").innerHTML = items.map(([id, t, i]) => `<a href="#${id}" class="drawer-item ${id === S.vista ? "activo" : ""}" data-v="${id}">${ic(i)}<span>${t}${id === "carrito" ? ' <span class="badge-n n-carrito"></span>' : ""}</span>${ic("chev")}</a>`).join("");
    $("#drawerUsuario").innerHTML = `Sesión: <strong style="color:var(--text)">${esc(S.u.usuario)}</strong> · ${ROLES[S.u.rol]}`;
    $("#menuUsuario").innerHTML = `<div class="u-cell">${avatar(S.u)}<div><strong>${esc(S.u.usuario)}</strong><span class="badge rol">${ROLES[S.u.rol]}</span></div></div>
        <a class="btn-ghost btn" style="width:100%;margin-top:12px" href="#perfil">Mi perfil</a>
        <button class="btn-danger" style="width:100%;margin-top:8px" id="btnSalir">Cerrar sesión</button>`;
    $("#btnSalir").onclick = salir;
    $("#btnUsuario").innerHTML = S.u.foto ? `<img class="avatar" src="${esc(S.u.foto)}" alt="">` : ic("user");
    if (S.u.rol === "comprador") guardarCarrito();
}

function renderAviso() {
    const c = $("#avisoCorreo");
    if (!S.u || S.u.correoVerificado || !S.u.correo || S.vista === "perfil") { c.innerHTML = ""; return; }
    c.innerHTML = `<div class="aviso-correo">📧 Confirma tu correo <b>${esc(S.u.correo)}</b>${esStaff() ? " (obligatorio para el personal)" : ""}. Te enviamos un código al registrarte.
        <form id="fAviso" novalidate><input id="avCodigo" inputmode="numeric" maxlength="6" placeholder="Código de 6 dígitos" autocomplete="one-time-code"><button class="btn btn-sm" type="submit">Verificar</button><button class="btn-ghost btn-sm" type="button" id="avReenviar">Reenviar código</button></form></div>`;
    $("#fAviso").onsubmit = e => { e.preventDefault(); intentar(async () => { S.u = await DB.confirmarCorreo($("#avCodigo").value); toast("Correo verificado.", "ok"); renderAviso(); construirNav(); }); };
    $("#avReenviar").onclick = () => intentar(async () => { await DB.enviarCodigoVerificacion(); toast("Código enviado.", "ok"); });
}

async function salir() {
    try { await DB.cerrarSesion(); } catch (_) {}
    location.replace("login.html");
}

async function ir() {
    const items = MENU[S.u.rol];
    let v = location.hash.slice(1);
    if (!items.some(m => m[0] === v)) { v = items[0][0]; history.replaceState(null, "", "#" + v); }
    if (esStaff() && !S.u.correoVerificado && v !== "perfil") { v = "perfil"; history.replaceState(null, "", "#perfil"); toast("Verifica tu correo para continuar.", "error"); }
    if (v !== S.vista) { S.cat = ""; S.bajo = false; }
    S.vista = v; S.recargar = null; S.buscar = null; S.pendiente = false;
    const meta = items.find(m => m[0] === v);
    document.querySelectorAll("[data-v]").forEach(a => a.classList.toggle("activo", a.dataset.v === v));
    $("#drawerActual").innerHTML = ic(meta[2]) + "<span>" + meta[1] + "</span>";
    $("#drawer").classList.remove("abierto");
    document.title = meta[1] + " · Tiendachikitin";
    renderAviso();
    cerrarModal();
    try { await cargarImgRel(); await VISTAS[v](); } catch (e) { $("#vista").innerHTML = `<div class="error-msg">Error: ${esc(e.message)}</div>`; }
    window.scrollTo(0, 0);
}

function irAProductos() {
    const destino = S.u.rol === "comprador" ? "#catalogo" : "#inventario";
    if (location.hash !== destino) location.hash = destino; else ir();
}

(async function iniciar() {
    try {
        await DB.init();
        S.u = await DB.sesion();
    } catch (e) {
        document.body.innerHTML = '<p style="padding:24px">No se pudo iniciar la base de datos: ' + esc(e.message) + ' <a href="login.html">Volver</a></p>';
        return;
    }
    if (!S.u) { location.replace("registro.html"); return; }

    try { S.carrito = JSON.parse(localStorage.getItem(claveCarrito()) || "[]"); } catch (_) { S.carrito = []; }
    if (!Array.isArray(S.carrito)) S.carrito = [];
    S.carrito = S.carrito.filter(c => c && Number.isSafeInteger(c.pid) && Number.isSafeInteger(c.cantidad) && c.cantidad > 0);

    construirNav();

    $("#btnMenu").onclick = () => $("#drawer").classList.add("abierto");
    $("#btnCerrarMenu").onclick = () => $("#drawer").classList.remove("abierto");
    $("#btnSalirMovil").onclick = salir;

    $("#btnUsuario").onclick = e => { e.stopPropagation(); $("#menuUsuario").classList.toggle("oculto"); };
    document.addEventListener("click", e => { if (!e.target.closest(".usuario-wrap")) $("#menuUsuario").classList.add("oculto"); });
    $("#menuUsuario").addEventListener("click", e => { if (e.target.closest("a")) $("#menuUsuario").classList.add("oculto"); });

    $("#btnBuscar").onclick = () => { document.body.classList.toggle("busqueda-abierta"); if (document.body.classList.contains("busqueda-abierta")) $("#q").focus(); };
    $("#formBusqueda").onsubmit = e => { e.preventDefault(); if (!S.buscar) irAProductos(); };
    $("#q").oninput = e => { S.q = e.target.value; if (S.buscar) S.buscar(); else irAProductos(); };
    document.addEventListener("keydown", e => {
        if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $("#q").focus(); }
        if (e.key === "Escape") document.body.classList.remove("busqueda-abierta");
    });

    const dlg = $("#modal");
    dlg.addEventListener("click", e => { if (e.target.closest("[data-cerrar]") || e.target === dlg) cerrarModal(); });
    dlg.addEventListener("close", () => { if (S.pendiente) { S.pendiente = false; if (S.recargar) S.recargar(); } });

    // Cambios hechos por cualquier usuario (en este u otro dispositivo): refrescar la vista actual
    DB.onCambio(async () => {
        try {
            const u = await DB.perfil();
            if (u.rol !== S.u.rol) return location.reload();
            const distinto = JSON.stringify(u) !== JSON.stringify(S.u);
            S.u = u;
            if (distinto) { construirNav(); renderAviso(); }
        } catch (e) { if (e.codigo === 401) location.replace("login.html"); return; }
        await cargarImgRel();
        if (S.recargar) { if (dlg.open) S.pendiente = true; else S.recargar(); }
    });

    window.addEventListener("hashchange", ir);
    ir();
})();