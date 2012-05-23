var fs = require('fs')
	, path = require('path')
	, common = require('./common.js')
	, async = require('async')
	, azure = require('azure');

var existsSync = fs.existsSync || path.existsSync;

exports.action = function (cmd) {

	var config;

	process.on('exit', function () {
		if (config && config.generatedX509) {
			[config.certFile, config.keyFile].forEach(function (item) {
				try {
					fs.unlinkSync(item);
				}
				catch (e) {
					// empty
				}
			});
		}
	});

	function save() {
		fs.writeFileSync(config.configFile, JSON.stringify(config.packageJson, null, 2));
		console.log('Configuration successful. You must commit and push for the changes to take effect.');
	}

	function configurePathRouting() {
		if (config.disablePathRouting) {
			config.packageJson.azure.pathRoutingDisabled = true;
		}
		else if (config.enablePathRouting) {
			delete config.packageJson.azure.pathRoutingDisabled;
		}

		save();
	}

	function configureSsl() {
		if (config.key) {
			config.packageJson.azure.hosts[config.host].sslKeyName = config.key;
			config.packageJson.azure.hosts[config.host].sslCertificateName = config.cert;
		}

		configurePathRouting();
	}

	function uploadCert() {
		if (config.certFile) {
			var blob = azure.createBlobService(config.storageAccountName, config.storageAccountKey);
			var fileName = path.resolve(process.cwd(), config.certFile);
			config.cert = config.host + '.certificate.pem';
			blob.createBlockBlobFromFile(config.blobContainerName, config.cert, fileName, function (err) {
				if (err) {
					console.error('Unable to upload X.509 certificate from ' + fileName + ' to Windows Azure Blob Storage:');
					console.error(err);
					process.exit(1);
				}

				configureSsl();
			});
		}
		else {
			configureSsl();
		}
	}

	function uploadKey() {
		if (config.keyFile) {
			var blob = azure.createBlobService(config.storageAccountName, config.storageAccountKey);
			var fileName = path.resolve(process.cwd(), config.keyFile);
			config.key = config.host + '.key.pem';
			blob.createBlockBlobFromFile(config.blobContainerName, config.key, fileName, function (err) {
				if (err) {
					console.error('Unable to upload SSL private key from ' + fileName + ' to Windows Azure Blob Storage:');
					console.error(err);
					process.exit(1);
				}

				uploadCert();
			});
		}
		else {
			uploadCert();
		}
	}

	function addGitSubmodule() {
		common.git(['submodule','add',config.gitUrl,'apps/' + config.setup],
			config.git.projectRoot,
			function (err, result) {
				if (err) {
					console.error('Unable to register Git repository ' + config.gitUrl + ' as a submodule under apps/' + config.setup + ':');
					console.error(err.msg);
					process.exit(1);
				}

				loadPackageJson();
			});
	}

	function generateX509() {
		if (config.generateX509) {
			var options = { config: config };
			if (config.generateX509 === true) {
				options.cn = config.host;
			}
			else {
				options.cn = config.generateX509;
			}
			
			common.generateX509(options, function (err, result) {
				if (err) {
					console.error('Unable to generate self-signed X.509 certificate:');
					console.error(err);
					process.exit(1);
				}

				config.certFile = result.certFile;
				config.keyFile = result.keyFile;
				config.generatedX509 = true;

				uploadKey();
			})
		}
		else {
			uploadKey();
		}
	}

	function scaffoldContent() {
		if (!config.gitUrl) {
			var entryFile = path.resolve(config.appDir, config.packageJson.azure.script);
			if (!existsSync(entryFile)) {
				var serverJsTemplate = fs.readFileSync(path.resolve(__dirname, 'server.template.js'), 'utf8');

				if (!config.ip)
					config.ip = '0.0.0.0';
				if (!config.cname)
					config.cname = 'myServiceName.cloudapp.net';

				var serverJs = serverJsTemplate.replace(/##NAME##/g, config.setup).replace(/##AZUREHOST##/g, config.cname).replace(/##IP##/g, config.ip).replace(/##HOST##/g, config.host);

				fs.writeFileSync(entryFile, serverJs);
			}
		}

		generateX509();
	}

	function loadPackageJson() {
		if (existsSync(config.configFile)) {
			config.packageJson = require(config.configFile);
		}
		else {
			config.packageJson = {}
		}

		if (config.packageJson.azure) {
			if (config.entry) {
				config.packageJson.azure.script = config.entry;
			}
		}
		else {
			config.packageJson.azure = {};
			if (!config.entry) {
				['server.js', 'app.js'].some(function (item) { 
					if (existsSync(path.resolve(config.appDir, item))) {
						config.entry = item;
						return true;
					}

					return false;
				});

				if (!config.entry) {
					config.entry = 'server.js';
				}

				config.packageJson.azure.script = config.entry;
			}
		}

		if (!config.packageJson.azure.hosts) {
			config.packageJson.azure.hosts = {};
		}

		if (config.host) {
			if (config.packageJson.azure.hosts[config.host]) {
				if (config.ssl) {
					config.packageJson.azure.hosts[config.host].ssl = config.ssl;
				}
			}
			else {
				if (!config.ssl) {
					config.ssl = 'allowed';
				}

				config.packageJson.azure.hosts[config.host] = {
					ssl: config.ssl
				};
			}
		}

		scaffoldContent();		
	}

	function createOrConfigureApp() {

		if (!existsSync(config.appsDir)) {
			fs.mkdirSync(config.appsDir);
		}

		if (config.gitUrl) {
			addGitSubmodule();
		}
		else {
			if (!existsSync(config.appDir)) {
				fs.mkdirSync(config.appDir);
			}

			loadPackageJson();
		}
	}

	function deleteHost() {
		if (existsSync(config.configFile)) {
			var c = require(config.configFile);
			if (c.azure && c.azure.hosts && c.azure.hosts[config.host]) {
				delete c.azure.hosts[config.host];
				fs.writeFileSync(config.configFile, JSON.stringify(c, null, 2));
				console.log('Hostname ' + config.host + ' deleted from app ' + config.disable + '.');
				console.log('You must commit and push for the changes to take effect.');
			}
			else {
				console.log('Hostname ' + config.host + ' not configured for app ' + config.disable + '. Nothing to delete.');
			}
		}
		else {
			console.log('The package.json file not present at ' + config.configFile + '. Nothing to delete.');
		}
	}

	function deleteApp() {
		if (existsSync(config.configFile)) {
			var c = require(config.configFile);
			if (c.azure) {
				delete c.azure.hosts;
				c.azure.pathRoutingDisabled = true;
				fs.writeFileSync(config.configFile, JSON.stringify(c, null, 2));
				console.log('Disabled URL path routing and removed all hostname registrations for app ' + config.disable + '. This disables routing any messages to the app.');
				console.log('You must commit and push for the changes to take effect.');
			}
			else {
				console.log('Hostname ' + config.host + ' not configured for app ' + config.disable + '. Nothing to delete.');
			}
		}
		else if (existsSync(config.appDir)) {
			fs.writeFileSync(config.configFile, JSON.stringify({ azure: { script: 'server.js', hosts: {} }}, null, 2));
			console.log('Created package.json file for app ' + config.disable + ' with no hostnames registred. This disables routing any messages to the app.')
			console.log('You must commit and push for the changes to take effect.');
		}
		else {
			console.log('App ' + config.disable + ' does not exist. Nothing to delete.');	
		}
	}

	function getAppConfig(app, errors, warnings) {
		var appConfig = { app: app };
		var configFile = path.resolve(config.appsDir, app, 'package.json');
		if (existsSync(configFile)) {
			
			var packageJson = require(configFile);

			if (packageJson.azure) 
				appConfig.azure = packageJson.azure;
		}

		if (!appConfig.azure) {
			appConfig.inferred = true;
			appConfig.azure = { hosts: {} };
			if (app.indexOf('.') > 0) {
				appConfig.azure.hosts[app] = { ssl: 'allowed' };
			}

			['server.js', 'app.js'].some(function (item) {
				if (existsSync(path.resolve(config.appsDir, app, item))) {
					appConfig.azure.script = item;

					return true;
				}
				else {
					return false;
				}
			});
		}

		if (!appConfig.azure.script) {
			errors.push('- app ' + app + ' does not specify an entry script and neither server.js or app.js exist');
		}
		else if (!existsSync(path.resolve(config.appsDir, app, appConfig.azure.script))) {
			errors.push('- app ' + app + ' specifies an entry script name that does not exist: ' + appConfig.azure.script);
		}

		if (appConfig.azure.pathRoutingDisabled && (!appConfig.azure.hosts || Object.getOwnPropertyNames(appConfig.azure.hosts).length === 0)) {
			warnings.push('- app ' + app + ' is disabled because it does not have any associated host names and has turned off URL path based routing');
		}

		return appConfig;
	}

	function printErrors(errors, message) {
		if (errors.length > 0) {
			console.error('');
			console.error(message);
			errors.forEach(console.error);
		}
	}

	function printAppConfig(appConfig) {
		if (appConfig.inferred) {
			console.log((appConfig.app + ' (inferred configuration):').cyan);
		}
		else {
			console.log((appConfig.app + ':').cyan);
		}

		console.log(JSON.stringify(appConfig.azure, null, 2));
	}

	function showApp() {
		if (existsSync(path.resolve(config.appsDir, config.show))) {
			var errors = [];
			var warnings = [];
			printAppConfig(getAppConfig(config.show, errors, warnings));
			printErrors(errors, 'Errors:');
			printErrors(warnings, 'Warnings:')
		}
		else {
			console.error('App ' + config.show + ' does not exist.');
			process.exit(1);
		}
	}

	function showAllApps() {
		if (existsSync(config.appsDir)) {
			var apps = fs.readdirSync(config.appsDir);
			var errors = [];
			var warnings = [];
			var appConfigs = {};
			var hosts = {};
			var first = true;
			apps.forEach(function (item) {
				appConfigs[item] = getAppConfig(item, errors, warnings);
				if (!first) {
					console.log('');
				}

				first = false;

				printAppConfig(appConfigs[item]);
				
				if (appConfigs[item].azure.hosts) {
					for (var host in appConfigs[item].azure.hosts) {
						if (hosts[host])
							hosts[host].push(item);
						else
							hosts[host] = [item];
					}
				}
			});

			for (var host in hosts) {
				if (hosts[host].length > 1) {
					errors.push('- more than one app is associated with host name ' + host + ': ' + JSON.stringify(hosts[host]));
				}
			}

			printErrors(errors, 'Errors:');
			printErrors(warnings, 'Warnings:')
		}
	}

	function checkParametersSpecified() {
		// check git context

		if (!config.git.projectRoot) {
			console.error('Unable to determine Git repository.')
			process.exit(1)
		}

		// check config

		var missing = [];

		if (!config.setup && !config.disable && !config.show) {
			missing.push('- one of --setup, --show, or --delete must be specified');
		}

		if (!([undefined, 'allowed', 'disallowed', 'required'].some(function (item) { return item === config.ssl; }))) {
			missing.push('--ssl must specify \'allowed\', \'required\', or \'disallowed\'');
		}

		if ((config.cert || config.certFile) && !config.key && !config.keyFile) {
			missing.push('- when --cert or --certFile is specified, one of --key or --keyFile must also be specified');
		}

		if ((config.key || config.keyFile) && !config.cert && !config.certFile) {
			missing.push('- when --key or --keyFile is specified, one of --cert of --certFile must also be specified');
		}

		if (config.generateX509 && (config.certFile || config.keyFile || config.cert || config.key)) {
			missing.push('--generateX509 is mutually exlusive with either of --certFile, --keyFile, --cert, or -key');
		}

		if (config.certFile || config.keyFile || config.generateX509) {
			['storageAccountName', 'storageAccountKey', 'blobContainerName'].forEach(function (item) {
				if (!config[item])
					missing.push('--' + item);
			});			
		}

		if (config.enablePathRouting && config.disablePathRouting) {
			missing.push('--disablePathRouting and --enablePathRouting cannot be specified togeather');
		}

		if (config.setup) {
			if (!config.host && config.setup.indexOf('.') > -1) {
				config.host = config.setup;
			}

			if (!config.host && (config.ssl || config.cert || config.certFile || config.key || config.keyFile || config.generateX509)) {
				missing.push('--host must be specified when --ssl, --cert, --certFile, --key, --keyFile, or --generateX509 is specified');
			}			
		}

		config.appsDir = path.resolve(config.git.projectRoot, 'apps');
		config.appDir = path.resolve(config.appsDir, config.setup || config.disable);
		config.configFile = path.resolve(config.appDir, 'package.json');

		if (config.setup && config.gitUrl && existsSync(config.appDir)) {
			missing.push('--gitUrl can only be used when the apps/' + config.setup + ' directory does not exist yet');
		}

		if (missing.length > 0) {
			console.error('Missing or incorrect parameters:\n');
			missing.forEach(console.error);
			console.error("\nYou can use 'git azure blob' command to manipulate SSL certificates and keys in Windows Azure Blob storage.");
			process.exit(1)
		}

		if (config.disable) {
			if (config.host) {
				deleteHost();
			}
			else {
				deleteApp();
			}
		}
		else if (config.show === true) {
			showAllApps();
		}
		else if (config.show) {
			showApp();
		}
		else { // --setup
			createOrConfigureApp();
		}
	}

	common.getAzureConfigFromGit('azure.', ['storageAccountName', 'storageAccountKey', 'blobContainerName', 'ip', 'cname'], function (err, gitConfig) {
		if (err) {
			console.error(err);
			process.exit(1);
		}

		config = gitConfig;

		common.merge(cmd, config, ['show', 'gitUrl', 'ssl', 'cert', 'certFile', 'key', 'keyFile', 'generateX509',
			'disablePathRouting', 'enablePathRouting', 'entry', 'disable', 'host', 'setup', 'storageAccountName', 
			'storageAccountKey', 'blobContainerName']);

		common.getGitContext(function (err, context) {
			if (err) {
				console.error(err.toString());
				process.exit(1);
			}

			config.git = context;
			checkParametersSpecified();
		});
	});
}
