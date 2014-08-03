var q = require('q');
var net = require('net');
var carrier = require('carrier');
var nano = require('nano')('https://couch.fluffl.es');
var ndb = nano.db;

var banner = "smtp.litehost.net ESMTP Postfix";

ndb.create('spamtrap-smtp');
var db = nano.use('spamtrap-smtp');

var srv = net.createServer(function(c) {
	c.setEncoding('ascii');
	
	var ip = c.remoteAddress, port = c.remotePort;
	console.log(ip + ':' + port + ' connected!');
	var client = {
		ip: ip, port: port,
		ts: new Date().getTime(),
		log: []
	};
	var mode = 'cmd'; // cmd, data
	var data = [];
	
	var addLog = function(msg) {
		client.log.push({
			ts: new Date().getTime(),
			msg: msg
		});
	}
	var send = function(line) {
		setTimeout(function() {
			c.write(line + "\r\n");
		}, /*Math.round(Math.random() * 1000)*/ 500);
	}
	
	c.on('error', function(err) {
		console.log(ip + ':' + port + ' error:', err);
	});
	c.on('end', function() {
		console.log(ip + ':' + port + ' disconnected.');
		addLog('disconnect');
		
		db.insert(client, function(err, body) {
			if(err) console.log(err);
		});
	});
	addLog('connect');
	
	
	carrier.carry(c, function(line) {		
		if(mode == 'cmd') {
			addLog(line);
			console.log(ip + ':' + port + ' ' + line);
		
			var args = line.split(' ');
			var cmd = args[0].toUpperCase();
			
			switch(cmd) {
				case 'HELO':
				case 'EHLO':
					send('250-Hello ' + args[1] + ', I\'m not glad to meet you\r\n250 AUTH PLAIN');
					break;
					
				case 'MAIL':
				case 'RCPT':
					send('250 Ok');
					break;
				
				case 'DATA':
					send('354 End data with <CR><LF>.<CR><LF>');
					mode = 'data';
					data = [];
					//send('502 Not Implemented');
					break;
					
				case 'QUIT':
					send('221 Bye'); // Bye but hog the connection
					break;
					
				default:
					send('502 Not Implemented');
					console.log('!! unhandled');
			}
		} else {
			if(line == '.') {
				mode = 'cmd';
				client['data'] = data;
				send('250 Ok: queued as yoloswag31337');
			} else {
				data.push(line);
			}
		}
		
	}, 'ascii');
	
	send('220 ' + banner);
});
srv.listen(25, function() {
	console.log('Listening on 25/smtp');
});