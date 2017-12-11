var SocketIO = require('socket.io-client');
var socket;

var worldData = {};
var worldView = {};

var blockers = [];
var ground = [];
var monsters = [];
var players = [];

var messagesDiv;
var messageEntry;
var game;
var view;

var inputLocked = false;
var attackLocked = false;

var tileSize = 45;

var playerStartingStats = {
	facing: 'down',
	maxHp: 20,
	hp: 20,
	attack: 1
};

document.addEventListener('DOMContentLoaded', function() {

	socket = SocketIO('192.168.1.41:1111');

	messagesDiv = document.getElementById("messages");
	messageEntry = document.getElementById("message_entry");
	game = document.getElementById("game");
	view = document.getElementById("view");

	game.focus();

	game.style.top = view.clientHeight * 0.5;
	game.style.left = view.clientWidth * 0.5;

	socket.on('chat', function(message) {
		addMessageToLog(messagesDiv, message, false);
	});

	socket.on('world', handleWorldUpdate);

	messageEntry.addEventListener('keypress', function(event) {
		if(event.keyCode == 13) { // Enter key
			var text = messageEntry.value;
			if(text != "") {
				var message = username + ": " + text;
				socket.emit('chat', message);
				messageEntry.value = "";
				addMessageToLog(messagesDiv, message, true);
			}

			view.focus();
		}
	});

	view.addEventListener('keydown', function(event) {
		if(inputLocked) return;
		inputLocked = true;

		if(event.keyCode === 13) {
			setTimeout(function() {
				messageEntry.focus();
			}, 100);
		} else {
			handlePlayerAction(event);
		}

		setTimeout(function() {
			inputLocked = false;
		}, 100); // One move every 100ms
	});

	setTimeout(function() {
		socket.emit('world', {
			type: 'player_entered',
			username: username
		});

		var player = createNewObject(
			username,
			username,
			'player',
			Math.floor(Math.random() * 3) - 1,
			Math.floor(Math.random() * 3) - 1,
			playerStartingStats
		);
		socket.emit('world', {
			type: 'object_deleted',
			id: username
		});
		socket.emit('world', {
			type: 'object_created',
			object: player
		});
		addObjectToWorld(player);

		if(!isGroundAt(player.x, player.y)) {
			// Spawn ground underneath the player
			spawnGround(player.x, player.y);
		}

		if(!isGroundAt(player.x + 1, player.y)) {
			// Spawn ground to the right
			spawnGround(player.x + 1, player.y);
		}

		if(!isGroundAt(player.x - 1, player.y)) {
			// Spawn ground to the left
			spawnGround(player.x - 1, player.y);
		}

		if(!isGroundAt(player.x, player.y + 1)) {
			// Spawn ground to the bottom
			spawnGround(player.x, player.y + 1);
		}

		if(!isGroundAt(player.x, player.y - 1)) {
			// Spawn ground to the top
			spawnGround(player.x, player.y - 1);
		}
	}, 500);
});

var cookies = require('cookies-js');

var username = cookies.get('username');
if(username === undefined) {
	username = window.prompt('Enter your username:');
	cookies.set('username', username);
}

