var fs = require('fs')
	, path = require('path')
	, xml2js = require('xml2js')
	, assert = require('assert')
	, common = require('./common.js')
	, pfx2pem = require('./pkcs.js').pfx2pem
	, async = require('async')
	, azure = require('azure')
	, https = require('https')
	, util = require('util')
	, uuid = require('node-uuid');

exports.action = function (cmd) {

	var instanceStatus = {
		StoppedVM: 'Waiting for a machine to be assigned... [StoppedVM]',
		CreatingVM: 'Provisioning virtual machine... [CreatingVM]',
		StartingVM: 'Starting virtual machine... [StartingVM]',
		BusyRole: 'Running setup scripts... [BusyRole]',
		ReadyRole: 'Running [ReadyRole]'
	};

	var gitAzureDir = '.git-azure';
	var gitAzureRepo = 'git@github.com:tjanczuk/git-azure.git';
	var managementHost = 'management.core.windows.net';
	var bootstrapBlobName = 'bootstrap.cspkg';
	var config;
	var waitInterval, adsInterval;
	var startTime, endTime;

	function waitForDeployment() {

		var captureEndTime = function() {
			endTime = new Date();
			console.log(('Finished at ' + new Date()).grey);
			var duration = endTime - startTime;
			console.log(('Duration ' + Math.floor(duration / 60000) + ' min ' + Math.floor((duration % 60000) / 1000) + ' sec.').grey);
		}

		common.httpsRequest(
			config.subscriptionId,
			config.managementCertificate,
			managementHost,
			'/' + config.subscriptionId + '/services/hostedservices/' + config.serviceName + '/deploymentslots/production',
			'GET',
			null,
			{ 'x-ms-version': '2011-10-01' },
			function (err, res, body) {
				var onError = function (err, res, body) {
					console.error('Unable to obtain status of the production deployment of service with name ' + config.serviceName 
						+ ' under subscription ' + config.subscriptionId + ':');
					if (err) {
						console.error(err.toString());
					}
					else {
						console.error('Status code: ' + res.statusCode + ', response body:');
						console.error(body);
					}

					console.error('You can view the status of the service on the Windows Azure management portal at https://windows.azure.com');

					clearInterval(adsInterval);
					clearInterval(waitInterval);

					captureEndTime();

					process.exit(1);
				};

				if (err || res.statusCode !== 200) {
					onError(err, res, body);
				}

				var processResponse = function(response) {
					var status = response.Status;
					var instances = (typeof response.RoleInstanceList.RoleInstance.RoleName === 'string' ? 
						[ response.RoleInstanceList.RoleInstance ]: response.RoleInstanceList.RoleInstance);

					var failed = status !== 'Running';
					var success = !failed;

					console.log(('Deployment status: ' + status + '. Status of machines in the farm:').grey);
					instances.forEach(function (item) {
						console.log(('  ' + item.InstanceName + ': ' 
							+ (instanceStatus[item.InstanceStatus] || item.InstanceStatus)).grey);

						if (typeof item.InstanceStateDetails === 'string') {
							console.log(('    ' + item.InstanceStateDetails).grey);
							if (-1 < item.InstanceStateDetails.indexOf('startup task failed')) {
								failed = true;
							}
						}

						failed = failed || ['RoleStateUnknown', 'StoppedVM', 'CreatingVM', 'StartingVM', 'CreatingRole', 'StartingRole', 'BusyRole', 'ReadyRole'].every(function (state) { 
							return state !== item.InstanceStatus; 
						});

						success = success && item.InstanceStatus === 'ReadyRole';
					});
					
					if (failed) {
						console.error('An error occurred when deploying the service to Windows Azure. You can find out more '
							+ 'about the status of the deployment on the Windows Azure management portal at https://windows.azure.com');
						console.error('To completely remove all billable Windows Azure artifacts that were deployed, run \'git azure destroy\' ' 
							+ ' or use the management portal.');

						clearInterval(adsInterval);
						clearInterval(waitInterval);

						captureEndTime();

						process.exit(1);						
					}
					else if (success) {
						console.log();
						console.log(('OK: your Windows Azure service ' + config.serviceName + ' is ready').green);
						console.log();
						console.log('The service can be accessed at the following endpoints:');
						console.log('  http://' + config.serviceName + '.cloudapp.net         - HTTP application endpoint');
						console.log('  https://' + config.serviceName + '.cloudapp.net        - HTTPS application endpoint (if SSL is configured)');
						console.log('  ws://' + config.serviceName + '.cloudapp.net           - WebSocket application traffic');
						console.log('  wss://' + config.serviceName + '.cloudapp.net          - secure WebSocket application traffic (if SSL is configured)');
						console.log('You can configure additional A entires in your DNS directed at IP address ' + response.InputEndpointList.InputEndpoint[0].Vip 
									+ ' (useful for /etc/hosts).');
						console.log('You can configure additional CNAME entires in your DNS directed at ' + config.serviceName + '.cloudapp.net ' 
									+ ' (recommended for production).');
						console.log();
						console.log('Management endpoints:');
						console.log('  https://' + config.serviceName + '.cloudapp.net:31415  - management endpoint (if SSL is configured)');
						console.log('  http://' + config.serviceName + '.cloudapp.net:31415   - management endpoint (if SSL is not configured)');
						console.log('  https://windows.azure.com - Windows Azure management portal (billing, accounts etc.)');
						console.log();
						console.log('Configure a post-receive hook in your repository to enable automatic updates on \'git push\'. '
									+ 'Your post-receive hook URL is:');
						console.log('  http://' + config.serviceName + '.cloudapp.net:31417' + config.postReceive);
						console.log();
						console.log('Visit https://github.com/tjanczuk/git-azure for walkthroughs on setting up SSL, support for multiple apps, and more.');

						clearInterval(adsInterval);
						clearInterval(waitInterval);

						captureEndTime();

						process.exit(0);						
					}
					else {
						setTimeout(waitForDeployment, 10000);
					}
				};

				var parser = new xml2js.Parser();
			    parser.on('end', processResponse);
			    try {
			        parser.parseString(body);
			    } catch (e) {
			        onError(e, res, body);
			    }
			}
		);
	}

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

				console.log(('OK: created and initiated the start of production deployment of service ' 
					+ config.serviceName + '.').green);

				waitInterval = common.startWait();
				adsInterval = common.startAds();
				waitForDeployment();
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
      <Setting name="POSTRECEIVE_URL_PATH" value="%s" />\
      <Setting name="MANAGEMENT_USERNAME" value="%s" />\
      <Setting name="MANAGEMENT_PASSWORD" value="%s" />\
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
			config.postReceive,
			config.username,
			config.password,
			config.instances,
			config.rdp.sha1
		);

		console.log('OK: service configuration generated.'.green);

		createHostedService();
	}

	function ensureCspkgUploaded() {
		var blob = azure.createBlobService(config.storageAccountName, config.storageAccountKey);

		var cspkgPath = path.resolve(config.git.projectRoot, gitAzureDir, 'src/bootstrap/bootstrap.cspkg');

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

		var suspendDeploymentSlot = function (slot, callback) {

			var content = '<?xml version="1.0" encoding="utf-8"?>\
<UpdateDeploymentStatus xmlns="http://schemas.microsoft.com/windowsazure">\
  <Status>Suspended</Status>\
</UpdateDeploymentStatus>';

			common.httpsRequest(
				config.subscriptionId,
				config.managementCertificate,
				managementHost,
				'/' + config.subscriptionId + '/services/hostedservices/' + config.serviceName + '/deploymentslots/' 
					+ slot + '/?comp=status',
				'POST',
				content,
				{ 'x-ms-version': '2009-10-01', 'Content-Type': 'application/xml' },
				true,
				function (err, res, body) {
					if (err || res.statusCode !== 200 && res.statusCode !== 404) {
						console.error('Unable to suspend deployment slot ' + slot + ' of service ' + config.serviceName 
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

					console.log(('OK: suspended deployment slot ' + slot + ' of service ' + config.serviceName 
						+ ' under subscription ' + config.subscriptionId + '.').green);

					callback(err, res, body);
				}
			);
		};

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

			console.log(('INFO: if you like coffee, now is the time to get yourself a cup. '
				+ 'The process of provisioning your own VM in Windows Azure typically takes several minutes...').blue);

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

		suspendDeploymentSlot('staging', function () {
			suspendDeploymentSlot('production', function () {
				deleteDeploymentSlot('staging', function () {
					deleteDeploymentSlot('production', function () {
						deleteService(function () {
							ensureCspkgUploaded();
						});
					});
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
		var tmpDir = path.resolve(config.git.projectRoot, gitAzureDir, 'src/bootstrap');
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
			'openssl smime -in ' + passwordFile + ' -out ' + encryptedPasswordFile + ' -outform DER -encrypt ' + keyFile + '\n' +
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
		common.git(args, config.git.projectRoot, function (err, result) {
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
		
		var remote = config.remote_url.toLowerCase();

		if (0 !== remote.indexOf('git@') && 0 !== remote.indexOf('https://') 
			&& 0 !== remote.indexOf('git://') && 0 !== remote.indexOf('http://')) {
			console.error('The Git remote location ' + config.remote_url + ' does not appear to be an endpoint that can be accessed '
				+ 'from the internet. '
				+ 'Please deploy your repository to a remote that can be accessed from within Windows Azure and configure '
				+ '--remote and --branch accordingly.');
			process.exit(1);
		}

		var paramOutline = {
			'Windows Azure service settings' : [ 'serviceName', 'subscriptionId', 'publishSettings', 'serviceLocation', 'instances' ],
			'Windows Azure storage settings' : [ 'storageAccountName', 'storageAccountKey', 'blobContainerName' ],
			'Windows Azure RDP and Management settings' : [ 'username', 'password' ],
			'Git settings' : [ 'remote_url', 'branch' ]
		};

		console.log('Running with the following configuration:');
		for (var i in paramOutline) {
			console.log('  ' + i);
			paramOutline[i].forEach(function (item) {
				if (item === 'password' || item === 'storageAccountKey') {
					console.log('    ' + item + ': <hidden>');
				}
				else {
					console.log('    ' + item + ': ' + config[item]);
				}
			})
		}

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
		 'instances', 'remote', 'branch', 'username', 'password'].forEach(function (item) {
			if (!config[item])
				missing.push('--' + item);
		});

		if (!config.blobContainerName) {
			config.blobContainerName = config.serviceName;
		}

		if (!config.postReceive) {
			config.postReceive = '/' + uuid.v4();
		}
		else if (typeof config.postReceive === 'string' && config.postReceive.substring(0, 1) !== '/') {
			config.postReceive = '/' + config.postReceive;
		}

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

	startTime = new Date();
	console.log(('Starting at ' + startTime).grey);

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
