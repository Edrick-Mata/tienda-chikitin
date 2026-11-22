/*Entrega de correos: EmailJS si está configurado; si no, bandeja simulada en pantalla */
(function () {
    "use strict";
    const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    function bandeja(msgs) {
        return new Promise(ok => {
            let d = document.getElementById("dlgCorreo");
            if (!d) { d = document.createElement("dialog"); d.id = "dlgCorreo"; document.body.appendChild(d); }
            d.innerHTML = '<div class="modal-head"><h3>📧 Bandeja simulada</h3></div><div class="modal-body">' +
                '<p class="muted" style="margin-top:0">Modo demo: no hay correo real configurado, así que estos mensajes se muestran aquí.</p>' +
                msgs.map(m => '<div class="correo-sim"><small class="muted">Para: <b>' + esc(m.para) + '</b></small><br><b>' + esc(m.asunto) + '</b><pre>' + esc(m.cuerpo) + '</pre></div>').join("") +
                '</div><div class="modal-foot"><button class="btn" id="cerrarCorreo">Entendido</button></div>';
            const fin = () => { if (d.open) d.close(); ok(); };
            d.querySelector("#cerrarCorreo").onclick = fin;
            d.onclose = ok;
            d.showModal();
        });
    }

    async function conEmailJS(m, cfg) {
        const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ service_id: cfg.serviceId, template_id: cfg.templateId, user_id: cfg.publicKey,
                template_params: { to_email: m.para, subject: m.asunto, message: m.cuerpo } })
        });
        if (!r.ok) throw new Error("EmailJS " + r.status);
    }

    async function entregar(msgs) {
        const cfg = (window.CONFIG && window.CONFIG.emailjs) || {};
        const usable = cfg.serviceId && cfg.templateId && cfg.publicKey;
        const simulados = [];
        for (const m of msgs) {
            let estado = "simulado";
            if (usable) {
                try { await conEmailJS(m, cfg); estado = "enviado"; } catch (e) { console.warn("EmailJS falló:", e.message); estado = "error"; }
            }
            if (estado !== "enviado") simulados.push(m);
            try { await window.DB.marcarCorreo({ id: m.id, estado }); } catch (_) {}
        }
        if (simulados.length) await bandeja(simulados);
    }

    window.Correo = { entregar };
})();