var msBetweenMobActions = 800;
setInterval(function() {
	var now = Date.now();

	// Update monsters
	for(var i in monsters) {
		var monster = worldData[monsters[i]];

		// Make an action

		// 1. Check if there is a player directly infront of the monster
		var target;
		if(monster.stats.facing === 'up') {
			target = worldData[getBlockerAt(monster.x, monster.y - 1)];
		} else if(monster.stats.facing === 'down') {
			target = worldData[getBlockerAt(monster.x, monster.y + 1)];
		} else if(monster.stats.facing === 'left') {
			target = worldData[getBlockerAt(monster.x - 1, monster.y)];
		} else if(monster.stats.facing === 'right') {
			target = worldData[getBlockerAt(monster.x + 1, monster.y)];
		}

		if(target && target.type === 'player') {
			if(monster.timeOfLastAction + msBetweenMobActions < now) {
				worldData[monster.id].timeOfLastAction = now + Math.floor(Math.random() * 20) - 10;

				// Attack!
				var attack = {
					id: username,
					action: 'attack'
				};
				socket.emit('world', {
					type: 'object_updated',
					object: attack
				});

				if(target.type === 'player') {
					var damage = {
						id: target.id,
						action: 'damage',
						amount: monster.stats.attack
					};
					socket.emit('world', {
						type: 'object_updated',
						object: damage
					});

					updateObjectInWorld(damage);

					if(target.stats.hp <= 0) {
						removeObjectFromWorld(target.id);
						socket.emit('world', {
							type: 'object_deleted',
							id: target.id
						});
					}
				}
			}

			continue;
		}
		target = undefined;

		// 2. Check if there is player next to the monster in any direction
		var targets = [];
		var currTarget;
		
		currTarget = worldData[getBlockerAt(monster.x, monster.y - 1)];
		if(currTarget && currTarget.type === 'player') targets.push(currTarget);
		currTarget = worldData[getBlockerAt(monster.x, monster.y + 1)];
		if(currTarget && currTarget.type === 'player') targets.push(currTarget);
		currTarget = worldData[getBlockerAt(monster.x - 1, monster.y)];
		if(currTarget && currTarget.type === 'player') targets.push(currTarget);
		currTarget = worldData[getBlockerAt(monster.x + 1, monster.y)];
		if(currTarget && currTarget.type === 'player') targets.push(currTarget);

		if(targets.length > 0) {
			worldData[monster.id].timeOfLastAction = now + Math.floor(Math.random() * 20) - 10;

			var target = shuffle(targets)[0];

			var directionToFace;
			if(target.x > monster.x) directionToFace = 'right';
			if(target.x < monster.x) directionToFace = 'left';
			if(target.y < monster.y) directionToFace = 'up';
			if(target.y > monster.y) directionToFace = 'down';

			if(directionToFace) {
				var change = {
					id: monster.id,
					action: 'turn',
					direction: directionToFace
				};
				socket.emit('world', {
					type: 'object_updated',
					object: change
				});
				updateObjectInWorld(change);
			}

			continue;
		}
		targets = [];

		// 3. Check it there are any players within range;
		var maxRange = 3;

		var currentTarget;
		var currentTargetsRange = maxRange + 1;
		for(var i = -maxRange; i <= maxRange; i++) {
			for(var j = -maxRange; j <= maxRange; j++) {
				if(Math.abs(i) + Math.abs(j) <= maxRange) {
					// In range
					var target = worldData[ getBlockerAt(monster.x + i, monster.y + j)];

					if(target && target.type === 'player') {
						currentTargetsRange = Math.abs(i) + Math.abs(j);
						currentTarget = target;
					}
				}
			}
		}

		if(currentTarget) {
			var directions = [];
			if(currentTarget.x < monster.x && !getBlockerAt(monster.x - 1, monster.y)) directions.push('left');
			if(currentTarget.x > monster.x && !getBlockerAt(monster.x + 1, monster.y)) directions.push('right');
			if(currentTarget.y < monster.y && !getBlockerAt(monster.x, monster.y - 1)) directions.push('up');
			if(currentTarget.y > monster.y && !getBlockerAt(monster.x, monster.y + 1)) directions.push('down');

			if(directions.length > 0) {
				var direction = shuffle(directions)[0];

				var change = {
					id: monster.id,
					action: 'move',
					direction: direction
				};
				updateObjectInWorld(change);

				socket.emit('world', {
					type: 'object_updated',
					object: change
				});

				currentTarget = undefined;
				currentTargetsRange = maxRange + 1;

				continue;
			}
		}
	}
}, 200);

function addMessageToLog(log, message, isMine) {
	var p = document.createElement('p');
		p.classList.add('message');
		if(isMine) p.classList.add('mine');
		p.innerText = message;
		log.appendChild(p);
		log.scrollTop = log.scrollHeight;
}

