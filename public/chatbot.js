/* Chatbot de Tiendachikitin: asistente "Chiki" con Ollama (qwen3) dentro del panel.
   - Se inicia solo cuando app.js ya tiene la sesión lista (no hay que editar app.js).
   - Usa lo que ya existe en app.js: S, DB, money, toast, agregarAlCarrito, VISTAS, MENU, ROLES
     (si alguno falta, usa una versión de respaldo).
   - Habla con el servidor de la tienda en /api/chat, que reenvía la conversación a Ollama. */
(function () {
    "use strict";

    const CONFIG = {
        endpoint: "/api/chat",     // misma dirección desde la que se abrió la página
        maxHistorial: 8,           // mensajes previos que se mandan al modelo
        maxProductosEnPrompt: 60
    };

    const ST = { abierto: false, historial: [], ocupado: false, ctrl: null };
    const $c = s => document.querySelector(s);

    /* ---------- Ayudas (usan lo de app.js si existe) ---------- */
    const ROLES_BASE = { admin: "Administrador", supervisor: "Supervisor", comprador: "Comprador" };
    const MENU_BASE = {
        admin: [["panel", "Panel"], ["inventario", "Inventario"], ["ventas", "Ventas"], ["usuarios", "Usuarios"], ["historial", "Historial"]],
        supervisor: [["panel", "Panel"], ["inventario", "Inventario"], ["ventas", "Ventas"], ["historial", "Historial"]],
        comprador: [["catalogo", "Catálogo"], ["carrito", "Carrito"], ["compras", "Mis compras"]]
    };
    const nombresRol = () => (typeof ROLES !== "undefined" && ROLES) || ROLES_BASE;
    const menuRol = () => (typeof MENU !== "undefined" && MENU && MENU[S.u.rol]) || MENU_BASE[S.u.rol] || [];
    const dinero = n => (typeof money === "function"
        ? money(n)
        : Number(n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" }));
    const aviso = (msg, tipo) => { if (typeof toast === "function") toast(msg, tipo); };
    const carrito = () => (Array.isArray(S.carrito) ? S.carrito : []);
    const esStaffRol = () => S.u.rol === "admin" || S.u.rol === "supervisor";

    /* ---------- Contexto y prompt ---------- */
    async function construirPrompt() {
        const prods = await DB.productos();
        const lista = prods.slice(0, CONFIG.maxProductosEnPrompt)
            .map(p => `${p.id} | ${p.nombre} | ${p.categoria} | ${dinero(p.precio)} | stock ${p.stock}`)
            .join("\n");
        const nota = prods.length > CONFIG.maxProductosEnPrompt
            ? `\n(Se muestran ${CONFIG.maxProductosEnPrompt} de ${prods.length} productos.)`
            : "";

        // Totales ya calculados: así el modelo no tiene que sumar por su cuenta.
        const stockTotal = prods.reduce((s, p) => s + (Number(p.stock) || 0), 0);
        let resumen = `Productos distintos: ${prods.length}. Existencias totales: ${stockTotal} piezas.`;

        let extra = "";
        if (esStaffRol()) {
            const valor = prods.reduce((s, p) => s + (Number(p.precio) || 0) * (Number(p.stock) || 0), 0);
            resumen += ` Valor del inventario a precio de venta: ${dinero(valor)}.`;
            const bajos = prods.filter(p => p.stock <= p.minimo);
            extra += "\nProductos con stock bajo o agotado: " +
                (bajos.length ? bajos.map(p => `${p.nombre} (${p.stock}/mín. ${p.minimo})`).join(", ") : "ninguno") + ".";
        } else {
            const n = carrito().reduce((a, c) => a + c.cantidad, 0);
            extra += `\nEl carrito del cliente tiene ${n} pieza(s).`;
        }

        const secciones = menuRol().map(m => `${m[0]} (${m[1]})`).join(", ");
        const reglaAcciones = S.u.rol === "comprador"
            ? `- Si el cliente quiere agregar un producto al carrito, termina tu respuesta con una línea exacta [[AGREGAR|ID|CANTIDAD]], por ejemplo [[AGREGAR|P002|1]]. Usa solo IDs del catálogo.\n`
            : "";

        return `Eres "Chiki", el asistente virtual de Tiendachikitin, una tienda de tecnología y accesorios. Respondes SIEMPRE en español de México, de forma amable, directa y breve (máximo 4 oraciones).
Usuario actual: ${S.u.usuario} (${nombresRol()[S.u.rol] || S.u.rol}).

Reglas:
- Usa solo los datos del catálogo de abajo. Si algo no está ahí, di que no lo tienes. No inventes productos, precios ni existencias.
- Para totales y conteos usa el resumen de abajo; no hagas cuentas por tu cuenta.
- Los precios están en pesos mexicanos (MXN) con IVA incluido.
- No hables de costos, utilidades ni de las compras de otros usuarios.
${reglaAcciones}- Si el usuario quiere ir a una sección de la página, termina con una línea exacta [[IR|seccion]]. Secciones disponibles: ${secciones}.
- Si la pregunta no tiene que ver con la tienda, responde en una frase y ofrece ayuda con la tienda.

Resumen: ${resumen}

Catálogo actual (ID | nombre | categoría | precio | existencias):
${lista}${nota}
${extra}
/no_think`;
    }

    /* ---------- Atajos locales (no usan el modelo, siempre exactos) ---------- */
    const ATAJOS = {
        comprador: [
            ["Ver mi carrito", async () => {
                if (!carrito().length) return "Tu carrito está vacío.";
                const prods = new Map((await DB.productos()).map(p => [p.id, p]));
                let total = 0;
                const filas = carrito().map(c => {
                    const p = prods.get(c.id);
                    if (!p) return `• ${c.id}: ya no disponible`;
                    total += p.precio * c.cantidad;
                    return `• ${c.cantidad} × ${p.nombre} — ${dinero(p.precio * c.cantidad)}`;
                });
                return filas.join("\n") + `\nTotal: ${dinero(total)}`;
            }],
            ["Mis últimas compras", async () => {
                const tks = (await DB.tickets()).filter(t => t.comprador === S.u.usuario).slice(0, 3);
                if (!tks.length) return "Aún no tienes compras.";
                return tks.map(t => `• ${t.folio} — ${dinero(t.total)}${t.estado === "anulado" ? " (anulado)" : ""}`).join("\n");
            }],
            ["Productos más baratos", async () => {
                const d = (await DB.productos()).filter(p => p.stock > 0).sort((a, b) => a.precio - b.precio).slice(0, 5);
                return d.length ? d.map(p => `• ${p.nombre} (${p.id}) — ${dinero(p.precio)}`).join("\n") : "No hay productos disponibles.";
            }]
        ],
        staff: [
            ["Stock bajo", async () => {
                const b = (await DB.productos()).filter(p => p.stock <= p.minimo);
                return b.length ? b.map(p => `• ${p.nombre} (${p.id}): ${p.stock} / mín. ${p.minimo}`).join("\n") : "Todo el inventario está en niveles normales.";
            }],
            ["Stock total", async () => {
                const prods = await DB.productos();
                const total = prods.reduce((s, p) => s + (Number(p.stock) || 0), 0);
                return `Productos distintos: ${prods.length}\nExistencias totales: ${total} piezas`;
            }],
            ["Ventas de hoy", async () => {
                const hoy = new Date().toDateString();
                const t = (await DB.tickets()).filter(x => x.estado === "activo" && new Date(x.fecha).toDateString() === hoy);
                return `Tickets de hoy: ${t.length}\nTotal vendido: ${dinero(t.reduce((s, x) => s + x.total, 0))}`;
            }],
            ["Más vendidos", async () => {
                const top = {};
                (await DB.tickets()).filter(t => t.estado === "activo").forEach(t => t.lineas.forEach(l => {
                    top[l.nombre] = (top[l.nombre] || 0) + l.cantidad;
                }));
                const l = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 5);
                return l.length ? l.map(([n, c]) => `• ${n}: ${c} pzas`).join("\n") : "Aún no hay ventas.";
            }]
        ]
    };

    /* ---------- Interfaz ---------- */
    function construirUI() {
        if ($c("#cbFab")) return;

        const fab = document.createElement("button");
        fab.id = "cbFab"; fab.className = "cb-fab"; fab.setAttribute("aria-label", "Abrir asistente");
        fab.innerHTML = '<svg class="ic" viewBox="0 0 24 24"><path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.4A8 8 0 1121 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/></svg>';

        const panel = document.createElement("section");
        panel.id = "cbPanel"; panel.className = "cb-panel oculto"; panel.setAttribute("aria-label", "Asistente Chiki");
        panel.innerHTML = `
            <header class="cb-head">
                <div><strong>Chiki</strong><small>Asistente de la tienda</small></div>
                <div class="cb-head-btns">
                    <button class="icon-btn" id="cbLimpiar" title="Nueva conversación" aria-label="Nueva conversación">⟲</button>
                    <button class="icon-btn" id="cbCerrar" title="Cerrar" aria-label="Cerrar"><svg class="ic" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
                </div>
            </header>
            <div class="cb-msgs" id="cbMsgs" aria-live="polite"></div>
            <div class="cb-chips" id="cbChips"></div>
            <form class="cb-form" id="cbForm" autocomplete="off">
                <input id="cbInput" placeholder="Escribe tu pregunta…" maxlength="400">
                <button class="btn" type="submit" id="cbEnviar">Enviar</button>
            </form>`;
        document.body.appendChild(fab);
        document.body.appendChild(panel);

        fab.onclick = () => alternar();
        $c("#cbCerrar").onclick = () => alternar(false);
        $c("#cbLimpiar").onclick = reiniciar;
        $c("#cbForm").onsubmit = e => {
            e.preventDefault();
            if (ST.ocupado) { if (ST.ctrl) ST.ctrl.abort(); return; }
            const i = $c("#cbInput");
            const t = i.value.trim();
            if (!t) return;
            i.value = "";
            enviar(t);
        };

        const lista = ATAJOS[esStaffRol() ? "staff" : "comprador"];
        $c("#cbChips").innerHTML = "";
        lista.forEach(([txt, fn]) => {
            const b = document.createElement("button");
            b.type = "button"; b.className = "cb-chip"; b.textContent = txt;
            b.onclick = async () => {
                if (ST.ocupado) return;
                burbuja("user", txt);
                try {
                    const r = await fn();
                    burbuja("bot", r);
                    meter("user", txt); meter("assistant", r);
                } catch (err) { burbuja("bot", "No pude obtener esa información: " + err.message, true); }
            };
            $c("#cbChips").appendChild(b);
        });
        saludo();
    }

    function saludo() {
        $c("#cbMsgs").innerHTML = "";
        burbuja("bot", `¡Hola, ${S.u.usuario}! Soy Chiki. ` +
            (esStaffRol() ? "Puedo ayudarte a consultar inventario y ventas." : "Puedo ayudarte a encontrar productos y armar tu carrito."));
    }

    function reiniciar() {
        if (ST.ocupado && ST.ctrl) ST.ctrl.abort();
        ST.historial = [];
        saludo();
    }

    function alternar(forzar) {
        ST.abierto = forzar === undefined ? !ST.abierto : forzar;
        $c("#cbPanel").classList.toggle("oculto", !ST.abierto);
        $c("#cbFab").classList.toggle("activo", ST.abierto);
        if (ST.abierto) setTimeout(() => $c("#cbInput").focus(), 50);
    }

    function burbuja(quien, texto, error) {
        const d = document.createElement("div");
        d.className = "cb-msg " + (quien === "user" ? "cb-user" : "cb-bot") + (error ? " cb-error" : "");
        d.textContent = texto;
        const m = $c("#cbMsgs");
        m.appendChild(d);
        m.scrollTop = m.scrollHeight;
        return d;
    }

    function meter(rol, contenido) {
        ST.historial.push({ role: rol, content: contenido });
        if (ST.historial.length > 40) ST.historial.splice(0, ST.historial.length - 40);
    }

    function marcarOcupado(v) {
        ST.ocupado = v;
        $c("#cbEnviar").textContent = v ? "Detener" : "Enviar";
        $c("#cbInput").disabled = v;
        if (!v) $c("#cbInput").focus();
    }

    /* ---------- Acciones que propone el modelo ---------- */
    const RE_AGREGAR = /\[\[AGREGAR\|([A-Za-z0-9_-]+)\|(\d+)\]\]/g;
    const RE_IR = /\[\[IR\|([a-z]+)\]\]/g;
    const RE_PENSAR = /<think>[\s\S]*?(<\/think>|$)/g;

    function limpiar(raw) {
        return raw.replace(RE_PENSAR, "").replace(RE_AGREGAR, "").replace(RE_IR, "").replace(/\[\[[^\]]*$/, "").trim();
    }

    async function agregarDesdeChat(id, cant) {
        if (typeof agregarAlCarrito !== "function") return aviso("No se pudo agregar al carrito desde el chat.", "error");
        const prod = (await DB.productos()).find(p => p.id.toLowerCase() === id.toLowerCase());
        if (!prod) return aviso("Ese producto no existe.", "error");
        agregarAlCarrito(prod, cant);
        if (S.vista === "carrito" && typeof VISTAS !== "undefined" && VISTAS.carrito) VISTAS.carrito();
    }

    function botonesAccion(burbujaEl, raw) {
        const sinPensar = raw.replace(RE_PENSAR, "");
        const cont = document.createElement("div");
        cont.className = "cb-acciones";

        if (S.u.rol === "comprador") {
            for (const m of sinPensar.matchAll(RE_AGREGAR)) {
                const id = m[1], cant = Number(m[2]);
                if (!Number.isSafeInteger(cant) || cant < 1 || cant > 99) continue;
                const b = document.createElement("button");
                b.className = "btn btn-sm";
                b.textContent = `Agregar ${cant} × ${id} al carrito`;
                b.onclick = () => { b.disabled = true; agregarDesdeChat(id, cant); };
                cont.appendChild(b);
            }
        }
        const items = menuRol();
        const permitidas = items.map(m => m[0]);
        for (const m of sinPensar.matchAll(RE_IR)) {
            if (!permitidas.includes(m[1])) continue;
            const nombre = items.find(x => x[0] === m[1])[1];
            const b = document.createElement("button");
            b.className = "btn-ghost btn-sm";
            b.textContent = "Ir a " + nombre;
            b.onclick = () => { location.hash = "#" + m[1]; alternar(false); };
            cont.appendChild(b);
        }
        if (cont.children.length) burbujaEl.appendChild(cont);
    }

    /* ---------- Conexión con el modelo (streaming) ---------- */
    async function enviar(texto) {
        burbuja("user", texto);
        meter("user", texto);
        const bot = burbuja("bot", "…");
        marcarOcupado(true);
        ST.ctrl = new AbortController();
        let raw = "";

        try {
            let sistema;
            try { sistema = await construirPrompt(); }
            catch (e) { throw new Error("no pude leer los datos de la tienda (" + e.message + ")"); }

            const mensajes = [{ role: "system", content: sistema }, ...ST.historial.slice(-CONFIG.maxHistorial)];

            let r;
            try {
                r = await fetch(CONFIG.endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ messages: mensajes, stream: true }),
                    signal: ST.ctrl.signal
                });
            } catch (e) {
                if (e.name === "AbortError") throw e;
                throw new Error("no hay conexión con el servidor del chat. Revisa que Ollama y el servidor estén encendidos. (" + e.message + ")");
            }

            if (!r.ok) {
                let det = "";
                try { det = (await r.json()).error || ""; } catch (_) {}
                throw new Error(`el servidor respondió ${r.status}${det ? ": " + det : ""}`);
            }

            const lector = r.body.getReader();
            const dec = new TextDecoder();
            let buf = "";
            for (;;) {
                const { done, value } = await lector.read();
                if (done) break;
                buf += dec.decode(value, { stream: true });
                let i;
                while ((i = buf.indexOf("\n")) >= 0) {
                    const linea = buf.slice(0, i).trim();
                    buf = buf.slice(i + 1);
                    if (!linea) continue;
                    let j;
                    try { j = JSON.parse(linea); } catch (_) { continue; }
                    if (j.error) throw new Error(j.error);
                    if (j.message && j.message.content) {
                        raw += j.message.content;
                        bot.textContent = limpiar(raw) || "…";
                        $c("#cbMsgs").scrollTop = $c("#cbMsgs").scrollHeight;
                    }
                }
            }

            const final = limpiar(raw);
            bot.textContent = final || "No pude generar una respuesta. Intenta de nuevo.";
            if (final) meter("assistant", final); else ST.historial.pop();
            botonesAccion(bot, raw);
        } catch (err) {
            if (err.name === "AbortError") {
                const parcial = limpiar(raw);
                bot.textContent = parcial ? parcial + " [detenido]" : "Respuesta detenida.";
                if (parcial) meter("assistant", parcial); else ST.historial.pop();
            } else {
                ST.historial.pop();
                bot.classList.add("cb-error");
                bot.textContent = "No pude responder: " + err.message;
            }
        } finally {
            ST.ctrl = null;
            marcarOcupado(false);
        }
    }

    /* ---------- Arranque automático ---------- */
    // Espera a que app.js tenga la sesión lista (S.u) y la base de datos (DB).
    function listo() {
        try { return typeof S !== "undefined" && !!S && !!S.u && typeof DB !== "undefined" && !!DB; }
        catch (_) { return false; }
    }

    function arrancar() {
        let intentos = 0;
        const t = setInterval(() => {
            intentos++;
            if (listo()) { clearInterval(t); construirUI(); }
            else if (intentos > 150) clearInterval(t);   // se rinde tras ~60 s (por ejemplo, si no hay sesión)
        }, 400);
    }

    window.Chatbot = { init: construirUI };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
    else arrancar();
})();