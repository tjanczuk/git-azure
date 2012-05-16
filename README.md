# Walkthrough

This walkthrough demonstrates key features of the git-azure platform. Git-azure is a tool and runtime environment that allows deploying multiple node.js applications into Windows Azure Worker Role from MacOS using Git. 

It takes about 30-40 mins to present or walk through this content. 

Git-azure is work in progress. Not all planned features are done. The experience may be rough around the edges. Any and all feedback is very welcome: https://github.com/tjanczuk/git-azure/issues. I do take contributions. 

## Prerequisities

* MacOS - git-azure was developed primarily for use by MacOS developers; it may work on *nix, but I have not tested it there yet; I know it does not work on Windows, and fixing it is of relatively low priority, as Windows devs have alternatives.
* GitHub account
* node.js and Git client installed; I've tested it with 0.7.8 of node.js; support for multiple versions SxS is planned, but right now the git-azure runtime requires this version of node.js
* openssl installed
* Windows Azure account created (https://windows.azure.com); there is 90 day free trial going on right now. 

## One-time initialization

1. Create a new GitHub repo with a README (let's call it ```atest```) so that it can immediately be cloned. 
2. Clone the repo into ```atest``` directory.
3. Install git-azure with ```sudo npm install git-azure -g```
4. Invoke ```git azure``` and explain the key concepts.
5. Invoke ```git azure init``` and explain the key pieces of information that must be provided to initialize the system (publishSettings, serviceName, username, password).
6. Download the *.publishSettings from https://windows.azure.com/download/publishprofile.aspx
7. Go to the ```atest``` directory and stay there for the rest of initialization.
8. Provide configuration parameters required for initialization.

```
git config azure.publishSettings <path_to_your_publishSettings_file>
git config azure.username <username>
git config azure.password <password>
```

(The username and password are at present used to set up RDP access; going forward they will be used for Basic Auth to a mini management portal as well as SSH access to the box; Please note RDP access to Azure VMs from MacOS does not work today due to a known issue with Azure certificates).

Finally start the initialization process:

```
git azure init --serviceName <your_service_name>
```

your_service_name must be unique in Windows Azure as it will become part of a hostname (your endpoints will be accessible at your_service_name.cloudapp.net). 

The one time initialization process takes between 8-12 minutes. In this time the following things happen:

* git-azure runtime is registerded as a Git submodule in the ```atest\.git-azure``` subdirectory, commited and pushed to the repo
* A Windows Azure storage account is created is none exists
* The package is uploaded to the Windows Azure Blob Storage under that account
* A hosted service is created (one small instance - will be configurable going forward)
* RDP access is configured
* node.js and git are installed on the box
* The ```atest``` repo is cloned on the machine
* an HTTP reverse proxy (part of the git-azure runtime) is started on the machine

If the initialization process fails, it can be restarted with 

```
git azure init --serviceName <your_service_name> --force
```

In general the script is re-entrant; the --force option will override any prior artifacts deployed with ```git azure init```.

After successful initialization, information similar to this one is displayed:

```text
OK: your Windows Azure service git-azure-3 is ready

Configure a post-receive hook in your repository to enable automatic updates on 'git push'. Your post-receive hook URL is:
  http://git-azure-3.cloudapp.net:31417/ec0291ff-3e5d-4f36-a3dd-c7b929dc6d8a

The service can be accessed at the following endpoints:
  http://git-azure-3.cloudapp.net         - HTTP application endpoint
  https://git-azure-3.cloudapp.net        - HTTPS application endpoint (if SSL is configured)
  ws://git-azure-3.cloudapp.net           - WebSocket application traffic
  wss://git-azure-3.cloudapp.net          - secure WebSocket application traffic (if SSL is configured)
You can configure additional A entires in your DNS directed at IP address 65.52.238.34 (useful for /etc/hosts).
You can configure additional CNAME entires in your DNS directed at git-azure-3.cloudapp.net (recommended for production).

Management endpoints:
  https://git-azure-3.cloudapp.net:31415  - management endpoint (if SSL is configured)
  http://git-azure-3.cloudapp.net:31415   - management endpoint (if SSL is not configured)
  https://windows.azure.com - Windows Azure management portal (billing, accounts etc.)

Visit https://github.com/tjanczuk/git-azure for walkthroughs on setting up SSL, support for multiple apps, and more.
Finished at Fri May 11 2012 09:38:15 GMT-0700 (PDT)
Duration 10 min 8 sec.
```

## (Note for live demonstrations)

Given that the one-time initialization takes 8-12 minutes, I normally get it started, explain what it does and for how long, but then switch to a second console window with a pre-provisioned service to continue the presentation starting from the next step below. 

## Post-receive hook configuration

Configure the post-receive hook in GitHub: go to the administration section of the ```atest``` GitHub repository, select 'Service Hooks' on the left, then 'Web Hook URLs' on the list to the right, and then add the post-receive hook URL that was provided to you by ```git azure init``` in step 9. In the example above you would specifiy ```http://git-azure-3.cloudapp.net:31417/ec0291ff-3e5d-4f36-a3dd-c7b929dc6d8a```. Configuring the post-receive hook enables the system to automatically update running applications when changes are pushed with ```git push```.

## First application

Adding a first application is very easy as you don't need to think about configuring routing information. Basically all HTTP/WS requests will be routed to the application if only one exists in the system, regardless what the hostname of the HTTP/WS requests is. 

Go to http://your_service_name.cloudapp.net and show the respone indicating no applications are configured. 

Create ```atest\apps\hello``` directory and save the following ```server.js``` file in there:

```
require('http').createServer(function (req, res) {
	res.writeHead(200, { 'Content-Type': 'text/plain'});
	res.end('Hello, world!\nCurrent time on the server is ' + new Date() + '\n');
}).listen(process.env.PORT || 8000);
```

Then push it to GitHub:

```
git add .
git commit -m "first application"
git push
```

Go to http://your_service_name.cloudapp.net again; you may need to refresh a few times as the update process typically takes 6-10 seconds; At the end you should see the 'Hello, world' of your first application

## Second application - introduction of routing

When adding a second application, one needs to consider which requests are going to be routed to which of the two applications. This is convention based: 
* the name of the directory under ```apps``` in which the application exists is the domain name of HTTP/WS requests that will be routed to it, 
* if a directory is a simple name that does not look like a domain name (without a dot), it make a "fallback" application which receives all requests that did not match other directory names. Up to one such directory is allowed (and was created in the previous step of the walkthrough). 

Configuration that does not match this convention can be refined with entries in the package.json file of each app (including support for multiple domain names with different SSL certificates), which is not covered in this demo. 

Create ```atest\apps\foobar.com``` directory and save the following ```server.js``` file in there:

```
require('http').createServer(function (req, res) {
	res.writeHead(200, { 'Content-Type': 'text/plain'});
	res.end('SECOND APPLICATION!\nCurrent time on the server is ' + new Date() + '\n');
}).listen(process.env.PORT || 8000);
```

(Note the ```foobar.com``` directory name that needs to map to hostnames of the incoming HTTP requests). 

Then push it to GitHub:

```
git add .
git commit -m "first application"
git push
```

Next, add an entry to the ```/etc/hosts``` file to map the ```foobar.com``` domain name to the IP address of the Windows Azure service that was provided to you during the one-time intialization. First call

```
git config --get azure.ip
```

which will give you the IP address, say 65.52.238.34. Next, edit the ```/etc/hosts``` file with something like ```sudo nano /etc/hosts``` and enter the new host line:

```
65.52.238.34 foobar.com
```

Last, go to ```http://foobar.com```. You should see the 'SECOND APPLICATION' show up.

Note: in production, instead of adding A records to ```/etc/hosts``` or to their DNS registry, one would add a CNAME record redirecting the custom domain name to your_service_name.cloudapp.net. 

## Third application - submodules and WebSockets

This application shows two extra features of git-azure: ability to compose applications that reside in their own repositories, as well as support for WebSockets. 

Take a look at the node.js application at https://github.com/tjanczuk/dante. It runs a small web server, serves an index.html page to the browser in response to any HTTP requests. The page in turn makes a WebSocket connection back to the server. When the server gets an upgrade request, it starts streaming Dante's Divine Comedy, Canto 1, back to the client, one stanza at a time. Try running it as a standalone node.js app to get a sense of what it does. 

In this step we will add the application as a Git submodule to the ```atest``` repository. 

First, go the root of the ```atest``` repo; from there:

```
git submodule add git@github.com:tjanczuk/dante.git apps/dante.com
git add .
git commit -m "dante application"
git push
```

Similarly to the second app, add an entry to the ```/etc/hosts``` file to map the ```dante.com``` domain name to the IP address of the Windows Azure service, e.g.:

```
65.52.238.34 foobar.com
```

Last, hit ```http://dante.com``` in a browser and enjoy Divine Comedy streamed to you over WebSockets.