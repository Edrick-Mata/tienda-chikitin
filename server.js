
/* =========================================================
   server.js · Base de datos GLOBAL de Tiendachikitin
   Sin dependencias (solo Node 18+). Uso:  node server.js
   - Guarda todo en data/db.json
   - Sirve la web y la API (/api/rpc)
   - Avisa por SSE (/api/eventos) a todos los clientes conectados
     para que vean al instante cualquier cambio.
   Correo real (opcional) con variables de entorno:
     SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE=ssl|starttls|none
   ========================================================= */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const net = require("net");
const tls = require("tls");
const crypto = require("crypto");
const Core = require("./core.js");
 
const PORT = Number(process.env.PORT) || 3000;
const ARCHIVO = process.env.DATA_FILE || path.join(__dirname, "data", "db.json");
const SESION_MS = 30 * 24 * 3600 * 1000;
const MAX_BODY = 8 * 1024 * 1024;
const SMTP = process.env.SMTP_HOST ? {
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || "", pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || process.env.SMTP_USER || "tienda@localhost",
    modo: (process.env.SMTP_SECURE || (Number(process.env.SMTP_PORT) === 465 ? "ssl" : "starttls")).toLowerCase()
} : null;
 
/* ---------------- Estado + persistencia ---------------- */
let E;
try { E = JSON.parse(fs.readFileSync(ARCHIVO, "utf8")); }
catch (_) { E = Core.nuevoEstado(); }
E.sesiones = E.sesiones || {};
 
let temporizador = null;
function escribir() {
    fs.mkdirSync(path.dirname(ARCHIVO), { recursive: true });
    const tmp = ARCHIVO + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(E));
    fs.renameSync(tmp, ARCHIVO);
}
function programar() {
    if (temporizador) return;
    temporizador = setTimeout(() => { temporizador = null; try { escribir(); } catch (e) { console.error("No se pudo guardar:", e.message); } }, 150);
}
function volcarYSalir() { try { escribir(); } catch (_) {} process.exit(0); }
process.on("SIGINT", volcarYSalir);
process.on("SIGTERM", volcarYSalir);
 
/* ---------------- Tiempo real (SSE) ---------------- */
const clientes = new Set();
function difundir() { for (const r of clientes) r.write("data: cambio\n\n"); }
setInterval(() => { for (const r of clientes) r.write(": ping\n\n"); }, 25000).unref();
 
/* ---------------- Motor ---------------- */
const hash = txt => new Promise((ok, err) => crypto.pbkdf2(txt, "tpos", 60000, 32, "sha256", (e, k) => e ? err(e) : ok(k.toString("hex"))));
const motor = Core.Motor(E, { hash, guardar: emitir => { programar(); if (emitir) difundir(); } });
 
/* ---------------- SMTP mínimo ---------------- */
async function enviarSMTP({ para, asunto, cuerpo }) {
    const limpio = s => String(s).replace(/[\r\n]+/g, " ").trim();
    const b64 = s => Buffer.from(s, "utf8").toString("base64");
    let sock = SMTP.modo === "ssl" ? tls.connect({ host: SMTP.host, port: SMTP.port, servername: SMTP.host }) : net.connect({ host: SMTP.host, port: SMTP.port });
    let buf = "", pend = null, caido = null;
    const configurar = s => {
        s.setEncoding("utf8");
        s.setTimeout(20000, () => s.destroy(new Error("SMTP: tiempo de espera agotado")));
        s.on("data", d => { buf += d; vaciar(); });
        s.on("error", e => { caido = e; if (pend) { pend.rej(e); pend = null; } });
        s.on("close", () => { if (!caido) caido = new Error("SMTP: conexión cerrada"); if (pend) { pend.rej(caido); pend = null; } });
    };
    const vaciar = () => {
        if (!pend) return;
        const m = buf.match(/^(?:\d{3}-[^\r\n]*\r\n)*\d{3} [^\r\n]*\r\n/);
        if (m) { buf = buf.slice(m[0].length); const p = pend; pend = null; p.ok(m[0]); }
    };
    const leer = () => new Promise((ok, rej) => { if (caido) return rej(caido); pend = { ok, rej }; vaciar(); });
    const cmd = async (c, esperado) => {
        if (c !== null) sock.write(c + "\r\n");
        const r = await leer();
        if (!r.startsWith(esperado)) throw new Error("SMTP: " + r.trim());
        return r;
    };
    configurar(sock);
    try {
        await cmd(null, "220");
        let ehlo = await cmd("EHLO tiendachikitin", "250");
        if (SMTP.modo === "starttls") {
            await cmd("STARTTLS", "220");
            sock.removeAllListeners("data"); sock.removeAllListeners("error"); sock.removeAllListeners("close");
            buf = "";
            sock = tls.connect({ socket: sock, servername: SMTP.host });
            configurar(sock);
            ehlo = await cmd("EHLO tiendachikitin", "250");
        }
        if (SMTP.user) {
            await cmd("AUTH LOGIN", "334");
            await cmd(b64(SMTP.user), "334");
            await cmd(b64(SMTP.pass), "235");
        }
        const desde = (SMTP.from.match(/<([^>]+)>/) || [null, SMTP.from])[1].trim();
        await cmd("MAIL FROM:<" + limpio(desde) + ">", "250");
        await cmd("RCPT TO:<" + limpio(para) + ">", "25");
        await cmd("DATA", "354");
        const cabeza = [
            "From: " + limpio(SMTP.from), "To: " + limpio(para),
            "Subject: =?UTF-8?B?" + b64(limpio(asunto)) + "?=", "MIME-Version: 1.0",
            "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "Date: " + new Date().toUTCString()
        ].join("\r\n");
        const cuerpo64 = b64(cuerpo).replace(/.{1,76}/g, "$&\r\n");
        sock.write(cabeza + "\r\n\r\n" + cuerpo64 + "\r\n.\r\n");
        const fin = await leer();
        if (!fin.startsWith("250")) throw new Error("SMTP: " + fin.trim());
        try { sock.write("QUIT\r\n"); } catch (_) {}
    } finally { sock.end(); }
}
 
