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

## Creating your first application

Adding a first application is very easy as you don't need to think about configuring routing information. Basically all HTTP/WS requests will be routed to the application if only one exists in the system, regardless what the hostname of the HTTP/WS requests is. 

Go to http://your_service_name.cloudapp.net and show the respone indicating no applications are configured. 

Run the following command to scaffold a very simple application

`git azure app --setup hello`

The scaffolder simply created an `apps\hello` folder with a very simple ```server.js``` and ```package.json``` inside.
Now, commit that to the repo and push it.

```
git add .
git commit -m "first application"
git push
```

Go to ```http://your_service_name.cloudapp.net``` again; you may need to refresh a few times as the update process typically takes 6-10 seconds; At the end you should see a webpage that explains more advanced concepts about git-azure.

## Second application - introduction to routing

When adding a second application, one needs to consider which requests are going to be routed to which of the two applications. Routing is heavily convention based, and where conventions are not sufficient, explicit configuration can be used. All applications must be stored in subdirectories of the ```apps``` directory. The name of the subdirectory is the application name for routing purposes. A request is routed to an application when:

* it is the only application in the system, 
* no host names are explicitly associated with that application through configuration, and the application name matches the host name of the request, 
* host name of the request matches one of the host names explicitly associated with that application through configuration, 
* application name matches the first segment of the URL path of the request, and the application did not explicitly disable URL path based routing.

Run the following command to scaffold a second application

`git azure app --setup foobar.com`

The scaffolder created a `apps\foobar.com` folder.
Now, commit that to the repo and push it.

```
git add .
git commit -m "second application"
git push
```

Then, go to ```http://your_service_name.cloudapp.net/foobar.com```. You should get a response from the second application you just added. You can also fo to ```http://your_service_name.cloudapp.net/hello``` and receive a response from the first application. 

At this point you have two node.js applications running on a single VM on the same port 80. 

##  Host name based routing

The second application was placed in the ```foobar.com``` subdirectory, so given the convention based routing rules, all requests with host name equal to ```foobar.com``` will also be routed to that application. 

To test this, add an entry to the ```/etc/hosts``` file to map the ```foobar.com``` domain name to the IP address of the Windows Azure service that was provided to you during the one-time intialization. First call

```
git config --get azure.ip
```

which will give you the IP address of your Windows Azure service, say 65.52.238.34. Next, edit the ```/etc/hosts``` file with something like ```sudo nano /etc/hosts``` and enter the new host line:

```
65.52.238.34 foobar.com
```

Last, go to ```http://foobar.com```. You should see the 'SECOND APPLICATION' show up.

Note: in production, instead of adding A records to ```/etc/hosts``` or to their DNS registry, one would add a CNAME record redirecting the custom domain name to your_service_name.cloudapp.net. 

## Explicit routing configuration

Routing configuration for an application can be customized with entries in the ```package.json``` file in the root of the application's directory (e.g. ```apps/foobar.com/package.json```). In addition, the ```git azure app``` command helps make these configuration changes. Note that ```git azure app``` only scaffolds the changes locally, you still need to commit and push the changes with ```git commit``` and ```git push``` to make them effective. 

To associate a host name ```baz.com``` with an application ```hello```, call:

```
git azure app --setup hello --host baz.com
```

You can call that command multiple times to associate more than one host name with a given application. 

To remove the association of app ```hello``` with hostname ```baz.com```, call:

```
git azure app --delete hello --host baz.com
```

In a similar way you can control URL path based routing for an application. By default URL path based routing is enabled. To disable it for application ```hello```, call:

```
git azure app --setup hello --disablePathRouting
```

To re-enable again, call:

```
git azure app --setup hello --enablePathRouting
```

## Inspecting and validating routing configuration

Effective routing configuration is computed from the explicit configuration and the conventional routing rules. You can inspect and validate effective routing configuration for a single application by calling:

```
git azure app --show hello
```

or for all applications by calling:

```
git azure app --show
```

The latter command is particularly useful as it will detect and warn about any issues in the routing configuration, e.g. a conflicting association of a particular host name to more than one application. 

## Third application - submodules and WebSockets

This application shows two extra features of git-azure: ability to compose applications that reside in their own repositories, as well as support for WebSockets. 

Take a look at the node.js application at https://github.com/tjanczuk/dante. It runs a small web server which serves an index.html page to the browser in response to any HTTP requests. The page in turn makes a WebSocket connection back to the server. When the server gets an upgrade request, it starts streaming Dante's Divine Comedy, Canto 1, back to the client, one stanza at a time. Try running it as a standalone node.js app to get a sense of what it does. 

