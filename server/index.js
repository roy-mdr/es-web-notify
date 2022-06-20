
const http	= require("http");
const https = require("https");
const url   = require('url');
const fs    = require("fs");

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
			handleSubscription( trackConnection(url_parts, request, response) );
			break;
		
		case "/event":
			if ( 'id' in url_parts.query) {
				if ( url_parts.query.id in state.subscriptions ) {
					for (const [connId, conn] of Object.entries(state.subscriptions[url_parts.query.id])) {

						const jData = JSON.stringify({
							iat: Date.now(),
							payload: url_parts.query.id + " " + Math.random()
						})
						.replace(/\'/g, '\\u0027'); // UNICODE ESCAPE: '

						const outData = `${separator}${jData.length}${separator}${jData}`;
						conn.response.write( outData );
						console.log( `[${conn._id}]: ${outData}` );
						resetTick(conn);
					}
				}
			}

			
			response.statusCode = 200;
			response.statusMessage = 'OK';
			// console.log( Object.keys(state.connections) );
			// console.log( state.subscriptions );
			response.end();

			break;

		default:
			response.statusCode = 404;
			response.statusMessage = 'Not found';
			response.end();
			break;
	}

}





function trackConnection(parsed_url, request, response) {

	/* SET CONNECTION IN STATE TO TRACK */

	const connId = state.nextId;
	state.nextId += 1;
	
	state.connections[connId] = {};

	const connection		= state.connections[connId];
	connection._id			= connId;
	connection.request	= request;
	connection.response = response;
	connection.query		= parsed_url.query;
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
			console.log(`Connection [${connection._id}] closed.`);

			clearTimeout(connection.timeout);
			clearTimeout(connection.tick);
			
			connection.response.end();
			if ( 'subto' in connection.query) {
				connection.subs.forEach( (key, index, node) => {
					delete state.subscriptions[key][connection._id];

					if ( Object.keys(state.subscriptions[key]).length == 0) {
						delete state.subscriptions[key];
					}
				});
			} else {
				delete state.connections[connection._id];
			}
			connection = undefined;
		}
	connection.request.on('close', connection.onClose);



	/* HANDLE REQUEST QUERY */

	if ( 'subto' in connection.query) {

		connection.subs = JSON.parse(connection.query.subto);
		connection.subs.forEach( (key, index, node) => {
			if (typeof key === 'string') {
				(key in state.subscriptions) || (state.subscriptions[key] = {} )
				state.subscriptions[key][connection._id] = connection;
			}
		});

		delete state.connections[connection._id];
	}





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