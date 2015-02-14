'use strict';

var sendChannel = new Array(10);
//var sendButton = document.getElementById("sendButton");
//var sendTextarea = document.getElementById("dataChannelSend");
//var receiveTextarea = document.getElementById("dataChannelReceive");

/*sendButton.onclick =  function sendData() {
              var data = sendTextarea.value;
              sendChannel[fromId].send(data);
              trace('Sent data: ' + data);
            };
*/

var isChannelReady = new Array(10);
var isInitiator;
var isStarted = new Array(10);
var localStream;
var pc = new Array(10);
var numClients;
var myId;
//var remoteStream;
var turnReady;
var divRemoteVideo;
var toId;
var params = getQueryParams(document.location.search) 
var room = params.room;
var username = params.username;
var localVideo = document.querySelector('#localVideo');
var remoteVideo = new Array();
remoteVideo[0] = document.querySelector('#remoteVideo0');
remoteVideo[1] = document.querySelector('#remoteVideo1');
remoteVideo[2] = document.querySelector('#remoteVideo2');
remoteVideo[3] = document.querySelector('#remoteVideo3');
remoteVideo[4] = document.querySelector('#remoteVideo4');
remoteVideo[5] = document.querySelector('#remoteVideo5');

// Configuration des serveurs stun...
var pc_config = webrtcDetectedBrowser === 'firefox' ?
  {'iceServers':[{'url':'stun:23.21.150.121'}]} : // number IP
  {'iceServers': [{'url': 'stun:stun.l.google.com:19302'}]};

// Peer connection constraints
var pc_constraints = {
  'optional': [
    {'DtlsSrtpKeyAgreement': true},
    {'RtpDataChannels': true}
  ]};

// Set up audio and video regardless of what devices are present.
var sdpConstraints = {'mandatory': {
  'OfferToReceiveAudio':true,
  'OfferToReceiveVideo':true }};

/////////////////////////////////////////////


// Demande de connexion au serveur de sockets. Si on regarde le code du
// server dans server.js on verra que si on est le premier client connecté
// on recevra un message "created", sinon un message "joined"
var socket = io.connect();

if (room !== '') {
  console.log('Create or join room', room);
  socket.emit('create or join', room);
}

// Si on reçoit le message "created" alors on est l'initiateur du call


// On a essayé de rejoindre une salle qui est déjà pleine (avec deux personnes)
socket.on('full', function (room){
  console.log('Room ' + room + ' is full');
});

// Jamais appelé, à mon avis une trace de la version nxn
socket.on('join', function (room, idClientEntered){
  console.log('Another peer made a request to join room ' + room);
  console.log('This peer is the initiator of room ' + room + '!');
  isChannelReady[idClientEntered] = true;
  numClients = idClientEntered+1;
});

// Si on reçoit le message "joined" alors on a rejoint une salle existante
// on est pas l'initiateur, il y a déjà quelqu'un (l'appelant), donc
// on est prêt à communiquer...
socket.on('joined', function (room, idClientEntered){
  console.log(Date()+'This peer has joined room ' + room);
  for (var i=0; i <= idClientEntered; i++)
    isChannelReady[i] = true;
  numClients = idClientEntered+1;
    myId = idClientEntered;
	localVideo = document.querySelector('#remoteVideo'+myId);
});

// Appelé par le serveur pour faire des traces chez les clients connectés
socket.on('log', function (array){
  console.log.apply(console, array);
});

function getQueryParams(qs) {
    qs = qs.split("+").join(" ");

    var params = {}, tokens,
        re = /[?&]?([^=]+)=([^&]*)/g;

    while (tokens = re.exec(qs)) {
        params[decodeURIComponent(tokens[1])]
            = decodeURIComponent(tokens[2]);
    }

    return params;
}
////////////////////////////////////////////////

// Envoi de message générique, le serveur broadcaste à tout le monde
// par défaut (ce sevrait être que dans la salle courante...)
// Il est important de regarder dans le code de ce fichier quand on envoit
// des messages.
function sendMessage(message){
  message.push(room);
  console.log(Date()+'Sending message: ', message);
  socket.emit('message', message);
}

