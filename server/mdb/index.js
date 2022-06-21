const mariadb = require('mariadb');

const notifPool = mariadb.createPool({
		// host: 'localhost',
		// port: 3306,
		// ssl: true,

		// socketPath: '/tmp/mysql.sock',
		socketPath: '/run/mysqld/mysqld10.sock',

		user:'DATABASE_USER',
		password: 'DATABASE_PASSWORD',

		rowsAsArray: true, // ?
		connectionLimit: 1,

		database:'notification'
	});

let poolConnection;



/*console.log(Date.now())

notifPool.getConnection()
	.then(conn => {
		console.log("connected ! connection id is " + conn.threadId);

		conn.release(); //release to pool

		return conn.query("SELECT `shared` FROM `registered_endpoints` WHERE `endpoint` = 'wid-0001/response' OR  `endpoint` = 'wid-0002/response'");
	})
	.then(rows => {
		console.log(rows);

		return notifPool.end();
	})
	.then(() => {
		console.log("connections have been ended properly");
		console.log(Date.now())
	})

	.catch(err => {
		console.log("not connected due to error: " + err);
	});*/





module.exports = {

	connectDb: function () {
		return new Promise( (resolve, reject) => {

			if (notifPool.activeConnections() < 1) {

				notifPool.getConnection()
					.then( (conn) => {
						console.log("Connected to notifications database.");
						poolConnection = conn;
						resolve(poolConnection);
					} );

			} else {

				resolve(poolConnection);

			}

		} );
	}
}