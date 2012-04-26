var path = require('path')
	, fs = require('fs')
	, spawn = require('child_process').spawn
	, path = require('path');

if (!fs.existsSync) {
	// polyfill node v0.7 fs.existsSync with node v0.6 path.existsSync
	fs.existsSync = path.existsSync;
}

exports.isWindows = typeof process.env.OS !== 'undefined';

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
	'branch'
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