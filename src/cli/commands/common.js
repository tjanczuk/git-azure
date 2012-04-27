var path = require('path')
	, fs = require('fs')
	, spawn = require('child_process').spawn
	, path = require('path')
	, https = require('https');

if (!fs.existsSync) {
	// polyfill node v0.7 fs.existsSync with node v0.6 path.existsSync
	fs.existsSync = path.existsSync;
}

var ads = [
	'Did you know you can easily access Windows Azure services from node.js? Check out https://github.com/WindowsAzure/azure-sdk-for-node for details.',
	'Did you know Windows Azure offers three storage services for your data: blob storage, table storage, and MS SQL? Visit https://www.windowsazure.com to learn more.',
	'Did you know Windows Azure has a 90-day free trial? Check out https://www.windowsazure.com to find out the details.',
	'Did you know you can host node.js applications in IIS along with other types of content? Visit https://github.com/tjanczuk/iisnode for more information.',
	'Did you know you can develop node.js applications in WebMatrix on Windows? Download it for free at http://www.microsoft.com/web/webmatrix/.',
	'Did you know Windows Azure SDK for node.js has everything you need to develop node.js apps on Windows? Check out https://www.windowsazure.com/en-us/develop/nodejs/ for more.',
	'Did you know node.js developers live on average 2.7 years longer than PHP devs? [Quotation needed]',
	'[Place for your ad] Send your credit card number and text of the ad to @tjanczuk (just joking)'
];

exports.isWindows = typeof process.env.OS !== 'undefined';

exports.httpsRequest = 	function (subscriptionId, cert, host, url, method, body, headers, isLongLasting, callback)
{
	if (typeof isLongLasting === 'function') {
		callback = isLongLasting;
		isLongLasting = undefined;
	}

	var adInterval;

	var showAd = function () {
		console.log(ads[Math.random() * ads.length]);
	}

	var finishAsyncRequest = function (err, res, body) {
		if (adInterval) {
			clearInterval(adInterval);
		}

		callback(err, res, body);
	}

	var waitSymbols = [ '\\', '|', '/', '-' ];
	var waitSymbolIndex = 0;

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
					finishAsyncRequest(new Error('Async operation failed'), res, body);
				}
				else if (-1 < body.indexOf('<Status>InProgress</Status>')) {
					process.stdout.write(waitSymbols[waitSymbolIndex] + ' stay on the line and we will be right with you\r');
					waitSymbolIndex = (waitSymbolIndex + 1) % waitSymbols.length;
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
					adInterval = setInterval(showAd, 12000);
				}

				waitForAsyncOperation(res.headers['x-ms-request-id']);
			}
			else {

				// sync operation - invoke callback

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
	'rdpusername',
	'rdppassword',
	'remote',
	'branch',
	'force'
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
			if (source[filter[k]])
				dest[filter[k]] = source[filter[k]]
	}
	else 
		for (var k in source) 
			dest[k] = source[k]			
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
			console.log('Using remote ' + config.remote + ' with URL ' + config.remote_url);
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