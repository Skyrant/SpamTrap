var q = require('q');
var net = require('net');
var carrier = require('carrier');
var nano = require('nano')('https://spamtrap:823yjFQMNG2SDXsnloo6@couch.fluffl.es');
var ndb = nano.db;

var banner = "smtp.litehost.net ESMTP Postfix";

// Drop privileges
var UID = 'blood';
var GID = 'users';

ndb.create('spamtrap-smtp');
var db = nano.use('spamtrap-smtp');

function dropPrivileges() {
	process.setgid(GID);
	process.setuid(UID);
}

(function() {

	var views = {
		byIP: { map: function(doc) { emit(doc.ip, doc); } },
		byTime: { map: function(doc) { emit(doc.ts, doc); } }
	}

	function create() {
		var body = {
			_id: "_design/views",
			language: 'javascript',
			views: views
		};
		
		db.insert(body, function(err) {
			if(err) console.log(err);
		});
	}
	
	function update() {
		db.get('_design/views', function(err, body) {
			if(err) {
				console.log(err);
				return;
			}
			
			var newbody = body;
			newbody['language'] = "javascript";
			newbody['views'] = views;
			
			db.insert(newbody, '_design/views', function(err) {
				if(err) console.log(err);
			});
		});
	}

	// Initialize design docs
	db.head('_design/views', function(err, _, headers) {
		if(err) {
			if (err['status-code'] === 404) {
				create();
				return;
			} else {
				console.log(err);
			}
			return;
		}
		
		if(headers['status-code'] === 200) {
			update();
		} else {
			console.log(headers);
		}
	});
})();

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
	
	var addLog = function(msg, isServer) {
		msg = msg.replace(/\r?\n/g, ' | ');
		
		if(isServer === true) {
			msg = 'S ' + msg;
		}
		
		client.log.push({
			ts: new Date().getTime(),
			msg: msg
		});
	}
	var send = function(line) {		
		setTimeout(function() {
			console.log(ip + ':' + port + ' S ' + line.replace(/\r?\n/g, ' | '));
			addLog(line, true);
			c.write(line + "\r\n");
		}, /*Math.round(Math.random() * 1000)*/ 500);
	}
	
	c.on('error', function(err) {
		console.log(ip + ':' + port + ' error:', err);
		
		addLog('disconnect (' + err + ')');
		db.insert(client, function(err, body) {
			if(err) console.log(err);
		});
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
			console.log(ip + ':' + port + ' C ' + line);
		
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
				var databytes = 0;
				for(var i in data) {
					var d = data[i];
					databytes += d.length;
				}
				addLog("DATA mode concluded with " + databytes + " bytes.");
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
	try {
		dropPrivileges();
		console.log('Successfully dropped privileges to ' + process.getuid() + ':' + process.getgid());
	} catch(err) {
		console.warning('Unable to drop privileges, continuing as root!');
	}
});