function createNewObject(id, name, type, x, y, stats) {
	return {
		id: id,
		name: name,
		type: type,
		x: x,
		y: y,
		stats: stats
	};
}

function handleWorldUpdate(message) {
	switch(message.type) {
		case 'object_created':
			addObjectToWorld(message.object);
			break;

		case 'object_deleted':
			removeObjectFromWorld(message.id);
			break;

		case 'object_updated':
			updateObjectInWorld(message.object);
			break;
	}
}

function addObjectToWorld(object) {
	// Clear any existing object
	removeObjectFromWorld(object.id);

	worldData[object.id] = object;

	switch(object.type) {
		case 'player':
			worldView[object.id] = addNewPlayerView(object);
			addBlockerAt(object.x, object.y, object.id);
			players.push(object.id);
			break;

		case 'ground':
			worldView[object.id] = addNewGroundView(object);
			if(object.stats.type === 'wall') {
				addBlockerAt(object.x, object.y, object.id);
			}
			addGroundAt(object.x, object.y);
			break;

		case 'monster':
			worldView[object.id] = addNewMonsterView(object);
			addBlockerAt(object.x, object.y, object.id);
			monsters.push(object.id);
			object.timeOfLastAction = Date.now();
			break;

		case 'item':
			worldView[object.id] = addNewItemView(object);
			addBlockerAt(object.x, object.y, object.id);
			break;
	}
}

function removeObjectFromWorld(id) {
	var object = worldView[id];
	var data = worldData[id];

	if(object) {
		object.remove();
	}
	if(data) {
		removeBlockerFrom(data.x, data.y, id);

		switch(data.type) {
			case 'player':
				players.splice(players.indexOf(data.id), 1);
				break;

			case 'monster':
				monsters.splice(monsters.indexOf(data.id), 1);
				break;
		}
	}

	delete worldView[id];
	delete worldData[id];
}

function updateObjectInWorld(object) {
	var data = worldData[object.id];
	var objectView = worldView[object.id];

	if(data && objectView) {
		switch(object.action) {
			case 'move':
				removeBlockerFrom(data.x, data.y, data.id);

				if(object.direction === 'up') data.y--;
				else if(object.direction === 'down') data.y++;
				else if(object.direction === 'left') data.x--;
				else if(object.direction === 'right') data.x++;

				addBlockerAt(data.x, data.y, data.id);

				// Turn character
				data.stats.facing = object.direction;

				objectView.classList.remove('up');
				objectView.classList.remove('down');
				objectView.classList.remove('left');
				objectView.classList.remove('right');

				objectView.classList.add(data.stats.facing);

				if(data.type === 'monster') {
					data.timeOfLastAction = Date.now() + (Math.floor(Math.random() * 20) - 10);
				}
				break;

			case 'turn':
				data.stats.facing = object.direction;

				objectView.classList.remove('up');
				objectView.classList.remove('down');
				objectView.classList.remove('left');
				objectView.classList.remove('right');

				objectView.classList.add(data.stats.facing);

				if(data.type === 'monster') {
					// data.timeOfLastAction = Date.now() + (Math.floor(Math.random() * 20) - 10);
				}
				break;

			case 'attack':
				if(data.type === 'monster') {
					data.timeOfLastAction = Date.now() + (Math.floor(Math.random() * 20) - 10);
				}
				break;

			case 'damage':
				worldData[object.id].stats.hp -= object.amount;
				objectView.getElementsByClassName("name")[0].textContent = data.name + ' (' + data.stats.hp + '/' + data.stats.maxHp + ')';
				
				objectView.style['-webkit-filter'] = 'sepia() hue-rotate(-50deg) saturate(12)';
				setTimeout(function() {
					objectView.style['-webkit-filter'] = '';
				}, 50);
				break;

			case 'heal':
				worldData[object.id].stats.hp = Math.min(data.stats.hp + object.amount, data.stats.maxHp);
				objectView.getElementsByClassName("name")[0].textContent = data.name + ' (' + data.stats.hp + '/' + data.stats.maxHp + ')';
				
				objectView.style['-webkit-filter'] = 'sepia() hue-rotate(50deg) saturate(12)';
				setTimeout(function() {
					objectView.style['-webkit-filter'] = '';
				}, 50);
				break;
		}

		objectView.style.left = gamePositionXToPx(data.x);
		objectView.style.top = gamePositionYToPx(data.y);
	}
}

