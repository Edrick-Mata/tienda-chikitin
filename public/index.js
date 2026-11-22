// Con sesión guardada -> panel; sin sesión -> pantalla de registro.
(function () {
    var hay = false;
    try { hay = !!(localStorage.getItem("tpos_token") || localStorage.getItem("tpos_uid")); } catch (_) {}
    location.replace(hay ? "app.html" : "registro.html");
})();
