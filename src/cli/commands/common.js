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

exports.startWait = function () {
	var waitSymbols = [ '\\', '|', '/', '-' ];
	var waitSymbolIndex = 0;

	var showWait = function() {
		process.stdout.write(('  stay on the line and we will be right with you ' + waitSymbols[waitSymbolIndex]).grey + '\r');
		waitSymbolIndex = (waitSymbolIndex + 1) % waitSymbols.length;
	}

	return setInterval(showWait, 1000);
};

exports.startAds = function () {

	var ads = [
		'Did you know you can easily access Windows Azure services from node.js?\nCheck out https://github.com/WindowsAzure/azure-sdk-for-node for details.',
		'Did you know Windows Azure offers three storage services for your data: blob storage, table storage, and MS SQL?\nVisit https://www.windowsazure.com to learn more.',
		'Did you know Windows Azure has a ' + '90-day free trial'.green + '?\nCheck out https://www.windowsazure.com for details.',
		'Did you know you can host node.js applications in IIS along with other types of content?\nVisit https://github.com/tjanczuk/iisnode to get started.',
		'Did you know you can develop node.js applications in WebMatrix on Windows?\nDownload it for free at http://www.microsoft.com/web/webmatrix/',
		'Did you know Windows Azure SDK for node.js has everything you need to develop node.js apps on Windows?\nCheck out https://www.windowsazure.com/en-us/develop/nodejs/ for more.',
		'Did you know that node.js developers live on average 2.7 years longer than PHP devs? [Quotation needed]',
		'[Place for your ad] Send money and the text of the ad to @tjanczuk. Seriously.'
	];

	var showAd = function () {
		console.log(ads[Math.floor(Math.random() * ads.length)]);
	}

	return setInterval(showAd, 16000);
};

exports.httpsRequest = 	function (subscriptionId, cert, host, url, method, body, headers, isLongLasting, callback) {
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
			subscriptionId,
			cert,
			'management.core.windows.net',
			'/' + subscriptionId + '/operations/' + requestId,
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
	'subscriptionId',
	'publishSettings',
	'storageAccountName',
	'storageAccountKey',
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

	var result = {}
	var getNextSetting = function (i) {
		exports.git(['config','--get', (prefix || '') + properties[i]], null, function (err, stdout) {
			if (!err && typeof stdout === 'string' && stdout.length > 0)
				result[properties[i]] = stdout.replace('\n','')
			if (++i === properties.length) 
				callback(err, result)
			else
				getNextSetting(i)
		})
	}
	getNextSetting(0)
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