const http  = require('http');
const https = require('https');
// require('https').globalAgent.options.ca = require('ssl-root-cas/latest').create();

class NoPollSubscriber {
	/************************************************
	          SHOULD LISTEN FOR VALID JSON,          
	         {"iat":Unixtime,"payload":Object}         
	    -----------------------------------------
	  To auto-start subscription ( .start() )
	  should be inside the window.onload function,
	  otherwise Firefox will not finish the
	  page loading indicator.
	************************************************/



	/////////////////////////////////////////////////
	////////////////// CONSTRUCTOR //////////////////

	constructor(urlOrObj, callbackOnParsed, callbackOnSubscribe = ()=>{}, callbackOnStateChange = ()=>{}) {

		// PRIVATE ATTRIBUTES //
		this._XHR          = this._setHTTPRequest(urlOrObj);
		this._bindURL      = '';
		this._onParsed     = callbackOnParsed;
		this._onSubscribe  = callbackOnSubscribe;
		this._onStChange   = callbackOnStateChange;
		this._responseLen  = 0;
		this._dataMem      = '';
		this._fullResponse = null;
		this._subscribed   = false;
		this._stopped      = false;
		this._separator    = "''";
		this._httpCall     = null;
		this._retryTimeout = setTimeout(() => {}, 0);
		this._lastIat      = 0;
		this._resTimeout   = setTimeout(() => {}, 0);

		// SET EVENT LISTENERS //
		this._addOnlineListeners();
		// this._remOnlineListeners();

	}





	/////////////////////////////////////////////////
	//////////////// PUBLIC METHODS ////////////////

	start( urlOrObj              = this._XHR,
	       callbackOnParsed      = this._onParsed,
	       callbackOnSubscribe   = this._onSubscribe,
	       callbackOnStateChange = this._onStChange ) { // Start, restart and resume paused

		this.stop();
		this.abort();
		clearTimeout(this._retryTimeout);
		this.setURL(urlOrObj);

		this._stopped      = false;
		this._onParsed     = callbackOnParsed;
		this._onSubscribe  = callbackOnSubscribe;
		this._onStChange   = callbackOnStateChange;

		this._subscribe();
	}

	stop() { // Wont call again when ready state == 4
		this._stopped = true;
	}

	abort() { // Abort connection (will retry, so to fully stop: fist stop() then abort())
		clearTimeout(this._retryTimeout);
		if (this._httpCall) this._httpCall.destroy();
		this._dataMem = '';
	}

	validateIat(rawString) { // Experimental...

		if ( typeof rawString !== 'string' ) {
			console.error('Parameter should be a JSON encoded string.');
			return;
		}

		this._validateIat(rawString);
	}





	/////////////////////////////////////////////////
	//////////////// PRIVATE METHODS ////////////////

	_addOnlineListeners() {
		// window.NoPollSubscriber = this;
		// window.addEventListener('online',  this._isOnline );
		// window.addEventListener('offline', this._isOffline);
	}

	_remOnlineListeners() {
		// delete window.NoPollSubscriber;
		// window.removeEventListener('online',  this._isOnline );
		// window.removeEventListener('offline', this._isOffline);
	}

	_isOnline(ev) {
		// console.log('came online');
		// console.log(this);
		// console.log(ev);
		ev.target.NoPollSubscriber.start();
	}

	_isOffline(ev) {
		// console.log('came offline');
		// console.log(this);
		// console.log(ev);
		ev.target.NoPollSubscriber.stop();
		ev.target.NoPollSubscriber.abort();
		ev.target.NoPollSubscriber._onStChange({value:-1,state:"OFFLINE"});
	}

