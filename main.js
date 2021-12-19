// imports
const mc = require("minecraft-protocol"); // to handle minecraft login session
const opn = require("opn"); //to open a browser window
const secrets = require("./secrets.json"); // read the creds
const config = require("./config.json"); // read the config

var StartArgs = process.argv.slice(2);
console.log('StartArgs: ', StartArgs);

// lets
let proxyClient; // a reference to the client that is the actual minecraft game
let client; // the client to connect to 2b2t
let server; // the minecraft server to pass tjpackets
let reconnectIntervalObj; // self explanatory
var currentSession; //Let's save the session to avoid re-authing every time we try to reconnect.
var chunk = [];
var lastPos;
startServer()
// function to disconnect from the server
function stop() {
	client.end(); // disconnect
	if (proxyClient) {
		proxyClient.end("Stopped the proxy."); // boot the player from the server
	}
	server.close(); // close the server
}

function sendAntiafkMessage(client) {
	sendRespawnMsg(client);
	filterPacketAndSend(
		{ message: '{"text":">"}', position: 1 },
		{ name: "chat" },
		client
	);
	console.log("antiafk-chat");
}
function sendRespawnMsg(client) {
	filterPacketAndSend(
		{ message: "{ actionId: 0 }", position: 1 },
		{ name: "client_command" },
		client
	);
}
function reconnect() {
	console.log("Trying to reconnect");
	if (proxyClient) {
		proxyClient.end("Stopped the proxy."); // boot the player from the server
	}
	server.close(); // close the server
	startQueuing();
}
function QueueReconnect() {
	clearInterval(reconnectIntervalObj);
	reconnectIntervalObj = null;

	reconnectIntervalObj = setTimeout(reconnect, 100); // reconnect after 100 ms
}

function startServer(){
	console.log("Server Started");
	server = mc.createServer({
		// create a server for us to connect to
		"online-mode": false,
		encryption: true,
		host: config.debug.bindip,
		port: config.ports.minecraft,
		version: config.MCversion,
		"max-players": (maxPlayers = 1),
	});

	server.on("login", (newProxyClient) => {
		// handle login
		startQueuing();
		tjreset();

		newProxyClient.on("packet", (data, meta) => {
			// redirect everything we do to 2b2t (except internal commands)
			let chatMessage = "NONCHAT";
			if (meta.name === "chat") {
				chatMessage = data.message;
			}
			doAll(data,meta,chatMessage,proxyClient,newProxyClient);
			var packet = modifyPacketToTryJump(data,meta);
			if(packet==false)return;
			if(packet)
			{
				data = packet.data;
				meta = packet.meta;
			}
			if(!commandexecuted)
			{
				try{
				filterPacketAndSend(data, meta, client);}catch{}
			}
			
		});

		proxyClient = newProxyClient;
	});
	server.on("disconnect", (newProxyClient) => {
		stop()
	})
}
var clientconnected = false;
// function to start the whole thing
function startQueuing() {
	clientconnected = false;
	console.log("Queuing Started");
	var playerId;
	if(secrets.online_mode){
		client = mc.createClient({
			// connect to 2b2t
			host: config.debug.serverip,
			port: config.debug.serverport,
			username: secrets.username,
			password: secrets.password,
			version: config.MCversion,
			session: currentSession,
		});
	}else{
		client = mc.createClient({
			// connect to 2b2t
			host: config.debug.serverip,
			port: config.debug.serverport,
			username: secrets.username,
			version: config.MCversion,
			session: currentSession,
			uuid: "a1a3fef2-3187-473a-8601-ce07d47d3623"
		});
	}
	
	let finishedQueue = false;
	client.on("session", (ses) => {
		currentSession = ses;
		//console.log('session set',ses);
	});
	chunk = []; //let's reset the saved chunkdata when we start queuing.
	client.on("packet", (data, meta) => {
		// each time 2b2t sends a packet
		try {
			if(!"position look position_look keep_alive update_time map_chunk entity_head_rotation sound_effect rel_entity_move".includes(meta.name)){
				//console.log([meta.name,data]);
				
			}
			if (!proxyClient || proxyClient.ended) {
				if(clientconnected){
					console.log("Client Disconnected");
					stop();
				}
				clientconnected = false;
			} else {
				clientconnected = true;
				
				// if we are connected to the proxy, forward the packet we recieved to our game.
				filterPacketAndSend(data, meta, proxyClient);
			}
		} catch (error) {
			console.log(error);
			QueueReconnect();
		}
	});
	// set up actions in case we get disconnected.
	client.on("end", (err) => {
		console.log("end", err);
		//QueueReconnect();
	});

	client.on("error", (err) => {
		console.log("error", err);
		QueueReconnect();
	});


}