function addNewPlayerView(playerData) {
	var blob = document.createElement('div');
	blob.classList.add('player');
	blob.classList.add(playerData.stats.facing);
	blob.style.left = gamePositionXToPx(playerData.x);
	blob.style.top = gamePositionYToPx(playerData.y);
	blob.style.width = tileSize;
	blob.style.height = tileSize;
	game.appendChild(blob);

	var name = document.createElement('span');
	name.textContent = playerData.name + ' (' + playerData.stats.hp + '/' + playerData.stats.maxHp + ')';
	name.classList.add('name');
	name.style['margin-left'] = (-tileSize) + 'px';
	blob.appendChild(name);

	var icon = document.createElement('div');
	icon.classList.add('icon');
	blob.appendChild(icon);

	return blob;
}

function addNewGroundView(groundData) {
	var blob = document.createElement('div');
	blob.classList.add(groundData.stats.type);
	blob.style.left = gamePositionXToPx(groundData.x);
	blob.style.top = gamePositionYToPx(groundData.y);
	blob.style.width = tileSize;
	blob.style.height = tileSize;
	game.appendChild(blob);

	return blob;
}

function addNewMonsterView(mobData) {
	var blob = document.createElement('div');
	blob.classList.add('monster');
	blob.classList.add(mobData.stats.type);
	blob.classList.add(mobData.stats.facing);
	blob.style.left = gamePositionXToPx(mobData.x);
	blob.style.top = gamePositionYToPx(mobData.y);
	blob.style.width = tileSize;
	blob.style.height = tileSize;
	game.appendChild(blob);

	var name = document.createElement('span');
	name.textContent = mobData.stats.type + ' (' + mobData.stats.hp + '/' + mobData.stats.maxHp + ')';
	name.classList.add('name');
	name.style['margin-left'] = (-tileSize) + 'px';
	blob.appendChild(name);

	var icon = document.createElement('div');
	icon.classList.add('icon');
	blob.appendChild(icon);

	return blob;
}

function addNewItemView(itemData) {
	var blob = document.createElement('div');
	blob.classList.add('item');
	blob.classList.add(itemData.stats.item);
	blob.style.left = gamePositionXToPx(itemData.x);
	blob.style.top = gamePositionYToPx(itemData.y);
	blob.style.width = tileSize;
	blob.style.height = tileSize;
	game.appendChild(blob);

	var icon = document.createElement('div');
	icon.classList.add('icon');
	blob.appendChild(icon);

	return blob;
}

