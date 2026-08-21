import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
} from 'react-native-webrtc';
import { turnAPI } from './api';

const FALLBACK_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

let cachedTurn = null;
let cachedTurnAt = 0;

const getIceServers = async () => {
  const now = Date.now();
  if (cachedTurn && now - cachedTurnAt < 30 * 60 * 1000) {
    return cachedTurn;
  }
  try {
    const res = await turnAPI.getCredentials();
    const servers = res.data?.ice_servers?.filter(Boolean) || FALLBACK_SERVERS;
    if (servers.some((s) => s.urls && s.urls.startsWith('turn:'))) {
      cachedTurn = servers;
      cachedTurnAt = now;
    }
    return servers;
  } catch (err) {
    return FALLBACK_SERVERS;
  }
};

export const createPeerConnection = async (socket, remoteSocketId, onStateChange) => {
  const pc = new RTCPeerConnection({
    iceServers: await getIceServers(),
    sdpSemantics: 'unified-plan',
    iceCandidatePoolSize: 10,
  });

  pc.onicecandidate = ({ candidate }) => {
    if (candidate && socket?.connected) {
      socket.emit('webrtc_ice_candidate', {
        target_socket_id: remoteSocketId,
        candidate,
      });
    }
  };

  pc.onconnectionstatechange = () => {
    onStateChange?.('connection', pc.connectionState);
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      pc.getTransceivers?.().forEach((t) => t.stop?.());
      pc.close();
    }
  };

  pc.oniceconnectionstatechange = () => {
    onStateChange?.('ice', pc.iceConnectionState);
  };

  pc.onicegatheringstatechange = () => {
    onStateChange?.('gathering', pc.iceGatheringState);
  };

  return pc;
};

export const getLocalStream = async () => {
  try {
    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    return stream;
  } catch (err) {
    throw new Error('Microphone access denied. Please allow microphone permission.');
  }
};

export const createOffer = async (pc) => {
  const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
  await pc.setLocalDescription(offer);
  return pc.localDescription;
};

export const createAnswer = async (pc) => {
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  return pc.localDescription;
};

export const setRemoteDescription = async (pc, sdp) => {
  const desc = new RTCSessionDescription({ type: sdp.type, sdp: sdp.sdp });
  await pc.setRemoteDescription(desc);
};

export const addIceCandidate = async (pc, candidate) => {
  try {
    const iceCandidate = new RTCIceCandidate({
      candidate: candidate.candidate,
      sdpMLineIndex: candidate.sdpMLineIndex,
      sdpMid: candidate.sdpMid,
    });
    await pc.addIceCandidate(iceCandidate);
  } catch (err) {
    // Ignore invalid candidates
  }
};

export const addLocalTracks = (pc, stream) => {
  stream.getAudioTracks().forEach((track) => {
    pc.addTrack(track, stream);
  });
};

export const stopStream = (stream) => {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    track.stop();
  });
};

export const cleanupPC = (pc) => {
  if (!pc) return;
  pc.getTransceivers?.().forEach((t) => t.stop?.());
  pc.close();
};
