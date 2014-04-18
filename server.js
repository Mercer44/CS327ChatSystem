
var express 	= require('express'),
	app			= express(),
    server  	= require('http').createServer(app),
    io      	= require('socket.io').listen(server),
    jade		= require('jade'),
    port    	= 4400,

    // hash object to save clients data,
    // { socketid: { clientid, nickname }, socketid: { ... } }
    chatClients = new Object();

// listening to port...
server.listen(port);

// configure express, since this server is
// also a web server, we need to define the
// paths to the static files
app.use("/styles", express.static(__dirname + '/public/styles'));
app.use("/scripts", express.static(__dirname + '/public/scripts'));
app.use("/images", express.static(__dirname + '/public/images'));

app.get('/', function (req, res) {
 res.sendfile(__dirname + '/public/index.html');
});

io.set('log level', 2);
io.set('transports', [ 'websocket', 'xhr-polling' ]);

io.sockets.on('connection', function(socket){
	
	// after connection, the client sends us the nickname
	socket.on('connect', function(data){
		connect(socket, data);
	});

	//client sends message
	socket.on('chatmessage', function(data){
		chatmessage(socket, data);
	});
	
	// client subscribtion to a room
	socket.on('subscribe', function(data){
		subscribe(socket, data);
	});

	// client unsubscribtion from a room
	socket.on('unsubscribe', function(data){
		unsubscribe(socket, data);
	});
	
	// builtin disconnect
	socket.on('disconnect', function(){
		disconnect(socket);
	});
});

// create a client for the socket
function connect(socket, data){
	//generate clientId
	data.clientId = generateId();

	// save the client to the hash object
	chatClients[socket.id] = data;

	socket.emit('ready', { clientId: data.clientId });
	
	// auto subscribe the client to the 'lobby'
	subscribe(socket, { room: 'lobby' });

	// sends a list of all active rooms
	socket.emit('roomslist', { rooms: getRooms() });
}

// when a client disconnect, unsubscribe him
function disconnect(socket){
	// get a list of rooms for the client
	var rooms = io.sockets.manager.roomClients[socket.id];
	
	// unsubscribe from the rooms
	for(var room in rooms){
		if(room && rooms[room]){
			unsubscribe(socket, { room: room.replace('/','') });
		}
	}

	// delete from the hash object
	delete chatClients[socket.id];
}

// receive chat message from a client and send
function chatmessage(socket, data){
	socket.broadcast.to(data.room).emit('chatmessage', { client: chatClients[socket.id], message: data.message, room: data.room });
}

// join
function subscribe(socket, data){
	// get a list of all active rooms
	var rooms = getRooms();

	// check if this room is exist, if not, update all 
	// other clients about this new room
	if(rooms.indexOf('/' + data.room) < 0){
		socket.broadcast.emit('addroom', { room: data.room });
	}

	// subscribe the client to the room
	socket.join(data.room);

	// update all other clients about the online
	// presence
	updatePresence(data.room, socket, 'online');

	// send to the client a list of all subscribed clients
	// in this room
	socket.emit('roomclients', { room: data.room, clients: getClientsInRoom(socket.id, data.room) });
}

function unsubscribe(socket, data){
	// update all other clients about the offline presence
	updatePresence(data.room, socket, 'offline');
	
	// remove the client from socket.io room
	socket.leave(data.room);

	if(!countClientsInRoom(data.room)){

		io.sockets.emit('removeroom', { room: data.room });
	}
}

function getRooms(){
	return Object.keys(io.sockets.manager.rooms);
}

// get array of clients in a room
function getClientsInRoom(socketId, room){
	// get array of socket ids in this room
	var socketIds = io.sockets.manager.rooms['/' + room];
	var clients = [];
	
	if(socketIds && socketIds.length > 0){
		socketsCount = socketIds.lenght;
		
		// push every client to the result array
		for(var i = 0, len = socketIds.length; i < len; i++){
			
			// check if the socket is not the requesting
			// socket
			if(socketIds[i] != socketId){
				clients.push(chatClients[socketIds[i]]);
			}
		}
	}
	
	return clients;
}

// get the amount of clients in aroom
function countClientsInRoom(room){
	// 'io.sockets.manager.rooms' is an object that holds
	// the active room names as a key and an array of
	// all subscribed client socket ids
	if(io.sockets.manager.rooms['/' + room]){
		return io.sockets.manager.rooms['/' + room].length;
	}
	return 0;
}

// updating all other clients when a client goes online or offline.
function updatePresence(room, socket, state){
	room = room.replace('/','');

	socket.broadcast.to(room).emit('presence', { client: chatClients[socket.id], state: state, room: room });
}

// unique id generator
function generateId(){
	var S4 = function () {
		return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
	};
	return (S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4());
}

// show a message in console
console.log('Chat server is running and listening to port %d...', port);