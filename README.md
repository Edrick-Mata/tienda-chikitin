# Tiendachikitin · Punto de venta e inventario

## 1. Nombre del proyecto

**Tiendachikitin**  sistema web de Venta y Inventario.

## 2. Integrantes

- Edrick Mata
- Osirys Acdeel
- Jesus Manuel
- Luis Erubiel
- Juan Angel 

## 3. Grupo

502 B

## 4. Objetivo del sistema

Ofrecer a una tienda de accesorios de cómputo una sola plataforma para vender (en mostrador y en línea), controlar su inventario y administrar a su personal y clientes, con datos compartidos en tiempo real entre todos los usuarios conectados.

## 5. Problema que resuelve

- Evita llevar ventas e inventario en papel o en hojas de cálculo separadas, donde las existencias se desactualizan.
- Impide vender productos sin stock: cada compra valida las existencias antes de registrarse.
- Da trazabilidad: cada venta, entrada, salida, corrección o anulación queda en un historial con el usuario que la hizo.
- Separa responsabilidades por rol, de modo que cada persona solo ve y modifica lo que le corresponde.
- Permite que el cliente compre en línea sin depender de que el personal esté en el mostrador.

## 6. Tecnologías utilizadas

| Capa | Tecnología |

| Servidor | Node.js 18 o superior (módulos nativos `http`, `fs`, `crypto`, `net`, `tls`) |
| Frontend | HTML, CSS y JavaScript sin framework |
| Tiempo real | Server-Sent Events (SSE) en `/api/eventos` |
| Persistencia | Archivo JSON (`data/db.json`); en modo local, IndexedDB del navegador |
| Seguridad de claves | PBKDF2 (SHA-256) con `crypto` de Node |
| Correo | SMTP propio (variables de entorno) o EmailJS desde el navegador; sin configurar, bandeja simulada en pantalla |
| Dependencias npm | `express` y `express-rate-limit` (declaradas en `package.json`) |
| Chatbot (opcional) | Puente hacia Ollama en `chat-ollama.js` (modelo por defecto `qwen3:1.7b-q4_K_M`) |

## 7. Principales funciones

- **Catálogo y compra en línea:** búsqueda, compra rápida, carrito y pago con tarjeta o transferencia.
- **Caja (venta presencial):** cobro en efectivo, tarjeta o transferencia, con cálculo de cambio y folio de ticket.
- **Inventario:** altas y ediciones de productos, categorías, existencias, galería de hasta 6 imágenes, manejo por lotes y ofertas.
- **Historial del inventario:** registro de ventas, entradas, salidas, correcciones y anulaciones.
- **Registro de ventas y anulación de tickets:** las piezas vuelven al lote de origen. Los compradores ven "Mis compras".
- **Panel de estadísticas:** ventas por día, método de pago y categoría; productos más vendidos; mejores compradores; stock bajo o agotado.
- **Usuarios y roles:** administrador, supervisor, cajero y comprador; alta, edición, baja y restablecimiento de contraseña.
- **Cuentas:** registro, inicio de sesión, verificación de correo con código y recuperación de contraseña.
- **Correos:** envío de notificaciones y mensajes a usuarios, con bandeja de correos generados.
- **Actualización en vivo:** todos los usuarios conectados ven los cambios al instante.

## 8. Instrucciones para instalarlo

Requisitos: [Node.js](https://nodejs.org) 18 o superior y Git.

```bash
git clone https://github.com/Edrick-Mata/tienda-chikitin.git
cd tienda-chikitin
npm install
```

> El repositorio ya incluye la carpeta `node_modules`; `npm install` solo la deja al día.

## 9. Instrucciones para iniciar el servidor

```bash
npm start
# equivalente a: node server.js
```

Al arrancar, la consola muestra las direcciones de acceso:

- Esta computadora: `http://localhost:3000`
- Otros dispositivos de la misma red (celular, por ejemplo): `http://<IP-de-tu-equipo>:3000`

Para cambiar el puerto:

```bash
PORT=8080 npm start          # Linux / macOS
$env:PORT=8080; npm start    # PowerShell (Windows)
```

**Modo local (sin servidor):** abrir `public/index.html` en el navegador. Los datos se guardan en el propio navegador (IndexedDB) y no se comparten entre equipos.

Al iniciar por primera vez se crea la información de ejemplo, incluidas cuentas de demostración (`admin`, `supervisor`, `cajero` y `comprador`); sus contraseñas están en `public/LEEME.md`. **Cámbialas antes de publicar el sistema.**

## 10. Configuración de la base de datos mediante variables de entorno

El sistema **no usa un motor SQL**: guarda todo en un archivo JSON, por lo que no hay usuario, host ni contraseña de base de datos. Lo que se configura es la ruta del archivo y, de forma opcional, el correo y el chatbot. Nunca escribas valores reales en el repositorio; defínelos en tu terminal o en el panel de tu hosting.

| Variable | Uso | Valor por defecto |
|---|---|---|
| `PORT` | Puerto del servidor | `3000` |
| `DATA_FILE` | Ruta del archivo de la base de datos | `data/db.json` |
| `SMTP_HOST` | Servidor de correo (si no se define, modo demo) | _(vacío)_ |
| `SMTP_PORT` | Puerto SMTP | `587` |
| `SMTP_USER` | Usuario SMTP | _(vacío)_ |
| `SMTP_PASS` | Contraseña SMTP | _(vacío)_ |
| `SMTP_FROM` | Remitente de los correos | `SMTP_USER` |
| `SMTP_SECURE` | `ssl`, `starttls` o `none` | `ssl` si el puerto es 465; si no, `starttls` |
| `OLLAMA_URL` | Dirección de Ollama para el chatbot (opcional) | `http://127.0.0.1:11434/api/chat` |
| `OLLAMA_MODEL` | Modelo del chatbot (opcional) | `qwen3:1.7b-q4_K_M` |

Ejemplo con valores ficticios (sustituye por los tuyos):

```bash
export PORT=3000
export DATA_FILE=/var/data/tienda/db.json
export SMTP_HOST=smtp.ejemplo.com
export SMTP_PORT=587
export SMTP_USER=usuario@ejemplo.com
export SMTP_PASS=<tu-contraseña-smtp>
export SMTP_FROM="Tiendachikitin <usuario@ejemplo.com>"
export SMTP_SECURE=starttls
npm start
```

Notas:

- En un hosting con disco efímero, apunta `DATA_FILE` a un volumen persistente o los datos se perderán al reiniciar.
- Para correos desde el navegador con EmailJS, completa `public/config.js` con tus propias llaves en lugar de dejar las de ejemplo.
- Haz respaldo periódico del archivo definido en `DATA_FILE`.

## 11. Enlace del sistema publicado

> falta esto saludos

## Estructura del repositorio

```
tienda-chikitin/
├── server.js          Servidor HTTP, API (/api/rpc), SSE y envío SMTP
├── core.js            Reglas de negocio, roles y permisos (compartido con el navegador)
├── chat-ollama.js     Puente opcional hacia Ollama para el chatbot
├── package.json       Dependencias y script de inicio
├── data/db.json       Base de datos (archivo JSON)
└── public/            Interfaz web
    ├── index.html, login.html, registro.html, recuperar.html, app.html
    ├── app.js, auth.js, db.js, correo.js, index.js, config.js, chatbot.js
    ├── estilos.css, chatbot.css
    └── LEEME.md       Notas rápidas de uso
```
