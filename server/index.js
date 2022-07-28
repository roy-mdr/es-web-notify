
const notifDb   = require("./mdb");
const serverCfg = require("./options.js");

const http	 = require("http");
const https  = require("https");
const url    = require('url');
const crypto = require("crypto");





// Connect to DB
notifDb.connectDb()
	.then( (conn) => {

		// https.createServer(onRequest).listen(serverCfg.NODE_PORT/*, serverConfig.NODE_HOST*/);
		const server = http.createServer();
		server.on('request', onRequest);
		server.setTimeout(0);
		server.listen(serverCfg.NODE_PORT);
		console.log(`Server started.`, `Listening on port: ${serverCfg.NODE_PORT}`, `Default timeout: ${server.timeout}`);



		// we create a server with automatically binding to a server request listener
		// https.createServer(onRequest).listen(serverCfg.NODE_PORT/*, serverConfig.NODE_HOST*/);
		const server_secure = https.createServer(serverCfg.options_secure);
		server_secure.on('request', onRequest);
		server_secure.setTimeout(0);
		server_secure.listen(serverCfg.NODE_PORT_SECURE);
		console.log(`Secure server started.`, `Listening on port: ${serverCfg.NODE_PORT_SECURE}`, `Default timeout: ${server_secure.timeout}`);

	} )





const separator = "''";
const state = {
	nextId: 0,
	connections: {},
	clids: {},
	clid_headers: {},
	topics: {}
};