	_setHTTPRequest(request) {

		if ( (typeof request !== 'string') && (typeof request !== 'object') ) {
			console.error('What are you requesting?', 'Request should be a string or an object with options.');
			return;
		}

		if (typeof request === 'string') {
			const url = request;
			request = {};
			request.url = url;
		}

		if (typeof request === 'object') {

			if ( !('url' in request) ) {
				console.error('should pass url');
				return;
			}

			if ( typeof request.url !== 'string') {
				console.error('url should be a string');
				return;
			}

			if ( ('method' in request) && typeof request.method !== 'string') {
				console.error('method should be a string');
				return;
			}

			if ( ('data' in request) && typeof request.data !== 'string') {
				request.data = JSON.stringify(request.data);
			}

			if ( 'headers' in request ) {
				if (typeof request.headers !== 'object') {
					console.error('headers should be an object');
					return;
				} else {
					for ( const key in request.headers ) {
						if (typeof request.headers[key] !== 'string') {
							console.error(`header '${key}' should be a string`);
							return;
						}
					}
				}
			}

			if ( 'dataType' in request ) {

				if (typeof request.dataType !== 'string') {
					console.error('dataType should be a string');
					return;
				} else {
					('headers' in request) || (request.headers = {})
					request.headers['Content-Type'] = request.dataType;
				}
				
			}
		}

		const xhr = {
			url:     request.url,
			method:  request.method  || 'GET',
			data:    request.data    || undefined,
			headers: request.headers || {}
		}
		
		// console.log(xhr);

		return xhr;
	}

	_logicOnChunk() {
		const obj = this;

		let payload = '';
		const response = obj._httpCall.responseText.substring(obj._responseLen);
		const bUpdated = obj._httpCall.responseText.length - obj._responseLen;
		obj._responseLen = obj._httpCall.responseText.length;

		
		/*
		// Very useful logging
		console.log(
			response,
			`(${bUpdated} bytes updated)`,
			`(${obj._responseLen} bytes total)`,
			`(HTTP response state: ${obj._httpCall.readyState})`);
		*/

		if ( obj._dataMem.length > 0 ) { // If there is data in memory
			payload = obj._dataMem + response; // Add it to the beginning
		} else {
			payload = response;
		}

		obj._dataMem = ''; // Empty memory

		obj._parseChunks( payload.split(obj._separator) );
	}


	_parseChunks(array) {
		const obj = this;

		let expLen = 0;

		if ( array[0].replace(/\s/g, '').length == 0) { array.shift(); }

		if ( array.length == 0 ) {
			return false;
		}

		if ( array.length == 1 ) {
			obj._dataMem = array[0];
			return false;
		}

		expLen = array.shift();

		if ( array[0].length < expLen ) {
			obj._dataMem = expLen + obj._separator + array[0];
			return false;
		} else {

			if ( expLen > 0) {
				const cData = array[0].substring(0, expLen);

				// if ( obj._validateIat( cData ) ) { // Optional
					obj._onParsed( cData );
				// }
			}

			if ( array.length > 1 ) {
				array.shift();
				obj._parseChunks(array);
			} else {
				if ( array[0].substring(expLen, array[0].length).replace(/\s/g, '').length != 0 ) {
					obj._dataMem = array[0];
				}
				return false;
			}
			
		}

	}


	_validateIat(rawString) {
		const obj = this;

		let jData;

		try {
			jData = JSON.parse(rawString);
		} catch(er) {
			console.warn(`Data received is not valid JSON.`, `Timestamp validation was not done... Returning data anyway.`);
			console.error(er);
			return true;
		}

		if ( !('iat' in jData) ) {
			console.warn(`Data received does not match expected format: {"iat": Unixtime, "payload": Object}`, `Timestamp validation was not done... Returning data anyway.`);
			return true;
		}

		if ( !((new Date(jData.iat)).getTime() > 0) ) {
			console.warn(`Timestamp received is invalid.`, `Timestamp validation was not done... Returning data anyway.`);
			return true;
		}

		if (jData.iat < obj._lastIat) {
			console.warn(`Data received is older than last read.`, `Data will be not returned.`);
			return false;
		} else {
			obj._lastIat = jData.iat;
			return true;
		}

	}



	_ajaxReq(protocol) {

		let pr;

		switch (protocol) {
			case 'http:':
				pr = http;
				break;
			case 'https:':
				pr = https;
				break;
			default:
				pr = false;
				break;
		}

		return pr;
	}



