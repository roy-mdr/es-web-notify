
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
	clids: {},
	topics: {}
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

					try {

						emitEvent(
							{
								ep: jBody.ep,
								e: {
									type: jBody.e.type,
									info: jBody.e.info === undefined ? undefined : jBody.e.info
								}
							}
						);

					} catch(err) {
						response.writeHead(400, err, { 'Access-Control-Allow-Origin' : '*' });
						response.end();
					}
				
					response.writeHead(200, { 'Access-Control-Allow-Origin' : '*' });
					// console.log( Object.keys(state.connections) );
					// console.log( state.topics );
					response.end();

				});

			}

			if (request.method != 'OPTIONS' && request.method != 'POST') {
				response.writeHead(400, 'Method is not POST', { 'Access-Control-Allow-Origin' : '*' });
				response.end();
				return;
			}

			break;



			case "/connections":

			if (request.method == 'GET') {

				/*************************************************************************************************/
				/***** EVALUATE AUTHORIZATION TO GET CONNECTIONS (MAYBE ONLY USER CAN SEE OWNED CONNECTIONS) *****/
				/*************************************************************************************************/

				let clidConnected = 0;

				if ( url_parts.query.clid != undefined && state.clids.hasOwnProperty(url_parts.query.clid) ) {
					clidConnected = state.clids[url_parts.query.clid];
				}

				console.log(clidConnected);
				
				response.writeHead(200, { 'Access-Control-Allow-Origin' : '*' });
				// console.log( Object.keys(state.connections) );
				// console.log( state.topics );
				response.write(clidConnected.toString());
				response.end();

			}

			if (request.method != 'GET') {
				response.writeHead(400, 'Method is not GET', { 'Access-Control-Allow-Origin' : '*' });
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


	if (connection.body.clid == undefined || typeof connection.body.clid != 'string') {
		connection.body.clid = '@ANON_CONNECTION@';
	}

	if ( state.clids.hasOwnProperty(connection.body.clid) ) {
		state.clids[connection.body.clid]++;
	} else {
		state.clids[connection.body.clid] = 1;
	}

	if ( state.clids.hasOwnProperty('@TOTAL@') ) {
		state.clids['@TOTAL@']++;
	} else {
		state.clids['@TOTAL@'] = 1;
	}


	connection.onClose	= (err) => {
			console.log(`Connection [${connection._id}](${connection.body.clid}) closed default.`);
			
			connection.response.end();
			delete state.connections[connection._id];

			state.clids[connection.body.clid]--;
			if (state.clids[connection.body.clid] == 0) {
				delete state.clids[connection.body.clid];
			}

			state.clids['@TOTAL@']--;
			if (state.clids['@TOTAL@'] == 0) {
				delete state.clids['@TOTAL@'];
			}

		}

	connection.request.on('close', connection.onClose);


	console.log(`Connection ID: ${connection._id}`);
	console.log(`Client ID: ${connection.body.clid}[${state.clids[connection.body.clid] - 1}]`);

	return connection;
}





