# es-web-notify

Estudio Sustenta broker for handling real-time notifications

Made before I knew about MQTT and then adopting some of it 😅 so maybe just use MQTT


# *RECUERDA AÑADIR LICENCIA ANTES DE HACERLO PÚBLICO*

## To Do

- [ ] Migrate keys to external file
- [ ] Fix all the mixed up using of "event point", "channel" and "topic"
- [ ] Organize code
- [ ] Add pushing quee when multiple event are ammited to the same endpoint. Messages colliding?
- [ ] Add verify the server sending event
- [ ] Migrate to stateless JWT auth with access and refresh token workflow
- [ ] Add redis integration for handling stateful auth
- [ ] Add websockets API
- [ ] Add raw TCP API

## API

`/`
Handles client subscription

`/event`
Handles event sent by a server

`/connections`
List of active clients and number of instances for each `client_id` (and `@TOTAL@`).
If no `client_id` was passed to the subscription it will default to `@ANON_CONNECTION@`

`/connections?clid=<client_id>`
Number of active instances of given `client_id`

`/connections?clid=<client_id>&details=true`
Insight of full details of active instances of given `client_id`

## FLUJO

### CLIENTE SE SUSCRIBE
Petición `POST` a `NOTIF. SERVER` en donde se especifiquen los `EVENT POINTS` que se quieren escuchar (a los que se va a suscribir)
```js
// SUB CONFIG
{
  bind_key: BindKey, // Optional
  clid: String, // Optional, helps identify client for debugging
  ep: [
    /* Setup as string or object with properties */
    TopicString,
    {
      topic: TopicString,
      binded: true // Optional. Only works if a valid bind_key is passed
    }
  ]
}
```
Al pasar una `BindKey` válida, se habilitan los `Event Points` permitidos para el usuario identificado.
> Ej. `Usuario_1` y `Usuario_2` se suscriben a `CASA/NIVEL_AGUA` y cada uno pasa su `BinKey`, pero solo `Usuario_1` tiene permitido recibir esa información, por lo que `Usuario_2` nunca recibe la notificación.

`BindKey` = RSA_ENCRYPTED({iat, session_id})
> Las BindKey tienen una expiración corta (~3seg) configurada en broker

Flujo:
1. cliente web pide a servidor PHP el `BindKey` pasando su `PHP_SESION_ID` en una cookie (HTTPS ONLY)
1. cliente web se suscribe usando el `BindKey` recibido
1. `NOTIF. SERVER` envia `BindKey` a servidor PHP para que este devuelva al `NOTIF. SERVER` el `USER_ID` asociado a la sesión
1. `NOTIF. SERVER` bindea usuario con conexion y tópicos

(esto se podría evitar si ambos servidores compartiran storage de session_id o se hiciera uso de JWT)


### SE EMITE EVENTO
>SOLO LO PUEDE HACER UN BACKEND! EL MISMO QUE MODIFICA BASES DE DATOS

peticion `POST` a `NOTIF. SERVER` en donde se especifiquen los `EVENT POINTS` a los que se notificara y el `EVENTO` que contendrá el `TIPO DE EVENTO` y opcionalmente los `DATOS DE EVENTO` (String JSON encoded si es necesario)
```js
// EVENT
{
  bind_key: BindKey, // Optional
  ep: [
    /* Setup as string or object with properties */
    TopicString, // Unbinded, shout mode event
    {
      topic: TopicString,
      whisper: ConnId, // Optional. Connection Id to whisper event
      binded: true, // Optional. Only works if a valid bind_key is passed
      password: String // Optional. Only if endpoint requires password
    }
  ],
  e: {
    type: String,
    detail: Any // Optional
  }
}
```
Al pasar una `BindKey` válida, los `EVENT POINTS` serán dirigidos sólo a los usuarios que los pueden escuchar. De igual manera, seran evaluados los permisos para emitir el evento a los `EVENT POINTS` pasados.

`BindKey` = RSA_ENCRYPTED({iat, user_id})
> Las BindKey tienen una expiración corta (~3seg) configurada en broker

