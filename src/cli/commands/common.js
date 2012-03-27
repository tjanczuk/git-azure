var path = require('path')
	, fs = require('fs')
	, spawn = require('child_process').spawn

exports.git = function (args, dir, callback) {
    if (typeof args === 'string') 
    	args = [args];
    var git = spawn('git', args, { cwd: dir || process.cwd() });
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
	'managementCertificate',
	'publishSettings',
	'storageAccountName',
	'storageAccountKey',
	'serviceName',
	'serviceLocation',
	'vmSize',
	'instances',
	'blobContainerName',
	'remote',
	'branch'
]

exports.getAzureConfigFromGit = function (callback) {
	if (typeof callback !== 'function')
		throw new Error('callback must be a function')

	var result = {}
	var getNextSetting = function (i) {
		exports.git(['config','--get','azure.' + exports.gitAzureConfigNames[i]], null, function (err, stdout) {
			if (!err && typeof stdout === 'string' && stdout.length > 0)
				result[exports.gitAzureConfigNames[i]] = stdout.replace('\n','')
			if (++i === exports.gitAzureConfigNames.length) 
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
		vmSize: 'ExtraSmall',
		instances: 1,
		remote: 'origin',
		branch: 'master'
	}

	// override with configuration stored in Git

	exports.getAzureConfigFromGit(function (err, gitConfig) {
		exports.merge(gitConfig, config)
		callback(null, config)
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