function handleSubscription(connection) {



	/* SET NEW VARIABLES TO TRACK */

	resetTick(connection);

	connection.timeout	= setTimeout( () => {
			console.log(`Connection [${connection._id}](${connection.body.clid}) hard-coded timed out.`);
			connection.request.removeListener('close', connection.onClose);
			connection.onClose();
		}, 5 * 60 * 1000);

	connection.request.removeListener('close', connection.onClose);
	connection.onClose	= (err) => {
			if (connection !== undefined) {
				console.log(`Connection [${connection._id}](${connection.body.clid}) closed.`);

				emitEvent({
					ep: [`${connection.body.clid}/@CONNECTION@`],
					e: {
						type: 'disconnect',
						info: {
							clid_instances: state.clids[connection.body.clid] - 1
						}
					}
				});

				clearTimeout(connection.timeout);
				clearTimeout(connection.tick);
				
				connection.response.end();
				if ( 'ep' in connection.body) {
					connection.body.ep.forEach( (ePoint, index, node) => {

						if ( ePoint in state.topics ) {

							if ( connection._id in state.topics[ePoint] ) {
								delete state.topics[ePoint][connection._id];
							}

							if ( Object.keys(state.topics[ePoint]).length == 0) {
								delete state.topics[ePoint];
							}
						}
					});
				} else {
					if ( connection._id in state.connections ) {
						delete state.connections[connection._id];
					}
				}

				state.clids[connection.body.clid]--;
				if (state.clids[connection.body.clid] == 0) {
					delete state.clids[connection.body.clid];
				}

				state.clids['@TOTAL@']--;
				if (state.clids['@TOTAL@'] == 0) {
					delete state.clids['@TOTAL@'];
				}

				connection = undefined;

			}
		}
	connection.request.on('close', connection.onClose);



	/* HANDLE REQUEST BODY */

	connection.body.ep.forEach( (ePoint, index, node) => {

		(ePoint in state.topics) || (state.topics[ePoint] = {} )
		state.topics[ePoint][connection._id] = connection;

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
	console.log( `[${connection._id}](${connection.body.clid}): ${separator}0${separator}` );

	/* CONNECTED! */
	emitEvent({
		ep: [`${connection.body.clid}/@CONNECTION@`],
		e: {
			type: 'connect',
			info: {
				clid_instances: state.clids[connection.body.clid]
			}
		}
	});

}





function resetTick(connection) {

	if (connection) {
		
		if ( 'tick' in connection ) {
			clearTimeout(connection.tick);
		}

		connection.tick = setTimeout( () => {
				connection.response.write( `${separator}0${separator}` );
				console.log( `[${connection._id}](${connection.body.clid}): ${separator}0${separator}` );
				resetTick(connection);
			}, 50 * 1000);

	}

}





function emitEvent(evObj) {



	// VALIDATE EVENT OBJECT //

	if (
		   evObj.ep == undefined
		|| evObj.e == undefined
		|| evObj.e.type == undefined
		|| !Array.isArray(evObj.ep)
		|| typeof evObj.e.type !== 'string'
		) {

		throw 'Invalid event object';
	}



	// VALIDATE EVENT INFO DATA //

	/*if (
		   evObj.e !== undefined
		&& evObj.e.info !== undefined
		&& typeof evObj.e.info !== 'string'
		) {
		response.writeHead(400, 'Data should be  string', { 'Access-Control-Allow-Origin' : '*' });
		response.end();
		return;
	}*/



	// GET SUBSCRIBERS OF GIVEN TOPICS //

	const subscribers = getSubscribers(evObj.ep);



	// EMIT EVENT TO EACH SUBSCRIBER //

	subscribers.forEach( (subscriber) => {

		const jData = JSON.stringify({
			iat: Date.now(),
			payload: {
				ep: {
					requested: subscriber.topicRequested,
					emitted: subscriber.topicEmitted
				},
				e: {
					type: evObj.e.type,
					info: evObj.e.info === undefined ? undefined : evObj.e.info
				}
			}
		})
		.replace(/\'/g, '\\u0027'); // UNICODE ESCAPE: '

		const outData = `${separator}${jData.length}${separator}${jData}`; // FORMAT RESPONSE

		subscriber.connection.response.write( outData ); // SEND DATA TO SUBSCRIBER
		resetTick(subscriber.connection);

		console.log( `[${subscriber.connection._id}](${subscriber.connection.body.clid}): ${outData}` );

		return true;

	} );



}





function getSubscribers(arrayTopics) { // MQTT-topics Style

	/* THIS FUNCTION RETURNS AN ARRAY OF { TOPICS AND CONNECTIONS } OF THE SUBSCRIBERS
	   SUBSCRIBED TO THE GIVEN TOPICS IN arrayTopics */



	const subscribers = [];

	arrayTopics.forEach( (ePoint, indx, nde) => {

		if (typeof ePoint !== 'string') {
			throw 'End Point should be a string';
		}

		const arr1 = ePoint.split('/');

		for (const [subsId, subs] of Object.entries(state.topics)) {

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
					subscribers.push({
						topicRequested: subsId,
						topicEmitted: ePoint,
						connection: conn
					});
				}
			}
		}

	} );

	return subscribers;

}