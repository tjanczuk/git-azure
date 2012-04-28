var fs = require('fs')
	, path = require('path')
	, xml2js = require('xml2js')
	, assert = require('assert')
	, common = require('./common.js')
	, pfx2pem = require('./pkcs.js').pfx2pem
	, async = require('async')
	, azure = require('azure')
	, https = require('https')
	, util = require('util');

exports.action = function (cmd) {

	var gitAzureDir = '.git-azure';
	var gitAzureRepo = 'git@github.com:tjanczuk/git-azure.git';
	var managementHost = 'management.core.windows.net';
	var bootstrapBlobName = 'bootstrap.cspkg';
	var config;

	function createDeployment() {
		var template = 
'<?xml version="1.0" encoding="utf-8"?>\
<CreateDeployment xmlns="http://schemas.microsoft.com/windowsazure">\
  <Name>%s</Name>\
  <PackageUrl>%s</PackageUrl>\
  <Label>%s</Label>\
  <Configuration>%s</Configuration>\
  <StartDeployment>true</StartDeployment>\
  <TreatWarningsAsError>false</TreatWarningsAsError>\
</CreateDeployment>';

		var content = util.format(template,
			config.serviceName,
			'http://' + config.storageAccountName + '.blob.core.windows.net/' + config.blobContainerName + '/' + bootstrapBlobName,
			new Buffer(config.serviceName).toString('base64'),
			new Buffer(config.cscfg).toString('base64')
		);

		common.httpsRequest(
			config.subscriptionId,
			config.managementCertificate,
			managementHost,
			'/' + config.subscriptionId + '/services/hostedservices/' + config.serviceName + '/deploymentslots/production',
			'POST',
			content,
			{ 'x-ms-version': '2011-08-01', 'Content-Type': 'application/xml' },
			true,
			function (err, res, body) {
				if (err || res.statusCode !== 200) {
					console.error('Unable to create deployment of service with name ' + config.serviceName 
						+ ' under subscription ' + config.subscriptionId + ':');
					if (err) {
						console.error(err.toString());
					}
					else {
						console.error('Status code: ' + res.statusCode + ', response body:');
						console.error(body);
					}
					process.exit(1);
				}

				console.log(('OK: created and started production deployment of service ' + config.serviceName
					+ ' under the subscription ' + config.subscriptionId + '.').green);
			}
		);
	}

	function uploadPasswordEncryptionCertificate() {

		var template = 
'<?xml version="1.0" encoding="utf-8"?>\
<CertificateFile xmlns="http://schemas.microsoft.com/windowsazure">\
  <Data>%s</Data>\
  <CertificateFormat>pfx</CertificateFormat>\
  <Password></Password>\
</CertificateFile>';

		var content = util.format(template,
			config.rdp.pfx
		);

		common.httpsRequest(
			config.subscriptionId,
			config.managementCertificate,
			managementHost,
			'/' + config.subscriptionId + '/services/hostedservices/' + config.serviceName + '/certificates',
			'POST',
			content,
			{ 'x-ms-version': '2009-10-01', 'Content-Type': 'application/xml' },
			function (err, res, body) {
				if (err || res.statusCode !== 200) {
					console.error('Unable to upload X.509 certificate to enable remote access to the ' + config.serviceName 
						+ ' service under subscription ' + config.subscriptionId + ':');
					if (err) {
						console.error(err.toString());
					}
					else {
						console.error('Status code: ' + res.statusCode + ', response body:');
						console.error(body);
					}
					process.exit(1);
				}

				console.log(('OK: uploaded X.509 certificate to enable remote access to the ' + config.serviceName 
					+ ' service under subscription ' + config.subscriptionId + '.').green);

				createDeployment();
			}
		);		
	}

	function createHostedService() {
		var template = 
'<?xml version="1.0" encoding="utf-8"?>\
<CreateHostedService xmlns="http://schemas.microsoft.com/windowsazure">\
  <ServiceName>%s</ServiceName>\
  <Label>%s</Label>\
  <Location>%s</Location>\
</CreateHostedService>';

		var content = util.format(template,
			config.serviceName,
			new Buffer(config.serviceName).toString('base64'),
			config.serviceLocation
		);

		common.httpsRequest(
			config.subscriptionId,
			config.managementCertificate,
			managementHost,
			'/' + config.subscriptionId + '/services/hostedservices',
			'POST',
			content,
			{ 'x-ms-version': '2010-10-28', 'Content-Type': 'application/xml' },
			function (err, res, body) {
				if (err || res.statusCode !== 201) {
					console.error('Unable to create service with name ' + config.serviceName 
						+ ' under subscription ' + config.subscriptionId + ':');
					if (err) {
						console.error(err.toString());
					}
					else {
						console.error('Status code: ' + res.statusCode + ', response body:');
						console.error(body);
					}
					process.exit(1);
				}

				console.log(('OK: created service ' + config.serviceName 
					+ ' under subscription ' + config.subscriptionId + '.').green);

				uploadPasswordEncryptionCertificate();
			}
		);
	}

	function generateServiceConfiguration() {
		var template = 
'<?xml version="1.0"?>\
<ServiceConfiguration xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" serviceName="%s" xmlns="http://schemas.microsoft.com/ServiceHosting/2008/10/ServiceConfiguration">\
  <Role name="bootstrap">\
    <ConfigurationSettings>\
      <Setting name="Microsoft.WindowsAzure.Plugins.RemoteAccess.AccountEncryptedPassword" value="%s" />\
      <Setting name="Microsoft.WindowsAzure.Plugins.RemoteAccess.AccountExpiration" value="2100-01-01T03:14:15Z" />\
      <Setting name="Microsoft.WindowsAzure.Plugins.RemoteAccess.AccountUsername" value="%s" />\
      <Setting name="Microsoft.WindowsAzure.Plugins.RemoteAccess.Enabled" value="true" />\
      <Setting name="Microsoft.WindowsAzure.Plugins.RemoteForwarder.Enabled" value="true" />\
      <Setting name="REMOTE_BRANCH" value="%s" />\
      <Setting name="REMOTE_URL" value="%s" />\
      <Setting name="AZURE_STORAGE_ACCOUNT" value="%s" />\
      <Setting name="AZURE_STORAGE_ACCESS_KEY" value="%s" />\
      <Setting name="AZURE_STORAGE_CONTAINER" value="%s" />\
    </ConfigurationSettings>\
    <Instances count="%s" />\
    <Certificates>\
    	<Certificate name="Microsoft.WindowsAzure.Plugins.RemoteAccess.PasswordEncryption" thumbprint="%s" thumbprintAlgorithm="sha1" />\
    </Certificates>\
  </Role>\
</ServiceConfiguration>';

		config.cscfg = util.format(template,
			config.serviceName,
			config.rdp.encryptedPassword,
			config.username,
			config.branch,
			config.remote_url,
			config.storageAccountName,
			config.storageAccountKey,
			config.blobContainerName,
			config.instances,
			config.rdp.sha1
		);

		console.log('OK: service configuration generated.'.green);

		createHostedService();
	}

	function ensureCspkgUploaded() {
		var blob = azure.createBlobService(config.storageAccountName, config.storageAccountKey);

		var cspkgPath = path.resolve(config.projectRoot, gitAzureDir, 'src/bootstrap/bootstrap.cspkg');

		if (!fs.existsSync(cspkgPath)) {
			console.error('Unable to find the bootstrap package file at ' + cspkgPath);
			process.exit(1);
		}

		blob.createContainerIfNotExists(config.blobContainerName, function (err) {
			if (err) {
				console.error('Unable to create blob container ' + config.blobContainerName + ' within storage account '
					+ config.storageAccountName + ':');
				console.error(err.toString());
				process.exit(1);
			}

			console.log(('OK: blob container ' + config.blobContainerName + ' exists or has been created.').green);

			blob.getBlobProperties(config.blobContainerName, bootstrapBlobName, function (err, result, response) {
				if (!err) {
					if (config.force) {
						console.log(('OK: blob name ' + bootstrapBlobName + ' already exists in container '
							+ config.blobContainerName + ' and will be replaced.').green);
					} 
					else {
						console.error('Blob name ' + bootstrapBlobName + ' already exists in the container '
							+ config.blobContainerName + '. To replace it, specify --force, or use \'git azure blob\' command to remove it.');
						process.exit(1);	
					}
				}

				blob.createBlockBlobFromFile(config.blobContainerName, bootstrapBlobName, cspkgPath, function (err) {
					if (err) {
						console.error('Unable to upload boostrap package ' + cspkgPath + ' to Windows Azure blob ' 
							+ bootstrapBlobName + ' in container ' + config.blobContainerName + ' under storage account '
							+ config.storageAccountName + ':');
						console.error(err.toString());
						process.exit(1);
					}

					console.log(('OK: bootstrap package ' + cspkgPath + ' uploaded to blob ' + bootstrapBlobName + ' in container '
						+ config.blobContainerName + ' under storage account ' + config.storageAccountName + '.').green);

					generateServiceConfiguration();
				});
			});
		});
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
					if (err || res.statusCode !== 200 && res.statusCode !== 404) {
						console.error('Unable to delete deployment slot ' + slot + ' of service ' + config.serviceName 
							+ ' under subscription ' + config.subscriptionId + ':');
						if (err) {
							console.error(err.toString());
						}
						else {
							console.error('Status code: ' + res.statusCode + ', response body:');
							console.error(body);
						}
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
					if (err || res.statusCode !== 200 && res.statusCode !== 404) {
						console.error('Unable to delete service ' + config.serviceName + ' under subscription ' + config.subscriptionId + '.');
						if (err) {
							console.error(err.toString());
						}
						else {
							console.error('Status code: ' + res.statusCode + ', response body:');
							console.error(body);
						}
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

	function generateRdpSettings() {

		var tmpDir = path.resolve(config.projectRoot, gitAzureDir, 'src/bootstrap');
		var passwordFile = path.resolve(tmpDir, 'password.clear.openssl');
		var encryptedPasswordFile = path.resolve(tmpDir, 'password.encrypted.openssl');
		var keyFile = path.resolve(tmpDir, 'key.pem.openssl');
		var sha1File = path.resolve(tmpDir, 'key.sha1.openssl');
		var pfxFile = path.resolve(tmpDir, 'key.pfx.openssl');

		var cleanupFiles = function () {
			[passwordFile, encryptedPasswordFile, keyFile, sha1File, pfxFile].forEach(function (item) {
				try {
					fs.unlinkSync(item);
				}
				catch (e) {
					// empty
				}
			});
		}

		try {
			fs.writeFileSync(keyFile, config.managementCertificate);
			fs.writeFileSync(passwordFile, config.password);
		}
		catch (e) {
			console.error('Unable to encrypt the password for remote access to the Windows Azure service:');
			console.error(e.message || e);
			cleanupFiles();
			process.exit(1);
		}

		var command = 
			'openssl rsautl -in ' + passwordFile + ' -out ' + encryptedPasswordFile + ' -inkey ' + keyFile + ' -encrypt\n' +
			'openssl x509 -in ' + keyFile + ' -fingerprint -noout > ' + sha1File + '\n' +
			'openssl pkcs12 -in ' + keyFile + ' -export -passout pass: -out ' + pfxFile;

		require('child_process').exec(command, function (err, stdout, stderr) {
			if (err || stderr) {
				console.error('Unable to encrypt the password for remote access to the Windows Azure service:');
				if (err) {
					console.error(err.toString());
				}
				else {
					console.error(stderr);
				}
				cleanupFiles();
				process.exit(1);
			}

			try {
				config.rdp = {};
				config.rdp.encryptedPassword = fs.readFileSync(encryptedPasswordFile, 'base64');
				config.rdp.pfx = fs.readFileSync(pfxFile, 'base64');
				config.rdp.sha1 = fs.readFileSync(sha1File, 'utf8').replace(/SHA1 Fingerprint=/, '').replace(/\:/g, '').replace(/\n/, '');
			}
			catch (e) {
				console.error('Unable to encrypt the password for remote access to the Windows Azure service:');
				console.error(e.message || e);
				cleanupFiles();
				process.exit(1);				
			}

			cleanupFiles();
			console.log(('OK: encrypted password for remote access to the Windows Azure service.').green);

			checkHostedServiceNameAvailable();
		});
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
			generateRdpSettings();
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

				generateRdpSettings();
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

		console.log('Running with the following parameters:');
		console.log(config);

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

		['publishSettings', 'storageAccountName', 'storageAccountKey', 'serviceName', 'serviceLocation', 
		 'instances', 'blobContainerName', 'remote', 'branch', 'username', 'password'].forEach(function (item) {
			if (!config[item])
				missing.push('--' + item);
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
