var fs = require('fs')
	, path = require('path')
	, common = require('./common.js')
	, azure = require('azure');

exports.action = function (cmd) {

	var config;

	function onError(err) {
		if (err) {
			console.error(err);
			process.exit(1);
		}
	}

	function put() {
		var blob = azure.createBlobService(config.storageAccountName, config.storageAccountKey);
		if (config.content) {
			blob.createBlockBlobFromText(config.blobContainerName, config.put, config.content, onError);
		}
		else {
			var fileName = path.resolve(process.cwd(), config.file);
			blob.createBlockBlobFromFile(config.blobContainerName, config.put, fileName, onError);
		}
	}

	function get() {
		var blob = azure.createBlobService(config.storageAccountName, config.storageAccountKey);
		if (config.file) {
			var fileName = path.resolve(process.cwd(), config.file);
			blob.getBlobToFile(config.blobContainerName, config.get, fileName, onError);
		}
		else {
			blob.getBlobToText(config.blobContainerName, config.get, process.stdout, function (err, text) {
				onError(err);
				console.log(text);
			});
		}
	}

	function list() {
		var blob = azure.createBlobService(config.storageAccountName, config.storageAccountKey);
		blob.listBlobs(config.blobContainerName, function (err, blobs) {
			onError(err);

			if (config.verbose) {
				console.log(blobs);
			}
			else {
				blobs.forEach(function (item) {
					console.log(item.name);
				});
			}
		});
	}

	function del() {
		var blob = azure.createBlobService(config.storageAccountName, config.storageAccountKey);
		blob.deleteBlob(config.blobContainerName, config.delete, onError);
	}

	var ops = {
		put: put,
		get: get,
		list: list,
		'delete': del
	};

	function checkParametersSpecified() {

		var missing = [];

		['storageAccountName', 'storageAccountKey', 'blobContainerName'].forEach(function (item) {
			if (!config[item])
				missing.push('--' + item);
		});

		var opCount = 0;
		var op;
		['get', 'put', 'delete', 'list'].forEach(function (item) {
			if (config[item]) {
				opCount++;
				op = item;
			}
		});

		if (opCount === 0) {
			missing.push('--get, --put, --delete, or --list must be specified');
		}
		else if (opCount > 1) {
			missing.push('--get, --put, --delete, and --list are mutually exclusive');	
		}

		if (config.put && !config.file && !config.content) {
			missing.push('--put requires that either --content or --file are specified');
		}

		if (missing.length > 0) {
			console.error('The following required parameters must be specified:\n');
			missing.forEach(console.error);
			process.exit(1);
		}

		ops[op]();		
	}

	common.getAzureConfigFromGit('azure.', ['storageAccountName', 'storageAccountKey', 'blobContainerName'], function (err, gitConfig) {
		if (err) {
			console.error(err);
			process.exit(1);
		}

		config = gitConfig;
		common.merge(cmd, config, ['put', 'get', 'delete', 'list', 'file', 'content',
			'storageAccountName', 'storageAccountKey', 'blobContainerName', 'verbose']);

		checkParametersSpecified();
	});
}
