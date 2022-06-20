class NoPollSubscriber {
	/************************************************
	          SHOULD LISTEN FOR VALID JSON,          
	         {"iat":Unixtime,"data":String}         
	    -----------------------------------------
	  To auto-start subscription ( .start() )
	  should be inside the window.onload function,
	  otherwise Firefox will not finish the
	  page loading indicator.
	************************************************/



	/////////////////////////////////////////////////
	////////////////// CONSTRUCTOR //////////////////

	constructor(url, callbackOnParsed) {

		// PRIVATE ATTRIBUTES //
		this._url          = url;
		this._callback     = callbackOnParsed;
		this._responseLen  = 0;
		this._dataMem      = '';
		this._fullResponse = null;
		this._stopped      = false;
		this._separator    = "''";
		this._httpCall     = this._ajaxReq();
		this._retryTimeout = setTimeout(0);
		
	}





	/////////////////////////////////////////////////
	//////////////// PUBLIC METHODS ////////////////

	start( url = this._url ) { // Start and resume paused
		this.stop();
		this.abort();
		clearTimeout(this._retryTimeout);
		this.setURL(url);
		this._stopped = false;
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





	/////////////////////////////////////////////////
	//////////////// PRIVATE METHODS ////////////////

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
				obj._callback( array[0].substring(0, expLen) );
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

		obj._httpCall.open('GET', obj._url, true);


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

			if (ev.target.readyState == 4) {

				if (ev.target.status >= 200 && ev.target.status < 300) {

					if (ev.target.response.length == 0) {
						console.error('No bytes were received. Breaking loop... Retrying in 5 seconds.');
						obj._retryTimeout = setTimeout( () => { obj._subscribe() }, 5000);
						return false;
					}

					obj._subscribe(); // RECONNECTING!

				} else {
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


		obj._httpCall.send();
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

	setURL(string) {
		this._url = string.toString();
	}





}