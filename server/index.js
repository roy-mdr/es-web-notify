
const http	= require("http");
const https = require("https");
const url   = require('url');
const fs	= require("fs");

const NODE_HOST			= "127.0.0.1"; // localhost
const NODE_PORT			= 1010;
const NODE_PORT_SECURE	= 1011;

const options_secure = {
	key: fs.readFileSync('/usr/syno/etc/certificate/_archive/WBwJuG/privkey.pem'),
	cert: fs.readFileSync('/usr/syno/etc/certificate/_archive/WBwJuG/cert.pem')
};



// https.createServer(onRequest).listen(NODE_PORT/*, NODE_HOST*/);
const server = http.createServer();
server.on('request', onRequest);
server.setTimeout(0);
server.listen(NODE_PORT);
console.log(`Server started.`, `Listening on port: ${NODE_PORT}`, `Default timeout: ${server.timeout}`);



// we create a server with automatically binding to a server request listener
// https.createServer(onRequest).listen(NODE_PORT/*, NODE_HOST*/);
const server_secure = https.createServer(options_secure);
server_secure.on('request', onRequest);
server_secure.setTimeout(0);
server_secure.listen(NODE_PORT_SECURE);
console.log(`Secure server started.`, `Listening on port: ${NODE_PORT_SECURE}`, `Default timeout: ${server_secure.timeout}`);



const separator = "''";
const state = {
	nextId: 0,
	connections: {},
	subscriptions: {}
};





