#!/usr/bin/env node

var program = require('commander')
    , fs = require('fs')
    , path = require('path')
    , util = require('util')
    , colors = require('colors')

var oldError = console.error
console.error = function (thing) {
    if (typeof thing === 'string')
        thing = thing.red
    return oldError.call(this, thing)
}

program.version(require(path.resolve(__dirname, '../../package.json')).version)

program.command('init')
    .description('One-time initialization of a Windows Azure Service associated with this Git repo.'.cyan)
    .option('-s, --subscriptionId <id>', 'Windows Azure subscription ID to create the service under')
    .option('-p, --publishSettings <file>', 'location of the *.publishSettings file for managing the specified subscription')
    .option('-c, --managementCertificate <file>', 'location of the management certificate file in PEM format')
    .option('-a, --storageAccountName <name>', 'name of the Windows Azure Blob Storage account to use')
    .option('-k, --storageAccountKey <key>', 'access key for the specified Windows Azure Blob Storage account')
    .option('-n, --serviceName <name>', 'name of the Windows Azure service to create')
    .option('-l, --serviceLocation <location>', 'location of the Windows Azure datacenter to host the service in')
    .option('-m, --vmSize <size>', 'size of the Windows Azure Worker Role VM to create [ExtraSmall|Small|Medium|Large|ExtraLarge]')
    .option('-i, --instances <number>', 'number of instances of Windows Azure Worker Role to create')
    .option('-b, --blobContainerName <name>', 'name of the Windows Azure Blob Storage contaniner to create or use')
    .option('-n, --no_persist', 'do not store any settings in the azure section of the Git configuration for convenience of later use')
    .option('-q, --quiet', 'succeed or fail without showing prompts')
    .action(require('./commands/init.js').action)

program.command('destroy')
    .description('Destroy the Windows Azure service associated with this Git repo.'.cyan)
    .option('-s, --subscriptionId <id>', 'Windows Azure subscription ID to create the service under')
    .option('-p, --publishSettings <file>', 'location of the *.publishSettings file for managing the specified subscription')
    .option('-a, --storageAccountName <name>', 'name of the Windows Azure Blob Storage account to use')
    .option('-k, --storageAccountKey <key>', 'access key for the specified Windows Azure Blob Storage account')
    .option('-n, --serviceName <name>', 'name of the Windows Azure service to create')
    .option('-b, --blobContainerName <name>', 'name of the Windows Azure Blob Storage contaniner to create or use')
    .option('-q, --quiet', 'succeed or fail without showing prompts')
    .action(function (cmd) {
        console.log('destroying: ', cmd);
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

if (process.argv.length == 2)
    program.parse(['', '', '-h'])
else
    program.parse(process.argv)
