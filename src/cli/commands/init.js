var fs = require('fs')
	, path = require('path')
	, xml2js = require('xml2js')
	, assert = require('assert')
	, common = require('./common.js')
	, pfx2pem = require('./pkcs.js').pfx2pem
	, async = require('async')
	, azure = require('azure')
	, https = require('https');

exports.action = function (cmd) {

	var gitAzureDir = '.git-azure';
	var gitAzureRepo = 'git@github.com:tjanczuk/git-azure.git';
	var managementHost = 'management.core.windows.net';
	var config;

	function ensureCspkgUploaded() {

	}

	function deleteHostedService() {
		var deleteDeploymentSlot = function (slot, callback) {
			common.httpsRequest(
				config.subscriptionId,
				config.managementCertificate,
				managementHost,
				'/' + config.subscriptionId + '/services/hostedservices/' + config.serviceName + '/deploymentslots/' + slot,
				'DELETE',
				null,
				{ 'x-ms-version': '2009-10-01' },
				true,
				function (err, res, body) {
					if (err) {
						console.error('Unable to delete deployment slot ' + slot + ' of service ' + config.serviceName 
							+ ' under subscription ' + config.subscriptionId + '.');
						console.error(err);
						process.exit(1);
					}

					console.log(('OK: deleted deployment slot ' + slot + ' of service ' + config.serviceName 
						+ ' under subscription ' + config.subscriptionId + '.').green);

					callback(err, res, body);
				}
			);
		};

		var deleteService = function (callback) {
			common.httpsRequest(
				config.subscriptionId,
				config.managementCertificate,
				managementHost,
				'/' + config.subscriptionId + '/services/hostedservices/' + config.serviceName,
				'DELETE',
				null,
				{ 'x-ms-version': '2010-10-28' },
				function (err, res, body) {
					if (err) {
						console.error('Unable to delete service ' + config.serviceName + ' under subscription ' + config.subscriptionId + '.');
						console.error(err);
						process.exit(1);
					}
					else if (res.statusCode !== 200) {
						console.error('Unable to delete service ' + config.serviceName + ' under subscription ' + config.subscriptionId + '.');
						console.error('Status code: ' + res.statusCode + ', response body:');
						console.error(body);
						process.exit(1);
					}

					console.log(('OK: deleted service ' + config.serviceName + ' under subscription ' + config.subscriptionId + '.').green);

					callback(err, res, body);
				}
			);
		};

		deleteDeploymentSlot('staging', function () {
			deleteDeploymentSlot('production', function () {
				deleteService(function () {
					ensureCspkgUploaded();
				});
			});
		});
	}

	function checkHostedServiceNameAvailable() {
		common.httpsRequest(
			config.subscriptionId,
			config.managementCertificate,
			managementHost,
			'/' + config.subscriptionId + '/services/hostedservices/' + config.serviceName,
			'GET',
			null,
			{ 'x-ms-version': '2011-10-01' },
			function (err, res, body) {
				if (err) {
					console.error('Unable to check availability of the service name ' + config.serviceName + ':');
					console.error(err);
					process.exit(1);
				}

				if (res.statusCode === 200) {
					if (config.force) {
						console.log(('OK: found existing hosted service with name ' + config.serviceName 
							+ ' under subscription ' + config.subscriptionId + '. It will be deleted and re-created.').green);
						deleteHostedService();
					}
					else {
						console.error('Found existing hosted service with name ' + config.serviceName 
							+ ' under subscription ' + config.subscriptionId + '. To replace the service use --force.');
						process.exit(1);
					}
				}
				else if (res.statusCode === 404 && -1 < body.indexOf('The hosted service does not exist')) {
					console.log(('OK: service name ' + config.serviceName + ' is available under the subscription ' 
						+ config.subscriptionId).green);
					ensureCspkgUploaded();
				}
				else {
					console.error('Unexpected error when checking availability of the hosted service name ' 
						+ config.serviceName + ' with Windows Azure.');
					console.error('Status code: ' + res.statusCode + ', response body:');
					console.error(body);
					process.exit(1);
				}
			}
		);
	}

	function gitOrDie(args, successMessage, dieMessage, callback) {
		common.git(args, config.projectRoot, function (err, result) {
			if (err) {
				console.error(dieMessage);
				console.error(err.msg);
				process.exit(1);
			}

			if (successMessage)
				console.log(successMessage.green);

			if (callback)
				callback(err, result);
		})
	}

	function ensureGitAzureSubmodule() {
		var gitAzure = path.resolve(config.git.projectRoot, gitAzureDir)
		if (fs.existsSync(gitAzure)) {
			console.log(('OK: detected existing ' + gitAzure + ' directory, skipping scaffolding.').green);
			checkHostedServiceNameAvailable();
		}
		else 
			async.series([
				
				//git submodule add git@github.com:tjanczuk/git-azure.git .git-azure

				async.apply(gitOrDie,
					['submodule', 'add', gitAzureRepo, gitAzureDir],
					'OK: created scaffolding of git-azure runtime as a submodule at ' + gitAzure,
					'Unable to create scaffolding of the git-azure runtime as a Git submodule at ' + gitAzure + ':'),

				// git add .

				async.apply(gitOrDie,
					['add', '.'],
					'OK: added scaffolding changes to Git index.',
					'Unable to add git-azure scaffolding changes to Git index:'),

				// git commit -m "git-azure service runtime"

				async.apply(gitOrDie,
					['commit', '-m', 'git-azure service runtime'],
					'OK: commited scaffolding changes.',
					'Unable to commit git-azure scaffolding changes:'),

				// git push -u origin master

				async.apply(gitOrDie,
					['push', '-u', config.remote, config.branch],
					'OK: pushed scaffolding changes to ' + config.remote + '/' + config.branch + '.',
					'Unable to push git-azure scaffolding changes to ' + config.remote + '/' + config.branch +'.\n'
					+ 'WARNING: changes have already been commited locally; please push them manually to your remote, '
					+ 'then re-run this command.\nError details:')
			],
			function () {
				console.log(('OK: created and pushed scaffolding of the git-azure runtime at ' + gitAzure).green);

				checkHostedServiceNameAvailable();
			});
	}

	function processPublishSettings() {
	    var parser = new xml2js.Parser();

	    parser.on('end', processSettings);
	    try {
	        parser.parseString(fs.readFileSync(config.publishSettings));
	    } catch (err) {
	        console.error('Unable to parse *.publishSettings file from ' + config.publishSettings)
	        console.error(err)
	        process.exit(1)
	    }

	    function processSettings(settings) {
	        var attribs = settings.PublishProfile['@']

	        // validate or establish subscriptionId to use

	        var subs = settings.PublishProfile.Subscription
	        if (subs === 'undefined') 
	            subs = []
	        else if (typeof (subs[0]) === 'undefined') 
	            subs = [subs];

	        if (config.subscriptionId) {
	        	var found = false
	        	for (var index in subs)
	        		if (config.subscriptionId === subs[index]['@'].Id) {
	        			found = true
	        			break
	        		}

	        	if (!found) {
	        		console.error('The *.publishSettings file ' + config.publishSettings 
	        			+ ' does not contain a management certificate for requested subscriptionId ' 
	        			+ config.subscriptionId)
	        		process.exit(1)
	        	}
	        }
	        else {
	        	// pick first subscription Id by default
	        	if (subs.length > 0) {
	        		config.subscriptionId = subs[0]['@'].Id
	        		console.log('Choosing subscription name ' + subs[0]['@'].Name + ' with subscriptionId '
	        			+ config.subscriptionId)
	        	}
	        	else {
	        		console.error('The *.publishSettings file ' + config.publishSettings 
	        			+ ' does not specify any subscriptions.') 
	        		process.exit(1)
	        	}
	        }

	        var pem
	        try {
		        var pfx = new Buffer(attribs.ManagementCertificate, 'base64');
		        pem = pfx2pem(pfx);
	        }
	        catch (err) {
	        	console.error('Error converting the PKCS#12 management certificate in ' + config.publishSettings + 
	        		' to PKCS#7 format.')
	        	console.error(err)
	        	process.exit(1)
	        }

	        config.managementCertificate = pem

	        console.log('OK: *.publishSettings file processed.'.green)
	    }

		ensureGitAzureSubmodule()
	}

	function ensureManagementCertificate() {
		if (config.managementCertificate)
			ensureGitAzureSubmodule()
		else 
			processPublishSettings()
	}

	function checkParametersValid() {
		// TODO

		console.log('OK: parameters validated.'.green)
		ensureManagementCertificate()
	}

	function checkParametersSpecified() {
		// check git context

		if (!config.git.projectRoot) {
			console.error('Unable to determine Git repository.')
			process.exit(1)
		}

		// check config

		var missing = [];

		if (config.rdpusername && !config.rdppassword)
			missing.push('--rdppassword must be specified when --rdpusername is specified');
		else if (!config.rdpusername && config.rdppassword)
			missing.push('--rdpusername must be specified when --rdppassword is specified');

		['publishSettings', 'storageAccountName', 'storageAccountKey', 'serviceName', 'serviceLocation', 
		 'instances', 'blobContainerName', 'remote', 'branch'].forEach(function (item) {
			if (!config[item])
				missing.push('--' + item)
		});

		if (missing.length > 0) {
			console.error('The following required parameters must be specified:\n')
			missing.forEach(console.error)
			console.error('\nYou can specify parameters either as command line options, e.g.\n')
			console.error('    git azure init --subscriptionId 342d6bc9-21b7-427d-a31c-04956f221bd2\n')
			console.error("or by using the 'azure' section of Git config, e.g.\n")
			console.error('    git config azure.subscriptionId 342d6bc9-21b7-427d-a31c-04956f221bd2')
			if (!config.managementCertificate && !config.publishSettings) 
				console.error('\nYou can download the *.publishSettings file for your Windows Azure subscription from '
							  + 'https://windows.azure.com/download/publishprofile.aspx')
			process.exit(1)
		}

		checkParametersValid()
	}

	common.getCurrentConfig(function (err, gitConfig) {
		if (err) {
			console.error(err.toString())
			process.exit(1)
		}

		config = gitConfig

		// override Git configuration with parameters passed to the command

		common.merge(cmd, config, common.gitAzureConfigNames)

		common.getGitContext(function (err, context) {
			if (err) {
				console.error(err.toString())
				process.exit(1)
			}

			config.git = context
			checkParametersSpecified()
		})
	})
}
