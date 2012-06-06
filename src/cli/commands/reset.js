var common = require('./common.js')
	, http = require('http')
	, https = require('https');

exports.action = function (cmd) {

	var config;

	function reset(engines) {
		if (engines.length === 0) {
			console.error('Unable to reset the git-azure service using either https://' + config.endpooint 
					+ ' or http://' + config.endpoint + '.');
			process.exit(1);
		}

		var engine = engines.shift();

		var options = {
			host: config.host,
			port: 31415,
			path: config.path,
			method: 'POST',
			auth: config.username + ':' + config.password
		}

		var req = engine.req(options, function (res) {
			if (res.statusCode !== 201) {
				reset(engines);
			}
			else {
				console.log('Reset initiated.'.green);
				process.exit(0);
			}
		});

		req.on('error', function (e) {
			reset(engines);
		});

		req.end();
	}

	function checkParametersSpecified() {

		var missing = [];

		['serviceName', 'username', 'password'].forEach(function (item) {
			if (!config[item])
				missing.push('--' + item);
		});

		if (config.soft && config.hard) {
			missing.push('--soft and --hard are mutually exclusive';)
		}

		if (missing.length > 0) {
			console.error('The following required parameters must be specified:\n');
			missing.forEach(console.error);
			process.exit(1);
		}

		config.path = '/reset/' + (config.hard ? 'hard' : 'soft');
		config.endpoint = config.serviceName + '.cloudapp.net:31415' + config.path;

		reset([https, http]);
	}

	common.getAzureConfigFromGit('azure.', ['serviceName', 'username', 'password'], function (err, gitConfig) {
		if (err) {
			console.error(err);
			process.exit(1);
		}

		config = gitConfig;
		common.merge(cmd, config, ['serviceName', 'username', 'password', 'soft', 'hard']);

		checkParametersSpecified();
	});
}
