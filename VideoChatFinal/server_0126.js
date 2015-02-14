// We need to use the express framework: have a real web server that knows how to send mime types etc.  
var express=require('express');  
var MongoClient = require('mongodb').MongoClient;
var path = require('path');
var fs = require('fs');
var multer  = require('multer');

var uploadFilename = "";
// Init globals variables for each module required  
var app = express()  
  , http = require('http')  
  , server = http.createServer(app)  
  , io = require('socket.io').listen(server);  
  
// Indicate where static files are located    
app.use(express.static(__dirname + '/'));
 
app.use(multer({ dest: './uploads/',
	 rename: function (fieldname, filename) {
	    return Date.now()+filename;
	  },
	onFileUploadStart: function (file) {
		uploadFilename = Date.now()+file.originalname;
	  console.log(file.originalname + ' is starting ...')
	},
	onFileUploadComplete: function (file) {
	  console.log(file.fieldname + ' uploaded to  ' + file.path)
	  done=true;
	}
	}));


// routing  
app.get('/chat', function (req, res) {  
  res.sendfile(__dirname + '/index.html');  
});  
//launch the http server on given port  
server.listen(2013);  


app.post('/uploadfile',function(req,res){
	  if(done==true){
		console.log(req.files);
	    console.log(req.body.submit);
	    res.end("File uploaded.");
	  }
	  var old_path = "./uploads/"+uploadFilename;
	  var target_path = './uploads/' + req.body.submit+"/"+uploadFilename;
	  // move the file from the temporary location to the intended location
	  fs.rename(old_path, target_path, function(err) {
	      if (err) throw err;
	      // delete the temporary file, so that the explicitly set temporary upload dir does not get filled with unwanted files
	      fs.unlink(old_path, function() {
	          if (err) throw err;
	          //res.send('File uploaded to: ' + target_path + ' - ' + req.files.thumbnail.size + ' bytes');
	      });
	  });
});

//var rooms = [{roomname:"room1",creator:"tlf",key:"123456",maxspace:"3",userlist:[{username:"tlf"},{username:"user2"},{username:"user3"}]},{id:"1001",roomname:"room2",creator:"njc",key:"123456",maxspace:"20",userlist:[{username:"njc"}]}];
var rooms = [];
var done=false;
var fromIndex = true;

var allClients = [];

function populate(roomData){

	MongoClient.connect('mongodb://127.0.0.1:27017/testRooms', function (err,
	        db) {
	        if (err) {
	            throw err;
	        }
	        
	        var collection = db.collection('rooms');     
	        //collection.drop();// first drop the existing collection
	        collection.insert(roomData, function (err, docs) {
	                    if (err) {
	                        throw err;
	                    }
	                    // everything inserted correctly into the database it seems
	                    console.info('finished populating db with rooms');
	                    console.info('should have inserted %d elements into db',
	                        docs.length);
	                    // now that data has been inserted, let's shut it down
	                    db.close();
	        		});
	});
}

function updateUserList(rname, uname){
	console.log('updateuserlist');
	MongoClient.connect('mongodb://127.0.0.1:27017/testRooms', function (err,
	        db) {
	        if (err) {
	            throw err;
	        }
	        
	        var collection = db.collection('rooms');  
	        var roomInfo = {};
	        var ulist = [];
	        collection.find({'roomname':rname}).toArray(function(err, data) {
	        	if(err){
	        		console.log(err);
	        	}else{
	        		ulist = data[0].userlist;
		        	ulist.push({'username':uname});
		        	roomInfo = {roomname:rname,creator:data[0].creator,key:data[0].key,maxspace:data[0].maxspace,userlist:ulist}
		        	collection.remove({'roomname':rname},function(err, removed){
			            console.log(removed);
			            db.close();
			        });
		        	//console.log("haha"+roomInfo.roomname+" "+roomInfo.creator+" "+roomInfo.key+" "+roomInfo.maxspace+" "+roomInfo.userlist);
		        	populate(roomInfo);
	        	}
	        });
	           
	});
	
}

