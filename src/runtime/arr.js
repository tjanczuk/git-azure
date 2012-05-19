var httpProxy = require('http-proxy'),
	http = require('http'),
	https = require('https'),
	child_process = require('child_process'),
	net = require('net'),
	fs = require('fs'),
	path = require('path'),
	azure = require('azure');

var processes = {};
var config;
var managementPassword;
var server, secureServer, managementServer, postReceiveServer;
var recycleInProgress;
var recycleStartTime;

if (!fs.existsSync) {
	// polyfill node v0.7 fs.existsSync with node v0.6 path.existsSync
	fs.existsSync = path.existsSync;
}

var oldLog = console.log;
console.log = function (thing) {
	if (typeof thing === 'string') {
		oldLog(new Date().toISOString() + ' ' + thing);
	}
	else {
		oldLog.apply(this, arguments);
	}
};

function determineConfiguration() {

	// start with default configuration

	config = {
		port: 80,
		sslPort: 443,
		externalManagementPort: 31415,
		internalManagementPort: 31416,
		postReceivePort: 31417,
		postReceive: '/postReceive',
		managementUsername: 'admin',
		sslCertificateName: 'master.certificate.pem',
		sslKeyName: 'master.key.pem',
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
		.options('s', {
			alias: 'syncCmd',
			description: 'Command to run to synchronize the repository'
		})
		.options('n', {
			alias: 'validateOnly',
			description: 'Validate configuration without starting the runtime'
		})
		.check(function (args) { return !args.help; })
		.check(function (args) { return fs.existsSync(args.r); })
		.check(function (args) { return typeof args.syncCmd === 'string' && args.syncCmd.length > 0; })
		.argv;

	config.root = argv.r;
	config.validateOnly = argv.n;
	config.syncCmd = argv.syncCmd;

	// read package.json from the root directory and override configuration defaults

	var packageJson = path.resolve(config.root, 'package.json');
	if (fs.existsSync(packageJson)) {
		var json;
		try {
			json = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
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
		AZURE_STORAGE_CONTAINER: 'azureStorageContainer',
		POSTRECEIVE_URL_PATH: 'postReceive',
		MANAGEMENT_USERNAME: 'managementUsername',
		POSTRECEIVE_PUBLIC_PORT: 'postReceivePort'
	};

	for (var n in vars) {
		if (process.env[n]) {
			config[vars[n]] = process.env[n];
		}
	}

	config.currentPort = config.startPort;
	managementPassword = process.env.MANAGEMENT_PASSWORD || 'admin';

	// process apps directory to determine app specific configuration

	config.apps = {};
	var appsDir = path.resolve(config.root, 'apps');
	var rootDirContent;

	try {
		rootDirContent = fs.readdirSync(appsDir);
	}
	catch (e) {
		// no apps directory
		rootDirContent = [];
	}

	for (var index in rootDirContent) {
		var file = rootDirContent[index];
		var appDir = path.resolve(appsDir, file);
		var appPackageJson = path.resolve(appDir, 'package.json');

		if (fs.existsSync(appPackageJson)) {
			var json;
			try {
				json = JSON.parse(fs.readFileSync(appPackageJson, 'utf8'));
			}
			catch (e) {}

			if (json && typeof json.azure === 'object') {
				config.apps[file] = json.azure;
				config.apps[file].name = file;
			}
		}

		if (!config.apps[file]) {
			['server.js', 'app.js'].some(function (item) {
				if (fs.existsSync(path.resolve(appDir, item))) {

					config.apps[file] = {
						name: file,
						script: item,
						hosts: {}
					};

					var indexOfDot = file.indexOf('.');
					if (0 < indexOfDot && indexOfDot < (file.length - 1)) {
						// directory name has a dot somewhere in the middle 
						// - assume the host name is equal to the directory name

						config.apps[file].hosts[file] = { ssl: 'allowed' };
					}

					return true;				
				}

				return false;
			});
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
	config.pathRoutingTable = {};
	var appCount = 0;
	var oneAppName;

	for (var app in config.apps) {
		if (typeof config.apps[app].hosts === 'object') {
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

		if (!config.apps[app].pathRoutingDisabled) {
			// add a URL path based route

			config.pathRoutingTable[app] = {
				app: config.apps[app],
				route: {
					ssl: 'allowed'
				}
			}
		}

		appCount++;
		oneAppName = app;
	}

	if (appCount === 1) {

		// there is only one application, make it a "catch all" application for all traffic unless pathRoutingDisabled is on

		var oneApp = config.apps[oneAppName];

		if (!app.pathRoutingDisabled) {
			config.fallbackRoute = {
				app: oneApp,
				route: {
					ssl: 'allowed'
				}
			};
		}
	}

	console.log('Computed the following host routing table:');
	console.log(config.routingTable);
	console.log('Computed the following URL path routing table:');
	console.log(config.pathRoutingTable);
	console.log('Computed the following fallback application:');
	console.log(config.fallbackRoute);

	validateSslConfiguration();
}

function validateSslConfiguration() {

	if (typeof config.sslCertificateName === 'string' && typeof config.sslKeyName !== 'string'
		|| typeof config.sslCertificateName !== 'string' && typeof config.sslKeyName === 'string') {
			console.log('Error in service level SSL configuration. To configure a single SSL certificate for all applications, you must specify both '
				+ "'sslCertificateName' and 'sslKeyName' configuration properties in the 'azure' section of package.json.");
			process.exit(1);
	}

	if (typeof config.sslCertificateName === 'string') {
		config.sslEnabled = true;
		console.log('Non-SNI SSL credentials are configured at the reverse proxy level.');
	}

	for (var host in config.routingTable) {
		var route = config.routingTable[host].route;
		if (route.ssl !== 'disallowed') {
			if (typeof route.sslCertificateName === 'string' && typeof route.sslKeyName !== 'string'
				|| typeof route.sslCertificateName !== 'string' && typeof route.sslKeyName === 'string') {
					console.log('Error in SSL configuration of host ' + host + ' of application application ' + config.routingTable[host].app.name + '.' 
						+' To configure an SSL certificate for a single host using SNI, you must specify both '
						+ "'sslCertificateName' and 'sslKeyName' configuration properties in the configuration of the selected host name in the package.json "
						+ 'file at the application\'s directory root.');
					process.exit(1);
			}

			if (typeof route.sslCertificateName === 'string') {
				config.sslEnabled = true;
				console.log('SSL credentials for SNI are configured for host name ' + host + ' of application ' + config.routingTable[host].app.name);
			}
		}
	}

	if (config.sslEnabled && typeof config.sslCertificateName !== 'string') {
		console.log('Error in SSL configuration. At least one application specified SSL credentials for SNI, which requires that '
			+ 'a non-SNI SSL credentials be also configured. You must specify both '
			+ "'sslCertificateName' and 'sslKeyName' configuration properties in the 'azure' section of package.json.");
		process.exit(1);
	}

	if (!config.sslEnabled) {
		console.log('SSL is not configured, SSL endpoint will not be created.');
	}

	if (config.validateOnly) {
		process.exit(0);
	}

	if (config.sslEnabled) {
		obtainCertificates();
	}
	else {
		initializeEndpoints();
	}
}

function initializeEndpoints() {
	process.removeAllListeners('exit');
	process.on('exit', killChildProcesses);

	ensurePostReceiveHook();
	setupManagement();
	setupRouter();
}

function closeEndpoints(callback) {
	if (server) {
		console.log('Closing HTTP/WS router...');
		server.close();
		server = undefined;
	}

	if (secureServer) {
		console.log('Closing HTTPS/WSS router...');
		secureServer.close();
		secureServer = undefined;
	}

	if (managementServer) {
		console.log('Closing management endpoint...');
		managementServer.close();
		managementServer = undefined;
	}

	callback(null);
}

function obtainCertificates() {
	var blob = azure.createBlobService();
	var pendingAsyncOps = 0;

	var finishAsyncOp = function () {
		if (--pendingAsyncOps === 0) {

			// all SSL certificates and keys were successfuly obtained
			console.log('Success obtaining all SSL certificates.');
			initializeEndpoints();
		}
	}

	var obtainOne = function(spec) {
		if (spec.ssl === 'disallowed') {
			return;
		}

		if (typeof spec.sslCertificateName === 'string') {
			console.log('Obtaining SSL certificate named ' + spec.sslCertificateName + '...')
			pendingAsyncOps++;
			blob.getBlobToText(config.azureStorageContainer, spec.sslCertificateName, function (err, text) {
				if (err) {
					console.log('Error obtaining SSL certificate named ' + spec.sslCertificateName + '. '
						+ 'Make sure the certificate in PEM format is uploaded as a blob named '
						+ spec.sslCertificateName + ' to the Windows Azure Blob Storage container named '
						+ config.azureStorageContainer + ' under the Windows Azure storage account named '
						+ process.env.AZURE_STORAGE_ACCOUNT + '. You can do this using the \'git azure blob\' command.');
					process.exit(1);
				}

				console.log('Success obtaining SSL certificate named ' + spec.sslCertificateName);
				spec.sslCertificate = text;
				config.sslEndpoint = true;
				finishAsyncOp();
			});

			console.log('Obtaining SSL key named ' + spec.sslKeyName + '...')
			pendingAsyncOps++;
			blob.getBlobToText(config.azureStorageContainer, spec.sslKeyName, function (err, text) {
				if (err) {
					console.log('Error obtaining SSL key named ' + spec.sslKeyName + '. '
						+ 'Make sure the SSL key in PEM format is uploaded as a blob named '
						+ spec.sslKeyName + ' to the Windows Azure Blob Storage container named '
						+ config.azureStorageContainer + ' under the Windows Azure storage account named '
						+ process.env.AZURE_STORAGE_ACCOUNT + '. You can do this using the \'git azure blob\' command.');
					process.exit(1);
				}

				console.log('Success obtaining SSL key named ' + spec.sslKeyName);
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
	var requestType = (context.socket ? 'WS' : 'HTTP') + (context.proxy.secure ? 'S' : '');
	return requestType + ' request to app ' + context.routingEntry.app.name + ' on port ' + context.routingEntry.app.to.port;	
}

function routeToProcess(context) {
	console.log('Routing ' + getDestinationDescription(context));

	// creating a clone of the routing entry is necessary to work around 
	// https://github.com/nodejitsu/node-http-proxy/issues/248

	var options = {
		port: context.routingEntry.app.to.port,
		host: context.routingEntry.app.to.host
	};

	if (context.socket) {
		context.socket.resume();
		context.proxy.proxyWebSocketRequest(context.req, context.socket, context.head, options);	
	}
	else {
		context.req.resume();
		context.proxy.proxyRequest(context.req, context.res, options);
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

function waitForServer(routingEntry, attemptsLeft, delay) {
	var client = net.connect(routingEntry.app.to.port, function () {
		client.destroy();

		for (var i in routingEntry.app.pendingRequests) {
			routeToProcess(routingEntry.app.pendingRequests[i])
		}

		delete routingEntry.app.pendingRequests;
	});

	client.on('error', function() {
		client.destroy();
		if (attemptsLeft === 0 || !routingEntry.app.process) {
			for (var i in routingEntry.app.pendingRequests) {
				var context = routingEntry.app.pendingRequests[i];
				onProxyError(context, 500, 'The node.js process for application ' + routingEntry.app.name 
					+ ' did not establish a listener in a timely manner or failed during startup.');
			}

			delete routingEntry.app.pendingRequests;

			if (routingEntry.app.process) {
				console.log('Terminating unresponsive node.js process with PID ' + routingEntry.app.process.pid);
				delete processes[routingEntry.app.to.port];
				try { 
					process.kill(routingEntry.app.process.pid); 
				}
				catch (e) {
					// empty
				}

				delete routingEntry.app.process;
				delete routingEntry.app.to;
			}
		} 
		else { 
			setTimeout(function () {
				waitForServer(routingEntry, attemptsLeft - 1, delay);				
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
		var absolutePath = path.resolve(config.root, 'apps', context.routingEntry.app.name, context.routingEntry.app.script);

		console.log('Starting application ' + context.routingEntry.app.name + ' with entry point ' + absolutePath);
		
		try { 
			context.routingEntry.app.process = child_process.spawn(process.execPath, [ absolutePath ], { env: env }); 
		}
		catch (e) {
			// empty
		}

		if (!context.routingEntry.app.process 
			|| (typeof context.routingEntry.app.process.exitCode === 'number' && context.routingEntry.app.process.exitCode !== 0)) {
			console.log('Unable to start process: node.exe ' + absolutePath);
			onProxyError(context, 500, 'Unable to start process: node.exe ' + absolutePath);
		}
		else {
			processes[port] = context.routingEntry.app.process;
			context.routingEntry.app.to = { host: '127.0.0.1', port: port };
			var logger = function(data) { process.stdout.write('PID ' + context.routingEntry.app.process.pid + ':' + data); };
			context.routingEntry.app.process.stdout.on('data', logger);
			context.routingEntry.app.process.stderr.on('data', logger);
			var currentProcesses = processes;
			context.routingEntry.app.process.on('exit', function (code, signal) {
				if (currentProcesses === processes) {
					// avoid race condition in he recycle mode

					delete processes[port];
				}
				console.log('Child process exited. App: ' + context.routingEntry.app.name + ', Port: ' + port + ', PID: ' + context.routingEntry.app.process.pid 
					+ ', code: ' + code + ', signal: ' + signal);

				// remove registration of the instance of the application that just exited

				delete context.routingEntry.app.process;
				delete context.routingEntry.app.to;
			});

			waitForServer(context.routingEntry, 20, 1000);
		}
	}
}

function ensureProcess(context) {
	// Routing logic:
	// 1. If app process is running:
	// 1.1. If it has already established a listener, route to it
	// 1.2. Else, queue up the context to be routed once the listener has been established
	// 2. Else, provision a new instance

	if (context.routingEntry.app.process) {
		if (context.routingEntry.app.pendingRequests) {
			context.routingEntry.app.pendingRequests.push(context);
		}
		else {
			routeToProcess(context);
		}
	}
	else {
		context.routingEntry.app.pendingRequests = [ context ];
		createProcess(context);
	}
}

function ensureSecurityConstraints(context) {
	if (context.routingEntry.route.ssl === 'disallowed' && context.proxy.secure
		|| context.routingEntry.route.ssl === 'required' && !context.proxy.secure) {
		onProxyError(context, 404, "Request security does not match security configuration of the application");
	}
	else {
		ensureProcess(context);
	}
}

function routeByHost(context) {
	return config.routingTable[context.host];
}

function routeByPath(context) {
	var match = /\/([^\/\#\?]+)/.exec(context.req.url);
	return match ? config.pathRoutingTable[match[1]] : undefined;
}

function loadApp(context) {
	context.host = context.req.headers['host'].toLowerCase();
	context.req.context = context;
	context.routingEntry = routeByHost(context) || routeByPath(context) || config.fallbackRoute;
	if (!context.routingEntry) {
		onProxyError(context, 404, 'Web application not found in routing table');
	}
	else {
		ensureSecurityConstraints(context);
	}
}

function onRouteRequest(req, res, proxy) {
	if (isSystemInMaintenance(req, res)) {
		return;
	}

	req.pause();
	loadApp({ req: req, res: res, proxy: proxy});
}

function onRouteUpgradeRequest(req, socket, head, proxy) {
	if (recycleInProgress) {
		socket.destroy();
		return;
	}

	socket.pause();
	loadApp({ req: req, socket: socket, head: head, proxy: proxy});
}

function onProxyingError(err, req, res) {
	console.log('Error routing ' + getDestinationDescription(req.context) + ': ' + req.url);

	// attempt to send a polite response

	if (req.method !== 'HEAD') {
		try {
			res.writeHead(500, {'Content-Type': 'text/plain'});
			res.write('There was an error routing the request to the application process:\n');
			res.write(err.toString());
			res.end();
		}
		catch (e) {
			try {
				res.end();
			}
			catch (e1) {
				// empty
			}
		}
	}
}

function setupRouter() {

	console.log('Setting up the HTTP/WS router...');

	// setup HTTP/WS proxy

	server = httpProxy.createServer(onRouteRequest);
	server.proxy.on('proxyError', onProxyingError);
	server.on('upgrade', function (req, res, head) { onRouteUpgradeRequest(req, res, head, server.proxy); });
	server.listen(config.port);

	if (config.sslEnabled) {
		// setup HTTPS/WSS proxy along with SNI information for individual apps

		console.log('Setting up the HTTPS/WSS router...');

		var options = { 
			https: { 
				cert: config.sslCertificate, 
				key: config.sslKey
			} 
		};

		secureServer = httpProxy.createServer(options, onRouteRequest);
		secureServer.proxy.secure = true;
		secureServer.proxy.on('proxyError', onProxyingError);
		secureServer.on('upgrade', function (req, res, head) { onRouteUpgradeRequest(req, res, head, secureServer.proxy); });
		for (var hostName in config.routingTable) {
			var host = config.routingTable[hostName];
			if (host.route.sslCertificate && host.route.sslKey && host.route.ssl !== 'disallowed') {
				console.log('Configuring SNI for host name ' + hostName);
				secureServer.addContext(hostName, { cert: host.route.sslCertificate, key: host.route.sslKey });
			}
		}
		secureServer.listen(config.sslPort);
	}

	console.log('Router successfuly started.');
}

function killChildProcesses(callback) {
	console.log('Killing existing child processes...')

	for (var i in processes) {
		var p = processes[i];
		try {
			process.kill(p.pid);
			console.log('Killed child process with PID ' + p.pid);
		}
		catch (e) {
			console.log('Unable to kill child process with PID ' + p.pid + ': ' + e);
		}
	}

	processes = {};	

	if (callback) {
		callback(null);
	}
}

function syncRepo(callback) {

	var callbackCalled;

	console.log('Syncing the repo with command ' + config.syncCmd);
	var child = child_process.exec(config.syncCmd, function (err, stdout, stderr) {

		if (callbackCalled) {
			return;
		}

		var isNonEmptyString = function (s) {
			return typeof s === 'string' && s.length > 0;
		}

		if (err) {
			console.log('Failed to sync the repo: ');
			console.log(err);
			if (isNonEmptyString(stderr)) {
				console.log('Stderr of sync command:');
				console.log(stderr);
			}
		}
		else {
			console.log('Successfuly synced the repo');
		}

		if (isNonEmptyString(stdout)) {
			console.log('Stdout of sync command:');
			console.log(stdout);
		}	

		callbackCalled = true;
		callback(err);
	});

	// 'exit' was introduced in v0.7.x, it speeds up detection of process termination on
	// windows; see https://github.com/joyent/node/pull/2944 for details

	child.on('exit', function (code, signal) {
		if (callbackCalled) {
			return;
		}

		if (code === 0) {
			console.log('Successfuly synced the repo');
			callbackCalled = true;
			callback(null);
		}

		// otherwise wait some more for the actual 'close' event to collect all output
	});
}

function recycleService() {

	recycleInProgress = true;
	recycleStartTime = new Date();

	// terminate existing child processes
	killChildProcesses(function (err) {
		if (err) throw err;

		// sync the repo
		syncRepo(function (err) {
			if (err) throw err;

			// stop services
			closeEndpoints(function (err) {
				if (err) throw err;

				// recalculate configuration & restart services
				determineConfiguration();

				recycleInProgress = false;
			});

		});
	});
}

function isSystemInMaintenance(req, res) {
	if (recycleInProgress) {
		res.writeHead(503, { 'Content-Type': 'text/plain' });
		var duration = new Date() - recycleStartTime;
		res.end('The system is updating, please try again in a moment.\nElapsed time: ' + (duration / 1000) + ' seconds.');
	}

	return recycleInProgress;
}

function onManagementRequest(req, res) {
	if (isSystemInMaintenance(req, res)) {
		return;
	}

	res.writeHead(501);
	res.end();
}

function onPostReceiveMessage(req, res) {
	if (isSystemInMaintenance(req, res)) {
		return;
	}

	if ((req.method === 'POST' || req.method === 'GET') && req.url === config.postReceive) {
		console.log('Received post receive notification. Initializing recycle...');
		res.writeHead(200, { 'Content-Type': 'text/plain' });
		res.end('Recycle initialized at ' + new Date() + '\n');
		recycleService();
	}
	else {
		console.log('Received unrecognized request at the post receive notification endpoint. Verb: '
			+ req.method + ', Path: ' + req.url);
		res.writeHead(404);
		res.end();
	}
}

function setupManagement() {

	console.log('Setting up the management endpoint...');

	if (config.sslEnabled) {
		var options = { cert: config.sslCertificate, key: config.sslKey };
		managementServer = https.createServer(options, onManagementRequest).listen(config.externalManagementPort);
		console.log('HTTPS (secure) management endpoint set up on port ' + config.externalManagementPort);
	}
	else {
		managementServer = http.createServer(onManagementRequest).listen(config.externalManagementPort);
		console.log('HTTP (unsecure) management endpoint set up on port ' + config.externalManagementPort);
	}
}

function ensurePostReceiveHook() {
	console.log('Setting up post receive hook endpoint...');

	if (postReceiveServer) {
		console.log('Post receive server is already running.');
	}
	else {
		postReceiveServer = http.createServer(onPostReceiveMessage).listen(config.postReceivePort);
		console.log('HTTP (unsecure) post receive endpoint set up on port ' + config.postReceivePort + ' and URL path ' + config.postReceive);
	}
}

determineConfiguration();