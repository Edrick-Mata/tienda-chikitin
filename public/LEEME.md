# Tiendachikitin · Punto de venta e inventario

## Cómo ejecutarlo
`node server.js` y abre http://localhost:3000
(el servidor muestra también la dirección para entrar desde el celular en la misma red).
Los datos se guardan en `data/db.json` y todos los usuarios conectados ven los cambios al instante.

**Modo local:** abre `index.html` sin servidor. Los datos viven en el navegador (IndexedDB).

## Cuentas de prueba
| Rol | Usuario | Contraseña |
|---|---|---|
| Administrador | admin | admin123 |
| Supervisor | supervisor | super123 |
| Cajero | cajero | cajero123 |
| Comprador | comprador | compra123 |

## Correos reales
- Servidor: variables `SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE=ssl|starttls|none`.
- Solo navegador: llena `config.js` con las llaves de EmailJS (variables `{{to_email}}`, `{{subject}}`, `{{message}}`).
- Sin configuración: los correos se muestran en una bandeja simulada en pantalla.