function onRequest(request, response) {

	const url_parts = url.parse(request.url, true); // url.parse(urlStr, [parseQueryString], [slashesDenoteHost])
	console.log(`New connection to: ${url_parts.pathname}`);
	
	switch(url_parts.pathname) {
		
		case "/": // Endpoint to subscribe (listen) to topics

			if (request.method == 'OPTIONS') {
				response.writeHead(200, {
						'Access-Control-Allow-Origin': '*',
						'Access-Control-Allow-Headers': 'Authorization, X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Allow-Request-Method',
						'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
						'Allow': 'GET, POST, OPTIONS, PUT, DELETE'
					});
				response.end();
				return;
			}

			if (request.method == 'POST' /*&& request.headers['content-type'] == 'application/json'*/) {

				/* HANDLE REQUEST BODY */

				let body = '';

				request.on('data', (chunk) => {
					// console.log(chunk);
					// body += chunk.toString(); // convert Buffer to string
					body += chunk;
					if (body.length > 1e6) request.connection.destroy(); // if > 1MB of body, kill the connection
				});

				request.on('end', () => {

					let jBody = null;

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



					if ( jBody.bind_key !== undefined ) {
						// This means that all the Event Points should be binded to the USER_ID doing the request.
						// This is acomplished prepending "@bind@" to the topic requested (for perfomance) ??? + adding the USER_ID to the connection (for security)

						// The USER_ID comes from asking it to the server, when sending the encrypted data in jBody.bind_key
						// If they requested a binding but there was not user registered in the session, the user will be "[][][]"
						try {

							getUserIdFromServer(jBody.bind_key, (uid) => {

								delete jBody.bind_key;

								parseSubscriberEPoints(jBody.ep, uid)
									.then( newEp => {
										jBody.ep = newEp;
										handleSubscription( trackConnection(url_parts, jBody, request, response) );
									})
									.catch( ex => {
										response.writeHead(400, ex, { 'Access-Control-Allow-Origin' : '*' });
										response.end();
										return;
									});


							});

						} catch(exc) {
							response.writeHead(400, exc, { 'Access-Control-Allow-Origin' : '*' });
							response.end();
							return;
						}
						
						
					} else {

						parseSubscriberEPoints(jBody.ep)
							.then( newEp => {
								jBody.ep = newEp;
								handleSubscription( trackConnection(url_parts, jBody, request, response) );
							})
							.catch( ex => {
								response.writeHead(400, ex, { 'Access-Control-Allow-Origin' : '*' });
								response.end();
								return;
							});

					}

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
				return;
			}

			if (request.method == 'POST' /*&& request.headers['content-type'] == 'application/json'*/) {
					// response.writeHead(200, { 'Access-Control-Allow-Origin' : '*' });
					// response.end();
					// return;

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

					const toQuery = [];

					for (let i = 0; i < jBody.ep.length; i++) {

						const ePoint = jBody.ep[i];

						if (ePoint === null) {
							// throw "Event Point can't be null";
							response.writeHead(400, "Event Point can't be null", { 'Access-Control-Allow-Origin' : '*' });
							response.end();
							return;
						}

						if (typeof ePoint === 'string') {
							emitEvent({
								ep: {
									topic: ePoint
								},
								e: {
									type: jBody.e.type,
									detail: jBody.e.detail === undefined ? undefined : jBody.e.detail
								}
							});
						}

						if (typeof ePoint === 'object') {

							if ( ePoint.topic == undefined ) {
								// throw 'Topic missing';
								response.writeHead(400, 'Topic missing', { 'Access-Control-Allow-Origin' : '*' });
								response.end();
								return;
							}

							if ( typeof ePoint.topic !== 'string' ) {
								// throw 'Topic should be a string';
								response.writeHead(400, 'Topic should be a string', { 'Access-Control-Allow-Origin' : '*' });
								response.end();
								return;
							}

							if ( ePoint.whisper !== undefined ) {
								if ( typeof ePoint.whisper !== 'number' || !Number.isInteger(ePoint.whisper) ) {
									response.writeHead(400, 'Invalid connection id in whisper', { 'Access-Control-Allow-Origin' : '*' });
									response.end();
									return;
								}
							}

							if (jBody.bind_key === undefined) {
								emitEvent({
									ep: {
										topic: ePoint.topic,
										whisper: ePoint.whisper
									},
									e: {
										type: jBody.e.type,
										detail: jBody.e.detail === undefined ? undefined : jBody.e.detail
									}
								});
							} else {
								toQuery.push(ePoint.topic);
							}
						}
					}

					if (toQuery.length == 0) {
						response.writeHead(200, { 'Access-Control-Allow-Origin' : '*' });
						response.end();
						return;
					}

					if (jBody.bind_key !== undefined) {

						// Get USER_ID from bind_key

						const base64ToDecrypt = jBody.bind_key;
						let decryptedBindKey;

						try {

							const bufferToDecrypt = new Buffer.from(base64ToDecrypt, 'base64');
							const decrypted = crypto.privateDecrypt(

								{
									key: serverCfg.local_privateKey,
									padding: crypto.constants.RSA_PKCS1_PADDING
								},

								bufferToDecrypt
							);

							decryptedBindKey = JSON.parse( decrypted.toString() );

						} catch(err) {

							console.log("Whoops! Something went wrong while decrypting.");
							console.log("ERROR:", err);
							response.writeHead(400, 'Error in Bind Key', { 'Access-Control-Allow-Origin' : '*' });
							response.end();
							return;

						}

						if (
							   decryptedBindKey.iat == undefined
							|| decryptedBindKey.uid == undefined
							|| !((new Date(decryptedBindKey.iat)).getTime() > 0) // Not valid timestamp
							) {
							console.log("Invalid Bind Key");
							response.writeHead(400, 'Invalid Bind Key', { 'Access-Control-Allow-Origin' : '*' });
							response.end();
							return;
						}



						const iatMs = decryptedBindKey.iat * 1000;
						const nowMs = Date.now();
						const toleranceMs = 3000; // 3 secondS

						if ( (iatMs > nowMs) || (iatMs < (nowMs - toleranceMs)) ) {
							console.log("Bind Key expired");
							response.writeHead(400, 'Invalid Bind Key', { 'Access-Control-Allow-Origin' : '*' });
							response.end();
							return;
						}

						
						/* GET USER_IDs THAT CAN LISTEN EACH EVENT POINT */
						/* ¿¿¿ DELETE USERS THAT ARE NOT LISTENING ??? */
						/* FORMAT NEW EVENT WITH USER_IDs IN TOPIC */ // bind:user_id/event_point
						/* EMIT EVENT */

						const epQuery = "SELECT `pub`, `sub`, `pub_password` FROM `registered_endpoints` WHERE `endpoint` = " + "'" + toQuery.join("' OR `endpoint` = '") + "'";

						// Connect to DB
						notifDb.connectDb()
							.then( (conn) => conn.query(epQuery) )
							.then( (rows) => {

								for (let rowIndex = 0, rl = rows.length; rowIndex < rl; rowIndex++) {
									const row = rows[rowIndex];

									const allowPub = JSON.parse(row[0]);
									const allowSub = JSON.parse(row[1]);
									const pub_password = JSON.parse(row[2]);

									/** EVALUATE PASSWORD **/

									if ( allowPub.includes(decryptedBindKey.uid) ) { // Evaluate credentials to publish event

										try {

											emitEvent({
												ep: {
													topic: `@bind@/${toQuery[rowIndex]}`,
													allowedSubs: allowSub,
													whisper: ePoint.whisper
												},
												e: {
													type: jBody.e.type,
													detail: jBody.e.detail === undefined ? undefined : jBody.e.detail
												}
											});

											if (allowSub.includes("*")) {
												emitEvent({
													ep: {
														topic: toQuery[rowIndex],
														whisper: ePoint.whisper
													},
													e: {
														type: jBody.e.type,
														detail: jBody.e.detail === undefined ? undefined : jBody.e.detail
													}
												});
											}

										} catch(err) {
											response.writeHead(400, err, { 'Access-Control-Allow-Origin' : '*' });
											response.end();
											return;
										}

									} else {
										console.log(`${decryptedBindKey.uid} can't publish to ${jBody.ep[rowIndex].topic}`);
									}
								}

								response.writeHead(200, { 'Access-Control-Allow-Origin' : '*' });
								response.end();
								return;

								
							} )
							.catch(err => {
								console.log("not connected due to error: " + err);

								response.writeHead(400, err, { 'Access-Control-Allow-Origin' : '*' });
								response.end();
								return;
							});


					}
					

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


				if ( url_parts.query.clid != undefined ) {

					if ( url_parts.query.details != undefined && url_parts.query.details == "true" ) {

						let clidConnHeaders = {};

						if ( state.clid_headers.hasOwnProperty(url_parts.query.clid) ) {
							clidConnHeaders = state.clid_headers[url_parts.query.clid];
						}

						response.writeHead(200, { 'Access-Control-Allow-Origin' : '*', 'content-type' : 'application/json;charset=utf-8' });
						// console.log( Object.keys(state.connections) );
						// console.log( state.topics );
						response.write( JSON.stringify(clidConnHeaders) );
						response.end();
						return;

					} else {

						let clidConnected = 0;

						if (state.clids.hasOwnProperty(url_parts.query.clid)) {
							clidConnected = state.clids[url_parts.query.clid];
						}

						console.log(clidConnected);
						
						response.writeHead(200, { 'Access-Control-Allow-Origin' : '*' });
						// console.log( Object.keys(state.connections) );
						// console.log( state.topics );
						response.write(clidConnected.toString());
						response.end();
						return;

					}

				} else {

					response.writeHead(200, { 'Access-Control-Allow-Origin' : '*', 'content-type' : 'application/json;charset=utf-8' });
					// console.log( Object.keys(state.connections) );
					// console.log( state.topics );
					response.write( JSON.stringify(state.clids) );
					response.end();
					return;

				}

				

			}

			if (request.method != 'GET') {
				response.writeHead(400, 'Method is not GET', { 'Access-Control-Allow-Origin' : '*' });
				response.end();
				return;
			}

			break;



		case "/state":

			if (request.method == 'GET') {

				// Stringify JSON with depth limit:
				// > from: https://gist.github.com/bennettmcelwee/06f0cadd6a41847f848b4bd2a351b6bc
				const stringify = (obj/*: any*/, depth = 1)/*: string*/ => {
					return !obj
						? JSON.stringify(obj/*, null, 2*/)
						: typeof obj === 'object'
						? JSON.stringify(
								JSON.parse(
									depth < 1
										? '"???"'
										: `{${Object.keys(obj)
												.map((k) => `"${k}": ${stringify(obj[k], depth - 1)}`)
												.join(', ')}}`,
								)/*,
								null,
								2,*/
							)
						: JSON.stringify(obj/*, null, 2*/);
				};

				response.writeHead(200, { 'Access-Control-Allow-Origin' : '*', 'content-type' : 'application/json;charset=utf-8' });
				response.write( stringify(state, 2) );
				response.end();
				return;
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
			return;
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

	if ( !state.clid_headers.hasOwnProperty(connection.body.clid) ) {
		state.clid_headers[connection.body.clid] = {};
	}

	if ( !state.clid_headers[connection.body.clid].hasOwnProperty(connection._id) ) {
		state.clid_headers[connection.body.clid][connection._id] = {
			headers: connection.request.headers,
			body: connection.body
		};
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

			delete state.clid_headers[connection.body.clid][connection._id];
			if (Object.keys(state.clid_headers[connection.body.clid]).length == 0) {
				delete state.clid_headers[connection.body.clid];
			}

		}

	connection.request.connection.on('close', connection.onClose);


	console.log(`Connection ID: ${connection._id}`);
	console.log(`Client ID: ${connection.body.clid}[${state.clids[connection.body.clid] - 1}]`);

	return connection;
}





function handleSubscription(connection) {



	/* SET NEW VARIABLES TO TRACK */

	resetTick(connection);

	connection.timeout	= setTimeout( () => {
			console.log(`Connection [${connection._id}](${connection.body.clid}) hard-coded timed out.`);
			connection.request.connection.removeListener('close', connection.onClose);
			connection.onClose();
		}, 5 * 60 * 1000); // 5 minutes

	connection.request.connection.removeListener('close', connection.onClose);
	connection.onClose	= (err) => {
			if (connection !== undefined) {
				console.log(`Connection [${connection._id}](${connection.body.clid}) closed.`);

				emitEvent({
					ep: {
						topic: `@CONNECTION@/${connection.body.clid}`
					},
					e: {
						type: 'disconnect',
						detail: {
							clid_instances: state.clids[connection.body.clid] - 1
						}
					}
				});

				clearTimeout(connection.timeout);
				clearTimeout(connection.tick);
				
				connection.response.end();
				if ( 'ep' in connection.body) {

					for (let index = 0, cbep = connection.body.ep.length; index < cbep; index++) {
						const ePoint = connection.body.ep[index];

						if ( ePoint.topic in state.topics ) {

							if ( connection._id in state.topics[ePoint.topic] ) {
								delete state.topics[ePoint.topic][connection._id];
							}

							if ( Object.keys(state.topics[ePoint.topic]).length == 0) {
								delete state.topics[ePoint.topic];
							}
						}
					}
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

				delete state.clid_headers[connection.body.clid][connection._id];
				if (Object.keys(state.clid_headers[connection.body.clid]).length == 0) {
					delete state.clid_headers[connection.body.clid];
				}

				connection = undefined;

				/* --- CHECK MEMORY --- */
				console.log("---------- MEMORY STATUS ----------")
				const used = process.memoryUsage();
				for (let key in used) {
				  console.log(`${key} ${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB`);
				}
				console.log("-----------------------------------")
				/* -------------------- */

			}
		}
	connection.request.connection.on('close', connection.onClose);



	/* HANDLE REQUEST BODY */

	for (let index = 0, cbep = connection.body.ep.length; index < cbep; index++) {
		const ePoint = connection.body.ep[index];

		(ePoint.topic in state.topics) || (state.topics[ePoint.topic] = {} )
		state.topics[ePoint.topic][connection._id] = {
				// bind: ePoint.bind,
				conn: connection
			};
		if (ePoint.bind !== undefined) state.topics[ePoint.topic][connection._id].bind = ePoint.bind;
	}


	delete state.connections[connection._id];

	console.log(connection.request.headers);
	// console.log(connection.request.connection.server);
	// console.log(connection.request.connection.server.sessionIdContext);
	// console.log(connection.request.connection.remoteAddress);



	/* BEGIN WRITING */

	connection.response.writeHead(200, {

			'Access-Control-Allow-Origin' : '*',

			'content-type' : 'text/plain;charset=utf-8', // BROWSER WILL WAIT BUFFER... TO PREVT THAT YOU MUST 'x-content-type-options: nosniff'.
			'x-content-type-options' : 'nosniff', // BROWSER WON'T WAIT BUFFER (RECEIVE BYTES IMMEDIATELY) ON 'content-type: text/plain'

			// 'content-type' : 'application/x-json', // "application/anything" BROWSER WON'T WAIT BUFFER (RECEIVE BYTES IMMEDIATELY)

			// 'Transfer-Encoding' : 'chunked',
			// 'server' : 'GSE', // server: nginx
			// 'x-xss-protection' : '1; mode=block',


			'cache-control' : 'no-cache, no-store, max-age=0, must-revalidate',
			'pragma' : 'no-cache'

		});



	/* CONNECTED! */
	// console.log(state.topics)
	emitEvent({
		ep: {
			topic: `@CONNECTION@/${connection.body.clid}`
		},
		e: {
			type: 'connect',
			detail: {
				clid_instances: state.clids[connection.body.clid]
			}
		}
	});





	// Write initial response to connection

	const initOutData = {
		topic_requested: '@SERVER@',
		topic_emitted:   '@SERVER@',
		type:   'info',
		detail: {
			connid: connection._id
		}
	};

	subscriberSend(connection, initOutData); // SEND DATA TO SUBSCRIBER
	resetTick(connection);




	topicsInfoMiddleware(connection);

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




function formatOutEvent(evObj) {

	const jData = JSON.stringify({
		iat: Date.now(),
		ep: {
			requested: evObj.topic_requested,
			emitted:   evObj.topic_emitted
		},
		e: {
			type: evObj.type,
			detail: evObj.detail
		}
	})
	.replace(/\'/g, '\\u0027'); // UNICODE ESCAPE: '

	return `${separator}${jData.length}${separator}${jData}`; // FORMAT RESPONSE

}





function emitEvent(evObj) {


	/*
		Expects evObj:
		{
			ep: {
				topic: String,
				allowedSubs: Uid[], // Otional
				whisper: ConnId // Optional
			},
			e: {
				type: String,
				detail: Any // Optional
			}
		}
	*/



	// GET SUBSCRIBERS OF GIVEN TOPICS //

	const subscribers = getSubscribers(evObj.ep);



	// EMIT EVENT TO EACH SUBSCRIBER //

	for (let sIx = 0, sl = subscribers.length; sIx < sl; sIx++) {
		const subscriber = subscribers[sIx];

		let allowed = true;

		if (subscriber.bind !== undefined) {
			// Este topico solo puede ser emitido por un evento binded.
			allowed = false;

			if ( evObj.ep.allowedSubs !== undefined && Array.isArray(evObj.ep.allowedSubs) ) {
				// Fue emitido por un evento binded! comprobando permisos...
				if ( evObj.ep.allowedSubs.includes("*") || evObj.ep.allowedSubs.includes("+") || evObj.ep.allowedSubs.includes(subscriber.bind) ) {
					allowed = true;
				}
			}
			
		}

		if ( evObj.ep.whisper !== undefined && evObj.ep.whisper !== subscriber.connection._id ) {
			// Event may not be whispered to this subscriber!
			allowed = false;
		}



		if (!allowed) {
			continue;
		}




		console.log(`Topics matched! (${subscriber.bind})`, `Requested: "${subscriber.topicRequested}"`, `Emitted: "${subscriber.topicEmitted}"`)


		const outData = {
			topic_requested: subscriber.bind !== undefined ? removeBindId(subscriber.topicRequested) : subscriber.topicRequested,
			topic_emitted:   subscriber.bind !== undefined ? removeBindId(subscriber.topicEmitted)   : subscriber.topicEmitted,
			type:   evObj.e.type,
			detail: evObj.e.detail === undefined ? undefined : evObj.e.detail
		};

		subscriberSend(subscriber.connection, outData); // SEND DATA TO SUBSCRIBER
		resetTick(subscriber.connection);

	}

	return true;

}





function getSubscribers(ePoint) { // MQTT-topics Style

	/* THIS FUNCTION RETURNS AN ARRAY OF CONNECTIONS OF THE SUBSCRIBERS SUBSCRIBED TO THE GIVEN TOPIC */



	const subscribers = [];

	if (typeof ePoint.topic === undefined) {
		throw 'Topic missing';
	}

	if (typeof ePoint.topic !== 'string') {
		throw 'Topic should be a string';
	}

	const arr1 = ePoint.topic.split('/');

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
					topicEmitted: ePoint.topic,
					bind: conn.bind,
					connection: conn.conn
				});
			}
		}
	}

	return subscribers;

}





function getUserIdFromServer(base64String, callback) {

	let body = '';

	const postData = /*JSON.stringify(*/base64String/*)*/;

	const options = {
		hostname: 'estudiosustenta.myds.me',
		port: 443,
		path: '/test/session/getUserId',
		method: 'RETREIVE',
		headers: {
			'Content-Type': 'application/json',
			'Content-Length': Buffer.byteLength(postData)
		}
	};

	const req = https.request(options, (res) => {
		// console.log(`STATUS: ${res.statusCode}`);
		// console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
		res.setEncoding('utf8');
		res.on('data', (chunk) => {
			// console.log(`BODY: ${chunk}`);
			body += chunk;
			if (body.length > 1e6) request.connection.destroy(); // if > 1MB of body, kill the connection
		});
		res.on('end', () => {
			// console.log('No more data in response.');
			let userId;

			try {
				userId = JSON.parse(body.toString());
			} catch(err) {
				// console.log('Binding server response:');
				// console.log(body.toString());
				console.log(`Invalid JSON in body from binding server.`);
				throw `Error connecting to binding server`;
			} finally {

				if (userId == "" || userId == "__DONT__") {
					throw `Don't even try`;
				}

				callback(userId);
				return;
				
			}
			
		});
	});

	req.on('error', (e) => {
		console.log(`problem with request: ${e.message}`);
		throw `Error connecting to binding server`;
	});

	// Write data to request body
	req.write(postData);
	req.end();
	// return;

}





function removeBindId(topicString) {

	const arr1 = topicString.split('/');
	arr1.shift();
	return arr1.join('/');

}





function parseSubscriberEPoints(ePointArray, uid = undefined) {

	return new Promise( (resolve, reject) => {

		if ( !(Array.isArray(ePointArray)) ) {
			reject('Event Points should be an array (internal error)');
		}

		const arrReturn = [];

		if (ePointArray.length == 0) resolve(arrReturn);

		for (let index = 0, epl = ePointArray.length; index < epl; index++) {
			const ePoint = ePointArray[index];

			if ( (typeof ePoint !== 'string') && (typeof ePoint !== 'object') ) {
				reject('Invalid Event Point');
			}

			let ePointTopic = '';
			let bindedTarget = undefined;

			if (typeof ePoint === 'string') {
				ePointTopic = ePoint;
			}

			if (typeof ePoint === 'object') {

				if ( ePoint.topic == undefined ) {
					reject('Topic missing');
				}

				if ( typeof ePoint.topic !== 'string' ) {
					reject('Topic should be a string');
				}


				if ( (ePoint.binded !== undefined && ePoint.binded === true) && uid !== undefined ) {
					bindedTarget = uid;
					ePointTopic = `@bind@/${ePoint.topic}`;
				} else {
					ePointTopic = ePoint.topic;
				}
			}

			/*****************************************************/
			/***** EVALUATE ACCESS/PERMISSION TO EVENT POINT *****/
			/*****************************************************/

			arrReturn.push({
				topic: ePointTopic,
				bind: bindedTarget,
			});


			if (index == epl - 1) {
				resolve(arrReturn);
			}
		}

	} );

	

}







function topicsInfoMiddleware(connection) {

	const topicsArray = connection.body.ep;

	for (let i = 0; i < topicsArray.length; i++) {

		// if subscribed to "@CONNECTION@/clid" emit event how many instances are connected
		if ( /^@CONNECTION@\/[^\/]+$/.test(topicsArray[i].topic) ) {

			const clid = topicsArray[i].topic.split('/')[1];

			let clidConnected = 0;

			if (state.clids.hasOwnProperty(clid)) {
				clidConnected = state.clids[clid];
			}


			// Write response to connection

			const outData = {
				topic_requested: topicsArray[i].topic,
				topic_emitted:   topicsArray[i].topic,
				type:   'available',
				detail: {
					clid_instances: clidConnected.toString()
				}
			};

			subscriberSend(connection, outData); // SEND DATA TO SUBSCRIBER
			resetTick(connection);

		}
		
	}
}





function subscriberSend(subConnection, dataEvent) {

	const outData = formatOutEvent(dataEvent);

	subConnection.response.write(outData);

	console.log( `[${subConnection._id}](${subConnection.body.clid}): ${outData}` );

}
