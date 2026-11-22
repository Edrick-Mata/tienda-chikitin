/* =========================================================
   db.js · Cliente de base de datos
   - Con servidor (node server.js): base de datos GLOBAL, tiempo real por SSE.
   - Sin servidor (abrir los .html directo): base de datos LOCAL en IndexedDB,
     usando exactamente la misma lógica (core.js).
   ========================================================= */
(function () {
    "use strict";
    const K_TOKEN = "tpos_token", K_UID = "tpos_uid";
    const ls = {
        get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } },
        set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} },
        del: k => { try { localStorage.removeItem(k); } catch (_) {} }
    };
    const oyentes = new Set();
    let temporizador = null;
    const avisar = () => { clearTimeout(temporizador); temporizador = setTimeout(() => oyentes.forEach(f => { try { f(); } catch (e) { console.error(e); } }), 250); };

    let modo = "local", motor = null, idb = null, canal = null, listo = null;

    /* ---------------- Modo remoto ---------------- */
    async function http(m, args) {
        let r;
        try {
            r = await fetch("api/rpc", { method: "POST", headers: { "Content-Type": "application/json", "x-token": ls.get(K_TOKEN) || "" }, body: JSON.stringify({ m, a: args }) });
        } catch (_) { throw Object.assign(new Error("No hay conexión con el servidor."), { codigo: 0 }); }
        let j;
        try { j = await r.json(); } catch (_) { throw Object.assign(new Error("Respuesta no válida del servidor."), { codigo: r.status }); }
        if (!j.ok) throw Object.assign(new Error(j.error || "Error del servidor."), { codigo: r.status });
        if (j.token) ls.set(K_TOKEN, j.token);
        if (m === "cerrarSesion") ls.del(K_TOKEN);
        return j;
    }

    /* ---------------- Modo local (IndexedDB) ---------------- */
    const abrirIDB = () => new Promise((ok, err) => {
        const r = indexedDB.open("tpos_v2", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("kv");
        r.onsuccess = () => ok(r.result);
        r.onerror = () => err(r.error);
    });
    const idbLeer = () => new Promise((ok, err) => { const q = idb.transaction("kv").objectStore("kv").get("estado"); q.onsuccess = () => ok(q.result); q.onerror = () => err(q.error); });
    let cola = Promise.resolve();
    const idbGuardar = () => { cola = cola.then(() => new Promise(ok => {
        const t = idb.transaction("kv", "readwrite");
        t.objectStore("kv").put(motor.estado, "estado");
        t.oncomplete = ok; t.onerror = ok; t.onabort = ok;
    })); return cola; };

    // PBKDF2 (igual que el servidor); si el navegador no ofrece crypto.subtle (http en red local) usa SHA-256 en JS
    function sha256(texto) {
        const rr = (v, a) => (v >>> a) | (v << (32 - a));
        const b = new TextEncoder().encode(texto), K = [], H = [];
        for (let n = 2, c = 0; c < 64; n++) {
            let primo = true; for (let d = 2; d * d <= n; d++) if (n % d === 0) { primo = false; break; }
            if (!primo) continue;
            if (c < 8) H[c] = Math.floor((Math.sqrt(n) % 1) * 4294967296);
            K[c++] = Math.floor((Math.cbrt(n) % 1) * 4294967296);
        }
        const l = b.length, tot = ((l + 9 + 63) >> 6) << 6, buf = new Uint8Array(tot);
        buf.set(b); buf[l] = 0x80;
        const dv = new DataView(buf.buffer);
        dv.setUint32(tot - 8, Math.floor(l * 8 / 4294967296)); dv.setUint32(tot - 4, (l * 8) >>> 0);
        const w = new Uint32Array(64), h = H.slice();
        for (let o = 0; o < tot; o += 64) {
            for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + 4 * i);
            for (let i = 16; i < 64; i++) {
                const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
                w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
            }
            let [a, bb, c, d, e, f, g, hh] = h;
            for (let i = 0; i < 64; i++) {
                const t1 = (hh + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
                const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) >>> 0;
                hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
            }
            h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + bb) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
            h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
        }
        return h.map(x => x.toString(16).padStart(8, "0")).join("");
    }
    async function hashCliente(texto) {
        if (window.crypto && crypto.subtle) {
            const enc = new TextEncoder();
            const base = await crypto.subtle.importKey("raw", enc.encode(texto), "PBKDF2", false, ["deriveBits"]);
            const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode("tpos"), iterations: 60000, hash: "SHA-256" }, base, 256);
            return [...new Uint8Array(bits)].map(x => x.toString(16).padStart(2, "0")).join("");
        }
        return sha256("tpos|" + texto);
    }

    const cargarScript = src => new Promise((ok, err) => {
        if (window.TPOS_CORE) return ok();
        const s = document.createElement("script");
        s.src = src; s.onload = ok; s.onerror = () => err(new Error("No se pudo cargar " + src));
        document.head.appendChild(s);
    });

    async function iniciarLocal() {
        await cargarScript("core.js");
        idb = await abrirIDB();
        let estado = await idbLeer();
        if (!estado) estado = TPOS_CORE.nuevoEstado();
        motor = TPOS_CORE.Motor(estado, {
            hash: hashCliente,
            guardar: emitir => { idbGuardar(); if (emitir && canal) canal.postMessage("cambio"); }
        });
        await motor.sembrar();
        try {
            canal = new BroadcastChannel("tpos_v2");
            canal.onmessage = async () => { const n = await idbLeer(); if (n) motor.reemplazar(n); avisar(); };
        } catch (_) {}
    }

    async function iniciarRemoto() {
        const es = new EventSource("api/eventos");
        let abierto = false;
        es.onmessage = avisar;
        es.onopen = () => { if (abierto) avisar(); abierto = true; };   // al reconectar, refrescar
    }

    async function local(m, args) {
        if (m === "cerrarSesion") { ls.del(K_UID); return { r: true, correos: [] }; }
        const env = await motor.llamar(Number(ls.get(K_UID)) || null, m, args);
        if (env.sesion) ls.set(K_UID, String(env.sesion));
        return env;
    }

    /* ---------------- API pública ---------------- */
    async function llamar(m, args) {
        await listo;
        let env;
        try { env = modo === "remoto" ? await http(m, args) : await local(m, args); }
        catch (e) {
            if (e.codigo === 401 && !["iniciar", "registrar", "perfil"].includes(m)) {
                ls.del(K_TOKEN); ls.del(K_UID);
                location.replace("login.html");
            }
            throw e;
        }
        if (env.correos && env.correos.length && window.Correo) await window.Correo.entregar(env.correos);
        return env.r;
    }

    const DB = {
        get modo() { return modo; },
        init() {
            if (!listo) listo = (async () => {
                if (/^https?:$/.test(location.protocol)) {
                    try {
                        const c = new AbortController(); const t = setTimeout(() => c.abort(), 2500);
                        const r = await fetch("api/ping", { cache: "no-store", signal: c.signal }); clearTimeout(t);
                        const j = await r.json();
                        if (j && j.app === "tpos") { modo = "remoto"; await iniciarRemoto(); return; }
                    } catch (_) {}
                }
                modo = "local";
                await iniciarLocal();
            })();
            return listo;
        },
        onCambio(fn) { oyentes.add(fn); return () => oyentes.delete(fn); },
        tieneSesion() { return !!(ls.get(K_TOKEN) || ls.get(K_UID)); },
        async sesion() {
            if (!this.tieneSesion()) return null;
            try { return await llamar("perfil", []); } catch (e) { if (e.codigo === 401) { ls.del(K_TOKEN); ls.del(K_UID); return null; } throw e; }
        },
        llamar
    };

    ["registrar", "iniciar", "cerrarSesion", "pedirRecuperacion", "restablecer", "perfil", "actualizarPerfil", "cambiarContrasena",
        "enviarCodigoVerificacion", "confirmarCorreo", "solicitarCambioCorreo", "confirmarCambioCorreo",
        "productos", "guardarProducto", "eliminarProducto", "ajustarStock", "tickets", "crearTicket", "anularTicket",
        "usuarios", "crearUsuario", "editarUsuario", "restablecerClave", "eliminarUsuario", "movimientos", "correos",
        "enviarCorreoUsuario", "marcarCorreo",
        "ponerOferta", "quitarOferta", "imagenesRelacionadas", "galeria", "guardarImagenes"
    ].forEach(m => { DB[m] = (...a) => llamar(m, a); });

    window.DB = DB;
    window.__sha256 = sha256;
})();