function onRequest(request, response) {

	const url_parts = url.parse(request.url, true); // url.parse(urlStr, [parseQueryString], [slashesDenoteHost])
	console.log(`New connection to: ${url_parts.pathname}`);
	
	switch(url_parts.pathname) {
		
		case "/":

			if (request.method == 'OPTIONS') {
				response.writeHead(200, {
						'Access-Control-Allow-Origin': '*',
						'Access-Control-Allow-Headers': 'Authorization, X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Allow-Request-Method',
						'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
						'Allow': 'GET, POST, OPTIONS, PUT, DELETE'
					});
				response.end();
			}

			if (request.method == 'POST' /*&& request.headers['content-type'] == 'application/json'*/) {

				/* HANDLE REQUEST BODY */

				let body = '';

				request.on('data', (chunk) => {
					// console.log(chunk);
					// body += chunk.toString(); // convert Buffer to string
					body += chunk; // convert Buffer to string
					if (body.length > 1e6) request.connection.destroy(); // if > 1MB of body, kill the connection
				});

				request.on('end', () => {

					// const jBody = JSON.parse(body);
					try {
						jBody = JSON.parse(body.toString());
					} catch(err) {
						response.writeHead(400, 'Invalid JSON in body', { 'Access-Control-Allow-Origin' : '*' });
						response.end();
						return;
					}

					if ( jBody.ep == undefined || !Array.isArray(jBody.ep) ) {
						response.writeHead(400, 'Event Points should be an array', { 'Access-Control-Allow-Origin' : '*' });
						response.end();
						return;
					}

					jBody.ep.forEach( (ePoint, index, node) => {

						if (typeof ePoint !== 'string') {
							response.writeHead(400, 'Event Point should be a string', { 'Access-Control-Allow-Origin' : '*' });
							response.end();
							return;
						}

						/*****************************************************/
						/***** EVALUATE ACCESS/PERMISSION TO EVENT POINT *****/
						/*****************************************************/

						if (index == node.length - 1) {
							handleSubscription( trackConnection(url_parts, jBody, request, response) );
						}

					});
					
					// handleSubscription( trackConnection(url_parts, jBody, request, response) );

				});

			}

			if (request.method != 'OPTIONS' && request.method != 'POST') {
				response.writeHead(400, 'Method is not POST', { 'Access-Control-Allow-Origin' : '*' });
				response.end();
				return;
			}

			break;
		
		case "/event": // CALL ONLY FROM BACKEND

			/************************************************/
			/***** EVALUATE AUTHORIZATION TO EMIT EVENT *****/
			/************************************************/
			
			if (request.method == 'OPTIONS') {
				response.writeHead(200, {
						'Access-Control-Allow-Origin': '*',
						'Access-Control-Allow-Headers': 'Authorization, X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Allow-Request-Method',
						'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
						'Allow': 'GET, POST, OPTIONS, PUT, DELETE'
					});
				response.end();
			}

			if (request.method == 'POST' /*&& request.headers['content-type'] == 'application/json'*/) {
					// response.writeHead(200, { 'Access-Control-Allow-Origin' : '*' });
					// response.end();

				let body = '';

				request.on('data', (chunk) => {
					body += chunk.toString(); // convert Buffer to string
					if (body.length > 1e6) request.connection.destroy(); // if > 1MB of body, kill the connection
				});

				request.on('end', () => {

					let jBody = null;

					try {
						jBody = JSON.parse(body);
					} catch(err) {
						response.writeHead(400, 'Invalid JSON in body', { 'Access-Control-Allow-Origin' : '*' });
						response.end();
						return;
					}

					if (
						   jBody    == null
						|| jBody.ep == undefined
						|| jBody.e == undefined
						|| jBody.e.type == undefined
						|| !Array.isArray(jBody.ep)
						|| typeof jBody.e.type !== 'string'
						) {
						response.writeHead(400, 'Invalid object', { 'Access-Control-Allow-Origin' : '*' });
						response.end();
						return;
					}

					/*if (
						   jBody.e !== undefined
						&& jBody.e.info !== undefined
						&& typeof jBody.e.info !== 'string'
						) {
						response.writeHead(400, 'Data should be  string', { 'Access-Control-Allow-Origin' : '*' });
						response.end();
						return;
					}*/

					jBody.ep.forEach( (ePoint, indx, nde) => {

						if (typeof ePoint !== 'string') {
							response.writeHead(400, 'End Point should be a string', { 'Access-Control-Allow-Origin' : '*' });
							response.end();
							return;
						}

						const arr1 = ePoint.split('/');

						for (const [subsId, subs] of Object.entries(state.subscriptions)) {

							const arr2 = subsId.split('/');

							let matched = true;
							const times = arr1.length > arr2.length ? arr1.length : arr2.length;
							for (let i = 0; i < times; i++) {

								if (arr1[i] == undefined || arr2[i] == undefined) {
									matched = false;
									break;
								}

								if (
									   (arr1[i] == "#" && i == arr1.length - 1)
									|| (arr2[i] == "#" && i == arr2.length - 1)
									) {
									break;
								}

								if (
									   (arr1[i] == "+" && i != arr1.length - 1)
									|| (arr2[i] == "+" && i != arr2.length - 1)
									) {
									continue;
								}

								if (arr1[i] != arr2[i]) {
									matched = false;
									break;
								}
							}

							if (matched) {
								for (const [connId, conn] of Object.entries(subs)) {

									const jData = JSON.stringify({
										iat: Date.now(),
										payload: {
											ep: {
												requested: subsId,
												emitted: ePoint
											},
											e: {
												type: jBody.e.type,
												info: jBody.e.info === undefined ? undefined : jBody.e.info
											}
										}
									})
									.replace(/\'/g, '\\u0027'); // UNICODE ESCAPE: '

									const outData = `${separator}${jData.length}${separator}${jData}`;
									conn.response.write( outData );
									console.log( `[${conn._id}]: ${outData}` );
									resetTick(conn);
								}
							}
						}

					} );
				
					response.writeHead(200, { 'Access-Control-Allow-Origin' : '*' });
					// console.log( Object.keys(state.connections) );
					// console.log( state.subscriptions );
					response.end();

				});

			}

			if (request.method != 'OPTIONS' && request.method != 'POST') {
				response.writeHead(400, 'Method is not POST', { 'Access-Control-Allow-Origin' : '*' });
				response.end();
				return;
			}

			break;

		default:
			response.writeHead(404, { 'Access-Control-Allow-Origin' : '*' });
			response.end();
			break;
	}

}





function trackConnection(parsed_url, parsed_body = {}, request, response) {

	/* SET CONNECTION IN STATE TO TRACK */

	const connId = state.nextId;
	state.nextId += 1;
	
	state.connections[connId] = {};

	const connection	= state.connections[connId];
	connection._id		= connId;
	connection.request	= request;
	connection.response = response;
	connection.query	= parsed_url.query;
	connection.body		= parsed_body;
	connection.onClose	= (err) => {
			console.log(`Connection [${connection._id}] closed default.`);
			
			connection.response.end();
			delete state.connections[connection._id];
		}

	connection.request.on('close', connection.onClose);

	console.log(`Connection ID: ${connection._id}`);

	return connection;
}





function handleSubscription(connection) {



	/* SET NEW VARIABLES TO TRACK */

	resetTick(connection);

	connection.timeout	= setTimeout( () => {
			console.log(`Connection [${connection._id}] hard-coded timed out.`);
			connection.request.removeListener('close', connection.onClose);
			connection.onClose();
		}, 5 * 60 * 1000);

	connection.request.removeListener('close', connection.onClose);
	connection.onClose	= (err) => {
			if (connection !== undefined) {
				console.log(`Connection [${connection._id}] closed.`);

				clearTimeout(connection.timeout);
				clearTimeout(connection.tick);
				
				connection.response.end();
				if ( 'ep' in connection.body) {
					connection.body.ep.forEach( (ePoint, index, node) => {

						if ( ePoint in state.subscriptions ) {

							if ( connection._id in state.subscriptions[ePoint] ) {
								delete state.subscriptions[ePoint][connection._id];
							}

							if ( Object.keys(state.subscriptions[ePoint]).length == 0) {
								delete state.subscriptions[ePoint];
							}
						}
					});
				} else {
					if ( connection._id in state.connections ) {
						delete state.connections[connection._id];
					}
				}
				connection = undefined;
			}
		}
	connection.request.on('close', connection.onClose);



	/* HANDLE REQUEST BODY */

	connection.body.ep.forEach( (ePoint, index, node) => {

		(ePoint in state.subscriptions) || (state.subscriptions[ePoint] = {} )
		state.subscriptions[ePoint][connection._id] = connection;

	});


	delete state.connections[connection._id];



	/* BEGIN WRITING */

	connection.response.writeHead(200, {

			'Access-Control-Allow-Origin' : '*',

			'content-type' : 'text/plain; charset=utf-8', // BROWSER WILL WAIT BUFFER... TO PREVT THAT YOU MUST 'x-content-type-options: nosniff'.
			'x-content-type-options' : 'nosniff', // BROWSER WON'T WAIT BUFFER (RECEIVE BYTES IMMEDIATELY) ON 'content-type: text/plain'

			// 'content-type' : 'application/x-json', // "application/anything" BROWSER WON'T WAIT BUFFER (RECEIVE BYTES IMMEDIATELY)

			// 'Transfer-Encoding' : 'chunked',
			// 'server' : 'GSE', // server: nginx
			// 'x-xss-protection' : '1; mode=block',


			'cache-control' : 'no-cache, no-store, max-age=0, must-revalidate',
			'pragma' : 'no-cache'

		});

	connection.response.write( `${separator}0${separator}` );
	console.log( `[${connection._id}]: ${separator}0${separator}` );

}





function resetTick(connection) {

	if (connection) {
		
		if ( 'tick' in connection ) {
			clearTimeout(connection.tick);
		}

		connection.tick = setTimeout( () => {
				connection.response.write( `${separator}0${separator}` );
				console.log( `[${connection._id}]: ${separator}0${separator}` );
				resetTick(connection);
			}, 50 * 1000);

	}

}