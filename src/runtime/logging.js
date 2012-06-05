var WebSocket = require('faye-websocket')
	, url = require('url')
	, fs = require('fs')
	, path = require('path');

var id = 0;
var sessionCount = 0;
var sessions = {};
var appProcesses = {};
var loggingHtml = fs.readFileSync(path.resolve(__dirname, 'logging.html'), 'utf8');

exports.active = function () {
	return sessionCount > 0;
}

exports.addSession = function (request, socket, head) {
	try {
		sessions[++id] = {
			ws: new WebSocket(request, socket, head)
		};

	}
	catch (e) {
		return socket.destroy();
	}

	sessionCount++;

	var tmpId = id;
	sessions[id].ws.onclose = function () {
		delete sessions[tmpId];
		sessionCount--;
	};

	var query = url.parse(request.url, true).query;

	if (query.apps) {
		sessions[id].apps = query.apps.split(',');
	}

	if (query.type) {
		sessions[id].types = {};
		query.type.split(',').forEach(function (item) {
			sessions[id].types[item] = true;
		});
	}
};

var writelog = function (entry) {
	for (var i in sessions) {
		var session = sessions[i];

		if (session.apps && !session.apps[entry.app]) {
			continue;
		}

		if (session.types && !session.types[entry.type]) {
			continue;
		}

		try {
			session.ws.send(JSON.stringify(entry));
		}
		catch (e) {
			// empty
		}
	}
}

exports.emit = function (thing) {
	if (typeof thing === 'string') {
		writelog({ 
			app: 'git-azure',
			type: 'system',
			data: thing 
		});
	}
	else {
		writelog(thing);
	}
}

exports.addAppProcess = function (app, proc) {

	writelog({
		app: app,
		type: 'init',
		pid: proc.pid,
		data: 'new application process created'
	});

	proc.stderr.on('data', function (data) { 
		writelog({
			app: app,
			type: 'stderr',
			pid: proc.pid,
			data: data.toString()
		});
	});

	proc.stdout.on('data', function (data) { 
		writelog({
			app: app,
			type: 'stdout',
			pid: proc.pid,
			data: data.toString()
		});
	});

	proc.on('exit', function (code, signal) {
		writelog({
			app: app,
			type: 'exit',
			pid: proc.pid,
			code: code ? code.toString() : 'N/A',
			signal: signal ? signal.toString() : 'N/A'
		});
	});
};

exports.handleLoggingRequest = function (req, res) {
	res.writeHead(200, { 'Content-Type': 'text/html' });
	res.end(loggingHtml);
};