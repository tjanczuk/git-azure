var common = require('./common.js')
	, WebSocket = require('faye-websocket').Client
	, url = require('url');

exports.action = function (cmd) {

	var config;

	var style = {
		system: function (m) { return m.blue; },
		stderr: function (m) { return m.red; },
		stdout: function (m) { return m.green; },
		init: function (m) { return m.blue; },
		exit: function (m) { return m.blue; }
	}

	function writelog(entry) {
		var m = entry.app;

		if (entry.pid) {
			m += ' (' + entry.pid + ')'
		}

		if (!config.no_color) {
			m = style[entry.type](m);
		}

		if (entry.data) {
			m += ': ' + entry.data;
		}

		if (m[m.length - 1] !== '\n') {
			m += '\n';
		}

		process.stdout.write(m);
	}

	function connect(prefixes) {
		if (prefixes.length === 0) {
			writelog({
				app: 'git-azure',
				type: 'stderr',
				data: 'Unable to establish a WebSocket connection to either wss://' + config.sanitizedEndpoint 
					+ ' or ws://' + config.sanitizedEndpoint + '.'
			});

			process.exit(1);
		}

		var prefix = prefixes.shift();
		var connected;

		var ws = new WebSocket(prefix + config.endpoint);

		ws.onopen = function () {
			writelog({
				app: 'git-azure',
				type: 'system',
				data: 'Connected to ' + prefix + config.sanitizedEndpoint + '. Waiting for logs...'
			});

			connected = true;
		}

		ws.onclose = function () {
			if (connected) {
				writelog({
					app: 'git-azure',
					type: 'stderr',
					data: 'Connection to the git-azure management service was unexpectedly terminated.'
				});

				process.exit(1);
			}
			else {

				// try connecting using other URL prefixes

				connect(prefixes);
			}
		}

		ws.onmessage = function (msg) {
			writelog(JSON.parse(msg.data));
		}
	}

	function checkParametersSpecified() {

		var missing = [];

		['serviceName', 'username', 'password'].forEach(function (item) {
			if (!config[item])
				missing.push('--' + item);
		});

		if (missing.length > 0) {
			console.error('The following required parameters must be specified:\n');
			missing.forEach(console.error);
			process.exit(1);
		}

		config.endpoint = config.serviceName + '.cloudapp.net:31415/logs';
		config.endpoint += '?authorization=' + new Buffer(config.username + ':' + config.password).toString('base64');

		if (config.apps) {
			config.endpoint += '&apps=' + config.apps;
		}

		if (config.type) {
			config.endpoint += '&type=' + config.type;
		}

		var u = url.parse('ws://' + config.endpoint, true);
		delete u.query.authorization;
		delete u.search;
		delete u.path;
		config.sanitizedEndpoint = unescape(url.format(u).substring(5));
		
		connect(['wss://', 'ws://']);
	}

	common.getAzureConfigFromGit('azure.', ['serviceName', 'username', 'password'], function (err, gitConfig) {
		if (err) {
			console.error(err);
			process.exit(1);
		}

		config = gitConfig;
		common.merge(cmd, config, ['serviceName', 'username', 'password', 'apps', 'type', 'no_color']);

		checkParametersSpecified();
	});
}
