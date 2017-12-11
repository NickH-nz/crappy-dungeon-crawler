var app = require('express')();
var http = require('http').Server(app);
var sio = require('socket.io')(http);

var world = {};

http.listen(1111, function() {
	console.log('Server started..');
});

sio.on('connection', function(socket) {
	console.log('User connected.');

	socket.on('chat', function(message) {
		handleChat(socket, message);
	});

	socket.on('world', function(message) {
		handleWorldUpdate(socket, message);
	});

	socket.on('disconnect', function() {
		if(socket.user) {
			sio.emit('chat', socket.user + ' disconnected.');
			sio.emit('world', {
				type: 'object_deleted',
				id: socket.user
			});
			delete world[socket.user];
		}
		console.log('User disconncted.');
	});

	// Send current state to new player
	for(var id in world) {
		var object = world[id];

		socket.emit('world', {
			type: 'object_created',
			object: object
		});
	}
});

sio.on('error', function(error) {
	console.log('Error: ' + error.message);
	process.exit(1);
});

function handleChat(socket, message) {
	console.log('Chat: ' + message);
	socket.broadcast.emit('chat', message);
}

function handleWorldUpdate(socket, message) {
	console.log('World: ' + message.type + '<' + JSON.stringify(message) + '>');

	switch(message.type) {
		case 'player_entered':
			socket.user = message.username;
			socket.broadcast.emit('chat', message.username + ' entered the game.');
			break;

		case 'object_created':
			// Broadcast the message to everyone else
			socket.broadcast.emit('world', message);

			// Then save any change to the state
			world[message.object.id] = message.object;
			break;

		case 'object_deleted':
			// Broadcast the message to everyone else
			socket.broadcast.emit('world', message);

			// Then save any change to the state
			delete world[message.id];
			break;

		case 'object_updated':
			// Broadcast the message to everyone else
			socket.broadcast.emit('world', message);

			// Then save any change to the state
			handleUpdateObject(message);
			break;
	}
}

function handleUpdateObject(message) {
	var object = world[message.object.id];

	if(object) {
		switch(message.object.action) {
			case 'move':
				if(message.object.direction === 'up') object.y--;
				else if(message.object.direction === 'down') object.y++;
				else if(message.object.direction === 'left') object.x--;
				else if(message.object.direction === 'right') object.x++;
				break;

			case 'damage':
				object.stats.hp -= message.object.amount;
				break;
		}
	}
}