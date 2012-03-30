var fs = require('fs')
	, path = require('path')
	, common = require('./common.js')
	, async = require('async');

exports.action = function (cmd) {

	var appsFile = 'package.json'

	var config;

	function checkParametersValid() {
		// TODO

		console.log('OK: parameters validated.'.green)
	}

	function checkParametersSpecified() {
		// check git context

		if (!config.git.projectRoot) {
			console.error('Unable to determine Git repository.')
			process.exit(1)
		}

		// check config

		var missing = [];

		if (config.ssl !== 'disallowed' && (!config.key || !config.cert))
			missing.push('- both cert and key must be specified when SSL is enabled');

		if (missing.length > 0) {
			console.error('The following required parameters must be specified:\n');
			missing.forEach(console.error);
			console.error("\nYou can use 'git azure blob' command to upload certificates and keys to Windows Azure Blob storage.");
			process.exit(1)
		}

		checkParametersValid()
	}

	config = {
		ssl: 'disallowed'
	}

	common.merge(cmd, config, ['git', 'ssl', 'cert', 'key', 'entry', 'delete']);

	common.getGitContext(function (err, context) {
		if (err) {
			console.error(err.toString())
			process.exit(1)
		}

		config.git = context
		checkParametersSpecified()
	})
}