/* ---------------- API ---------------- */
function responder(res, estado, obj) {
    const cuerpo = JSON.stringify(obj);
    res.writeHead(estado, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(cuerpo);
}
 
function leerCuerpo(req) {
    return new Promise((ok, err) => {
        let tam = 0; const partes = [];
        req.on("data", c => { tam += c.length; if (tam > MAX_BODY) { err(Object.assign(new Error("La solicitud es demasiado grande."), { app: true, codigo: 413 })); req.destroy(); } else partes.push(c); });
        req.on("end", () => ok(Buffer.concat(partes).toString("utf8")));
        req.on("error", err);
    });
}
 
async function rpc(req, res) {
    try {
        const cuerpo = JSON.parse((await leerCuerpo(req)) || "{}");
        const token = String(req.headers["x-token"] || "");
        let uid = null;
        const ses = token && E.sesiones[token];
        if (ses) {
            if (Date.now() - ses.creada > SESION_MS || !E.usuarios.some(u => u.id === ses.uid)) { delete E.sesiones[token]; programar(); }
            else uid = ses.uid;
        }
        const env = await motor.llamar(uid, String(cuerpo.m || ""), cuerpo.a);
        let tokenNuevo;
        if (env.sesion) {
            tokenNuevo = crypto.randomBytes(24).toString("hex");
            E.sesiones[tokenNuevo] = { uid: env.sesion, creada: Date.now() };
            programar();
        }
        if (cuerpo.m === "cerrarSesion" && token) { delete E.sesiones[token]; programar(); }
        if (env.revocar) {
            for (const t of Object.keys(E.sesiones))
                if (E.sesiones[t].uid === env.revocar.uid && !(env.revocar.mantener && t === token)) delete E.sesiones[t];
            programar();
        }
        let correosDemo = [];
        if (env.correos.length) {
            if (SMTP) env.correos.forEach(c => enviarSMTP(c)
                .then(() => motor.llamar(null, "marcarCorreo", [{ id: c.id, estado: "enviado" }]))
                .catch(e => { console.error("Correo a " + c.para + " falló:", e.message); return motor.llamar(null, "marcarCorreo", [{ id: c.id, estado: "error" }]); }));
            else correosDemo = env.correos;      // modo demo: el cliente muestra la bandeja simulada
        }
        responder(res, 200, { ok: true, r: env.r, token: tokenNuevo, correos: correosDemo, smtp: !!SMTP });
    } catch (e) {
        if (e && e.app) return responder(res, e.codigo || 400, { ok: false, error: e.message });
        if (e instanceof SyntaxError) return responder(res, 400, { ok: false, error: "Solicitud no válida." });
        console.error(e);
        responder(res, 500, { ok: false, error: "Error interno del servidor." });
    }
}
 
 
/* ---------------- Archivos estáticos (lista blanca) ---------------- */
 
const TIPOS = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".md": "text/plain; charset=utf-8"
};
 
const PUBLICOS = new Set([
    "index.html",
    "index.js",
    "registro.html",
    "login.html",
    "recuperar.html",
    "app.html",
    "estilos.css",
    "config.js",
    "db.js",
    "correo.js",
    "auth.js",
    "app.js",
    "core.js"   // NUEVO: el navegador también necesita core.js (modo local y reglas compartidas)
]);
 
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' https://api.emailjs.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
 
 
const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/api/ping") return responder(res, 200, { ok: true, app: "tpos", smtp: !!SMTP });
    if (url.pathname === "/api/rpc" && req.method === "POST") return rpc(req, res);
    if (url.pathname === "/api/eventos") {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" });
        res.write("retry: 2000\n\n");
        clientes.add(res);
        req.on("close", () => clientes.delete(res));
        return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
 
    let nombre = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
 
    if (!PUBLICOS.has(nombre)) {
        res.writeHead(404, {
            "Content-Type": "text/plain; charset=utf-8"
        });
        return res.end("No encontrado");
    }
 
    // NUEVO: si el archivo no está en /public (p. ej. core.js junto a server.js), se busca en la carpeta del servidor
    const ruta = fs.existsSync(path.join(__dirname, "public", nombre)) ? path.join(__dirname, "public", nombre) : path.join(__dirname, nombre);
    fs.readFile(ruta, (err, data) => {
 
        if (err) { res.writeHead(404); return res.end("No encontrado"); }
        res.writeHead(200, { "Content-Type": TIPOS[path.extname(nombre)] || "application/octet-stream", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": CSP, "Referrer-Policy": "same-origin" });
        res.end(req.method === "HEAD" ? undefined : data);
    });
});
 
motor.sembrar().then(() => {
    servidor.listen(PORT, "0.0.0.0", () => {
        console.log("\nTiendachikitin corriendo (base de datos global en " + path.relative(process.cwd(), ARCHIVO) + ")");
        console.log("  Esta computadora:  http://localhost:" + PORT);
        for (const lista of Object.values(os.networkInterfaces()))
            for (const i of lista || []) if (i.family === "IPv4" && !i.internal) console.log("  Otros dispositivos (misma red / celular):  http://" + i.address + ":" + PORT);
        console.log(SMTP ? "  Correo: SMTP real (" + SMTP.host + ")" : "  Correo: modo DEMO (los correos se muestran en pantalla). Configura SMTP_* para enviarlos de verdad.");
        console.log("");
    });
});