Flujo:
1. cliente envía evento a servidor PHP destinado. Pasa su `PHP_SESION_ID` en una cookie (HTTPS ONLY)
1. servidor PHP evalúa si cliente tiene acceso a este endpoint (en base a sesión)
1. servidor PHP extrae `USER_ID` de `PHP_SESION_ID`, genera el `BindKey` y emite evento a `NOTIF. SERVER`
1. `NOTIF. SERVER` desencripta `BindKey` y si el `timestamp` no ha expirado (es menor al tiempo actual, pero mayor a el tiempo actual menos X segundos), revisa permisos de `USER_ID` recibido para publicar a cada `EVENT POINT`
(esto se podría evitar si ambos servidores compartiran storage de session_id o se hiciera uso de JWT)
(AMBOS SERVIDORES DEBEN ESTAR PERFECTAMENTE SINCRONIZADOS EN SU RELOJ)


### [EN BASE DE DATOS]
Al momento de publicar o suscribirse de forma bindeada, sólo entran en juego los endpoints registrados en esta base de datos.
```js
// BINDED EVENT POINT
{
  ep: String, // Atomic EventPoint
  owner: UserId,
  pub_password: HashString, // Empty = no password required
  pub: [ // Who can publish to this topic?
    UserId // Includes owner. WILDCARDS: "[][][]" = all unidentified (binded) users, "+" = all binded users, "*" = all users
  ],
  sub: [ // Who can subscribe to this topic?
    UserId // Includes owner. WILDCARDS: "[][][]" = all unidentified (binded) users, "+" = all binded users, "*" = all users
  ]
}
```
> !!! EVITA REGISTRAR `EVENT POINTS` CON `WILDCARDS` (# o +) EN LA BASE DE DATOS


## EVENT POINTS ESPECIALES / RESERVADOS

### @SERVER@
Emitido al realizar la conexión exitosamente. Contiene metadatos de la conexión asignada al cliente.

### @CONNECTION@/clid
Escucha las conexiones y desconexiones del Id de cliente suministrado
Al suscribirse emite un evento con el número de conexiones del clid actualmente conectadas.

## SHOUT & WHISPER [CONCEPTO]
Distintos clientes pueden estar suscritos a un mismo `EVENT POINT`, por lo tanto cada evento que se emita a dicho `EVENT POINT` será recibido por los clientes suscritos a este. Esto se conocerá como un evento en modo `SHOUT`.
Sin embargo el emisor del evento puede decidir emitirlo como modo `WHISPER` en donde el evento será recibido sólo por un cliente (especificado por el emisor). Esto hace que se tenga una fuincionalidad prácticamente de un tradicional HTTP donde hay peticiones y respuestas a quien hizo la petición.

Si no se recibe instrucción de `WHISPER`, se asume modo `SHOUT`.


## TIPOS DE NOTIFICACION
### BY PAGE
		- Definido en peticion de cliente
		- Significa que el hecho de estar en esta pagina, te suscribe a sus eventos
		- Al salir de la pagina te des-suscribes de sus eventos
		- Se recibe cualquier usuario en la pagina

		- ej. Un espectador de una partida en especifico de un juego online: recibe las actualizaciones de los jugadores y del chat publico. Fuera de la sala no recibe notificaciones de la partida.

### USER TARGETED
		- Definido en BASE DE DATOS de cada evento
		- Un evento X revisa en BASE DE DATOS quienes son los usuarios suscritos (a quienes se les notificará el evento) y manda una señal a cada uno de sus EVENT POINTS
		- Se recibe independiente de la pagina actual (recibira notificacion en cualquier sitio)
		- Para anular la subscripcion se debe modificar la BASE DE DATOS del evento correspondiente

		- ej. Se actualiza un post al que estas suscrito: recibes la notificacion de que ocurrio sin importar que estes en ese post

### USER TARGETED BY PAGE
		- Definido en peticion de cliente acompañado de TOKEN / SESSID como autenticacion
		- Solo se recibe si el usuario esta en la pagina
		- Para dejar de escuchar los eventos se puede modificar la BASE DE DATOS del evento (des-suscribirse) o abandonar la pagina actual

		- ej. Un jugador de un juego online: recibe las actualizaciones de sus rivales y su chat personal. Fuera de la sala no recibe notificaciones de la partida.
