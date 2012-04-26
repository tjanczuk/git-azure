var httpProxy = require('http-proxy'),
	http = require('http'),
	https = require('https'),
	spawn = require('child_process').spawn,
	net = require('net'),
	fs = require('fs'),
	path = require('path'),
	azure = require('azure');

var processes = {};
var config;

function determineConfiguration() {

	// start with default configuration

	config = {
		port: 80,
		sslPort: 443,
		externalManagementPort: 31415,
		internalManagementPort: 31416,
		sslCertificateName: 'serverCertificate',
		sslKeyName: 'serverKey',
		startPort: 8000,
		endPort: 9000
	};

	// get root directory from command line

	var argv = require('optimist')
		.usage('Usage: $0')
		.options('r', {
			alias: 'root',
			description: 'Directory with package.json configuration metadata and apps subdirectory'
		})
		.options('n', {
			alias: 'validateOnly',
			description: 'Validate configuration without starting the runtime'
		})
		.check(function (args) { return !args.help; })
		.check(function (args) { return path.existsSync(args.r); })
		.argv;

	config.root = argv.r;
	config.validateOnly = argv.n;

	// read package.json from the root directory and override configuration defaults

	var packageJson = path.resolve(config.root, 'package.json');
	if (path.existsSync(packageJson)) {
		var json;
		try {
			json = require(packageJson);
		}
		catch (e) {
			throw new Error('Unable to parse ' + packageJson);
		}

		if (typeof json.azure === 'object') {
			for (var n in config) {
				if (json.azure[n]) {
					config[n] = json.azure[n];
				}
			}
		}
	}

	// read environment variables to add or override configuration settings

	var vars = {
		HTTP_PORT: 'port',
		HTTPS_PORT: 'sslPort',
		MANAGEMENT_PUBLIC_PORT: 'externalManagementPort',
		MANAGEMENT_INTERNAL_PORT: 'internalManagementPort',
		REMOTE_URL: 'remoteUrl',
		REMOTE_BRANCH: 'remoteBranch',
		AZURE_STORAGE_CONTAINER: 'azureStorageContainer'
	};

	for (var n in vars) {
		if (process.env[n]) {
			config[vars[n]] = process.env[n];
		}
	}

	config.currentPort = config.startPort;

	// process apps directory to determine app specific configuration

	config.apps = {};
	var rootDirContent = fs.readdirSync(config.root);
	for (var file in rootDirContent) {
		var appDir = path.resolve(config.root, file);
		var appPackageJson = path.resolve(appDir, 'package.json');
		var appServerJs = path.resolve(appDir, 'server.js');

		if (path.existsSync(appPackageJson)) {
			var json;
			try {
				json = require(appPackageJson);
			}
			catch (e) {}

			if (json && typeof json.azure === 'object') {
				config.apps[file] = json.azure;
				config.apps[file].name = file;
			}
		}

		if (!config.apps[file] && path.existsSync(appServerJs)) {
			config.apps[file] = {
				name: file,
				script: 'server.js',
				hosts: {
					'*': {
						ssl: 'allowed'
					}
				}
			};
		}
	}

	// Move on to calculate the routing table

	console.log('Computed the following configuration:');
	console.log(config);
	console.log();

	calculateRoutingTable();
}

function calculateRoutingTable() {
	config.routingTable = {};
	for (var app in config.apps) {

		if (typeof(config.apps[app].hosts !== 'object'))
			throw new Error('The hosts property of the configuration element of the ' + app + ' application must be a JSON object.');

		for (var host in config.apps[app].hosts) {

			if (typeof config.apps[app].hosts[host] !== 'object')
				throw new Error('The host entry ' + host + ' of application ' + app + ' must be a JSON object.');

			if (config.routingTable[host])
				throw new Error('The host name ' + host + ' is currently mapped to two applications: ' + app + ' and '
					+ config.routingTable[host].app.name + '. Each host name must be mapped to one application only.');

			config.routingTable[host] = {
				app: config.apps[app],
				route: config.apps[app].hosts[host]
			};
		}
	}

	config.fallbackRoute = config.routingTable['*'];

	console.log('Computed the following routing table:');
	console.log(config.routingTable);
	console.log();

	if (config.validateOnly) {
		process.exit(0);
	}

	obtainCertificates();
}

