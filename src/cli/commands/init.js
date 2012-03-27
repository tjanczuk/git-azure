var fs = require('fs')
	, path = require('path')
	, xml2js = require('xml2js')
	, assert = require('assert')
	, common = require('./common.js')
	, pfx2pem = require('./pkcs.js').pfx2pem;

exports.action = function (cmd) {

	var gitAzureDir = '.git-azure'

	var config

	function ensureGitAzureSubmodule() {
		var gitAzure = path.resolve(config.git.projectRoot, gitAzureDir)
		if (fs.existsSync(gitAzure)) {
			console.log(('OK: detected existing ' + gitAzure + ' directory, skipping scaffolding.').green)
		}
		else {
			console.log(('OK: created scaffolding of the git-azure runtime at ' + gitAzure).green)
		}
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

		if (!config.managementCertificate && !config.publishSettings) 
			missing.push('- publishSettings or managementCertificate');

		if (config.managementCertificate && !config.subscriptionId)
			missing.push('- subscriptionId must be specified when managementCertificate is specified');

		['storageAccountName', 'storageAccountKey', 'serviceName', 'serviceLocation', 
		 'vmSize', 'instances', 'blobContainerName'].forEach(function (item) {
			if (!config[item])
				missing.push('- ' + item)
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