function deleteUserFromList(rname, uname){
	MongoClient.connect('mongodb://127.0.0.1:27017/testRooms', function (err,
	        db) {
	        if (err) {
	            throw err;
	        }
	        
	        var collection = db.collection('rooms');  
	        var roomInfo = {};
	        var ulist = [];
	        collection.find({'roomname':rname}).toArray(function(err, data) {
	        	if(err){
	        		console.log(err);
	        	}else{
	        		ulist = data[0].userlist;
	        		console.log("hah a"+ulist.length);
	        		for(var i=0; i<ulist.length; i++) {
	        		    if(ulist[i].username === uname) {
	        		    	console.log("haha"+ulist[i].username);
	        		       ulist.splice(i, 1);
	        		       
	        		    }
	        		}
	        		
		        	roomInfo = {roomname:rname,creator:data[0].creator,key:data[0].key,maxspace:data[0].maxspace,userlist:ulist}
		        	collection.remove({'roomname':rname},function(err, removed){
			            console.log(removed);
			            db.close();
			        });
		        	//console.log("haha"+roomInfo.roomname+" "+roomInfo.creator+" "+roomInfo.key+" "+roomInfo.maxspace+" "+roomInfo.userlist);
		        	populate(roomInfo);	
		        	
	        	}
	        });
	           
	});
	
}


function getRoomInfo(){

	MongoClient.connect('mongodb://127.0.0.1:27017/testRooms', function (err,
	        db) {
	        if (err) {
	            throw err;
	        }
	        var collection = db.collection('rooms');     
	        collection.find().toArray(function(err, data) {
	        	rooms = [];
                for(var i = 0; i<data.length; i++){
                	var ulist = [];
                	var room = {roomname:data[i].roomname,creator:data[i].creator,key:data[i].key,maxspace:data[i].maxspace,userlist:data[i].userlist}
                	rooms.push(room);
                }
	        });
	        //db.close();
	        
	});
}