In this step we will add the application as a Git submodule to the ```atest``` repository. 

First, go the root of the ```atest``` repo; from there:

```
git azure app --setup dante.com --gitUrl git@github.com:tjanczuk/dante.git
git add .
git commit -m "dante application"
git push
```

You can then go to ```http://your_service_name.cloudapp.net/dante.com```, you should see Dante's Divine Comedy streamed back to you over WebSockets. If you configure an entry in the ```/etc/hosts``` file pointing from the ```dante.com``` host name to the IP address of your Windows Azure Service (similarly to what you have done with the second applicaiton above), you will also be able to reach the same applicatio with ```http://dante.com``` URL. 

## SSL - the basics

SSL is enabled by default using a self-signed X.509 certificate generated by ```git azure init```. All applications that can be reached over HTTP can also be reached over HTTPS. Similarly for WebSockets, all WS endpoints can also be reached with WSS. 

Note that SSL is terminated at the HTTP reverse proxy level git-azure is running, and the local traffic between the reverse proxy and your application is always unsecured (HTTP or WS). So when authoring your server code, make sure to set up an HTTP and WS servers, not HTTPS or WSS. 

The default self-signed X.509 certificate contains Common Name (CN) equal to the DNS name of your Windows Azure Service (i.e. ```CN=your_service_name.cloudapp.net```). Because the certificate is self-signed, browsers are going to display a warning when HTTPS endpoints are visited. 

X.509 certificate of your service is securely stored in the Windows Azure Blob Storage associated your Windows Azure account. You can list the content of the storage by calling:

```
git azure blob --list
```

which will yield something like

```
bootstrap.cspkg
master.certificate.pem
master.key.pem
```

The ```master.certificate.pem``` and ```master.key.pem``` are the X.509 certificate and the associated private key of your service in PKCS#7 (PEM) format. You can download these credentials to your machine if you so desire (e.g. to set up explicit trust relationship) with:

```
git azure blob --get master.certificate.pem --file master.certificate.pem
git azure blob --get master.key.pem --file master.key.pem
```

You can also supply your own X.509 certificates (perhaps issued by a publicly trusted certification authority, e.g. VeriSign) by uploading them to Windows Azure Blob Storage with:

```
git azure blob --put master.certificate.pem --file mycert.pem
git azure blob --put master.key.pem --file mykey.pem
```

## SSL - application configuration

By default, all applications accept both secure and non-secure traffic (i.e. HTTP, HTTPS, WS, and WSS), and the SSL trafic is protected with the single X.509 certificate configured at the service level (```master.certificate.pem``` and ```master.key.pem``` with CN=your_service_name.cloudapp.net).

You can configure individual routes in the system to allow, require, or disallow SSL traffic. To require SSL for application ```hello``` when reached with host name route ```myapp.com```, call:

```
git azure app --setup hello --host myapp.com --ssl required
```

Similarly you can prevent SSL traffic or revert to the default (allow both SSL and non-secure traffic) with these two commands, respectively:

```
git azure app --setup hello --host myapp.com --ssl rejected
git azure app --setup hello --host myapp.com --ssl allowed
```

(Note that any changes made by ```git azure app``` are local and need to be explicitly commited and pushed with git to become effective).

You can also customize the SSL credentials a particular route will use if the client agent support Server Name Identification (virtualy all modern browsers do). Assuming your X.509 certficate and associated private key are stored in ```mycert.pem``` and ```mykey.pem``` files, you can call:

```
git azure app --setup hello --host myapp.com --ssl required --certFile mycert.pem --keyFile mykey.pem
```

The command will securely upload the certifiate and the key to Windows Azure Blob Storage, where your service will fetch it from after the configuration changes are pushed through git. 

As a convenince, ```git azure app``` can also generate a set of self-signed X.509 credentials for you that will include the Common Name equal to the host name of the route. For example: 

```
git azure app --setup hello --host myapp.com --ssl required --generateX509
```

Will generate a self-signed certificate with CN=myapp.com, upload it to Windows Azure Blob Storage, and configure application ```hello``` to use that certificate with SNI. 

## Roadmap - what is coming?

These are some ideas for what I plan to enable next. Feel free to chime in by filing an issue. 

* access to logs (inluding live log streaming)
* SSH access to the VM
* web based management portal (mostly diagnostics)

## I do take contributions

Inspired? Bored? Or just want to make the world a better place? Get in touch and we will go from there. 