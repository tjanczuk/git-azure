var path = require('path')
	, fs = require('fs')
	, spawn = require('child_process').spawn
	, path = require('path')
	, https = require('https');

if (!fs.existsSync) {
	// polyfill node v0.7 fs.existsSync with node v0.6 path.existsSync
	fs.existsSync = path.existsSync;
}

exports.isWindows = typeof process.env.OS !== 'undefined';

var gitAzureDir = '.git-azure';

exports.startWait = function () {
	var waitSymbols = [ '\\', '|', '/', '-' ];
	var waitSymbolIndex = 0;

	var showWait = function() {
		process.stdout.write(('  stay on the line and we will be right with you ' + waitSymbols[waitSymbolIndex]).grey + '\r');
		waitSymbolIndex = (waitSymbolIndex + 1) % waitSymbols.length;
	}

	return setInterval(showWait, 1000);
};

var ads = [
	'Did you know you can easily access Windows Azure services from node.js?\nCheck out https://github.com/WindowsAzure/azure-sdk-for-node for details.',
	'Did you know you can store data in Windows Azure using blob storage, table storage, and MS SQL?\nVisit https://www.windowsazure.com to learn more.',
	'Did you know you can host node.js applications in IIS along with other types of content?\nVisit https://github.com/tjanczuk/iisnode to get started.',
	'Did you know you can develop node.js applications in WebMatrix on Windows?\nDownload it for free at http://www.microsoft.com/web/webmatrix/',
	'Did you know Windows Azure SDK for node.js has everything you need to develop node.js apps on Windows?\nCheck out https://www.windowsazure.com/en-us/develop/nodejs/ for more.',
	'Did you know that node.js developers live on average 2.7 years longer than PHP devs? [Quotation needed]',
	'[Place for your ad] Send money and the text of the ad to @tjanczuk. Seriously.'
];

exports.startAds = function () {

	var showAd = function () {
		if (ads.length > 0) {
			var index = Math.floor(Math.random() * ads.length);
			console.log(ads[index]);
			ads.splice(index, 1);
		}
	}

	return setInterval(showAd, 60000);
};

exports.httpsRequest = 	function (subscription, cert, host, url, method, body, headers, isLongLasting, callback) {
	if (typeof isLongLasting === 'function') {
		callback = isLongLasting;
		isLongLasting = undefined;
	}

	var adInterval;
	var waitShowInterval;

	var finishAsyncRequest = function (err, res, body) {
		if (adInterval) {
			clearInterval(adInterval);
		}

		if (waitShowInterval) {
			clearInterval(waitShowInterval);
		}

		callback(err, res, body);
	}

	var waitForAsyncOperation = function (requestId) {
		exports.httpsRequest(
			subscription,
			cert,
			'management.core.windows.net',
			'/' + subscription + '/operations/' + requestId,
			'GET',
			null,
			{ 'x-ms-version': '2009-10-01' },
			function (err, res, body) {
				if (err || res.statusCode !== 200) {
					finishAsyncRequest(err, res, body);
				}
				else if (-1 < body.indexOf('<Status>Succeeded</Status>')) {
					finishAsyncRequest(null, res, body);
				}
				else if (-1 < body.indexOf('<Status>Failed</Status>')) {
					finishAsyncRequest(new Error('Windows Azure management operation failed:\r\n' + body || ''), res, body);
				}
				else if (-1 < body.indexOf('<Status>InProgress</Status>')) {
					setTimeout(function () { 
						waitForAsyncOperation(requestId); 
					}, 5000);
				}
				else {
					finishAsyncRequest(new Error('Unexpected response from Windows Azure'), res, body);
				}
			}
		);
	}

	var options = {
		host: host,
		port: 443,
		path: url,
		method: method,
		key: cert,
		cert: cert,
		headers: headers || {}
	};

	options.agent = new https.Agent(options);

	if (body) {
		options.headers['Content-Length'] = body.length;
	}

	var request = https.request(options, function (res) {
		res.setEncoding('utf8');
		var body = '';
		
		res.on('data', function (chunk) {
			body += chunk;
		});

		res.on('end', function () {
			if (res.statusCode === 202 
				&& typeof res.headers['x-ms-request-id'] === 'string' && res.headers['x-ms-request-id'].length > 0) {

				// async operation - wait for completion

				if (isLongLasting) {
					adInterval = exports.startAds();
					waitShowInterval = exports.startWait();
				}

				waitForAsyncOperation(res.headers['x-ms-request-id']);
			}
			else {

				// sync completion - invoke callback

				callback(null, res, body);
			}
		});
	});

	request.on('error', callback);

	if (body) {
		request.end(body);
	}
	else {
		request.end();
	}
}