//function to filter out some tjpackets that would make us disconnect otherwise.
//this is where you could filter out tjpackets with sign data to prevent chunk bans.
function filterPacketAndSend(data, meta, dest) {
	if (meta.name != "keep_alive" && meta.name != "update_time"&& meta.state != "login") {
		//keep alive tjpackets are handled by the client we created, so if we were to forward them, the minecraft client would respond too and the server would kick us for responding twice.
		dest.write(meta.name, data);
	}
}
//startQueuing(); //Let's start instantly

var commandexecuted = false;
var properexecuted = false;

function doAll(data,meta,message){
    commandexecuted = false;
    doUPX(data,meta,message);
    return commandexecuted;
}

function doUPX(data,meta,message){
    if(message.startsWith("/upx")){
        commandexecuted = true;
        chunkscmd(data,meta,message);
        clearchunkscmd(data,meta,message);
        reconnectcmd(data,meta,message);
		tryjumpcmd(data,meta,message);
    }
}

function chunkscmd(data,meta,message){
    if(message.startsWith("/upx chunks")){
        if (chunk.length >= 1) {
            chunk.forEach(function (element) {
                 filterPacketAndSend(
                    element[0],
                    element[1],
                    new  proxyClient
                );
                 filterPacketAndSend(
                    {
                        message:
                            '{"text":"2b2w: okily-dokily"}',
                        position: 1,
                    },
                    { name: "chat" },
                      proxyClient
                );
            });
        } else {
             filterPacketAndSend(
                {
                    message:
                        '{"text":"2b2w: I have no chunks"}',
                    position: 1,
                },
                { name: "chat" },
                  proxyClient
            );
        }
        properexecuted = true;
    }
} 
function clearchunkscmd(data,meta,message){
    if (message.startsWith("/upx clearchunks")) {
        chunk = [];
         filterPacketAndSend(
            {
                message: '{"text":"UPX: cleared chunk cache"}',
                position: 1,
            },
            { name: "chat" },
              proxyClient
        );
    }
}
function reconnectcmd(data,meta,message){
    if (message.startsWith("/upx reconnect")) {
         filterPacketAndSend(
            {
                message: '{"text":"UPX: reconnecting"}',
                position: 1,
            },
            { name: "chat" },
              proxyClient
        );
        client.end();
    }
}
function tryjumpcmd(data,meta,message){
    if (message.startsWith("/upx tryjump start")) {
		if(tjexecuting){
			filterPacketAndSend(
				{
					message: '{"text":"UPX: ERROR: TryJump is already executing"}',
					position: 1,
				},
				{ name: "chat" },
				  proxyClient
			);
			return;
		}
         filterPacketAndSend(
            {
                message: '{"text":"UPX: Position sending paused"}',
                position: 1,
            },
            { name: "chat" },
              proxyClient
        );
		 tjstart();
    }
    if (message.startsWith("/upx tryjump reset")) {
		if(tjexecuting){
			filterPacketAndSend(
				{
					message: '{"text":"UPX: TryJump is already executing - Executing aborted!"}',
					position: 1,
				},
				{ name: "chat" },
				  proxyClient
			);
			tjexecutingabort = true;
			return;
		}
         filterPacketAndSend(
            {
                message: '{"text":"UPX: Position sending resumed"}',
                position: 1,
            },
            { name: "chat" },
              proxyClient
        );
		 tjresetwithtp();
    }
    if (message.startsWith("/upx tryjump do")) {
		if(tjexecuting){
			filterPacketAndSend(
				{
					message: '{"text":"UPX: ERROR: TryJump is already executing"}',
					position: 1,
				},
				{ name: "chat" },
				  proxyClient
			);
			return;
		}
        filterPacketAndSend(
            {
                message: '{"text":"UPX: Positions sent"}',
                position: 1,
            },
            { name: "chat" },
             proxyClient
        );
         tjexecute();
    }
    if (message.startsWith("/upx tryjump")) {
        filterPacketAndSend(
            {
                message: `{"text":"UPX: Tryjump is ${isTryjump}"}`,
                position: 1,
            },
            { name: "chat" },
             proxyClient
        );
    }
}
var isTryjump = false;
var tjpackets = [];
var tjstartts  = -1;
var tjexecuting = false;
var tjexecutingabort = false;
var tjlastposlook;

