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

	constructor(urlOrObj, callbackOnParsed = ()=>{}, callbackOnSubscribe = ()=>{}, callbackOnStateChange = ()=>{}) {

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
		this._httpCall     = this._ajaxReq();
		this._retryTimeout = setTimeout(() => {}, 0);
		this._lastIat      = 0;

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
		this._httpCall.abort();
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
		window.NoPollSubscriber = this;
		window.addEventListener('online',  this._isOnline );
		window.addEventListener('offline', this._isOffline);
	}

	_remOnlineListeners() {
		delete window.NoPollSubscriber;
		window.removeEventListener('online',  this._isOnline );
		window.removeEventListener('offline', this._isOffline);
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
		const response = obj._httpCall.response.substring(obj._responseLen);
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



	_ajaxReq() {
		if (window.XMLHttpRequest) {
			return new XMLHttpRequest();
		} else if (window.ActiveXObject) {
			return new ActiveXObject("Microsoft.XMLHTTP");
		} else {
			alert("Browser does not support XMLHTTP.");
			return false;
		}
	}



	_subscribe() {
		if (this._stopped) return false;
		const obj = this;


		obj._subscribed = false;
		// obj._onStChange({value:1,state:"WAITING"});

		obj._httpCall.open( obj._XHR.method, obj._XHR.url, true);

		for ( const key in obj._XHR.headers ) {
			obj._httpCall.setRequestHeader(key, obj._XHR.headers[key]);
		}


		// THIS CODE WILL EXECUTE WHEN NEW CHUNK OF DATA IS RECEIVED
		obj._responseLen = 0;
		obj._httpCall.onprogress = (ev) => {
			// code...
			obj._logicOnChunk();
		}


		/*
		// THIS CODE ACTS THE SAME AS obj._httpCall.onprogress
		obj._responseLen = 0;
		obj._httpCall.onreadystatechange = (ev) => {
			if ( ev.target.readyState == 3 || ev.target.readyState == 4 ) {
				// code...
			}
		};
		*/


		// THIS CODE WILL EXECUTE WHEN THE POLLING FINISHES
		// SO WE LOOP THE SUBSRIBE FUNCTION TO KEEP POLLING
		obj._httpCall.onreadystatechange = (ev) => {

			/****************************************************************************************
			XMLHttpRequest.readyState
			-----------------------------------------------------------------------------------------
			Value    State               Description
			-----------------------------------------------------------------------------------------
			  0      UNSENT              Client has been created. open() not called yet.
			  1      OPENED              open() has been called.
			  2      HEADERS_RECEIVED    send() has been called, and headers and status are available.
			  3      LOADING             Downloading; responseText holds partial data.
			  4      DONE                The operation is complete.
			****************************************************************************************/

			/****************************************************************************************
			HTTP response status codes
			-----------------------------------------------------------------------------------------
			  [100–199] Informational responses
			  [200–299] Successful responses
			  [300–399] Redirects
			  [400–499] Client errors
			  [500–599] Server errors
			****************************************************************************************/

			/****************************************************************************************
			Custom
			-----------------------------------------------------------------------------------------
			Value    State               Description
			-----------------------------------------------------------------------------------------
			 -1      OFFLINE         BROWSER IS OFFLINE
			  0      DISCONNECTED    XMLHttpRequest.readyState == 0 OR HTTP response != 200-299
			  1      WAITING         XMLHttpRequest.readyState == 1 // OR _subscribe() was recalled //
			  2      CONNECTED       XMLHttpRequest.readyState > 1 AND HTTP response == 200-299
			****************************************************************************************/

			if (ev.target.readyState == 0) {
				obj._onStChange({value:0,state:"DISCONNECTED"});
			}

			if (ev.target.readyState == 1) {
				obj._onStChange({value:1,state:"WAITING"});
			}

			if (ev.target.readyState == 2) {
				if (ev.target.status >= 200 && ev.target.status < 300) {
					obj._onStChange({value:2,state:"CONNECTED"});
				} else {
					obj._onStChange({value:0,state:"DISCONNECTED"});
				}
			}

			if (ev.target.readyState == 3) {
				if (ev.target.status >= 200 && ev.target.status < 300) {
					obj._onStChange({value:2,state:"CONNECTED"});
					if ( !obj._subscribed ) {
						obj._subscribed = true;
						obj._onSubscribe();
					}
				} else {
					obj._onStChange({value:0,state:"DISCONNECTED"});
				}
			}

			if (ev.target.readyState == 4) {

				if (ev.target.status >= 200 && ev.target.status < 300) {

					if (ev.target.response.length == 0) {
						obj._onStChange({value:0,state:"DISCONNECTED"});
						console.error('No bytes were received. Breaking loop... Retrying in 5 seconds.');
						obj._retryTimeout = setTimeout( () => { obj._subscribe() }, 5000);
						return false;
					}

					obj._subscribe(); // RECONNECTING!

				} else {
					obj._onStChange({value:0,state:"DISCONNECTED"});
					if ( !this._stopped ) {
						console.error(`HTTP Status: ${ev.target.status}.`, 'Breaking loop... Retrying in 5 seconds.');
						obj._retryTimeout = setTimeout( () => { obj._subscribe() }, 5000);
					}
					return false;
				}

			}
		}


		/*obj._httpCall.addEventListener("error", function(e) {
			console.error(e);
			return false;
		});*/


		if (obj._bindURL != '') {

			// console.info('Binding...')

			const bindCall = this._ajaxReq();

			bindCall.open( 'GET', obj._bindURL, true);

			bindCall.onreadystatechange = (bev) => {

				if (bev.target.readyState == 4) {

					if (bev.target.status >= 200 && bev.target.status < 300) {

						// console.info('Binded!')

						// Inject user binding to body
						const tmpObj = JSON.parse(obj._XHR.data) || {};
						tmpObj.bind_key = bindCall.response;
						obj._XHR.data = JSON.stringify(tmpObj);

						obj._httpCall.send(obj._XHR.data);

					} else {
						console.error(`Unbinding...`);
						obj._httpCall.send(obj._XHR.data);
					}
				}
			}

			bindCall.send();

		} else {

			obj._httpCall.send(obj._XHR.data);

		}

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