exports.git = function (args, dir, callback) {
    if (typeof args === 'string') 
    	args = [args];
    var git = spawn(exports.isWindows ? 'git.cmd' : 'git', args, { cwd: dir || process.cwd() });
    var stdout = ''
    var stderr = ''
    git.stdout.on('data', function (data) { stdout += data.toString(); })
    git.stderr.on('data', function (data) { stderr += data.toString(); })
    git.on('exit', function (code) {
        var err = (code !== 0) ? { code: code, msg: stderr } : null
        if (callback) callback(err, stdout, stderr)
    })
}

exports.gitAzureConfigNames = [
	'subscription',
	'publishSettings',
	'storageAccountName',
	'serviceName',
	'serviceLocation',
	'instances',
	'blobContainerName',
	'username',
	'password',
	'remote',
	'branch',
	'force',
	'postReceive'
]

exports.getAzureConfigFromGit = function (prefix, properties, callback) {
	if (typeof callback !== 'function')
		throw new Error('callback must be a function');
	if (!Array.isArray(properties))
		throw new Error('properties must be an array of strings');

	var result = {};
	var getNextSetting = function (i) {
		exports.git(['config','--get', (prefix || '') + properties[i]], null, function (err, stdout) {
			if (!err && typeof stdout === 'string' && stdout.length > 0)
				result[properties[i]] = stdout.replace('\n','');
			if (++i === properties.length) 
				callback(null, result);
			else
				getNextSetting(i);
		});
	}
	getNextSetting(0);
}

exports.merge = function (source, dest, filter) {
	if (filter) {
		for (var k in filter)
			if (source[filter[k]] && typeof source[filter[k]] !== 'function')
				dest[filter[k]] = source[filter[k]];
	}
	else 
		for (var k in source) 
			if (typeof source[k] !== 'function')
				dest[k] = source[k];
}

exports.getCurrentConfig = function (callback) {

	if (typeof callback !== 'function')
		throw new Error('callback must be a function')

	// defaults

	var config = {
		serviceLocation: 'Anywhere US',
		instances: 1,
		remote: 'origin',
		branch: 'master'
	}

	// override with configuration stored in Git

	exports.getAzureConfigFromGit('azure.', exports.gitAzureConfigNames, function (err, gitConfig) {
		exports.merge(gitConfig, config);
		var remoteProp = 'remote.' + config.remote + '.url';
		exports.getAzureConfigFromGit(null, [remoteProp], function (err, remoteConfig) {
			if (err) {
				console.error('Cannot determine the URL of the remote: ' + config.remote + '.');
				console.error('Make sure the remote is registered or specify a different one with --remote.');
				process.exit(1);
			}
			config.remote_url = remoteConfig[remoteProp];
			callback(null, config)
		});
	})
}

exports.getGitContext = function (callback) {
	var result = {}

	// find the root of the current Git project

	var projectRoot = process.cwd()
	while (projectRoot.length > 1 && !fs.existsSync(path.resolve(projectRoot, '.git'))) 
		projectRoot = path.resolve(projectRoot, '..')

	if (fs.existsSync(path.resolve(projectRoot, '.git')))
		result.projectRoot = projectRoot

	if (callback)
		callback(null, result)
}

exports.generateX509 = function (options, callback) {
	var tmpDir = path.resolve(options.config.git.projectRoot, gitAzureDir, 'src/bootstrap');
	var keyFile = path.resolve(tmpDir, 'key.pem.openssl');
	var csrFile = path.resolve(tmpDir, 'csr.pem.openssl');
	var certFile = path.resolve(tmpDir, 'cert.pem.openssl');

	var cleanupFiles = function () {
		[keyFile, csrFile, certFile].forEach(function (item) {
			try {
				fs.unlinkSync(item);
			}
			catch (e) {
				// empty
			}
		});
	}

	// openssl genrsa -out key.pem.openssl 1024
	// openssl req -new -key key.pem.openssl -out csr.pem.openssl -subj /CN=<options.cn>
	// openssl x509 -req -in csr.pem.openssl -signkey key.pem.openssl -out cert.pem.openssl

	var command = 
		'openssl genrsa -out ' + keyFile + ' 1024\n' +
		'openssl req -new -key ' + keyFile + ' -out ' + csrFile + ' -subj /CN=' + options.cn + '\n' +
		'openssl x509 -req -in ' + csrFile + ' -signkey ' + keyFile + ' -out ' + certFile;

	cleanupFiles();

	require('child_process').exec(command, function (err, stdout, stderr) {
		if (err) {
			console.error('Unable to generate a self-signed X.509 certificate:');
			console.error(err);
			cleanupFiles();
			process.exit(1);
		}

		try {
			fs.unlinkSync(csrFile);
		}
		catch (e) {
			// empty
		}

		callback(null, { keyFile: keyFile, certFile: certFile });
	});
}