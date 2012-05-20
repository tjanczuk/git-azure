var http = require('http');

var html = (function () {/*
<html>
<head>
	<title>##NAME##</title>
	<style>
		pre { background-color: eeeeee; padding: 10px; margin-left: 30px; } 
		p { margin-left: 30px; } 
		body { font-family: Arial; } 
	</style>
</head>
<body>
	<h2>Welcome to ##NAME## application</h2>
		<p>Running on <a href="https://github.com/tjanczuk/git-azure">git-azure</a> 
			by <a href="http://tomasz.janczuk.org/">Tomasz Janczuk</a></p>
	<h3>Routing HTTP and WebSocket traffic to your application based on the path of the URL</h3>
		<p>HTTP and WebSocket traffic is routed to your application by default if the first segment 
			of the URL path matches the application name. You can disable URL path routing with:
		<pre>git azure app --setup ##NAME## --disablePathRouting
git add .
git commit
git push</pre>
		<p>Similarly, you can re-enable URL path routing with:
		<pre>git azure app --setup ##NAME## --enablePathRouting
...</pre>
	<h3>Routing HTTP and WebSocket traffic to your application based on host name of the URL</h3>
		<p>HTTP and WebSocket traffic can also be routed to your application based on the host name of the URL. 
			To associate a host name with this application, call:
		<pre>git azure app --setup ##NAME## --host myhostname.com
git add apps/##NAME##/package.json
git commit
git push</pre>
		<p>You can associate any number of host names with your application.
	<h3>Configuring DNS for host name routing during development</h3>
		<p>To enable host name routing during development, you can modify the /etc/hosts file
		to associate your host name with the IP address of your Windows Azure service.
 		<p>First, obtain the IP address of your Windows Azure Service by calling:
 		<pre>git config --get azure.ip</pre>
 		<p>Then, edit your /etc/hosts file:
		<pre>sudo nano /etc/hosts</pre>
		<p>and add a line similar to this one:
		<pre>##IP## myhostname.com</pre>
	<h3>Configuring DNS for hostname routing in production</h3>
		<p>For your service to be reachable from public internet with a custom host name, you must register 
			your host name with a public DNS registar, and set up a CNAME entry in the DNS that points from your 
			domain name (e.g. mydomain.com) to the domain name of your Windows Azure Service, 
			which is <strong>##AZUREHOST##</strong>.
		<p>Alternatively you can also set up an A record in your DNS that points from your domain name 
			(e.g. mydomain.com) to the IP address of your Windows Azure Service. However, the CNAME method 
			is preferred over the A method since the IP address of your service may change in certain situations.
	<h3>Enabling SSL</h3>
		<p>SSL for HTTP and WebSocket traffic is enabled by default using a self-signed X.509 certificate with 
			the common name of CN=##AZUREHOST##.
		<p>You can specify a custom SSL certificate for your application if you are using host name routing. 
			The certificate will be served to clients that support Server Name Identification (which is virtually 
			all modern web browsers). To associate a certificate with your host name and application, call:
		<pre>git azure app --setup ##NAME## --host myservice.com --ssl allowed --certFile myCertificate.pem --keyFile myKey.pem</pre>
		<p>The myCertificate.pem and myKey.pem files must contain the PKCS#7 encoded (PEM) X.509 certificate 
			and corresponding private key, respectively. The key and certificate will be securely uploaded 
			to the Windows Azure Blob storage so that they need not be checked into the Git repository.
 		<p>Alternatively, you can also quickly generate a self-siged X.509 certificate corresponding to your 
 			host name with:
 		<pre>git azure app --setup ##NAME## --host myservice.com --ssl allowed --generateX509</pre>
		<p>If you need to customize your self-siged certificate, you can use the following openssl command 
			chain to get started:
		<pre>openssl genrsa -out myKey.pem 1024
openssl req -new -key myKey.pem -out myCsr.pem
openssl x509 -req -in myCsr.pem -signkey myKey.pem -out myCertificate.pem</pre>
		<p>Please note that SSL is terminated at the git-azure HTTP reverse proxy, so the listener you set up 
			in your application should listen for unsecured HTTP or WebSocket traffic on port process.env.PORT. 
			This port is not externally addressable.
	<h3>Additional resources</h3>
		<a href="https://github.com/tjanczuk/git-azure">github project site</a><br>
		<a href="http://tomasz.janczuk.org">blog</a><br>
		<a href="https://twitter.com/#!/tjanczuk">@tjanczuk</a>
</body>
</html>
|*/}).toString().match(/[^\n]\n([^\|]*)/)[1];

http.createServer(function (req, res) {
	res.writeHead(200, { 'Content-Type': 'text/html'});
	res.end(html);
}).listen(process.env.PORT || 8000);