function obtainCertificates() {
	var blob = azure.createBlobService();
	var pendingAsyncOps = 0;

	var finishAsyncOp = function () {
		if (--pendingAsyncOps === 0) {

			// all SSL certificates and keys were successfuly obtained
			console.log('Success obtaining all SSL certificates.');
			setupRouter();
		}
	}

	var obtainOne = function(spec) {
		if (typeof spec.sslCertificateName === 'string') {
			console.log('Obtaining SSL certificate ' + spec.sslCertificateName + '...')
			pendingAsyncOps++;
			blob.getBlobToText(config.azureStorageContainer, spec.sslCertificateName, function (err, text) {
				if (err) {
					console.log('Error obtaining SSL certificate ' + spec.sslCertificateName + ':');
					throw err;
				}

				console.log('Success obtaining SSL certificate ' + spec.sslCertificateName);
				spec.sslCertificate = text;
				finishAsyncOp();
			});
		}

		if (typeof spec.sslKeyName === 'string') {
			console.log('Obtaining SSL key ' + spec.sslKeyName + '...')
			pendingAsyncOps++;
			blob.getBlobToText(config.azureStorageContainer, spec.sslKeyName, function (err, text) {
				if (err) {
					console.log('Error obtaining SSL key ' + spec.sslKeyName + ':');
					throw err;
				}

				console.log('Success obtaining SSL key ' + spec.sslKeyName);
				spec.sslKey = text;
				finishAsyncOp();
			});
		}
	}

	console.log('Obtaining SSL certificates...');

	// get global, non-SNI certificate and key: 

	obtainOne(config);

	// get SNI certificate and key for every app:

	for (var host in config.routingTable) {
		obtainOne(config.routingTable[host].route);
	}
}

function onProxyError(context, status, error) {
	if (context.socket) {
		context.socket.end();
	}
	else {
		context.req.resume();
		context.res.writeHead(status);
		if ('HEAD' !== context.req.method)
			context.res.end(typeof error === 'string' ? error : JSON.stringify(error));
		else
			context.res.end();
	}
}

function getDestinationDescription(context) {
	var machineName = context.backend.host === localIP ? 'localhost' : context.backend.host;
	var requestType = (context.socket ? 'WS' : 'HTTP') + (context.proxy.secure ? 'S' : '');
	return requestType + ' request to app ' + context.routingEntry.app.name + ' on port ' + context.routingEntry.to.port;	
}

function routeToProcess(context) {
	console.log('Routing ' + getDestinationDescription(context));
	if (context.socket) {
		context.socket.resume();
		context.proxy.proxyWebSocketRequest(context.req, context.socket, context.head, context.routingEntry.to);	
	}
	else {
		context.req.resume();
		context.proxy.proxyRequest(context.req, context.res, context.routingEntry.to);
	}
}

function getNextPort() {
	// TODO ensure noone is already listening on the port
	var sentinel = config.currentPort;
	var result;
	do {
		if (!processes[config.currentPort]) {
			result = config.currentPort;
			config.currentPort++;
			break;
		}

		config.currentPort++;
		if (config.currentPort > config.endPort) {
			config.currentPort = config.startPort;
		}

	} while (config.currentPort != sentinel);

	return result;
}

function getEnv(port) {
	var env = {};
	for (var i in process.env) {
		env[i] = process.env[i];
	}

	env['PORT'] = port;

	return env;
}

function waitForServer(context, port, attemptsLeft, delay) {
	var client = net.connect(port, function () {
		client.destroy();
		routeToProcess(context);
	});

	client.on('error', function() {
		client.destroy();
		if (attemptsLeft === 0) {
			onProxyError(context, 500, 'The application process for application ' + context.routingEntry.app.name 
				+ ' did not establish a listener in a timely manner.');
			console.log('Terminating unresponsive application process with PID ' + context.routingEntry.process.pid);
			delete processes[context.routingEntry.to.port];
			try { 
				process.kill(context.routingEntry.process.pid); 
			}
			catch (e) {
				// empty
			}

			delete context.routingEntry.process;
			delete context.routingEntry.to;
		} 
		else { 
			setTimeout(function () {
				waitForServer(context, port, attemptsLeft - 1, delay);				
			}, delay);
		}
	});
}