	_gBindKey() {

		const obj = this;

		return new Promise( (resolve, reject) => {
			
			if (obj._bindURL == '') {
				resolve();
				return;
			}


			// console.info('Binding...')

			const parseUrl = new URL(obj._bindURL);

			const options = {
				hostname: parseUrl.hostname,
				port: parseUrl.port,
				path: parseUrl.pathname,
				headers: {
					// 'Cookie': 'PHPSESSID=71407ba645ab1ffef88ccaa4232cfb62'
				}
			}

			let bKey = '';

			const getKey = obj._ajaxReq(parseUrl.protocol).get(options, (res) => {

				res.on('data', (d) => {
					bKey += d.toString();
				});

			});



			getKey.on('error', (e) => {
				console.error("_gBindKey on.error:", e);
			});



			getKey.on('close', (e) => {
				console.log("_gBindKey on.close:", e);

				// SIMILAR TO readyState 4 (could be successful or aborted...)

				if ( !getKey.res ) {
					console.error(`Unbinding...`);
					resolve();
					return;
				}

				// console.log(getKey.res.statusCode, bKey)

				if (getKey.res.statusCode >= 200 && getKey.res.statusCode < 300) {

					// console.info('Binded!')

					// Inject user binding to body
					const tmpObj = JSON.parse(obj._XHR.data) || {};
					tmpObj.bind_key = bKey;
					obj._XHR.data = JSON.stringify(tmpObj);

					resolve();
					return;

				} else {
					console.error(`Unbinding...`);
					resolve();
					return;
				}

			});

			getKey.end();

		} );

	}



	_subscribe() {

		const used = process.memoryUsage();
		for (let key in used) {
			console.log(`${key} ${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB`);
		}

		if (this._stopped) return false;
		const obj = this;

		if (obj._httpCall) {
			obj._httpCall = null;
			obj._subscribe();
			return false;
		}


		obj._gBindKey()
			.then( () => {

				const parseUrl = new URL(obj._XHR.url);

				obj._XHR.headers['Content-Length'] = Buffer.byteLength(obj._XHR.data).toString();

				const options = {
					hostname: parseUrl.hostname,
					port: parseUrl.port,
					path: parseUrl.pathname,
					method: obj._XHR.method,
					headers: obj._XHR.headers
				}


				// SIMILAR TO readyState 0 ?
				obj._onStChange({value:0,state:"DISCONNECTED"});
				obj._subscribed = false;

				obj._httpCall = obj._ajaxReq(parseUrl.protocol).request(options, (res) => {

					// console.log('statusCode:', res.statusCode);
					// console.log('headers:', res.headers);

					obj._httpCall.responseText = '';
					obj._responseLen = 0;

					res.on('data', (d) => {

						// SIMILAR TO readyState 3

						if (res.statusCode >= 200 && res.statusCode < 300) {
							obj._onStChange({value:2,state:"CONNECTED"});

							if ( !obj._subscribed ) {
								obj._subscribed = true;
								obj._onSubscribe();
							}

							obj._resTimeoutRestart();
						} else {
							obj._onStChange({value:0,state:"DISCONNECTED"});
						}

						obj._httpCall.responseText += d.toString();
						obj._logicOnChunk();
					});

					res.on('end', () => {
						// DATA FINISHED TRANSFERING

						// SIMILAR TO readyState 4 (successful)

						if (res.statusCode >= 200 && res.statusCode < 300) {

							if (obj._httpCall.responseText.length == 0) {
								obj._onStChange({value:0,state:"DISCONNECTED"});
								obj._subscribed = false;
								console.error('No bytes were received. Breaking loop... Retrying in 5 seconds.');
								obj._retryTimeout = setTimeout( () => { obj._subscribe() }, 5000);
								return false;
							}

							obj._subscribe(); // RECONNECTING!

						} else {
							obj._onStChange({value:0,state:"DISCONNECTED"});
							obj._subscribed = false;
							if ( !this._stopped ) {
								console.error(`HTTP Status: ${res.statusCode}.`, 'Breaking loop... Retrying in 5 seconds.');
								obj._retryTimeout = setTimeout( () => { obj._subscribe() }, 5000);
							}
							return false;
						}
					});
				});



				obj._httpCall.on('error', (e) => {
					console.error("_httpCall on.error:", e);

					obj._onStChange({value:0,state:"DISCONNECTED"});
					obj._subscribed = false;
				});



				obj._httpCall.on('connect', (e) => {
					console.log("_httpCall on.connect:", e);
				});

				obj._httpCall.on('continue', (e) => {
					console.log("_httpCall on.continue:", e);
				});

				obj._httpCall.on('information', (e) => {
					console.log("_httpCall on.information:", e);
				});

				obj._httpCall.on('response', (e) => {
					console.log("_httpCall on.response:", /*e*/);

					// SIMILAR TO readyState 2 (with response! so headers received)
				});

				obj._httpCall.on('socket', (e) => {
					console.log("_httpCall on.socket:", /*e*/);

					// SIMILAR TO readyState 1
					obj._onStChange({value:1,state:"WAITING"});
				});

				obj._httpCall.on('timeout', (e) => {
					console.log("_httpCall on.timeout:", e);
				});

				obj._httpCall.on('upgrade', (e) => {
					console.log("_httpCall on.upgrade:", e);
				});

				obj._httpCall.on('close', (e) => {
					console.log("_httpCall on.close:", e);

					// SIMILAR TO readyState 4 (could be successful or aborted...)

					obj._onStChange({value:0,state:"DISCONNECTED"});
					obj._subscribed = false;

					obj._resTimeoutCancel();

					if ( !obj._httpCall ) {
						console.error('Connection failed!');
						return;
					}
					
					if (obj._httpCall.destroyed) {
						console.error('Connection aborted!');
						if ( !this._stopped ) {
							console.error('Retrying in 5 seconds.');
							obj._retryTimeout = setTimeout( () => { obj._subscribe() }, 5000);
						}
					}

				});

				obj._httpCall.on('finish', (e) => {
					console.log("_httpCall on.finish:", e);

					// SIMILAR TO readyState 2 (no response yet... so no headers yet...)
				});



				// post the data
				obj._httpCall.write(obj._XHR.data);

				obj._httpCall.end();

			})

	}



