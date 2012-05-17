var http = require('http');

var html = '\
<html><head><title>##NAME##</title>\
<style>\
pre { background-color: eeeeee; padding: 10px; margin-left: 30px; } \
p { margin-left: 30px; } \
body { font-family: Arial; } \
</style>\
</head>\
<body>\
<h2>Welcome to ##NAME## application</h2>\
<p>Running on <a href="https://github.com/tjanczuk/git-azure">git-azure</a> by <a href="http://tomasz.janczuk.org/">Tomasz Janczuk</a></p>\
<h3>Routing HTTP and WebSocket traffic to your application</h3>\
<p>HTTP and WebSocket traffic is routed to your application based on the host name of the URL. To associate a host name with this application, call:\
<pre>git azure app --setup ##NAME## --host myhostname.com\n\
git add apps/##NAME##/package.json\n\
git commit\n\
git push</pre>\
<p>You can associate any number of host names with your application.\
<h3>Configuring DNS for development</h3>\
<p>During development, you can modify the /etc/hosts file to associate your host name with the IP address of your Windows Azure service,\
 which is <strong>##IP##</strong>. First:\
<pre>sudo nano /etc/hosts</pre>\
<p>then add a line similar to this one:\
<pre>##IP## myhostname.com</pre>\
<h3>Configuring DNS for production</h3>\
<p>For your service to be reachable from public internet, you must register your host name with a public DNS registar, and set up\
 a CNAME entry in the DNS that points from your domain name (e.g. mydomain.com) to the domain name of your Windows Azure Service,\
 which is <strong>##AZUREHOST##</strong>.\
<p>Alternatively you can also set up an A record in your DNS that points from your domain name (e.g. mydomain.com) to the IP address of your Windows Azure Service\
(##IP##). However, the CNAME method is preferred over the A method since the IP address of your service may change in certain situations.\
<h3>Enabling SSL</h3>\
<p>SSL for HTTP and WebSocket traffic is enabled by default using a self-signed X.509 certificate with the common name of CN=##AZUREHOST##. You can specify a custom\
 SSL certificate for your application that will be served to clients that support Server Name Identification (which is virtually all modern web browsers) using:\
<pre>git azure app --setup ##NAME## --host ##HOST## --ssl allowed --certFile myCertificate.pem --keyFile myKey.pem</pre>\
<p>The myCertificate.pem and myKey.pem files must contain the PKCS#7 encoded (PEM) X.509 certificate and corresponding private key, respectively.\
 The key and certificate will be securely uploaded to the Windows Azure Blob storage so that they need not be checked into the Git repository.\
<p>You can generate a self-signed X.509 certificate with a corresponding private key using the openssl tool:\
<pre>openssl genrsa -out myKey.pem 1024\n\
openssl req -new -key myKey.pem -out myCsr.pem\n\
openssl x509 -req -in myCsr.pem -signkey myKey.pem -out myCertificate.pem</pre>\
<p>Please note that SSL is terminated at the git-azure HTTP reverse proxy, so the listener you set up in your application should listen \
for unsecured HTTP or WebSocket traffic on port process.env.PORT. This port is not externally addressable.\
<h3>Additional resources</h3>\
<a href="https://github.com/tjanczuk/git-azure">github project site</a><br>\
<a href="http://tomasz.janczuk.org">blog</a><br>\
<a href="https://twitter.com/#!/tjanczuk">@tjanczuk</a>\
</body></html>\
';

http.createServer(function (req, res) {
	res.writeHead(200, { 'Content-Type': 'text/html'});
	res.end(html);
}).listen(process.env.PORT || 8000);