io.sockets.on('connection', function (socket){
	if(rooms.length === 0){
	getRoomInfo();}
	// Permet d'envoyer des traces au client distant
	function log(){
		var array = [">>> "];
	  for (var i = 0; i < arguments.length; i++) {
	  	array.push(arguments[i]);
	  }
	    socket.emit('log', array);
	}
	
	socket.on('entered', function() {
		log(rooms);
		socket.emit('inforooms', rooms);
		io.sockets.emit('inforooms', rooms);


	});

	socket.on('adduser', function(username){
		socket.username = username;
		socket.roomname = "";
		socket.emit('inforooms', rooms);
		
		allClients.push(socket);

	});

	socket.on('message', function (message) {
		log('Got message: ', message);
		socket.broadcast.to(message[message.length-1]).emit('message', message); // should be room only
	});

	/*socket.on('create or join', function (room) {
		var numClients = io.sockets.clients(room).length;

		log('Room ' + room + ' has ' + numClients + ' client(s)');
		log('Request to create or join room', room);

		if (numClients == 0){
			socket.join(room);
			socket.emit('created', room);
		} else if (numClients == 1) {
			io.sockets.in(room).emit('join', room);
			socket.join(room);
			socket.emit('joined', room);
		} else { // max two clients
			socket.emit('full', room);
		}
		//socket.emit('emit(): client ' + socket.id + ' joined room ' + room);
		//socket.broadcast.emit('broadcast(): client ' + socket.id + ' joined room ' + room);

	});*/
	socket.on('create or join', function (room) {
		//fromIndex=false;
		var numClients = io.sockets.clients(room).length;

		log('Room ' + room + ' has ' + numClients + ' client(s)');
		log('Request to create or join room', room);

		if (numClients <= 4) {

			for(var i=0; i<rooms.length; i++)
				if(room === rooms[i].roomname)
					socket.emit('updateuserlist', rooms[i].userlist);
			io.sockets.in(room).emit('join', room, numClients);
			socket.join(room);
			socket.emit('joined', room, numClients);
		}

		 else { // max two clients
			socket.emit('full', room);
		}
		//socket.emit('emit(): client ' + socket.id + ' joined room ' + room);
		//socket.broadcast.emit('broadcast(): client ' + socket.id + ' joined room ' + room);

	});
	
	
	socket.on('enterRoom', function(rname, uname) {
		console.log("enterroom");
		
		//si l'utilisateur est déjà dans une autre salle il faut supprimer
		var index = allClients.indexOf(socket);
		var ancienRoom = allClients[index].roomname;
		if(allClients[index].roomname != ""){
			for(var i=0; i<rooms.length; i++){
    			if(ancienRoom === rooms[i].roomname){
    				for(var j = 0; j<rooms[i].userlist.length; j++){
    					if(rooms[i].userlist[j].username === uname) {
    						rooms[i].userlist.splice(j, 1);
    					}
    				}
    				socket.leave(ancienRoom);
    				io.sockets.to(ancienRoom).emit('updateuserlist', rooms[i].userlist);
    				for(var j =0; j<rooms[i].userlist.length;j++){
    					console.log(rooms[i].userlist[j]);
    				}
    				deleteUserFromList(ancienRoom, uname);
    			}
    		}	
		}
		
		for(var i=0; i<rooms.length; i++){
			if(rname === rooms[i].roomname){
				rooms[i].userlist.push({username:uname});
				socket.join(rname);
				//socket.broadcast.to(rname).emit('updateuserlist', rooms[i].userlist);
				io.sockets.in(rname).emit('updateuserlist', rooms[i].userlist);
				for(var j =0; j<rooms[i].userlist.length;j++){
					console.log(rooms[i].userlist[j]);
				}
				
				updateUserList(rname, uname);
				var index = allClients.indexOf(socket);
				allClients[index].roomname = rname;
			}
		}
		
		//envoyer file list
		var path = './uploads/'+rname+'/';
		var fileList = [];
		fs.readdir(path, function (err, files) {
		  if(err) throw err;
		  files.forEach(function(file) {
		    console.log(path+file);
		    fileList.push({filename:file});
		  });
		  
		  console.log("haha"+fileList.length);
			socket.emit("updateFileList",fileList);
		});
		
		
		
		//lancer la vidéo
		
		
		//log
		var logLine = uname+" est connecté à la salle "+rname+" à "+ new Date()+"\r\n";
		fs.appendFile('./uploads/log.txt', logLine, function (err) {
			  if (err) throw err;
			  console.log('It\'s saved!');
			}); // => message.txt erased, contains only 'Hello Node'
	
	});

socket.on('refreshFileList',function(rname){
		console.log("refresh file list"+rname);
		
		var path = './uploads/'+rname+'/';
		var fileList = [];
		fs.readdir(path, function (err, files) {
		  if(err) throw err;
		  files.forEach(function(file) {
		    console.log(path+file);
		    fileList.push({filename:file});
		  });
		  
		  console.log("haha"+fileList.length);
			socket.emit("updateFileList",fileList);
		});

	});
	
	socket.on('createRoom', function(rname, rcode, uname){
		console.log("createing room");
		
		var roomPath = "./uploads/"+rname;
		fs.mkdir(roomPath, 0777, function(err) {
			  if(err) throw err;
			  console.log('Created newdir');
		});

		var room = {roomname:rname,creator:uname,key:rcode,maxspace:10,userlist:[]}
		populate(room);
		
		rooms.push({roomname:rname,creator:uname,key:rcode,maxspace:10,userlist:[]});
		io.sockets.emit('inforooms', rooms);
		
		var logLine = uname+" a crée une salle "+rname+" à "+ new Date()+"\r\n";
		fs.appendFile('./uploads/log.txt', logLine, function (err) {
			  if (err) throw err;
			  console.log('It\'s saved!');
			}); // => message.txt erased, contains only 'Hello Node'
	});
	
	
	
	socket.on('sendLocation',function(myLocationLat, myLocationLon, rname){
		console.log("new location");
		socket.broadcast.to(rname).emit("newLocation", myLocationLat, myLocationLon);

	});
	
	
    socket.on('disconnect', function() {
    	if (!fromIndex) {
    	try{
        var index = allClients.indexOf(socket);
        console.log(allClients[index].username+' Got disconnect!'+ allClients[index].roomname );
        
        var rname = allClients[index].roomname;
        var uname = allClients[index].username;
        
        var logLine = uname+" a quitté la salle "+rname+" à "+ new Date()+"\r\n";
		fs.appendFile('./uploads/log.txt', logLine, function (err) {
			  if (err) throw err;
			  console.log('It\'s saved!');
			}); // => message.txt erased, contains only 'Hello Node'
        
        //si l'utilisateur n'est  entré dans aucune salle, ne faut pas supprimer son nom dans la base de donée
        if(allClients[index].roomname != ""){
        	for(var i=0; i<rooms.length; i++){
    			if(rname === rooms[i].roomname){
    				for(var j = 0; j<rooms[i].userlist.length; j++){
    					if(rooms[i].userlist[j].username === uname) {
    						rooms[i].userlist.splice(j, 1);
    					}
    				}
    				socket.leave(rname);

    				//socket.broadcast.to(rname).emit('updateuserlist', rooms[i].userlist);
    				io.sockets.to(rname).emit('updateuserlist', rooms[i].userlist);
    				for(var j =0; j<rooms[i].userlist.length;j++){
    					console.log(rooms[i].userlist[j]);
    				}
    				deleteUserFromList(allClients[index].roomname, allClients[index].username);
    				//updateUserList(rname, uname);
    			}
    		}	
        }
        delete allClients[index]; }
    	catch(err){
    		console.log("error: "+err );
    	}
    	}
     });
    
    socket.on('sendchat',function(msg, currentRoom){
    	console.log("send messags");
    	io.sockets.to(currentRoom).emit("newMsg",msg);
    });

});