// Récépeiton de message générique.
socket.on('message', function (message){
  console.log(Date()+'Received message:', message);

  if (message.constructor === Array) {
    var valueMessage = message[0];
	var fromId = message[1];
    if (message.length == 4)
      var toId=message[2];
  } else
      var valueMessage = message;

  if (valueMessage === 'got user media') {
    // On ouvre peut-être la connexion p2p
    maybeStart(fromId);
  } else if (valueMessage.type === 'offer' && toId == myId) {
    isInitiator=isInit(myId,fromId);
    console.log(Date()+"entrou na offer");
    if (!isInitiator && !isStarted[fromId]) {
      // on a recu une "offre" on ouvre peut être la connexion so on
      // est pas appelant et si on ne l'a pas déjà ouverte...
      maybeStart(fromId);
    }

    // si on reçoit une offre, on va initialiser dans la connexion p2p
    // la "remote Description", avec le message envoyé par l'autre pair 
    // (et recu ici)
    pc[fromId].setRemoteDescription(new RTCSessionDescription(valueMessage));

    // On envoie une réponse à l'offre.
    doAnswer(fromId);
  } else if (valueMessage.type === 'answer' && isStarted[fromId] && toId == myId) {
    console.log(Date()+'recebeu answer');
    // On a reçu une réponse à l'offre envoyée, on initialise la 
    // "remote description" du pair.
    pc[fromId].setRemoteDescription(new RTCSessionDescription(valueMessage));
  } else if (valueMessage.type === 'candidate' && isStarted[fromId]) {
    // On a recu un "ice candidate" et la connexion p2p est déjà ouverte
    // On ajoute cette candidature à la connexion p2p. 
    var candidate = new RTCIceCandidate({sdpMLineIndex:valueMessage.label,
      candidate:valueMessage.candidate});
    console.log("fromId = "+fromId);
    pc[fromId].addIceCandidate(candidate);
  } else if (valueMessage === 'bye' && isStarted[fromId]) {
    handleRemoteHangup(fromId);
  }
});

function handleUserMedia(stream) {
  localStream = stream;
  attachMediaStream(localVideo, stream);
  console.log(Date()+'Adding local stream.');

  // On envoie un message à tout le monde disant qu'on a bien
  // overt la connexion video avec la web cam.
  var data = ['got user media', myId];
  sendMessage(data);

  // Si on est l'appelant on essaie d'ouvrir la connexion p2p

  if (isInitiator && numClients > 1) {
    maybeStart();
  }
}

function handleUserMediaError(error){
  console.log(Date()+'getUserMedia error: ', error);
}

var constraints = {
            video: true};

getUserMedia(constraints, handleUserMedia, handleUserMediaError);
console.log(Date()+'Getting user media with constraints', constraints);

// On regarde si on a besoin d'un serveur TURN que si on est pas en localhost
if (location.hostname != "localhost") {
  requestTurn('https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913');
}

// On démarre peut être l'appel (si on est appelant) que quand on a toutes les 
// conditons. Si on est l'appelé on n'ouvre que la connexion p2p   
// isChannelReady = les deux pairs sont dans la même salle virtuelle
//                  via websockets
// localStream = on a bien accès à la caméra localement,
// !isStarted = on a pas déjà démarré la connexion.
// En résumé : on établit la connexion p2p que si on a la caméra et les deux
// pairs dans la même salle virtuelle via WebSockets (donc on peut communiquer
// via WebSockets par sendMessage()...)
function maybeStart(fromId) {
  console.log(Date()+"entrou maybestart");
  if (!isStarted[fromId] && localStream && isChannelReady[fromId]) {
    // Ouverture de la connexion p2p
    createPeerConnection(fromId);
    // on donne le flux video local à la connexion p2p. Va provoquer un événement 
    // onAddStream chez l'autre pair.
    pc[fromId].addStream(localStream);
    // On a démarré, utile pour ne pas démarrer le call plusieurs fois
    isStarted[fromId] = true;
    // Si on est l'appelant on appelle. Si on est pas l'appelant, on ne fait rien.
    isInitiator=isInit(myId,fromId);
    if (isInitiator) {
      doCall(fromId);
    }
  }
}

window.onbeforeunload = function(e){
  sendMessage('bye', myId);
}

/////////////////////////////////////////////////////////

