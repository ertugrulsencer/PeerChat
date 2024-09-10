const APP_ID = "e286dee3a206478da7de42bb6c693faa";

let token = null;
let uid = Math.floor(Math.random() * 10000).toString();

let client;
let channel;

let localeStream;
let remoteStream;
let peerConnection;

const servers = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
};

// ICE adaylarını kuyrukta tutmak için bir array
let iceCandidatesQueue = [];

const init = async () => {
  client = new AgoraRTM.createInstance(APP_ID);
  await client.login({ uid, token });

  channel = client.createChannel("main");
  await channel.join();

  channel.on("MemberJoined", handleUserJoined);
  channel.on("MemberLeft", handleUserLeft);

  client.on("MessageFromPeer", handleMessageFromPeer);

  localeStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  document.getElementById("user-1").srcObject = localeStream;
};

const handleUserLeft = (MemberId) => {
  document.getElementById("user-2").style.display = "none";
};

const handleMessageFromPeer = async (message, MemberId) => {
  message = JSON.parse(message.text);
  if (message.type === "offer") {
    createAnswer(MemberId, message.offer);
  }
  if (message.type === "answer") {
    addAnswer(message.answer);
  }
  if (message.type === "candidate") {
    if (peerConnection && peerConnection.remoteDescription) {
      // Uzak tanım ayarlanmışsa ICE adayını ekle
      await peerConnection.addIceCandidate(
        new RTCIceCandidate(message.candidate)
      );
    } else {
      // Aksi takdirde ICE adayını kuyrukta beklet
      iceCandidatesQueue.push(message.candidate);
    }
  }
};

const handleUserJoined = async (MemberId) => {
  createOffer(MemberId);
  document.getElementById("user-2").style.display = "block";
};

const createPeerConnection = async (MemberId) => {
  peerConnection = new RTCPeerConnection(servers);

  remoteStream = new MediaStream();
  document.getElementById("user-2").srcObject = remoteStream;

  if (!localeStream) {
    localeStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
    document.getElementById("user-1").srcObject = localeStream;
  }

  localeStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localeStream);
  });

  peerConnection.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  peerConnection.onicecandidate = async (event) => {
    if (event.candidate) {
      client.sendMessageToPeer(
        {
          text: JSON.stringify({
            type: "candidate",
            candidate: event.candidate,
          }),
        },
        MemberId
      );
    }
  };
};

const createOffer = async (MemberId) => {
  await createPeerConnection(MemberId);
  let offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  client.sendMessageToPeer(
    { text: JSON.stringify({ type: "offer", offer }) },
    MemberId
  );
};

const createAnswer = async (MemberId, offer) => {
  await createPeerConnection(MemberId);
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer)); // Uzak tanım ayarlandı
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  client.sendMessageToPeer(
    { text: JSON.stringify({ type: "answer", answer }) },
    MemberId
  );

  // Uzak tanım ayarlandıktan sonra kuyruktaki ICE adaylarını ekle
  iceCandidatesQueue.forEach(async (candidate) => {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  });
  iceCandidatesQueue = []; // Kuyruğu temizle
};

const addAnswer = async (answer) => {
  if (!peerConnection.currentRemoteDescription) {
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(answer)
    );
  }
};

const leaveChanel = async () => {
  await channel.leave();
  await client.logout();
};

addEventListener("beforeunload", leaveChanel);

init();
