#!/usr/bin/env node

var program = require('commander')
    , fs = require('fs')
    , path = require('path')
    , util = require('util')
    , colors = require('colors');

var oldError = console.error;
console.error = function (thing) {
    if (typeof thing === 'string')
        thing = thing.red;
    return oldError.call(this, thing);
}

program.version(require(path.resolve(__dirname, '../../package.json')).version);

program.command('init')
    .description('One-time initialization of a Windows Azure Service associated with this Git repo.'.cyan)
    .option('-g, --publishSettings <file>', '[required] location of the *.publishSettings file for managing the specified subscription')
    .option('-n, --serviceName <name>', '[required] name of the Windows Azure service to create')
    .option('-u, --username <username>', '[required] username for administration and RDP connection to the Windows Azure service')
    .option('-p, --password <password>', '[required] password for administration and RDP connection to the Windows Azure service')
    .option('-s, --subscription <id|name>', '[optional] Windows Azure subscription ID to create the service under (defaults to first listed in *.publishSettings)')    
    .option('-a, --storageAccountName <name>', '[optional] name of the Windows Azure Blob Storage account to use')
    .option('-f, --force', '[optional] override hosted services and blobs if they already exist')
    .option('-l, --serviceLocation <location>', '[optional] location of the Windows Azure datacenter to host the service in (defaults to Anywhere US)')
    .option('-i, --instances <number>', '[optional] number of instances of Windows Azure Worker Role to create')
    .option('-b, --blobContainerName <name>', '[optional] name of the Windows Azure Blob Storage contaniner to create or use')
    .option('-r, --remote <name>', '[optional] remote name to push git-azure runtime scaffolding to (defaults to origin)')
    .option('-t, --branch <name>', '[optional] branch name to push git-azure runtime scaffolding to (defaults to master)')
    .option('-c, --postReceive <url_path>', '[optional] obfuscated URL path for the post receive hook endpoint')
    .option('-o, --noCache', '[optional] do not cache settings in Git config after successful completion')
    .action(require('./commands/init.js').action);

program.command('app')
    .description('Manage node.js applications associated with this Git repo.'.cyan)
    .option('-n, --setup <name>', '[command] create or update an app in apps/<name> directory')
    .option('-d, --disable <name>', '[command] if --host specified, delete the host entry only; otherwise disable the entire application')
    .option('-w, --show [name]', '[command] display configuration information for all apps or for the specified app')
    .option('-t, --host <hostname>', '[optional] a hostname the app is addressable with; defaults to --setup or --delete')
    .option('-g, --gitUrl <url>', '[optional] URL of the external git repo where the application resides to register as a submodule under apps/<name>')
    .option('-e, --entry <file>', '[optional] path to the main application file relative to apps/<name> directory; defaults to server.js')
    .option('-s, --ssl <mode>', '[optional] one of [required|allowed|disallowed]; default allowed')
    .option('-c, --cert <blob_name>', '[optional] the Windows Azure Blob name with PKCS#7 encoded (PEM) X.509 certificate for SSL')
    .option('--certFile <file>', '[optional] file name with PKCS#7 encoded (PEM) X.509 certificate for SSL')
    .option('-k, --key <blob_name>', '[optional] the Windows Azure Blob name with PKCS#7 encoded (PEM) private key for SSL')
    .option('--keyFile <file>', '[optional] file name with PKCS#7 encoded (PEM) private key for SSL')
    .option('--disablePathRouting', '[optional] disable routing on URL path for this application')
    .option('--enablePathRouting', '[optional] enable routing on URL path for this application')
    .option('-x, --generateX509 [commonName]', '[optional] generate a self-signed X.509 certificate to configure SSL for the --host')
    .option('-a, --storageAccountName <name>', '[optional] name of the Windows Azure Blob Storage account to use')
    .option('-k, --storageAccountKey <key>', '[optional] access key for the specified Windows Azure Blob Storage account')
    .option('-b, --blobContainerName <name>', '[optional] name of the Windows Azure Blob Storage contaniner to create or use')
    .action(require('./commands/app.js').action);

program.command('blob')
    .description('Manipulate data in Azure Blob Storage.'.cyan)
    .option('-p, --put <name>', 'add or override data in blob storage')
    .option('-g, --get <name>', 'get data from blob storage')
    .option('-d, --delete <name>', 'delete data from blob storage')
    .option('-l, --list', 'list blobs in blob storage')
    .option('-f, --file <name>', 'optionally use with --get or --put options to indicate file to save to or read from')
    .option('-c, --content <text>', 'specifies content of the blob for --put; --content takes precedence over --file')
    .option('-v, --verbose, ', 'more verbose output')
    .option('-a, --storageAccountName <name>', '[required] name of the Windows Azure Blob Storage account to use')
    .option('-k, --storageAccountKey <key>', '[required] access key for the specified Windows Azure Blob Storage account')
    .option('-b, --blobContainerName <name>', '[required] name of the Windows Azure Blob Storage contaniner to create or use')
    .action(require('./commands/blob.js').action);

program.command('restart')
    .description('Restart the Windows Azure service associated with this Git repo.'.cyan)
    .option('-s, --subscription <id>', 'Windows Azure subscription ID to create the service under')
    .option('-p, --publishSettings <file>', 'location of the *.publishSettings file for managing the specified subscription')
    .option('-n, --serviceName <name>', 'name of the Windows Azure service to create')
    .option('-r, --reboot', 'hard reboot the Windows Azure service rather then just recycle node.js applications')
    .option('-q, --quiet', 'succeed or fail without showing prompts')
    .action(function (cmd) {
        console.log('restart: ', cmd);
    });

program.command('destroy')
    .description('Destroy the Windows Azure service associated with this Git repo.'.cyan)
    .option('-s, --subscription <id>', 'Windows Azure subscription ID to create the service under (defaults to first listed in *.publishSettings)')
    .option('-p, --publishSettings <file>', 'location of the *.publishSettings file for managing the specified subscription')
    .option('-a, --storageAccountName <name>', 'name of the Windows Azure Blob Storage account to use')
    .option('-k, --storageAccountKey <key>', 'access key for the specified Windows Azure Blob Storage account')
    .option('-n, --serviceName <name>', 'name of the Windows Azure service to create')
    .option('-b, --blobContainerName <name>', 'name of the Windows Azure Blob Storage contaniner to delete  ')
    .option('-q, --quiet', 'succeed or fail without showing prompts')
    .action(function (cmd) {
        console.log('destroying: ', cmd);
    });

if (process.argv.length == 2)
    program.parse(['', '', '-h']);
else
    program.parse(process.argv);
