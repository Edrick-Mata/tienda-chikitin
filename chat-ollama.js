"use strict";
/* =========================================================
   chat-ollama.js · Puente entre la página y Ollama
   Sin dependencias (Node 18+). Se usa desde server.js con:
     const Chat = require("./chat-ollama.js");
     if (url.pathname === "/api/chat" && req.method === "POST") return Chat.manejar(req, res);
   ========================================================= */

// ====== CONFIGURACIÓN ======
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/chat";
const MODEL = process.env.OLLAMA_MODEL || "qwen3:1.7b-q4_K_M";
const SYSTEM =
    "Responde siempre en español. Sigue las reglas y usa únicamente los datos que se te " +
    "proporcionan a continuación; si un dato no aparece, di que no lo tienes en lugar de inventarlo.";
const MAX_MESSAGES = 12;          // mensajes de historial que se aceptan
const MAX_CHARS = 6000;           // largo máximo por mensaje de usuario/asistente
const MAX_CONTEXT_CHARS = 12000;  // largo máximo del contexto (datos de la página)
const MAX_BODY = 200 * 1024;      // tamaño máximo de la petición
const NUM_CTX = 8192;             // memoria de contexto del modelo (tokens)
const TEMPERATURE = 0.3;          // más bajo = menos inventos
const REQS_PER_MINUTE = 20;       // límite por IP
// ===========================

/* ---- Límite de peticiones por IP (en memoria) ---- */
const visitas = new Map();
setInterval(() => {
    const limite = Date.now() - 60000;
    for (const [ip, marcas] of visitas) {
        const vigentes = marcas.filter(t => t > limite);
        if (vigentes.length) visitas.set(ip, vigentes); else visitas.delete(ip);
    }
}, 60000).unref();

function limitado(ip) {
    const ahora = Date.now();
    const recientes = (visitas.get(ip) || []).filter(t => t > ahora - 60000);
    recientes.push(ahora);
    visitas.set(ip, recientes);
    return recientes.length > REQS_PER_MINUTE;
}

/* ---- Utilidades ---- */
function responderJSON(res, estado, obj) {
    res.writeHead(estado, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(obj));
}

function leerCuerpo(req) {
    return new Promise((ok, err) => {
        let tam = 0;
        const partes = [];
        req.on("data", c => {
            tam += c.length;
            if (tam > MAX_BODY) { err(new Error("Solicitud demasiado grande.")); req.destroy(); }
            else partes.push(c);
        });
        req.on("end", () => ok(Buffer.concat(partes).toString("utf8")));
        req.on("error", err);
    });
}

/* ---- Manejador principal ---- */
async function manejar(req, res) {
    // Detrás de Cloudflare, la IP real llega en estos encabezados.
    const ip = String(req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "")
        .split(",")[0].trim();
    if (limitado(ip)) return responderJSON(res, 429, { error: "Demasiadas peticiones, espera un momento." });

    let cuerpo;
    try { cuerpo = JSON.parse((await leerCuerpo(req)) || "{}"); }
    catch (_) { return responderJSON(res, 400, { error: "Solicitud no válida." }); }

    const entrantes = Array.isArray(cuerpo.messages) ? cuerpo.messages : [];
    const quiereStream = cuerpo.stream !== false;

    // Contexto que manda la página (inventario, ventas, etc.) como mensaje de sistema.
    const contexto = entrantes
        .filter(m => m && m.role === "system" && typeof m.content === "string")
        .map(m => m.content)
        .join("\n\n")
        .slice(0, MAX_CONTEXT_CHARS);

    // Conversación: solo usuario y asistente.
    const chat = entrantes
        .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .slice(-MAX_MESSAGES)
        .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));

    if (!chat.length) return responderJSON(res, 400, { error: "Mensaje vacío." });

    // Para diagnosticar: si "contexto" sale en 0, la página no está enviando sus datos.
    console.log("[chat] contexto: " + contexto.length + " caracteres | mensajes: " + chat.length);

    const prompt = contexto ? SYSTEM + "\n\n" + contexto : SYSTEM;

    // Si el visitante cierra la página, cancelamos la generación.
    const controlador = new AbortController();
    res.on("close", () => controlador.abort());

    try {
        const r = await fetch(OLLAMA_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controlador.signal,
            body: JSON.stringify({
                model: MODEL,
                messages: [{ role: "system", content: prompt }, ...chat],
                stream: quiereStream,
                think: false,
                options: { num_ctx: NUM_CTX, temperature: TEMPERATURE }
            })
        });

        if (!r.ok) return responderJSON(res, 502, { error: "El modelo no respondió." });

        if (!quiereStream) return responderJSON(res, 200, await r.json());

        res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" });
        for await (const trozo of r.body) res.write(trozo);
        res.end();
    } catch (e) {
        if (e && e.name === "AbortError") return;
        if (!res.headersSent) responderJSON(res, 502, { error: "No se pudo contactar al modelo." });
        else res.end();
    }
}

module.exports = { manejar };