function tjpushPacket(data,meta){
	data =JSON.parse(JSON.stringify(data))
	meta =JSON.parse(JSON.stringify(meta))
    var tsnow = Math.round(new Date().getTime());
    if(tjstartts <0)tjstartts  = tsnow;
    var lastts = tsnow;
    if(tjpackets.length>0){
        lastts = tjpackets[tjpackets.length-1].tsnow;
    }
	var tsdiff = tsnow - lastts;
	var packet = {data:{data:data,meta:meta},ts:tsdiff,tsnow:tsnow};
	tjpackets.push(packet);
}
function tjstart(){
    tjpackets = [{}];
    tjstartts  = -1;
    isTryjump = true;
}
function tjresetwithtp(){
    tjpackets = [{}];
    tjstartts  = -1;
	isTryjump = false;
	proxyClient.write("position", {
		x: tjlastposlook.x,
		y: tjlastposlook.y,
		z: tjlastposlook.z,
		yaw: tjlastposlook.yaw,
		pitch: tjlastposlook.pitch,
		flags: 0x00,
	});
}
function tjreset(){
    tjpackets = [{}];
    tjstartts  = -1;
	isTryjump = false;
}
function tjexecute(){
    if(!tjexecuting)
    tjexecuteAsync();
}
async function tjexecuteAsync(){
	if(tjexecuting)return;
	tjexecuting = true;
    for (let index = 0; index < tjpackets.length; index++) {
		if(tjexecutingabort){tjexecutingabort = false; tjexecuting = false;tjreset();return;}
		const element = tjpackets[index];
		if(element.data&&element.ts){
		await sleep(element.ts);
		var packet = {data:element.data.data,meta:element.data.meta};
		filterPacketAndSend(packet.data,packet.meta,client);}
		if(packet&&packet.data.x){
			proxyClient.write("position", {
				x: packet.data.x,
				y: packet.data.y,
				z: packet.data.z,
				yaw:0,pitch:0,
				flags: 0x18,
			});
		}
		if(packet&&packet.data.yaw){
			proxyClient.write("position", {
				x:0,y:0,z:0,
				yaw: packet.data.yaw,
				pitch: packet.data.pitch,
				flags: 0x07,
			});
		}
		
    }
    tjexecuting = false;
    tjreset();
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function modifyPacketToTryJump(data,meta){
	if(tjexecuting)return false;
	if(isTryjump){
		if(meta.name === "position"||meta.name === "look"||meta.name === "position_look"||meta.name==="entity_action"){
			tjpushPacket(data,meta);
		}
		if(meta.name=="entity_action"){
			return false;
		}
		if (meta.name === "position") {
			data.x = tjlastposlook.x;
			data.y = tjlastposlook.y;
			data.z = tjlastposlook.z;
			data.onGround = tjlastposlook.onGround;
		}
		if (meta.name === "look") {
			data.pitch = tjlastposlook.pitch;
			data.yaw = tjlastposlook.yaw;
		}
		if (meta.name === "position_look") {
			data.x = tjlastposlook.x;
			data.y = tjlastposlook.y;
			data.z = tjlastposlook.z;
			data.onGround = tjlastposlook.onGround;
			data.pitch = tjlastposlook.pitch;
			data.yaw = tjlastposlook.yaw;
		}
		return {data:data,meta:meta}
	}
	if(!tjlastposlook)tjlastposlook = {};
	if(meta.name === "position_look"){
		tjlastposlook = data;
	}
	if(meta.name === "position"){
		tjlastposlook.x = data.x;
		tjlastposlook.y = data.y;
		tjlastposlook.z = data.z;
	}
	if(meta.name === "look"){
		tjlastposlook.pitch = data.pitch;
		tjlastposlook.yaw  = data.yaw;
	}
	
	return;
	
}