function createProcess(context) {
	var port = getNextPort();
	if (!port) {
		onProxyError(context, 500, 'No ports remain available to initiate application ' + context.routingEntry.app.name);
	}
	else {
		var env = getEnv(port);
		var absolutePath = path.resolve(config.root, '/apps/', context.routingEntry.app.name, context.routingEntry.app.script);

		console.log('Starting application ' + context.routingEntry.app.name + ' with entry point ' + absolutePath);
		
		try { 
			context.routingEntry.process = spawn('node.exe', [ absolutePath ], { env: env }); 
		}
		catch (e) {
			// empty
		}

		if (!context.routingEntry.process 
			|| (typeof context.routingEntry.process.exitCode === 'number' && context.routingEntry.process.exitCode !== 0)) {
			console.log('Unable to start process: node.exe ' + absolutePath);
			onProxyError(context, 500, 'Unable to start process: node.exe ' + absolutePath);
		}
		else {
			processes[port] = context.routingEntry.process;
			context.routingEntry.to = { host: '127.0.0.1', port: port };
			var logger = function(data) { console.log('PID ' + context.routingEntry.process.pid + ':' + data); };
			context.routingEntry.process.stdout.on('data', logger);
			context.routingEntry.process.stderr.on('data', logger);
			context.routingEntry.process.on('exit', function (code, signal) {
				delete processes[port];
				console.log('Child process exited. App: ' + context.routingEntry.app.name + ', Port: ' + port + ', PID: ' + context.routingEntry.process.pid 
					+ ', code: ' + code + ', signal: ' + signal);

				// remove registration of the instance of the application that just exited

				delete context.routingEntry.process;
				delete context.routingEntry.to;
			});

			waitForServer(context, port, 20, 1000);
		}
	}
}

function ensureProcess(context) {
	// Routing logic:
	// 1. If app process is running, route to it
	// 2. Else, provision an new instance and route to it

	if (context.routingEntry.process) {
		routeToProcess(context);
	}
	else {
		createProcess(context);
	}
}

function ensureSecurityConstraints(context) {
	if (context.routingEntry.route.ssl === 'reject' && context.proxy.secureServer
		|| context.routingEntry.route.ssl === 'require' && !context.proxy.secureServer) {
		onProxyError(context, 404, "Request security does not match security configuration of the application");
	}
	else {
		ensureProcess(context);
	}
}

function loadApp(context) {
	context.host = context.req.headers['host'].toLowerCase();
	context.req.context = context;
	context.routingEntry = config.routingTable[context.host] || config.fallbackRoute;
	if (!context.routingEntry) {
		onProxyError(context, 404, 'Web application not found in routing table');
	}
	else {
		ensureSecurityConstraints(context);
	}
}

function onRouteRequest(req, res, proxy) {
	req.pause();
	loadApp({ req: req, res: res, proxy: proxy});
}

function onRouteUpgradeRequest(req, socket, head, proxy) {
	socket.pause();
	loadApp({ req: req, socket: socket, head: head, proxy: proxy});
}

function onProxyingError(err, req, res) {
	console.log('Error routing ' + getDestinationDescription(req.context));
}

function setupRouter() {

	console.log('Setting up the HTTP/WS router...');

	// setup HTTP/WS proxy

	var server = httpProxy.createServer(onRouteRequest);
	server.proxy.on('proxyError', onProxyingError);
	server.on('upgrade', function (req, res, head) { onRouteUpgradeRequest(req, res, head, server.proxy); });
	server.listen(config.port);

	// setup HTTPS/WSS proxy along with SNI information for individual apps

	var options = { https: { cert: config.sslCertificate, key: config.sslKey } };
	var secureServer = httpProxy.createServer(options, onRouteRequest);
	secureServer.proxy.secure = true;
	secureServer.proxy.on('proxyError', onProxyingError);
	secureServer.on('upgrade', function (req, res, head) { onRouteUpgradeRequest(req, res, head, secureServer.proxy); });
	for (var hostName in config.routingTable) {
		var host = config.routingTable[hostName];
		if (host.sslCertificate && host.sslKey && host.ssl !== 'reject') {
			console.log('Configuring SNI for host name ' + hostName);
			secureServer.addContext(hostName, { cert: host.sslCertificate, key: host.sslKey });
		}
	}
	secureServer.listen(config.sslPort);

	console.log('Router successfuly started.');
}

determineConfiguration();