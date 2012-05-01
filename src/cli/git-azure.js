#!/usr/bin/env node

var program = require('commander')
    , fs = require('fs')
    , path = require('path')
    , util = require('util')
    , colors = require('colors');

var oldError = console.error
console.error = function (thing) {
    if (typeof thing === 'string')
        thing = thing.red
    return oldError.call(this, thing)
}

program.version(require(path.resolve(__dirname, '../../package.json')).version)

program.command('init')
    .description('One-time initialization of a Windows Azure Service associated with this Git repo.'.cyan)
    .option('-s, --subscriptionId <id>', 'Windows Azure subscription ID to create the service under (defaults to first listed in *.publishSettings)')
    .option('-g, --publishSettings <file>', 'location of the *.publishSettings file for managing the specified subscription')
    .option('-a, --storageAccountName <name>', 'name of the Windows Azure Blob Storage account to use')
    .option('-k, --storageAccountKey <key>', 'access key for the specified Windows Azure Blob Storage account')
    .option('-n, --serviceName <name>', 'name of the Windows Azure service to create')
    .option('-f, --force', 'override hosted services and blobs if they already exist')
    .option('-l, --serviceLocation <location>', 'location of the Windows Azure datacenter to host the service in (defaults to Anywhere US)')
    .option('-i, --instances <number>', 'number of instances of Windows Azure Worker Role to create')
    .option('-b, --blobContainerName <name>', 'name of the Windows Azure Blob Storage contaniner to create or use')
    .option('-u, --username <username>', 'username for administration and RDP connection to the Windows Azure service')
    .option('-p, --password <password>', 'password for administration and RDP connection to the Windows Azure service')
    .option('-r, --remote <name>', 'remote name to push git-azure runtime scaffolding to (defaults to origin)')
    .option('-t, --branch <name>', 'branch name to push git-azure runtime scaffolding to (defaults to master)')
    .option('-t, --postReceive <url_path>', 'obfuscated URL path for the post receive hook endpoint')
    .option('-n, --no_persist', 'do not store any settings in the azure section of the Git configuration for convenience of later use')
    .option('-x, --scaffold_only', 'scaffold changes locally without pushing them or deploying to Windows Azure')
    .option('-q, --quiet', 'succeed or fail without showing prompts')
    .action(require('./commands/init.js').action)

program.command('app <name>')
    .description('Manage node.js applications associated with this Git repo.'.cyan)
    .option('-g, --git <url>', 'the optional URL of the external git repo where the application resides to register as a submodule under apps/<name>')
    .option('-t, --host <hostname>', 'the hostname the app is addressable with')
    .option('-e, --entry <file>', 'the relative path to the main application file; default apps/<name>/server.js')
    .option('-s, --ssl <mode>', 'one of [required|allowed|disallowed]; default disallowed')
    .option('-c, --cert <blob_name>', 'the Windows Azure Blob name with PKCS#7 encoded (PEM) X.509 certificate for SSL')
    .option('-k, --key <blob_name>', 'the Windows Azure Blob name with PKCS#7 encoded (PEM) private key for SSL')
    .option('-d, --delete', 'if --host specified, delete the host entry only; otherwise delete the entire application')
    .action(require('./commands/app.js').action)

program.command('blob')
    .description('Manipulate data in Azure Blob Storage.'.cyan)
    .option('-a, --add <name> [data]', 'add data to blob storage')
    .option('-g, --get <name>', 'get data from blob storage')
    .option('-d, --delete <name>', 'delete data from blob storage')
    .option('-l, --list', 'list blobs in blob storage')
    .option('-f, --file', 'optionally use with -g or -a options to indicate file to save or read data from')
    .option('-n, --storageAccountName <name>', 'name of the Windows Azure Blob Storage account to use')
    .option('-k, --storageAccountKey <key>', 'access key for the specified Windows Azure Blob Storage account')
    .option('-b, --blobContainerName <name>', 'name of the Windows Azure Blob Storage contaniner to create or use')
    .action(function (cmd) {
        console.log('blob: ', cmd);
    })

program.command('restart')
    .description('Restart the Windows Azure service associated with this Git repo.'.cyan)
    .option('-s, --subscriptionId <id>', 'Windows Azure subscription ID to create the service under')
    .option('-p, --publishSettings <file>', 'location of the *.publishSettings file for managing the specified subscription')
    .option('-n, --serviceName <name>', 'name of the Windows Azure service to create')
    .option('-r, --reboot', 'hard reboot the Windows Azure service rather then just recycle node.js applications')
    .option('-q, --quiet', 'succeed or fail without showing prompts')
    .action(function (cmd) {
        console.log('restart: ', cmd);
    })

program.command('destroy')
    .description('Destroy the Windows Azure service associated with this Git repo.'.cyan)
    .option('-s, --subscriptionId <id>', 'Windows Azure subscription ID to create the service under (defaults to first listed in *.publishSettings)')
    .option('-p, --publishSettings <file>', 'location of the *.publishSettings file for managing the specified subscription')
    .option('-a, --storageAccountName <name>', 'name of the Windows Azure Blob Storage account to use')
    .option('-k, --storageAccountKey <key>', 'access key for the specified Windows Azure Blob Storage account')
    .option('-n, --serviceName <name>', 'name of the Windows Azure service to create')
    .option('-b, --blobContainerName <name>', 'name of the Windows Azure Blob Storage contaniner to delete  ')
    .option('-q, --quiet', 'succeed or fail without showing prompts')
    .action(function (cmd) {
        console.log('destroying: ', cmd);
    })

if (process.argv.length == 2)
    program.parse(['', '', '-h'])
else
    program.parse(process.argv)
