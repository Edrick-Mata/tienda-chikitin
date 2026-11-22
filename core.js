/* Todas las reglas de permisos viven aquí. */
(function (raiz, fabrica) {
    if (typeof module === "object" && module.exports) module.exports = fabrica();
    else raiz.TPOS_CORE = fabrica();
})(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    const ROLES = ["admin", "supervisor", "cajero", "comprador"];
    const STAFF = ["admin", "supervisor", "cajero"];
    const METODOS = ["efectivo", "tarjeta", "transferencia"];
    const RE_MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const RE_USER = /^[a-z0-9_.-]{3,20}$/;
    const MIN10 = 10 * 60 * 1000;
    const MAX_GALERIA = 6;
    const MOV_REAL = ["Venta", "Entrada", "Salida", "Corrección", "Anulación"];   // movimientos que "mueven" un producto

    const ahora = () => new Date().toISOString();
    const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
    const norm = s => String(s == null ? "" : s).trim().toLowerCase();
    const fallo = (msg, codigo) => { const e = new Error(msg); e.app = true; e.codigo = codigo || 400; return e; };

    const wc = (typeof globalThis !== "undefined" && globalThis.crypto) ||
        (typeof require === "function" ? require("crypto").webcrypto : null);
    const azar = n => { const a = new Uint32Array(1); wc.getRandomValues(a); return a[0] % n; };
    const hex = n => { const a = new Uint8Array(n); wc.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, "0")).join(""); };
    const codigo6 = () => String(azar(1000000)).padStart(6, "0");

    /* Catálogo */
    const CATALOGO = {
        "Periféricos":    ["PER", ["Teclado", "Mouse", "Webcam", "Gamepad", "Mousepad", "Micrófono USB", "Hub USB", "Lector de tarjetas", "Tableta gráfica", "Base enfriadora"], 90, 1500],
        "Pantallas":      ["PAN", ["Monitor 19\"", "Monitor 22\"", "Monitor 24\"", "Monitor 27\"", "Monitor curvo", "Monitor portátil", "Proyector", "Pantalla táctil", "Soporte VESA", "Protector de pantalla"], 400, 6000],
        "Audio":          ["AUD", ["Audífonos", "Diadema gamer", "Bocina Bluetooth", "Barra de sonido", "Micrófono condensador", "Audífonos in-ear", "Adaptador de audio", "Tarjeta de sonido", "Bocinas 2.0", "Soporte para audífonos"], 80, 2500],
        "Cables":         ["CAB", ["Cable HDMI", "Cable USB-C", "Cable DisplayPort", "Cable Lightning", "Cable Ethernet", "Cable VGA", "Cable de poder", "Extensión USB", "Adaptador HDMI", "Cable de audio"], 30, 400],
        "Almacenamiento": ["ALM", ["Memoria USB", "Disco duro externo", "SSD interno", "SSD externo", "Tarjeta microSD", "Tarjeta SD", "Estuche para disco", "Dock para discos", "Lector NVMe", "NAS personal"], 100, 3500],
        "Accesorios":     ["ACC", ["Soporte para laptop", "Cargador USB-C", "Funda para laptop", "Limpiador de pantalla", "Regulador de voltaje", "Organizador de cables", "Mochila para laptop", "Power bank", "Lámpara de escritorio", "Ventilador USB"], 40, 1200]
    };
    const VARIANTES = ["Básico", "Plus", "Pro", "Mini", "Max", "Lite", "Elite", "Gamer", "Oficina", "Compacto"];
    const NOTAS = {
        "Básico": "Ideal para el uso diario.", "Plus": "Incluye funciones adicionales.", "Pro": "Rendimiento de nivel profesional.",
        "Mini": "Tamaño compacto y fácil de transportar.", "Max": "Máxima capacidad y potencia.", "Lite": "Ligero y económico.",
        "Elite": "Acabados y materiales premium.", "Gamer": "Pensado para largas sesiones de juego.",
        "Oficina": "Perfecto para trabajar todo el día.", "Compacto": "Ahorra espacio en tu escritorio."
    };

    function nuevoEstado() {
        return { v: 3, sig: { u: 1, p: 1, m: 1, t: 1, c: 1, l: 1 }, usuarios: [], productos: [], tickets: [], movimientos: [], correos: [], sesiones: {}, imagenesCategoria: {}, meta: {} };
    }

    /* 
       Motor
       opts.hash(texto) -> Promise<string>
       opts.guardar(emitir) -> se llama cuando hay que persistir
       */
    function Motor(estado, opts) {
        let E = estado;
        const hashFn = opts.hash;
        const guardar = opts.guardar || (() => {});

        /* utilidades  */
        const necesita = (u, ...roles) => {
            if (!u) throw fallo("Inicia sesión para continuar.", 401);
            if (roles.length && !roles.includes(u.rol)) throw fallo("No tienes permiso para esta acción.", 403);
            return u;
        };
        const pub = u => ({
            id: u.id, usuario: u.usuario, correo: u.correo || "", correoVerificado: !!u.correoVerificado,
            rol: u.rol, foto: u.foto || "", creado: u.creado, pwCambio: u.pwCambio || u.creado,
            cambioCorreoPendiente: !!u.cambioCorreo
        });
        const cmpLote = (a, b) => a.fecha.localeCompare(b.fecha) || a.lid - b.lid;
        const prodOut = (p, costos, vendidos) => {
            const o = { pid: p.pid, id: p.id, nombre: p.nombre, categoria: p.categoria, descripcion: p.descripcion || "",
                precio: p.precio, stock: p.stock, minimo: p.minimo, imagen: p.imagen || "", nGaleria: (p.galeria || []).length,
                alta: p.alta, movido: !!p.movido, actualizado: p.actualizado,
                vendidoNormal: !!p.vendidoNormal,   // NUEVO: ya se vendió a precio normal (impide ofertar)
                subcategoria: p.subcategoria || "",    // NUEVO: subcategoría (agrupa productos parecidos)
                imagenDe: p.imagenDe || null,       // NUEVO: pid del producto cuya imagen usa (misma subcategoría)
                oferta: p.oferta ? { tipo: p.oferta.tipo, valor: p.oferta.valor, precio: p.oferta.precio, creada: p.oferta.creada } : null };
            if (costos) {
                o.costo = p.costo; o.vendidos = vendidos || 0;
                o.lotes = (p.lotes || []).slice().sort(cmpLote).map(l => ({ ...l }));
            }
            return o;
        };
        const ticketOut = (t, costos) => costos ? t : { ...t, lineas: t.lineas.map(({ costo, lotes, ...l }) => l) };
        const verCostos = u => u.rol === "admin" || u.rol === "supervisor";

        const nuevoHash = async pass => { const sal = hex(16); return { sal, hash: await hashFn(sal + ":" + pass) }; };
        const claveOk = async (u, pass) => (await hashFn(u.sal + ":" + String(pass == null ? "" : pass))) === u.hash;

        const validarUsuario = u => { if (!RE_USER.test(u)) throw fallo("El usuario debe tener de 3 a 20 caracteres (letras, números, punto, guion o guion bajo)."); };
        const validarClave = p => {
            if (typeof p !== "string" || p.length < 6) throw fallo("La contraseña debe tener al menos 6 caracteres.");
            if (p.length > 100) throw fallo("La contraseña es demasiado larga.");
        };
        const validarCorreo = c => { if (!RE_MAIL.test(c) || c.length > 120) throw fallo("Escribe un correo válido."); };
        const validarImagen = (f, max) => {
            if (f === "" || f == null) return "";
            if (typeof f !== "string" || !/^data:image\/(jpeg|png|webp|gif|svg\+xml);/.test(f)) throw fallo("La imagen no es válida.");
            if (f.length > (max || 900000)) throw fallo("La imagen es demasiado grande.");
            return f;
        };
        const usuarioPorId = id => { const u = E.usuarios.find(x => x.id === Number(id)); if (!u) throw fallo("Usuario no encontrado.", 404); return u; };
        const productoPorId = pid => { const p = E.productos.find(x => x.pid === Number(pid)); if (!p) throw fallo("El producto no existe.", 404); return p; };
        const admins = () => E.usuarios.filter(x => x.rol === "admin").length;

        function mov(u, d) {
            E.movimientos.push({ id: E.sig.m++, fecha: ahora(), uid: u ? u.id : null, usuario: u ? u.usuario : "sistema", cambios: [], nota: "", ...d });
            if (E.movimientos.length > 5000) E.movimientos.splice(0, E.movimientos.length - 5000);
        }

        /* ---------- lotes PEPS (primeras entradas, primeras salidas) ---------- */
        const vigente = p => (p.oferta ? p.oferta.precio : p.precio);
        const txtLote = x => "Lote #" + x.lid + " (" + String(x.fecha).slice(0, 10) + "): " + x.cant + " pza(s) a $" + Number(x.costo).toFixed(2);

        function nuevoLote(p, cant, costo, fecha) {
            const l = { lid: E.sig.l++, fecha: fecha || ahora(), cantidad: cant, restante: cant, costo: r2(costo) };
            p.lotes.push(l);
            p.stock += cant;
            return l;
        }
        function podar(p) {                      // conserva solo los últimos 30 lotes agotados
            const vacios = p.lotes.filter(l => l.restante === 0).sort(cmpLote);
            if (vacios.length > 30) {
                const fuera = new Set(vacios.slice(0, vacios.length - 30).map(l => l.lid));
                p.lotes = p.lotes.filter(l => !fuera.has(l.lid));
            }
        }
        // Saca piezas empezando por el lote más antiguo. Devuelve qué lotes se usaron.
        function consumir(p, cant) {
            const usados = [];
            let falta = cant;
            for (const l of p.lotes.filter(x => x.restante > 0).sort(cmpLote)) {
                if (falta <= 0) break;
                const t = Math.min(l.restante, falta);
                l.restante -= t; falta -= t;
                usados.push({ lid: l.lid, fecha: l.fecha, cant: t, costo: l.costo });
            }
            if (falta > 0) throw fallo("Los lotes de \"" + p.nombre + "\" no cuadran con su stock; avisa al administrador.", 500);
            p.stock -= cant;
            podar(p);
            return usados;
        }

        /* NUEVO: imagen tomada de otro producto de la MISMA subcategoría.
           Devuelve el pid válido o null. El producto origen debe tener imagen propia (así no hay cadenas ni ciclos). */
        function origenImagen(p, pidOrigen) {
            if (pidOrigen === null || pidOrigen === undefined || pidOrigen === "") return null;
            const o = E.productos.find(x => x.pid === Number(pidOrigen));
            if (!o || o.pid === p.pid) throw fallo("El producto elegido para la imagen no existe.");
            if (!p.subcategoria || norm(o.subcategoria) !== norm(p.subcategoria)) throw fallo("Solo puedes usar la imagen de un producto de la misma subcategoría.");
            if (!o.imagen) throw fallo("Ese producto no tiene una imagen propia que compartir.");
            return o.pid;
        }
        const limpiarSub = v => String(v == null ? "" : v).trim().slice(0, 40);

        // Fecha de alta: la elige quien da de alta el producto y ya no se puede cambiar
        function fechaAlta(v) {
            if (v == null || v === "") return ahora();
            const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (!m) throw fallo("La fecha de alta no es válida.");
            const d = new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0);
            if (isNaN(d) || d.getMonth() !== +m[2] - 1) throw fallo("La fecha de alta no es válida.");
            const hoy = new Date();
            if (d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth() && d.getDate() === hoy.getDate()) return ahora();
            if (d.getTime() - Date.now() > 12 * 3600 * 1000) throw fallo("La fecha de alta no puede estar en el futuro.");
            return d.toISOString();
        }

        /* Actualiza datos creados por versiones anteriores (una sola vez) */
        /* NUEVO: calcula p.vendidoNormal (ventas a precio normal) en datos de versiones anteriores */
        function migrarOfertas() {
            if (E.meta.ofv2) return false;
            const vend = new Set();
            E.tickets.forEach(t => { if (t.estado !== "anulado") t.lineas.forEach(l => { if (!l.oferta) vend.add(l.pid); }); });
            E.productos.forEach(p => { p.vendidoNormal = !!p.vendidoNormal || vend.has(p.pid); p.subcategoria = p.subcategoria || ""; p.imagenDe = p.imagenDe || null; delete p.imgCat; });
            E.meta.ofv2 = true;
            return true;
        }
        function migrar() { const a = migrarFifo(), b = migrarOfertas(); return a || b; }
        function migrarFifo() {
            if (E.meta.fifo) return false;
            E.sig.l = E.sig.l || 1;
            E.imagenesCategoria = E.imagenesCategoria || {};
            const movidos = new Set(), altas = new Map();
            E.tickets.forEach(t => t.lineas.forEach(l => movidos.add(l.pid)));
            E.movimientos.forEach(m => {
                if (m.pid == null) return;
                if (m.tipo === "Alta" && !altas.has(m.pid)) altas.set(m.pid, m.fecha);
                if (MOV_REAL.includes(m.tipo)) movidos.add(m.pid);
            });
            E.productos.forEach(p => {
                p.alta = p.alta || altas.get(p.pid) || p.actualizado || ahora();
                p.galeria = p.galeria || [];
                p.movido = !!p.movido || movidos.has(p.pid);
                if (p.oferta === undefined) p.oferta = null;
                if (!Array.isArray(p.lotes)) {
                    p.lotes = [];
                    const s = p.stock; p.stock = 0;
                    if (s > 0) nuevoLote(p, s, p.costo, p.alta);
                }
            });
            E.meta.fifo = true;
            return true;
        }

        function correo(ctx, para, tipo, asunto, cuerpo, ocultar) {
            const id = E.sig.c++;
            E.correos.push({ id, fecha: ahora(), para, tipo, asunto, estado: "generado", por: ctx.u ? ctx.u.usuario : "sistema",
                cuerpo: ocultar ? "(contenido con código, oculto)" : cuerpo });
            if (E.correos.length > 500) E.correos.splice(0, E.correos.length - 500);
            ctx.correos.push({ id, para, asunto, cuerpo });
            ctx.guardar = true;
        }

        function generarVerificacion(ctx, u) {
            const cod = codigo6();
            u.verif = { codigo: cod, expira: Date.now() + MIN10, intentos: 0 };
            correo(ctx, u.correo, "verificacion", "Confirma tu correo en Tiendachikitin",
                "Hola " + u.usuario + ",\n\nTu código para confirmar el correo es: " + cod + "\nVence en 10 minutos.\n\nSi no creaste esta cuenta, ignora este mensaje.", true);
        }

        function comprobarCodigo(ctx, obj, codigo) {
            if (!obj || Date.now() > obj.expira) throw fallo("El código expiró. Pide uno nuevo.");
            ctx.guardar = true;
            obj.intentos = (obj.intentos || 0) + 1;
            if (obj.intentos > 5) { obj.expira = 0; throw fallo("Demasiados intentos. Pide un código nuevo."); }
            if (obj.codigo !== String(codigo == null ? "" : codigo).trim()) throw fallo("Código incorrecto.");
        }

        function renombrar(u, nuevo) {
            if (u.usuario === nuevo) return;
            E.tickets.forEach(t => { if (t.uid === u.id) t.comprador = nuevo; if (t.cajeroId === u.id) t.cajero = nuevo; });
            E.movimientos.forEach(m => { if (m.uid === u.id) m.usuario = nuevo; });
            E.correos.forEach(c => { if (c.por === u.usuario) c.por = nuevo; });
            u.usuario = nuevo;
        }

        /* ---------- siembra inicial ---------- */
        async function sembrar() {
            if (migrar()) guardar(false);
            if (E.meta.sembrado) return;
            const cuentas = [["admin", "admin123", "admin"], ["supervisor", "super123", "supervisor"], ["cajero", "cajero123", "cajero"], ["comprador", "compra123", "comprador"]];
            for (const [usuario, pass, rol] of cuentas) {
                const h = await nuevoHash(pass);
                E.usuarios.push({ id: E.sig.u++, usuario, correo: usuario + "@tienda.test", correoVerificado: true, rol, hash: h.hash, sal: h.sal, foto: "", creado: ahora(), pwCambio: ahora() });
            }
            for (const [cat, [pre, bases, pmin, pmax]] of Object.entries(CATALOGO)) {
                for (let i = 0; i < 100; i++) {
                    const precio = Math.round(pmin + (pmax - pmin) * (i / 99));
                    const variante = VARIANTES[Math.floor(i / 10)], base = bases[i % 10];
                    const alta = ahora();
                    const p = {
                        pid: E.sig.p++, id: pre + "-" + String(i + 1).padStart(3, "0"), nombre: base + " " + variante, categoria: cat,
                        descripcion: base + " " + variante + " de la categoría " + cat.toLowerCase() + ". " + NOTAS[variante],
                        precio, costo: r2(precio * 0.6), stock: 0, minimo: 5, imagen: "", galeria: [], alta, lotes: [], movido: false, vendidoNormal: false, subcategoria: "", imagenDe: null, oferta: null, actualizado: alta
                    };
                    const st = i % 37 === 36 ? 0 : 5 + (i * 7) % 40;
                    if (st > 0) nuevoLote(p, st, p.costo, alta);
                    E.productos.push(p);
                }
            }
            E.meta.sembrado = true;
            guardar(true);
        }

        /* Métodos expuestos (cada uno recibe ctx primero) */
        const M = {
            async ping() { return true; },
            async cerrarSesion() { return true; },

            /* ---------- acceso ---------- */
            async registrar(ctx, d) {
                d = d || {};
                const usuario = norm(d.usuario), correoU = norm(d.correo);
                validarUsuario(usuario); validarCorreo(correoU); validarClave(d.contrasena);
                const h = await nuevoHash(d.contrasena);
                if (E.usuarios.some(x => x.usuario === usuario)) throw fallo("Ese nombre de usuario ya está registrado.");
                if (E.usuarios.some(x => x.correo === correoU && x.correoVerificado)) throw fallo("Ese correo ya está en uso.");
                const u = { id: E.sig.u++, usuario, correo: correoU, correoVerificado: false, rol: "comprador", hash: h.hash, sal: h.sal, foto: "", creado: ahora(), pwCambio: ahora() };
                E.usuarios.push(u);
                generarVerificacion(ctx, u);
                ctx.sesion = u.id; ctx.cambio = true;
                return pub(u);
            },

            async iniciar(ctx, d) {
                d = d || {};
                const id = norm(d.usuario);
                const u = E.usuarios.find(x => x.usuario === id || (x.correoVerificado && x.correo === id));
                const mal = fallo("Usuario o contraseña incorrectos.", 401);
                if (!u) { await hashFn("x:" + String(d.contrasena || "")); throw mal; }
                if (u.bloqueoHasta && Date.now() < u.bloqueoHasta) throw fallo("Demasiados intentos fallidos. Intenta de nuevo en un minuto.", 429);
                if (!(await claveOk(u, d.contrasena))) {
                    u.fallos = (u.fallos || 0) + 1;
                    if (u.fallos >= 5) { u.bloqueoHasta = Date.now() + 60000; u.fallos = 0; }
                    ctx.guardar = true;
                    throw mal;
                }
                if (u.fallos || u.bloqueoHasta) { u.fallos = 0; u.bloqueoHasta = 0; ctx.guardar = true; }
                ctx.sesion = u.id;
                return pub(u);
            },

            async pedirRecuperacion(ctx, d) {
                const c = norm(d && d.correo);
                const u = E.usuarios.find(x => x.correoVerificado && x.correo === c);
                if (u) {
                    const cod = codigo6();
                    u.reset = { codigo: cod, expira: Date.now() + MIN10, intentos: 0 };
                    correo(ctx, u.correo, "recuperacion", "Recuperación de contraseña · Tiendachikitin",
                        "Hola " + u.usuario + ",\n\nTu código para restablecer la contraseña es: " + cod + "\nVence en 10 minutos.\n\nSi no lo pediste, ignora este mensaje.", true);
                }
                return true; // misma respuesta exista o no el correo
            },

            async restablecer(ctx, d) {
                d = d || {};
                validarClave(d.nueva);
                const c = norm(d.correo);
                const h = await nuevoHash(d.nueva);
                const u = E.usuarios.find(x => x.correoVerificado && x.correo === c);
                if (!u || !u.reset) throw fallo("Código inválido o expirado.");
                comprobarCodigo(ctx, u.reset, d.codigo);
                u.hash = h.hash; u.sal = h.sal; u.pwCambio = ahora(); delete u.reset;
                u.fallos = 0; u.bloqueoHasta = 0;
                ctx.revocar = { uid: u.id }; ctx.cambio = true;
                return true;
            },

            /* perfil  */
            async perfil(ctx) { return pub(necesita(ctx.u)); },

            async actualizarPerfil(ctx, d) {
                const u = necesita(ctx.u);
                d = d || {};
                if (d.usuario !== undefined) {
                    const n = norm(d.usuario);
                    validarUsuario(n);
                    if (E.usuarios.some(x => x.id !== u.id && x.usuario === n)) throw fallo("Ese nombre de usuario ya existe.");
                    renombrar(u, n);
                }
                if (d.foto !== undefined) u.foto = validarImagen(d.foto, 400000);
                ctx.cambio = true;
                return pub(u);
            },

            async cambiarContrasena(ctx, d) {
                const u = necesita(ctx.u);
                d = d || {};
                validarClave(d.nueva);
                if (!(await claveOk(u, d.actual))) throw fallo("La contraseña actual no es correcta.");
                const h = await nuevoHash(d.nueva);
                u.hash = h.hash; u.sal = h.sal; u.pwCambio = ahora();
                ctx.revocar = { uid: u.id, mantener: true }; ctx.cambio = true;
                return true;
            },

            async enviarCodigoVerificacion(ctx) {
                const u = necesita(ctx.u);
                if (!u.correo) throw fallo("Tu cuenta no tiene correo.");
                if (u.correoVerificado) throw fallo("Tu correo ya está verificado.");
                generarVerificacion(ctx, u);
                return true;
            },

            async confirmarCorreo(ctx, codigo) {
                const u = necesita(ctx.u);
                comprobarCodigo(ctx, u.verif, codigo);
                u.correoVerificado = true; delete u.verif;
                ctx.cambio = true;
                return pub(u);
            },

            // Cambiar de correo: se confirma con un código enviado al correo og
            async solicitarCambioCorreo(ctx, nuevo) {
                const u = necesita(ctx.u);
                nuevo = norm(nuevo);
                validarCorreo(nuevo);
                if (nuevo === u.correo) throw fallo("Ese ya es tu correo actual.");
                if (E.usuarios.some(x => x.id !== u.id && x.correoVerificado && x.correo === nuevo)) throw fallo("Ese correo ya está ligado a otra cuenta.");
                if (!u.correo || !u.correoVerificado) {          // el original no era confiable: cambio directo
                    u.correo = nuevo; u.correoVerificado = false; delete u.cambioCorreo;
                    generarVerificacion(ctx, u);
                    ctx.cambio = true;
                    return { aplicado: true };
                }
                const cod = codigo6();
                u.cambioCorreo = { nuevo, codigo: cod, expira: Date.now() + MIN10, intentos: 0 };
                correo(ctx, u.correo, "cambio-correo", "Confirma el cambio de correo · Tiendachikitin",
                    "Hola " + u.usuario + ",\n\nSolicitaste cambiar tu correo a " + nuevo + ".\nTu código de confirmación es: " + cod + "\nVence en 10 minutos.\n\nSi no fuiste tú, cambia tu contraseña de inmediato.", true);
                return { aplicado: false };
            },

            async confirmarCambioCorreo(ctx, codigo) {
                const u = necesita(ctx.u);
                comprobarCodigo(ctx, u.cambioCorreo, codigo);
                if (E.usuarios.some(x => x.id !== u.id && x.correoVerificado && x.correo === u.cambioCorreo.nuevo)) { delete u.cambioCorreo; throw fallo("Ese correo ya fue ligado a otra cuenta."); }
                u.correo = u.cambioCorreo.nuevo; u.correoVerificado = false; delete u.cambioCorreo;
                generarVerificacion(ctx, u);          // el nuevo correo también se verifica
                ctx.cambio = true;
                return pub(u);
            },

            /* productos*/
            async productos(ctx) {
                const u = necesita(ctx.u);
                const costos = verCostos(u);
                const vend = new Map();
                if (costos) E.tickets.forEach(t => { if (t.estado === "activo") t.lineas.forEach(l => vend.set(l.pid, (vend.get(l.pid) || 0) + l.cantidad)); });
                return E.productos.map(p => prodOut(p, costos, vend.get(p.pid))).sort((a, b) => a.id.localeCompare(b.id));
            },

            async guardarProducto(ctx, d, nuevo) {
                const u = necesita(ctx.u, "admin");
                d = d || {};
                const n = {
                    id: String(d.id || "").trim().toUpperCase().slice(0, 30),
                    nombre: String(d.nombre || "").trim().slice(0, 80),
                    categoria: String(d.categoria || "").trim().slice(0, 40) || "General",
                    descripcion: String(d.descripcion || "").trim().slice(0, 500),
                    precio: r2(d.precio), costo: r2(d.costo), stock: Number(d.stock), minimo: Number(d.minimo)
                };
                if (!n.id || !n.nombre) throw fallo("El ID y el nombre son obligatorios.");
                if (!/^[A-Z0-9._-]+$/.test(n.id)) throw fallo("El ID solo puede tener letras, números, punto, guion y guion bajo.");
                if (!(n.precio > 0)) throw fallo("El precio debe ser mayor a cero.");
                if (!(n.costo >= 0)) throw fallo("El costo no puede ser negativo.");
                if (!Number.isSafeInteger(n.stock) || n.stock < 0) throw fallo("El stock debe ser un entero no negativo.");
                if (!Number.isSafeInteger(n.minimo) || n.minimo < 0) throw fallo("El stock mínimo debe ser un entero no negativo.");
                const img = d.imagen === undefined ? undefined : validarImagen(d.imagen);

                if (nuevo) {
                    if (E.productos.some(x => x.id === n.id)) throw fallo("Ese ID ya existe.");
                    const alta = fechaAlta(d.alta);
                    const { stock, ...resto } = n;
                    const p = { pid: E.sig.p++, ...resto, stock: 0, imagen: img || "", galeria: [], alta, lotes: [], movido: false, vendidoNormal: false, subcategoria: limpiarSub(d.subcategoria), imagenDe: null, oferta: null, actualizado: ahora() };
                    if (!img) p.imagenDe = origenImagen(p, d.imagenDe);     // NUEVO: sin imagen propia, puede usar la de un producto parecido
                    const cambios = [];
                    if (stock > 0) cambios.push("Lote inicial #" + nuevoLote(p, stock, p.costo, alta).lid + ": " + stock + " pza(s) a $" + p.costo.toFixed(2));
                    E.productos.push(p);
                    mov(u, { tipo: "Alta", pid: p.pid, productoId: p.id, producto: p.nombre, cantidad: p.stock, stockAntes: 0, stockDespues: p.stock, cambios, nota: "Producto añadido al inventario" });
                    ctx.cambio = true;
                    return prodOut(p, true);
                }
                const p = productoPorId(d.pid);
                if (d.alta !== undefined && d.alta !== "" && d.alta !== p.alta) throw fallo("La fecha de alta no puede modificarse una vez registrada.");
                if (E.productos.some(x => x.pid !== p.pid && x.id === n.id)) throw fallo("Ese ID ya existe.");
                if (p.oferta && p.oferta.tipo === "precio" && !(p.oferta.precio < n.precio))
                    throw fallo("El precio normal debe seguir siendo mayor al precio de oferta ($" + p.oferta.precio.toFixed(2) + "). Quita la oferta primero.");
                const cambios = [];
                const campos = [["id", "ID"], ["nombre", "Nombre"], ["categoria", "Categoría"], ["descripcion", "Descripción"], ["precio", "Precio"], ["costo", "Costo"], ["minimo", "Stock mínimo"]];
                for (const [k, etq] of campos) {
                    if (p[k] !== n[k]) cambios.push(k === "descripcion" ? etq + " modificada" : etq + ": " + p[k] + " → " + n[k]);
                }
                if (img !== undefined && img !== (p.imagen || "")) cambios.push("Imagen " + (img ? "actualizada" : "eliminada"));
                const antes = p.stock, idAnterior = p.id, nombreAnterior = p.nombre;
                const { stock: stockNuevo, ...resto } = n;
                Object.assign(p, resto);
                if (img !== undefined) p.imagen = img;
                // NUEVO: subcategoría y relación de imagen con un producto parecido
                if (d.subcategoria !== undefined) {
                    const sub = limpiarSub(d.subcategoria);
                    if (sub !== (p.subcategoria || "")) cambios.push("Subcategoría: " + (p.subcategoria || "—") + " → " + (sub || "—"));
                    p.subcategoria = sub;
                }
                if (p.imagenDe) { const o = E.productos.find(x => x.pid === p.imagenDe); if (!o || !p.subcategoria || norm(o.subcategoria) !== norm(p.subcategoria)) p.imagenDe = null; }   // cambió de subcategoría: la relación ya no aplica
                if (p.imagen) p.imagenDe = null;                                       // una imagen propia manda
                else if (d.imagenDe !== undefined) {
                    const nuevoOrigen = origenImagen(p, d.imagenDe);
                    if (nuevoOrigen !== (p.imagenDe || null)) cambios.push(nuevoOrigen ? "Usa la imagen del producto #" + nuevoOrigen : "Ya no usa la imagen de otro producto");
                    p.imagenDe = nuevoOrigen;
                }
                if (p.oferta && p.oferta.tipo === "porcentaje") {
                    const np = r2(p.precio * (1 - p.oferta.valor / 100));
                    if (np !== p.oferta.precio) { p.oferta.precio = np; cambios.push("Precio de oferta recalculado: $" + np.toFixed(2)); }
                }
                p.actualizado = ahora();
                if (cambios.length) mov(u, { tipo: "Edición", pid: p.pid, productoId: p.id, producto: p.nombre, cantidad: 0, stockAntes: antes, stockDespues: antes, cambios, idAnterior, nombreAnterior, nota: "Datos del producto modificados" });
                if (antes !== stockNuevo) {           // el ajuste de stock también respeta PEPS
                    const delta = stockNuevo - antes;
                    let det;
                    if (delta > 0) {
                        const l = nuevoLote(p, delta, p.costo);
                        det = ["Entra " + txtLote({ lid: l.lid, fecha: l.fecha, cant: delta, costo: l.costo })];
                    } else det = consumir(p, -delta).map(x => "Sale de " + txtLote(x));
                    p.movido = true;
                    mov(u, { tipo: "Corrección", pid: p.pid, productoId: p.id, producto: p.nombre, cantidad: delta, stockAntes: antes, stockDespues: p.stock, cambios: det, nota: "Ajuste desde la edición del producto" });
                }
                ctx.cambio = true;
                return prodOut(p, true);
            },

            async eliminarProducto(ctx, pid) {
                const u = necesita(ctx.u, "admin");
                const p = productoPorId(pid);
                E.productos.splice(E.productos.indexOf(p), 1);
                E.productos.forEach(x => { if (x.imagenDe === p.pid) x.imagenDe = null; });   // NUEVO: nadie queda apuntando a un producto borrado
                mov(u, { tipo: "Baja", pid: p.pid, productoId: p.id, producto: p.nombre, cantidad: -p.stock, stockAntes: p.stock, stockDespues: 0, nota: "Producto eliminado del inventario" });
                ctx.cambio = true;
                return true;
            },

            async ajustarStock(ctx, pid, delta, nota, costo) {
                const u = necesita(ctx.u, "admin");
                delta = Number(delta);
                if (!Number.isSafeInteger(delta) || delta === 0) throw fallo("Introduce una cantidad entera distinta de cero.");
                const p = productoPorId(pid);
                if (p.stock + delta < 0) throw fallo("No puedes sacar más piezas de las que hay (" + p.stock + ").");
                const antes = p.stock;
                let cambios;
                if (delta > 0) {                       // entrada = lote nuevo
                    const c = (costo === undefined || costo === null || costo === "") ? p.costo : r2(costo);
                    if (!(c >= 0)) throw fallo("El costo del lote no puede ser negativo.");
                    const l = nuevoLote(p, delta, c);
                    cambios = ["Entra " + txtLote({ lid: l.lid, fecha: l.fecha, cant: delta, costo: c })];
                } else {                               // salida = del lote más antiguo
                    cambios = consumir(p, -delta).map(x => "Sale de " + txtLote(x));
                }
                p.movido = true; p.actualizado = ahora();
                mov(u, { tipo: delta > 0 ? "Entrada" : "Salida", pid: p.pid, productoId: p.id, producto: p.nombre, cantidad: delta, stockAntes: antes, stockDespues: p.stock, cambios, nota: String(nota || "").slice(0, 120) });
                ctx.cambio = true;
                return prodOut(p, true);
            },

            /* ofertas: solo el administrador. Se pueden poner, cambiar y quitar a voluntad mientras el producto no se haya vendido a precio normal (ventas hechas EN oferta no bloquean) */
            async ponerOferta(ctx, d) {
                const u = necesita(ctx.u, "admin");
                d = d || {};
                const p = productoPorId(d.pid);
                if (p.vendidoNormal) throw fallo("Este producto ya tuvo ventas a precio normal, por eso no puede ponerse en oferta. Las ofertas son para productos sin ventas (baja demanda).");
                const valor = Number(d.valor);
                let precio, guardado;
                if (d.tipo === "porcentaje") {
                    if (!(valor > 0 && valor < 100)) throw fallo("El descuento debe ser mayor a 0 % y menor a 100 %.");
                    guardado = r2(valor);
                    precio = r2(p.precio * (1 - guardado / 100));
                } else if (d.tipo === "precio") {
                    precio = r2(valor); guardado = precio;
                } else throw fallo("Elige el tipo de oferta.");
                if (!(precio > 0) || !(precio < p.precio)) throw fallo("El precio de oferta debe ser mayor a cero y menor al precio normal ($" + p.precio.toFixed(2) + ").");
                p.oferta = { tipo: d.tipo, valor: guardado, precio, creada: ahora(), por: u.usuario };
                p.actualizado = ahora();
                mov(u, { tipo: "Oferta", pid: p.pid, productoId: p.id, producto: p.nombre, cantidad: 0, stockAntes: p.stock, stockDespues: p.stock,
                    cambios: ["Precio normal: $" + p.precio.toFixed(2), "Precio de oferta: $" + precio.toFixed(2) + (d.tipo === "porcentaje" ? " (−" + guardado + " %)" : "")], nota: "Oferta aplicada" });
                ctx.cambio = true;
                return prodOut(p, true);
            },

            async quitarOferta(ctx, pid) {
                const u = necesita(ctx.u, "admin");
                const p = productoPorId(pid);
                if (!p.oferta) throw fallo("Este producto no tiene oferta.");
                const ant = p.oferta.precio;
                p.oferta = null; p.actualizado = ahora();
                mov(u, { tipo: "Oferta quitada", pid: p.pid, productoId: p.id, producto: p.nombre, cantidad: 0, stockAntes: p.stock, stockDespues: p.stock,
                    cambios: ["Vuelve al precio normal: $" + p.precio.toFixed(2) + " (oferta era $" + ant.toFixed(2) + ")"], nota: "Oferta eliminada" });
                ctx.cambio = true;
                return prodOut(p, true);
            },

            /* imágenes */
            // NUEVO: imágenes de los productos que otros usan como origen ({pid: imagen}). Se manda aparte para no repetir la imagen en cada producto.
            async imagenesRelacionadas(ctx) {
                necesita(ctx.u);
                const m = {};
                E.productos.forEach(p => { if (p.imagenDe && !m[p.imagenDe]) { const o = E.productos.find(x => x.pid === p.imagenDe); if (o && o.imagen) m[o.pid] = o.imagen; } });
                return m;
            },

            async galeria(ctx, pid) {
                necesita(ctx.u);
                const p = productoPorId(pid);
                return { imagen: p.imagen || "", galeria: (p.galeria || []).slice() };
            },

            async guardarImagenes(ctx, d) {
                const u = necesita(ctx.u, "admin", "supervisor");
                d = d || {};
                const p = productoPorId(d.pid);
                const img = d.imagen === undefined ? undefined : validarImagen(d.imagen);
                let gal;
                if (d.galeria !== undefined) {
                    if (!Array.isArray(d.galeria) || d.galeria.length > MAX_GALERIA) throw fallo("La galería admite hasta " + MAX_GALERIA + " imágenes.");
                    gal = d.galeria.map(x => validarImagen(x)).filter(Boolean);
                }
                const cambios = [];
                if (img !== undefined && img !== (p.imagen || "")) { cambios.push(img ? "Imagen principal actualizada" : "Imagen principal quitada"); p.imagen = img; }
                // NUEVO: usar (o dejar de usar) la imagen de un producto parecido; una imagen propia tiene prioridad
                if (p.imagen) { if (p.imagenDe) { p.imagenDe = null; cambios.push("Ya no usa la imagen de otro producto"); } }
                else if (d.imagenDe !== undefined) {
                    const nuevoOrigen = origenImagen(p, d.imagenDe);
                    if (nuevoOrigen !== (p.imagenDe || null)) { cambios.push(nuevoOrigen ? "Usa la imagen del producto #" + nuevoOrigen : "Ya no usa la imagen de otro producto"); p.imagenDe = nuevoOrigen; }
                }
                const vieja = p.galeria || [];
                if (gal !== undefined && (gal.length !== vieja.length || gal.some((x, i) => x !== vieja[i]))) { cambios.push("Galería: " + gal.length + " imagen(es)"); p.galeria = gal; }
                if (cambios.length) {
                    p.actualizado = ahora();
                    mov(u, { tipo: "Edición", pid: p.pid, productoId: p.id, producto: p.nombre, cantidad: 0, stockAntes: p.stock, stockDespues: p.stock, cambios, nota: "Imágenes del producto" });
                    ctx.cambio = true;
                }
                return prodOut(p, true);
            },

            /* tickets */
            async tickets(ctx) {
                const u = necesita(ctx.u);
                let lista = E.tickets;
                if (u.rol === "comprador") lista = lista.filter(t => t.uid === u.id);
                return lista.map(t => ticketOut(t, verCostos(u))).sort((a, b) => b.fecha.localeCompare(a.fecha));
            },

            async crearTicket(ctx, d) {
                const u = necesita(ctx.u, "comprador", "cajero");
                d = d || {};
                const presencial = u.rol === "cajero";
                const items = Array.isArray(d.items) ? d.items : [];
                if (!items.length) throw fallo("El carrito está vacío.");
                const pago = d.pago || {};
                if (!METODOS.includes(pago.metodo)) throw fallo("Elige un método de pago.");
                if (!presencial && pago.metodo === "efectivo") throw fallo("Las compras en línea se pagan con tarjeta o transferencia.");
                if (!presencial && pago.metodo === "tarjeta" && !/^\d{4}$/.test(String(pago.ult4 || ""))) throw fallo("Datos de tarjeta no válidos.");

                const pedido = new Map();
                for (const it of items) {
                    const pid = Number(it.pid), c = Number(it.cantidad);
                    if (!Number.isSafeInteger(c) || c <= 0) throw fallo("Cantidad no válida.");
                    pedido.set(pid, (pedido.get(pid) || 0) + c);
                }
                const lineas = [];
                for (const [pid, c] of pedido) {            // validar todo antes de modificar nada
                    const p = E.productos.find(x => x.pid === pid);
                    if (!p) throw fallo("Un producto de la compra ya no existe.");
                    if (p.stock < c) throw fallo("Stock insuficiente de \"" + p.nombre + "\" (disponible: " + p.stock + ").");
                    const pv = vigente(p);                  // si hay oferta, se cobra el precio de oferta
                    lineas.push({ pid: p.pid, id: p.id, nombre: p.nombre, categoria: p.categoria, cantidad: c, precio: pv, precioLista: p.precio, oferta: !!p.oferta, costo: p.costo, subtotal: r2(pv * c) });
                }
                const total = r2(lineas.reduce((a, l) => a + l.subtotal, 0));
                let recibido = null, cambio = null, referencia = "";
                if (pago.metodo === "efectivo") {
                    recibido = r2(pago.recibido);
                    if (!(recibido >= total)) throw fallo("El efectivo recibido no cubre el total.");
                    cambio = r2(recibido - total);
                } else {
                    referencia = String(pago.referencia || "").trim().slice(0, 40) || (pago.metodo === "tarjeta" ? "AUT-" : "SPEI-") + String(azar(1e8)).padStart(8, "0");
                }
                const f = new Date();
                const folio = "T" + f.getFullYear() + String(f.getMonth() + 1).padStart(2, "0") + String(f.getDate()).padStart(2, "0") + "-" + String(E.sig.t++).padStart(5, "0");
                for (const l of lineas) {
                    const p = E.productos.find(x => x.pid === l.pid);
                    const antes = p.stock;
                    const usados = consumir(p, l.cantidad);          // PEPS: sale primero lo más antiguo
                    l.lotes = usados;
                    l.costo = r2(usados.reduce((a, x) => a + x.cant * x.costo, 0) / l.cantidad);
                    p.movido = true; p.actualizado = ahora();
                    if (!l.oferta) p.vendidoNormal = true;   // una venta a precio normal impide ofertar; las ventas en oferta no
                    mov(u, { tipo: "Venta", pid: p.pid, productoId: p.id, producto: p.nombre, cantidad: -l.cantidad, stockAntes: antes, stockDespues: p.stock, cambios: usados.map(x => "Sale de " + txtLote(x)), nota: "Ticket " + folio });
                }
                const t = {
                    folio, fecha: ahora(), tipo: presencial ? "presencial" : "online",
                    uid: presencial ? null : u.id, comprador: presencial ? (String(d.cliente || "").trim().slice(0, 40) || "Mostrador") : u.usuario,
                    cajeroId: presencial ? u.id : null, cajero: presencial ? u.usuario : "",
                    lineas, total, iva: r2(total - total / 1.16), estado: "activo",
                    metodoPago: pago.metodo, referencia, tarjeta4: pago.metodo === "tarjeta" && !presencial ? String(pago.ult4) : "", recibido, cambio
                };
                E.tickets.push(t);
                ctx.cambio = true;
                return ticketOut(t, verCostos(u));
            },

            async anularTicket(ctx, folio) {
                const u = necesita(ctx.u, "admin");
                const t = E.tickets.find(x => x.folio === folio);
                if (!t) throw fallo("Ticket no encontrado.", 404);
                if (t.estado !== "activo") throw fallo("Este ticket ya fue anulado.");
                for (const l of t.lineas) {
                    const p = E.productos.find(x => x.pid === l.pid);
                    if (!p) continue;
                    const antes = p.stock;
                    if (Array.isArray(l.lotes) && l.lotes.length) {      // las piezas vuelven a su lote de origen
                        for (const x of l.lotes) {
                            const lote = p.lotes.find(y => y.lid === x.lid);
                            if (lote) lote.restante += x.cant;
                            else p.lotes.push({ lid: x.lid, fecha: x.fecha, cantidad: x.cant, restante: x.cant, costo: x.costo });
                            p.stock += x.cant;
                        }
                    } else nuevoLote(p, l.cantidad, l.costo || p.costo);    // ticket anterior a los lotes
                    p.movido = true; p.actualizado = ahora();
                    mov(u, { tipo: "Anulación", pid: p.pid, productoId: p.id, producto: p.nombre, cantidad: l.cantidad, stockAntes: antes, stockDespues: p.stock, nota: "Ticket " + folio });
                }
                t.estado = "anulado"; t.anuladoPor = u.usuario; t.anuladoFecha = ahora();
                ctx.cambio = true;
                return true;
            },

            /* users*/
            async usuarios(ctx) {
                necesita(ctx.u, "admin", "supervisor");
                const stats = new Map();
                E.tickets.forEach(t => {
                    if (t.uid == null || t.estado !== "activo") return;
                    const s = stats.get(t.uid) || { compras: 0, gastado: 0 };
                    s.compras++; s.gastado = r2(s.gastado + t.total);
                    stats.set(t.uid, s);
                });
                return E.usuarios.map(u => ({ ...pub(u), compras: (stats.get(u.id) || {}).compras || 0, gastado: (stats.get(u.id) || {}).gastado || 0 }));
            },

            async crearUsuario(ctx, d) {
                necesita(ctx.u, "admin");
                d = d || {};
                const usuario = norm(d.usuario), c = norm(d.correo);
                validarUsuario(usuario); validarCorreo(c); validarClave(d.contrasena);
                if (!ROLES.includes(d.rol)) throw fallo("Rol no válido.");
                const h = await nuevoHash(d.contrasena);
                if (E.usuarios.some(x => x.usuario === usuario)) throw fallo("Ese nombre de usuario ya existe.");
                if (E.usuarios.some(x => x.correoVerificado && x.correo === c)) throw fallo("Ese correo ya está ligado a otra cuenta.");
                const u = { id: E.sig.u++, usuario, correo: c, correoVerificado: false, rol: d.rol, hash: h.hash, sal: h.sal, foto: "", creado: ahora(), pwCambio: ahora() };
                E.usuarios.push(u);
                generarVerificacion(ctx, u);
                ctx.cambio = true;
                return pub(u);
            },

            async editarUsuario(ctx, d) {
                necesita(ctx.u, "admin");
                d = d || {};
                const u = usuarioPorId(d.id);
                const usuario = norm(d.usuario), c = norm(d.correo);
                validarUsuario(usuario); validarCorreo(c);
                if (!ROLES.includes(d.rol)) throw fallo("Rol no válido.");
                if (E.usuarios.some(x => x.id !== u.id && x.usuario === usuario)) throw fallo("Ese nombre de usuario ya existe.");
                if (u.rol === "admin" && d.rol !== "admin" && admins() <= 1) throw fallo("Debe existir al menos un administrador.");
                if (c !== u.correo) {
                    if (E.usuarios.some(x => x.id !== u.id && x.correoVerificado && x.correo === c)) throw fallo("Ese correo ya está ligado a otra cuenta.");
                    u.correo = c; u.correoVerificado = false; delete u.cambioCorreo;
                    generarVerificacion(ctx, u);
                }
                const foto = d.foto === undefined ? undefined : validarImagen(d.foto, 400000);
                renombrar(u, usuario);
                u.rol = d.rol;
                if (foto !== undefined) u.foto = foto;
                ctx.cambio = true;
                return pub(u);
            },

            async restablecerClave(ctx, d) {
                necesita(ctx.u, "admin");
                d = d || {};
                validarClave(d.nueva);
                const u = usuarioPorId(d.id);
                const h = await nuevoHash(d.nueva);
                u.hash = h.hash; u.sal = h.sal; u.pwCambio = ahora(); u.fallos = 0; u.bloqueoHasta = 0;
                ctx.revocar = { uid: u.id, mantener: u.id === ctx.u.id }; ctx.cambio = true;
                return true;
            },

            async eliminarUsuario(ctx, id) {
                const yo = necesita(ctx.u, "admin");
                const u = usuarioPorId(id);
                if (u.id === yo.id) throw fallo("No puedes eliminar tu propia cuenta.");
                if (u.rol === "admin" && admins() <= 1) throw fallo("Debe existir al menos un administrador.");
                E.usuarios.splice(E.usuarios.indexOf(u), 1);
                ctx.revocar = { uid: u.id }; ctx.cambio = true;
                return true;
            },

            /* historial y correos */
            async movimientos(ctx) {
                necesita(ctx.u, "admin", "supervisor");
                return E.movimientos.slice(-2000).reverse();
            },

            async correos(ctx) {
                necesita(ctx.u, "admin", "supervisor");
                return E.correos.slice().reverse();
            },

            async enviarCorreoUsuario(ctx, d) {
                necesita(ctx.u, "admin");
                d = d || {};
                const u = usuarioPorId(d.id);
                const asunto = String(d.asunto || "").trim().slice(0, 120), cuerpo = String(d.cuerpo || "").trim().slice(0, 3000);
                if (!asunto || !cuerpo) throw fallo("Escribe el asunto y el mensaje.");
                if (!u.correo) throw fallo("Ese usuario no tiene correo.");
                correo(ctx, u.correo, "admin", asunto, cuerpo, false);
                ctx.cambio = true;
                return true;
            },

            async marcarCorreo(ctx, d) {
                d = d || {};
                const c = E.correos.find(x => x.id === Number(d.id));
                if (c && ["enviado", "simulado", "error"].includes(d.estado) && c.estado === "generado") { c.estado = d.estado; ctx.cambio = true; }
                return true;
            }
        };

        /* despachador  */
        async function llamar(uid, metodo, args) {
            const fn = Object.prototype.hasOwnProperty.call(M, metodo) ? M[metodo] : null;
            if (!fn) throw fallo("Método no válido.", 404);
            if (migrar()) guardar(false);
            const ctx = { u: uid ? E.usuarios.find(x => x.id === uid) || null : null, correos: [], cambio: false, guardar: false, sesion: undefined, revocar: null };
            try {
                const r = await fn(ctx, ...(Array.isArray(args) ? args : []));
                if (ctx.cambio || ctx.guardar) guardar(ctx.cambio);
                return { r, correos: ctx.correos, sesion: ctx.sesion, revocar: ctx.revocar };
            } catch (e) {
                if (ctx.guardar) guardar(false);
                throw e;
            }
        }

        return {
            llamar, sembrar,
            reemplazar(nuevo) { E = nuevo; },
            get estado() { return E; }
        };
    }

    return { Motor, nuevoEstado, ROLES, STAFF };
});