function handlePlayerAction(event) {
	var player = worldData[username];
	if(!player) return;

	var actionType;
	var change;
	switch(event.keyCode) {
		case 38: // Up
			if(!getBlockerAt(player.x, player.y - 1)) {
				change = {
					id: username,
					action: 'move',
					direction: 'up'
				};
			} else {
				change = {
					id: username,
					action: 'turn',
					direction: 'up'
				};
			}
			break; 

		case 40: // Down
			if(!getBlockerAt(player.x, player.y + 1)) {
				change = {
					id: username,
					action: 'move',
					direction: 'down'
				};
			} else {
				change = {
					id: username,
					action: 'turn',
					direction: 'down'
				};
			}
			break;

		case 37: // Left
			if(!getBlockerAt(player.x - 1, player.y)) {
				change = {
					id: username,
					action: 'move',
					direction: 'left'
				};
			} else {
				change = {
					id: username,
					action: 'turn',
					direction: 'left'
				};
			}
			break;

		case 39: // Right
			if(!getBlockerAt(player.x + 1, player.y)) {
				change = {
					id: username,
					action: 'move',
					direction: 'right'
				};
			} else {
				change = {
					id: username,
					action: 'turn',
					direction: 'right'
				};
			}
			break;

		case 32: // Space
			if(!attackLocked) {
				attackLocked = true;
				change = {
					id: username,
					action: 'attack',
					type: 'short'
				};

				setTimeout(function() {
					attackLocked = false;
				}, 500);
			}
			break;
	}
	if(change) {
		updateObjectInWorld(change);
		player = worldData[username];

		switch(change.action) {
			case 'move':
				// Spawn ground

				if(!isGroundAt(player.x + 1, player.y)) {
					// Spawn ground to the right
					spawnGround(player.x + 1, player.y);
				}

				if(!isGroundAt(player.x - 1, player.y)) {
					// Spawn ground to the left
					spawnGround(player.x - 1, player.y);
				}

				if(!isGroundAt(player.x, player.y + 1)) {
					// Spawn ground to the bottom
					spawnGround(player.x, player.y + 1);
				}

				if(!isGroundAt(player.x, player.y - 1)) {
					// Spawn ground to the top
					spawnGround(player.x, player.y - 1);
				}

				// Center player on screen
				var bounds = worldView[username].getBoundingClientRect();
				var gameBounds = game.getBoundingClientRect();
				var buffer = tileSize * 3.5;

				var verticalOffset = (bounds.top + tileSize * 0.5) - view.clientHeight * 0.5;
				if(verticalOffset > buffer) {
					game.style.top = (gameBounds.top - (verticalOffset - buffer)) + 'px';
				} else if(verticalOffset < -buffer) {
					game.style.top = (gameBounds.top - (verticalOffset + buffer)) + 'px';
				}

				var horizontalOffset = (bounds.left + tileSize * 0.5) - view.clientWidth * 0.5;
				if(horizontalOffset > buffer * 1.5) {
					game.style.left = (gameBounds.left - (horizontalOffset - buffer * 1.5)) + 'px';
				} else if(horizontalOffset < -buffer * 1.5) {
					game.style.left = (gameBounds.left - (horizontalOffset + buffer * 1.5)) + 'px';
				}
				break;

			case 'attack':
				// Find targets
				var targets = [];
				if(change.type === 'short') {
					if(player.stats.facing === 'up') {
						targets.push(worldData[getBlockerAt(player.x, player.y - 1)]);
					} else if(player.stats.facing === 'down') {
						targets.push(worldData[getBlockerAt(player.x, player.y + 1)]);
					} else if(player.stats.facing === 'left') {
						targets.push(worldData[getBlockerAt(player.x - 1, player.y)]);
					} else if(player.stats.facing === 'right') {
						targets.push(worldData[getBlockerAt(player.x + 1, player.y)]);
					}
				}

				// Hit targets
				for(var i in targets) {
					var target = targets[i];
					if(!target) continue;

					if(target.type === 'player' || target.type === 'monster') {
						var attack = {
							id: target.id,
							action: 'damage',
							amount: player.stats.attack
						};
						socket.emit('world', {
							type: 'object_updated',
							object: attack
						});

						updateObjectInWorld(attack);

						if(target.stats.hp <= 0) {
							removeObjectFromWorld(target.id);
							socket.emit('world', {
								type: 'object_deleted',
								id: target.id
							});
						}
					} else if(target.type === 'item') {
						var heal = {
							id: username,
							action: 'heal',
							amount: 5
						};
						socket.emit('world', {
							type: 'object_updated',
							object: heal
						});

						updateObjectInWorld(heal);

						removeObjectFromWorld(target.id);
						socket.emit('world', {
							type: 'object_deleted',
							id: target.id
						});
					}
				}

				// Play animation
				var animation = {
					id: username,
					action: 'attack'
				};
				socket.emit('world', {
					type: 'object_updated',
					object: animation
				});
				updateObjectInWorld(animation);

				break;
		}

		socket.emit('world', {
			type: 'object_updated',
			object: change
		});
	}
}

