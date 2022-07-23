const fs = require("fs");

const serverConfig = {

	NODE_HOST:        "127.0.0.1", // localhost
	NODE_PORT:        1010,
	NODE_PORT_SECURE: 1011,

	options_secure: {
		key:  fs.readFileSync('./ssl_keys/privkey.pem'),
		cert: fs.readFileSync('./ssl_keys/cert.pem')
	},





	local_privateKey : `-----BEGIN RSA PRIVATE KEY-----
	SAME AS BINDING SERVER
	-----END RSA PRIVATE KEY-----`,

	local_publicKey : `-----BEGIN PUBLIC KEY-----
	SAME AS BINDING SERVER
	-----END PUBLIC KEY-----`

}



module.exports = serverConfig;