function createPeerConnection(fromId) {
  try {
    // Ouverture de la connexion p2p
    pc[fromId] = new RTCPeerConnection(pc_config, pc_constraints);

    // ecouteur en cas de réception de candidature
    pc[fromId].onicecandidate = handleIceCandidate;

    console.log(Date()+'Created RTCPeerConnnection with:\n' +
      '  config: \'' + JSON.stringify(pc_config) + '\';\n' +
      '  constraints: \'' + JSON.stringify(pc_constraints) + '\'.');
  } catch (e) {
    console.log(Date()+'Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
      return;
  }
  // Ecouteur appelé quand le pair a enregistré dans la connexion p2p son
  // stream vidéo.
  //divRemoteVideo = fromId;
  pc[fromId].onaddstream = function handleRemoteStreamAdded(event) {
							  console.log(Date()+'Remote stream added.');
							  // reattachMediaStream(miniVideo, localVideo);
							  attachMediaStream(remoteVideo[fromId], event.stream);
							  //remoteStream = event.stream;
							  //  waitForRemoteVideo();
							};

  // Ecouteur appelé quand le pair a retiré le stream vidéo de la connexion p2p
  pc[fromId].onremovestream = handleRemoteStreamRemoved;

  // Data channel. Si on est l'appelant on ouvre un data channel sur la 
  // connexion p2p
  isInitiator=isInit(myId,fromId);
  if (isInitiator) {
    try {
      // Reliable Data Channels not yet supported in Chrome
      sendChannel[fromId] = pc[fromId].createDataChannel("sendDataChannel",
        {reliable: false});

      // écouteur de message reçus
      sendChannel[fromId].onmessage = handleMessage;

      trace('Created send data channel');
    } catch (e) {
      alert('Failed to create data channel. ' +
            'You need Chrome M25 or later with RtpDataChannel enabled');
      trace('createDataChannel() failed with exception: ' + e.message);
    }

    // ecouteur appelé quand le data channel est ouvert
    sendChannel[fromId].onopen =  function handleSendChannelStateChange() {
                    var readyState = sendChannel[fromId].readyState;
                    trace('Send channel state is: ' + readyState);
                    //enableMessageInterface(readyState == "open");
                  };
    // idem quand il est fermé.
    sendChannel[fromId].onclose =   function handleSendChannelStateChange() {
                    var readyState = sendChannel[fromId].readyState;
                    trace('Send channel state is: ' + readyState);
                    //enableMessageInterface(readyState == "open");
                  };
  } else {
    // ecouteur appelé quand le pair a enregistré le data channel sur la 
    // connexion p2p
    pc[fromId].ondatachannel =  function gotReceiveChannel(event) {
                    trace('Receive Channel Callback');
                    sendChannel[fromId] = event.channel;
                    sendChannel[fromId].onmessage = handleMessage;
                    sendChannel[fromId].onopen =  function handleReceiveChannelStateChange() {
                                    var readyState = sendChannel[fromId].readyState;
                                    trace('Receive channel state is: ' + readyState);
                                    //enableMessageInterface(readyState == "open");
                                  };
                    sendChannel[fromId].onclose = function handleReceiveChannelStateChange() {
                                    var readyState = sendChannel[fromId].readyState;
                                    trace('Receive channel state is: ' + readyState);
                                    //enableMessageInterface(readyState == "open");
                                  };
                };
  }
}



// function closeDataChannels() {
//   trace('Closing data channels');
//   sendChannel.close();
//   trace('Closed data channel with label: ' + sendChannel.label);
//   receiveChannel.close();
//   trace('Closed data channel with label: ' + receiveChannel.label);
//   localPeerConnection.close();
//   remotePeerConnection.close();
//   localPeerConnection = null;
//   remotePeerConnection = null;
//   trace('Closed peer connections');
//   startButton.disabled = false;
//   sendButton.disabled = true;
//   closeButton.disabled = true;
//   dataChannelSend.value = "";
//   dataChannelReceive.value = "";
//   dataChannelSend.disabled = true;
//   dataChannelSend.placeholder = "Press Start, enter some text, then press Send.";
// }

// Le data channel est créé par l'appelant. Si on entre dans cet écouteur
// C'est qu'on est l'appelé. On se contente de le récupérer via l'événement


var arrayToStoreChunks = [];

function handleMessage(event) {
  trace('Received text message: ' + event.data);
  //receiveTextarea.value = event.data;
  var data = JSON.parse(event.data);

    arrayToStoreChunks.push(data.message); // pushing chunks in array

    if (data.last) {
        saveToDisk(arrayToStoreChunks.join(''), 'fake fileName');
        arrayToStoreChunks = []; // resetting array
    }
}

function saveToDisk(fileUrl, fileName) {
  console.log('chegou aqui no save', room);
    var save = document.createElement('a');
    save.href = fileUrl;
    save.target = '_blank';
    save.download = fileName || fileUrl;

    var event = document.createEvent('Event');
    event.initEvent('click', true, true);
    save.dispatchEvent(event);
    (window.URL || window.webkitURL).revokeObjectURL(save.href);
}

/*
function enableMessageInterface(shouldEnable) {
    if (shouldEnable) {
    dataChannelSend.disabled = false;
    dataChannelSend.focus();
    dataChannelSend.placeholder = "";
    sendButton.disabled = false;
  } else {
    dataChannelSend.disabled = true;
    sendButton.disabled = true;
  }
}*/

function handleIceCandidate(event) {
  // On a recu une candidature, c'est le serveur STUN qui déclenche l'event
  // quand il a réussi à déterminer le host/port externe.
  console.log(Date()+'handleIceCandidate event: ', event);

  if (event.candidate) {
    // On envoie cette candidature à tout le monde.
    var data = [{
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate}, myId];
    sendMessage(data);
  } else {
    console.log(Date()+'End of candidates.');
  }
}

// Exécuté par l'appelant uniquement
function doCall(fromId) {
  // M.Buffa : les contraintes et les configurations (SDP) sont encore 
  // supportées différements selon les browsers, et certaines propriétés du 
  // standard officiel ne sont pas encore supportées... bref, c'est encore
  // un peu le bazar, d'où des traitement bizarres ici par exemple...
  var constraints = {'optional': [], 'mandatory': {'MozDontOfferDataChannel': true}};
  // temporary measure to remove Moz* constraints in Chrome
  if (webrtcDetectedBrowser === 'chrome') {
    for (var prop in constraints.mandatory) {
      if (prop.indexOf('Moz') !== -1) {
        delete constraints.mandatory[prop];
      }
     }
   }
   
  constraints = mergeConstraints(constraints, sdpConstraints);
  console.log(Date()+'Sending offer to peer, with constraints: \n' +
    '  \'' + JSON.stringify(constraints) + '\'.');

  // Envoi de l'offre. Normalement en retour on doit recevoir une "answer"
 
  pc[fromId].createOffer(function setLocalAndSendMessage(sessionDescription) {
                // Set Opus as the preferred codec in SDP if Opus is present.
                // M.Buffa : là c'est de la tambouille compliquée pour modifier la 
                // configuration SDP pour dire qu'on préfère un codec nommé OPUS (?)
                sessionDescription.sdp = preferOpus(sessionDescription.sdp);

                pc[fromId].setLocalDescription(sessionDescription);

                // Envoi par WebSocket
                var data = [sessionDescription, myId, fromId];
                sendMessage(data);
              }, 
              null, constraints);
}

// Exécuté par l'appelé uniquement...
function doAnswer(fromId) {
  console.log(Date()+'Sending answer to peer.');

  pc[fromId].createAnswer(function setLocalAndSendMessage(sessionDescription) {
                // Set Opus as the preferred codec in SDP if Opus is present.
                // M.Buffa : là c'est de la tambouille compliquée pour modifier la 
                // configuration SDP pour dire qu'on préfère un codec nommé OPUS (?)
                sessionDescription.sdp = preferOpus(sessionDescription.sdp);

                pc[fromId].setLocalDescription(sessionDescription);

                // Envoi par WebSocket
                var data = [sessionDescription, myId, fromId];
                sendMessage(data);
              }, 
              null, sdpConstraints);
}

function mergeConstraints(cons1, cons2) {
  var merged = cons1;
  for (var name in cons2.mandatory) {
    merged.mandatory[name] = cons2.mandatory[name];
  }
  merged.optional.concat(cons2.optional);
  return merged;
}

// callback de createAnswer et createOffer, ajoute une configuration locale SDP
// A la connexion p2p, lors de l'appel de createOffer/answer par un pair.
// Envoie aussi la description par WebSocket. Voir le traitement de la réponse
// au début du fichier sans socket.on("message" , ...) partie "answer" et "offer"


// regarde si le serveur turn de la configuration de connexion
// (pc_config) existe, sinon récupère l'IP/host d'un serveur
// renvoyé par le web service computeengineondemand.appspot.com
// de google. La requête se fait en Ajax, résultat renvoyé en JSON.
function requestTurn(turn_url) {
  var turnExists = false;
  for (var i in pc_config.iceServers) {
    if (pc_config.iceServers[i].url.substr(0, 5) === 'turn:') {
      turnExists = true;
      turnReady = true;
      break;
    }
  }
  if (!turnExists) {
    console.log(Date()+'Getting TURN server from ', turn_url);
    // No TURN server. Get one from computeengineondemand.appspot.com:
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function(){
      if (xhr.readyState === 4 && xhr.status === 200) {
        var turnServer = JSON.parse(xhr.responseText);
        console.log(Date()+'Got TURN server: ', turnServer);
        pc_config.iceServers.push({
          'url': 'turn:' + turnServer.username + '@' + turnServer.turn,
          'credential': turnServer.password
        });
        turnReady = true;
      }
    };
    xhr.open('GET', turn_url, true);
    xhr.send();
  }
}

// Ecouteur de onremotestream : permet de voir la vidéo du pair distant dans 
// l'élément HTML remoteVideo


function handleRemoteStreamRemoved(event) {
  console.log(Date()+'Remote stream removed. Event: ', event);
}

// bouton "on raccroche"
function hangup() {
  console.log(Date()+'Hanging up.');
  stopAll();
  sendMessage('bye', myId);
}

function handleRemoteHangup(fromId) {
	
  console.log(Date()+'Session terminated.');
  stop(fromId);
  remoteVideo[fromId].hide;
  isInitiator = false;
}

// Fermeture de la connexion p2p
function stop(fromId) {
  isStarted[fromId] = false;
  // isAudioMuted = false;
  // isVideoMuted = false;
  pc[fromId].close();
  pc[fromId] = null;
}

function stopAll(){
    for (var i=0; i < isStarted.length; i++){
        isStarted[i] = false;
        // isAudioMuted = false;
        // isVideoMuted = false;
        pc[i].close();
        pc[i] = null;
    }
}

///////////////////////////////////////////
// M.Buffa : tambouille pour bidouiller la configuration sdp
// pour faire passer le codec OPUS en premier....
// 
// Set Opus as the default audio codec if it's present.
function preferOpus(sdp) {
  var sdpLines = sdp.split('\r\n');
  var mLineIndex;
  // Search for m line.
  for (var i = 0; i < sdpLines.length; i++) {
      if (sdpLines[i].search('m=audio') !== -1) {
        mLineIndex = i;
        break;
      }
  }
  if (mLineIndex === null) {
    return sdp;
  }

  // If Opus is available, set it as the default in m line.
  for (i = 0; i < sdpLines.length; i++) {
    if (sdpLines[i].search('opus/48000') !== -1) {
      var opusPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
      if (opusPayload) {
        sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex], opusPayload);
      }
      break;
    }
  }

  // Remove CN in m line and sdp.
  sdpLines = removeCN(sdpLines, mLineIndex);

  sdp = sdpLines.join('\r\n');
  return sdp;
}