	_resTimeoutRestart() {
		this._resTimeoutCancel();
		this._resTimeoutStart();
	}



	_resTimeoutStart() {
		const obj = this;

		const responseTimeout = 1000 * 60; // 1 minute

		obj._resTimeout = setTimeout( () => { obj.abort(); }, responseTimeout);
	}



	_resTimeoutCancel() {
		clearTimeout(this._resTimeout);
		delete this._resTimeout;
	}



	/*_decomposeURL(fullURL) {
		const obj = this;

		var lnk = document.createElement("a");
		lnk.href = fullURL;
		// lnk.href = 'https://who:passs@example.com:810/path/index.html?message=hello&who=world#xD';

		obj._url = lnk.href.replace(lnk.search, '').replace(lnk.hash, '');

		obj._urlQuery = lnk.search.split('&');

		obj._urlQuery.forEach( (el, index, node) => {
			if (el.length == 0) { node.splice(index, 1) }
		} );
		
		if (obj._urlQuery.length > 0 && obj._urlQuery[0].charAt(0) == '?') {
			obj._urlQuery[0] = obj._urlQuery[0].substring(1);
		}

		obj._urlHash = lnk.hash;
	}*/



	/*_composeURL() {
		const obj = this;

		if ( obj._urlTStampKey != '' ) {
			obj._urlQuery.push(`${obj._urlTStampKey}=${obj._lastParsedTime}`);
			obj._urlTStampKey = '';
		}

		const base = obj._url;
		const query = obj._urlQuery.length > 0 ? '?' + obj._urlQuery.join('&') : '';
		const hash = obj._urlHash;

		const url = base + query + hash;

		return url;
	}*/





	/////////////////////////////////////////////////
	//////////////////// SETTERS ////////////////////

	setURL(stringOrObj) {
		this._XHR = this._setHTTPRequest(stringOrObj);
	}

	setBindingKeyUrl(urlString) { // Bind connection to user_id (authorization layer).

		if ( typeof urlString !== 'string') {
			console.error('Bind url should be a string.', 'Binding was not set.');
			return;
		}

		this._bindURL = urlString;
	}

	unsetBindingKey() { // Unbind connection from user_id.
		this._bindURL = '';
	}





}

module.exports = NoPollSubscriber;
