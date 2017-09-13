var os = require('os');
var fs = require('fs');
var path = require('path');
var cluster = require('cluster');
var mysql = require('mysql');
var express = require('express');
var bodyParser = require('body-parser');
var Promise = require('bluebird');

var config = require('./config.js');

// Set up DB connection pools
var DB = mysql.createPool({
    connectionLimit: 10,
    host: config.database.host,
    database: config.database.database,
    user: config.database.user,
    password: config.database.password
});


if(cluster.isMaster) {

    var cpuCount = os.cpus().length;
    console.log((new Date())+' Starting '+cpuCount+' server threads.');

    // Create set of workers
    for(var i=0; i<cpuCount; i++) {
        var newWorker = cluster.fork();
    }

    // If a worker dies, restart a new one
    cluster.on('exit', (deadWorker, code, signal) => {
        console.log((new Date())+' Worker '+deadWorker.process.pid+' died.');
        var newWorker = cluster.fork();
        console.log((new Date())+' Worker '+newWorker.process.pid+' died.');
    });

}
else {

    console.log((new Date())+' Worker '+process.pid+' starting.');

    // Start server
    var app = express();
    var server = require('http').Server(app);
    app.use(bodyParser.json());
    app.listen(config.port);

// TODO: chrome requests .mp3 files twice

    app.get('*', function(request, response) {

        // Serve default file
        var file = path.join(__dirname, '/public/', request.hostname, 'index.html');

        // Serve all other files exactly as requested
        if(request.path !== '/') {

            file = path.join(__dirname, '/public/', request.hostname, request.path);
            console.log((new Date())+' File requested '+request.hostname+' '+request.path);

            checkFileExists(request).then((exists) => {
                if(exists === true) {

                    // Serve file
                    response.sendFile(file, (error) => {
                        if(!error) {
                            console.log((new Date())+' Served file '+file);
                        }
                        else {
                            console.log((new Date())+' Error serving file '+file);
                            console.log(error);
                        }
                    });

                    // Log Requests
                    if(checkExtension(request) === true) {
                        // Log request to MySQL
                        if(config.logToMySQL === true) {
                            logDownloadToMySQL(DB, request).then(() => {
                                console.log((new Date())+' Logged file download '+file);
                            }).catch((error) => {
                                console.log(error);
                            });
                        }
                        // FUTURE: Log request to somewhere else
                    }

                }
                else {
                    response.sendStatus(404);
                }
            }).catch((error) => {
                console.log((new Date())+' Error checking if file exists '+file);
            });

        }

	// Serve index.html
	else {
	    response.sendFile(file);
	}

    }); // app.get('*', ...)
}

function checkFileExists(request) {
    return new Promise((resolve, reject) => {
        var file = parseFile(request);
        var fullPath = path.join(__dirname, '/public/', request.hostname, file);
        fs.access(fullPath, fs.constants.F_OK, (error) => {
            if(!error) {
                resolve(true);
            }
            else {
                console.log((new Date())+' File does not exist. '+fullPath);
                resolve(false);
            }
        });
    });
}

function checkExtension(request) {
    var file = parseFile(request);
    var extension = file.split('.')[1];
    if(config.logExtensions.indexOf(extension) >= 0) {
        return true;
    }
    else {
        return false;
    }
}

function parseIP(request) {
    var ipSplit = request.ip.split(':');
    var ip = ipSplit[ipSplit.length-1];
    return ip;
}

function parseFile(request) {
    var fileSplit = request.path.split('/');
    var file = fileSplit[fileSplit.length-1];
    return file;
}

function logDownloadToMySQL(db, request) {
    return new Promise((resolve, reject) => {

        var ip = parseIP(request);
        var file = parseFile(request);
        var agent = request.headers['user-agent'];

        var values = [ip, request.hostname, file, agent];
        var sql = 'insert into downloads (time, ip, hostname, file, agent) values (now(), ?, ?, ?, ?);';
        db.query(sql, values, (error, rows, fields) => {
            if(!error) {
                resolve();
            }
            else {
                console.log((new Date())+' logDownloadToMySQL() failed.');
                console.log((new Date())+' ip: '+ip+' file: '+file);
                reject(error);
            }
        });

    });
}
