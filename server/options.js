const fs = require("fs");

const serverConfig = {

	connection_timeout: 1 * 60 * 1000, // In ms // 1 minute
	max_alive_count: 60,

	NODE_HOST:        "127.0.0.1", // localhost
	NODE_PORT:        1010,
	NODE_PORT_SECURE: 1011,

	options_secure: {
		key:  fs.readFileSync('./ssl_keys/privkey.pem'),
		cert: fs.readFileSync('./ssl_keys/cert.pem')
	},



	binding_server_options: {
		hostname: 'yourdomain.com',
		port: 443,
		path: '/test/session/getUserId',
		method: 'RETREIVE',
		headers: {
			'Content-Type': 'application/json'
		}


		/*
		,
		ca: [fs.readFileSync('./ssl_keys/cert.pem', {encoding: 'utf-8'})],
		rejectUnauthorized: false, // should be true?
		requestCert: true,
		agent: false

		// add `process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;` in code, before calling https.request()
		*/
	},





	local_privateKey : `-----BEGIN RSA PRIVATE KEY-----
	SAME AS BINDING SERVER
	-----END RSA PRIVATE KEY-----`,

	local_publicKey : `-----BEGIN PUBLIC KEY-----
	SAME AS BINDING SERVER
	-----END PUBLIC KEY-----`

}



module.exports = serverConfig;