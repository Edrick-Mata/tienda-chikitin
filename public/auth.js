/* Lógica de registro, inicio de sesión y recuperación de contraseña */
(async function () {
    "use strict";
    const $ = s => document.querySelector(s);
    const modo = document.body.dataset.page;

    // Menú desplegable (móvil)
    $("#btnMenu").addEventListener("click", () => $("#drawer").classList.add("abierto"));
    $("#btnCerrarMenu").addEventListener("click", () => $("#drawer").classList.remove("abierto"));

    // Mostrar / ocultar contraseña
    const ojo = $("#ojo");
    if (ojo) ojo.addEventListener("click", () => { const c = $("#contrasena"); c.type = c.type === "password" ? "text" : "password"; });

    const msg = (texto, ok) => {
        const d = document.createElement("div");
        d.className = ok ? "ok-msg" : "error-msg";
        d.textContent = texto;
        $("#mensaje").replaceChildren(d);
    };

    try {
        await DB.init();
        if (modo !== "recuperar" && await DB.sesion()) { location.replace("app.html"); return; }
    } catch (e) {
        msg("No se pudo iniciar la base de datos: " + e.message);
        return;
    }

    if (modo === "recuperar") {
        let correo = "";
        $("#paso1").addEventListener("submit", async e => {
            e.preventDefault();
            correo = $("#correo").value.trim().toLowerCase();
            try {
                await DB.pedirRecuperacion({ correo });
                msg("Si el correo está ligado a una cuenta verificada, te enviamos un código.", true);
                $("#paso1").classList.add("oculto");
                $("#paso2").classList.remove("oculto");
                $("#codigo").focus();
            } catch (err) { msg(err.message); }
        });
        $("#paso2").addEventListener("submit", async e => {
            e.preventDefault();
            try {
                await DB.restablecer({ correo, codigo: $("#codigo").value, nueva: $("#nueva").value });
                msg("Contraseña actualizada. Redirigiendo…", true);
                setTimeout(() => location.replace("login.html"), 1500);
            } catch (err) { msg(err.message); }
        });
        return;
    }

    $("#form").addEventListener("submit", async e => {
        e.preventDefault();
        const usuario = $("#usuario").value.trim();
        const contrasena = $("#contrasena").value;
        const btn = $("#enviar");
        $("#mensaje").replaceChildren();

        if (!usuario || !contrasena || (modo === "registro" && !$("#correo").value.trim())) {
            msg(modo === "registro" ? "Escribe tu usuario, correo y contraseña." : "Escribe tu usuario y tu contraseña.");
            return;
        }
        btn.disabled = true;
        try {
            if (modo === "registro") await DB.registrar({ usuario, correo: $("#correo").value, contrasena });
            else await DB.iniciar({ usuario, contrasena });
            location.replace("app.html");
        } catch (err) {
            msg(err.message);
            btn.disabled = false;
        }
    });
})();