function extractSdp(sdpLine, pattern) {
  var result = sdpLine.match(pattern);
  return result && result.length === 2 ? result[1] : null;
}

// Set the selected codec to the first in m line.
function setDefaultCodec(mLine, payload) {
  var elements = mLine.split(' ');
  var newLine = [];
  var index = 0;
  for (var i = 0; i < elements.length; i++) {
    if (index === 3) { // Format of media starts from the fourth.
      newLine[index++] = payload; // Put target payload to the first.
    }
    if (elements[i] !== payload) {
      newLine[index++] = elements[i];
    }
  }
  return newLine.join(' ');
}

// Strip CN from sdp before CN constraints is ready.
function removeCN(sdpLines, mLineIndex) {
  var mLineElements = sdpLines[mLineIndex].split(' ');
  // Scan from end for the convenience of removing an item.
  for (var i = sdpLines.length-1; i >= 0; i--) {
    var payload = extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
    if (payload) {
      var cnPos = mLineElements.indexOf(payload);
      if (cnPos !== -1) {
        // Remove CN payload from m line.
        mLineElements.splice(cnPos, 1);
      }
      // Remove CN line in sdp
      sdpLines.splice(i, 1);
    }
  }

  sdpLines[mLineIndex] = mLineElements.join(' ');
  return sdpLines;
}

function isInit(myId,peerId) {
  if (myId < peerId)
    return true;
  else
    return false;
}

function sendFile(filestosend, idOtherPeer){
  var file = filestosend[0];
  var reader = new window.FileReader();
  reader.readAsDataURL(file);
  reader.onload = function onReadAsDataURL(event, text) {
            var data = {}; // data object to transmit over data channel
            var chunkLength = 1000;
            
            if (event) text = event.target.result; // on first invocation

            if (text.length > chunkLength) {
              data.message = text.slice(0, chunkLength); // getting chunk using predefined chunk length
            } else {
              data.message = text;
              data.last = true;
            }
            
            console.log('sending file chunk', room);
            sendChannel[idOtherPeer].send(JSON.stringify(data));

            var remainingDataURL = text.slice(data.message.length);
            if (remainingDataURL.length) setTimeout(function () {
              onReadAsDataURL(null, remainingDataURL); // continue transmitting
            }, 500)
          };
}