function spawnGround(x, y) {
	var probabilityOfWall = 0.12;
	var probInc = 0.09;
	if(isGroundAt(x + 1, y) && getBlockerAt(x + 1, y)) probabilityOfWall += probInc;
	if(isGroundAt(x - 1, y) && getBlockerAt(x - 1, y)) probabilityOfWall += probInc;
	if(isGroundAt(x, y + 1) && getBlockerAt(x, y + 1)) probabilityOfWall += probInc;
	if(isGroundAt(x, y - 1) && getBlockerAt(x, y - 1)) probabilityOfWall += probInc;

	if(isGroundAt(x - 1, y - 1) && getBlockerAt(x - 1, y - 1)) probabilityOfWall += probInc;
	if(isGroundAt(x + 1, y - 1) && getBlockerAt(x + 1, y - 1)) probabilityOfWall += probInc;
	if(isGroundAt(x - 1, y + 1) && getBlockerAt(x - 1, y + 1)) probabilityOfWall += probInc;
	if(isGroundAt(x + 1, y + 1) && getBlockerAt(x + 1, y + 1)) probabilityOfWall += probInc;

	var groundType = Math.random() < probabilityOfWall ? 'wall' : 'floor';
	var ground = createNewObject(
		'ground_' + x + '-' + y,
		groundType,
		'ground',
		x,
		y,
		{
			type: groundType
		}
	);
	socket.emit('world', {
		type: 'object_created',
		object: ground
	});
	addObjectToWorld(ground);
	addGroundAt(x, y);

	// Spawn things
	if(groundType === 'floor') {

		var shouldSpawnMob = Math.random() < 0.04;
		var shouldSpawnPotion = Math.random() < 0.03;

		if(shouldSpawnMob) {
			var mob = createNewObject(
				'skeleton_' + Math.floor(Math.random() * 100),
				'Skeleton',
				'monster',
				x,
				y,
				{
					type: 'Skeleton',
					facing: 'down',
					maxHp: 3,
					hp: 3,
					attack: 1
				}
			);
			socket.emit('world', {
				type: 'object_created',
				object: mob
			});
			addObjectToWorld(mob);
		} else if(shouldSpawnPotion){
			var potion = createNewObject(
				'item_' + Math.floor(Math.random() * 100),
				'Potion',
				'item',
				x,
				y,
				{
					item: 'potion',
				}
			);
			socket.emit('world', {
				type: 'object_created',
				object: potion
			});
			addObjectToWorld(potion);
		}
	}
}

/**
 * Spatial functions
 */
function getBlockerAt(x, y) {
	var object;

	var col = blockers[x];
	if(col) {
		object = col[y];
	}

	return object;
}

function addBlockerAt(x, y, id) {
	var col = blockers[x];
	if(!col) {
		blockers[x] = col = [];
	}

	col[y] = id;
}

function removeBlockerFrom(x, y, id) {
	var col = blockers[x];
	if(col) {
		delete col[y];
	}
}

function isGroundAt(x, y) {
	var isGround = false;

	var col = ground[x];
	if(col) {
		isGround = col[y];
	}

	return isGround;
}

function addGroundAt(x, y) {
	var col = ground[x];
	if(!col) {
		ground[x] = col = [];
	}

	if(!col[y]) {
		col[y] = true;
	}
}

/**
 * Utility functions
 */
function gamePositionXToPx(position) {
	return (position * tileSize + game.clientWidth * 0.5) - (tileSize * 0.5);
}

function gamePositionYToPx(position) {
	return (position * tileSize + game.clientHeight * 0.5) - (tileSize * 0.5);
}

function shuffle(array) {
    let counter = array.length;

    // While there are elements in the array
    while (counter > 0) {
        // Pick a random index
        let index = Math.floor(Math.random() * counter);

        // Decrease counter by 1
        counter--;

        // And swap the last element with it
        let temp = array[counter];
        array[counter] = array[index];
        array[index] = temp;
    }

    return array;
}