import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { scanAPI } from '../services/api';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import {
  createPeerConnection,
  getLocalStream,
  createOffer,
  createAnswer,
  setRemoteDescription,
  addIceCandidate,
  addLocalTracks,
  stopStream,
  cleanupPC,
} from '../services/webrtcService';

const VoiceCallContext = createContext(null);

export const useVoiceCall = () => useContext(VoiceCallContext);

const waitForSocketConnection = (socket, timeoutMs = 20000) =>
  new Promise((resolve, reject) => {
    if (!socket) {
      reject(new Error('App call connection is still starting. Please try again in a moment.'));
      return;
    }

    if (socket.connected && socket.id) {
      resolve(socket);
      return;
    }

    let settled = false;
    const poll = setInterval(() => {
      if (socket.connected && socket.id) {
        settle();
      } else {
        socket.connect?.();
      }
    }, 1000);

    const timer = setTimeout(() => {
      settle(true);
    }, timeoutMs);

    const settle = (failed = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(poll);
      socket.off?.('connect', handleConnect);
      if (failed) {
        reject(new Error('App call connection is still starting. Please try again in a moment.'));
      } else {
        resolve(socket);
      }
    };

    const handleConnect = () => settle();
    socket.once('connect', handleConnect);
    socket.connect?.();
  });

const initWebRTC = async (socket, remoteSocketId, onStateChange) => {
  const stream = await getLocalStream();
  const pc = await createPeerConnection(socket, remoteSocketId, onStateChange);
  addLocalTracks(pc, stream);
  return { pc, stream };
};

export const VoiceCallProvider = ({ children }) => {
  const socket = useSocket();
  const socketRef = useRef(socket);
  socketRef.current = socket;
  const { user } = useAuth();
  const [callState, setCallState] = useState({ status: 'idle' });
  const callRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);

  const waitForCallSocket = async (timeoutMs = 20000) => {
    const deadline = Date.now() + timeoutMs;
    while (!socketRef.current) {
      if (Date.now() >= deadline) {
        throw new Error('App call connection is still starting. Please try again in a moment.');
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const remaining = deadline - Date.now();
    return waitForSocketConnection(socketRef.current, Math.max(500, remaining));
  };

  const updateCallState = useCallback((updates) => {
    setCallState((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleStateChange = useCallback((type, state) => {
    if (type === 'connection') {
      updateCallState({ connectionState: state });
      if (state === 'connected') {
        updateCallState({
          status: 'connected',
          connectedAt: Date.now(),
          message: 'Voice call connected.',
        });
      }
    } else if (type === 'ice') {
      updateCallState({ iceConnectionState: state });
    }
  }, [updateCallState]);

  const startWebRTCCall = useCallback(async (remoteSocketId) => {
    if (!socket?.connected) return;
    try {
      const { pc, stream } = await initWebRTC(socket, remoteSocketId, handleStateChange);
      pcRef.current = pc;
      localStreamRef.current = stream;

      const offer = await createOffer(pc);
      socket.emit('webrtc_offer', {
        target_socket_id: remoteSocketId,
        call_id: callRef.current?.call_id,
        sdp: { type: offer.type, sdp: offer.sdp },
      });
      updateCallState({ message: 'Voice call connecting...' });
    } catch (err) {
      cleanupWebRTC();
      updateCallState({ status: 'ended', message: err.message || 'Voice connection failed.' });
    }
  }, [socket, handleStateChange, updateCallState]);

  const cleanupWebRTC = useCallback(() => {
    if (pcRef.current) {
      cleanupPC(pcRef.current);
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      stopStream(localStreamRef.current);
      localStreamRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    cleanupWebRTC();
    callRef.current = null;
    setCallState({ status: 'idle' });
  }, [cleanupWebRTC]);

  const startOutgoingCall = async (qrCodeId) => {
    const connectedSocket = await waitForCallSocket();

    const response = await scanAPI.initiateCall(qrCodeId, connectedSocket.id, user?.id);

    const ownerSocketId = response.data.owner_socket_id;
    const ownerName = response.data.owner_name || response.data.ownerName || null;

    callRef.current = {
      call_id: response.data.call_id,
      owner_socket_id: ownerSocketId || null,
      role: 'caller',
      owner_name: ownerName,
    };

    if (ownerSocketId) {
      setCallState({
        status: 'ringing',
        role: 'caller',
        call_id: response.data.call_id,
        caller_name: ownerName,
        target_name: ownerName,
        message: 'Waiting for owner to accept...',
      });
    } else {
      // Owner app closed: backend push notification bhej chuka hai. Ye
      // session alive rakho — jab owner notification tap karega aur uski
      // app khulegi, call_response 'accepted' aaega aur call seedha
      // connect ho jayegi (koi nayi call start nahi karni padegi).
      setCallState({
        status: 'ringing',
        role: 'caller',
        call_id: response.data.call_id,
        caller_name: ownerName,
        target_name: ownerName,
        message: 'Call notification sent. Jab owner app kholega, call connect ho jayegi.',
      });
    }

    return response;
  };

  const acceptIncomingCall = async (incomingCall) => {
    const connectedSocket = await waitForCallSocket();
    if (!incomingCall?.caller_socket_id) {
      throw new Error('Caller connection details are missing. Ask the caller to try again.');
    }

    callRef.current = { ...incomingCall, role: 'receiver' };

    setCallState({
      status: 'connecting',
      role: 'receiver',
      call_id: incomingCall.call_id,
      caller_name: incomingCall.caller_name || incomingCall.target_name || null,
      target_name: incomingCall.caller_name || incomingCall.target_name || null,
      message: 'Connecting voice call...',
    });

    try {
      const { pc, stream } = await initWebRTC(connectedSocket, incomingCall.caller_socket_id, handleStateChange);
      pcRef.current = pc;
      localStreamRef.current = stream;

      connectedSocket.emit('call_response', {
        call_id: incomingCall.call_id,
        caller_socket_id: incomingCall.caller_socket_id,
        caller_user_id: incomingCall.caller_user_id,
        receiver_socket_id: connectedSocket.id,
        response: 'accepted',
      });
    } catch (err) {
      cleanupWebRTC();
      throw new Error(err.message || 'Could not accept voice call.');
    }
  };

  const rejectIncomingCall = async (incomingCall) => {
    if (!incomingCall) return;

    const connectedSocket = await waitForCallSocket().catch(() => null);
    if (!connectedSocket) return;

    connectedSocket.emit('call_response', {
      call_id: incomingCall.call_id,
      caller_socket_id: incomingCall.caller_socket_id,
      caller_user_id: incomingCall.caller_user_id,
      response: 'rejected',
    });
  };

  const endCall = () => {
    const info = callRef.current;
    if (socket && info) {
      socket.emit('voice_call_end', {
        call_id: info.call_id,
        target_socket_id:
          info.role === 'caller' ? info.owner_socket_id : info.caller_socket_id,
      });
    }
    cleanup();
  };

  useEffect(() => {
    if (!socket) return undefined;

    const handleCallResponse = async (data) => {
      if (data.response === 'rejected') {
        cleanupWebRTC();
        callRef.current = null;
        setCallState({ status: 'ended', message: 'Owner rejected your app call.' });
        return;
      }

      if (data.response === 'missed') {
        cleanupWebRTC();
        callRef.current = null;
        setCallState({ status: 'ended', message: data.message || 'Owner did not answer the app call.' });
        return;
      }

      if (data.response === 'cancelled' || data.response === 'failed') {
        cleanupWebRTC();
        callRef.current = null;
        setCallState({ status: 'ended', message: data.message || 'The call request was cancelled.' });
        return;
      }

      if (data.response !== 'accepted') return;

      const info = callRef.current;
      if (!info || info.role !== 'caller') return;

      callRef.current = {
        ...info,
        owner_socket_id: data.receiver_socket_id,
      };

      setCallState((prev) => ({
        ...prev,
        status: 'connecting',
        message: 'Owner accepted. Establishing voice connection...',
      }));

      await startWebRTCCall(data.receiver_socket_id);
    };

    const handleVoiceCallEnd = () => {
      cleanup();
    };

    const handleWebRTCOffer = async (data) => {
      if (!data?.sdp || !data?.caller_socket_id) return;
      const info = callRef.current;
      if (!info || info.role !== 'receiver') return;

      try {
        const pc = pcRef.current;
        if (!pc) return;

        await setRemoteDescription(pc, data.sdp);

        if (!localStreamRef.current) {
          const { pc: newPc, stream } = await initWebRTC(socket, data.caller_socket_id, handleStateChange);          pcRef.current = newPc;
          localStreamRef.current = stream;

          const answer = await createAnswer(newPc);
          socket.emit('webrtc_answer', {
            target_socket_id: data.caller_socket_id,
            call_id: info.call_id,
            sdp: { type: answer.type, sdp: answer.sdp },
          });
        } else {
          const answer = await createAnswer(pc);
          socket.emit('webrtc_answer', {
            target_socket_id: data.caller_socket_id,
            call_id: info.call_id,
            sdp: { type: answer.type, sdp: answer.sdp },
          });
        }
      } catch (err) {
        // SDP handling error
      }
    };

    const handleWebRTCAnswer = async (data) => {
      if (!data?.sdp) return;
      const pc = pcRef.current;
      if (!pc || pc.signalingState !== 'have-local-offer') return;

      try {
        await setRemoteDescription(pc, data.sdp);
      } catch (err) {
        // SDP answer error
      }
    };

    const handleWebRTCIce = async (data) => {
      if (!data?.candidate) return;
      const pc = pcRef.current;
      if (!pc) return;

      await addIceCandidate(pc, data.candidate);
    };

    socket.on('call_response', handleCallResponse);
    socket.on('voice_call_end', handleVoiceCallEnd);
    socket.on('webrtc_offer', handleWebRTCOffer);
    socket.on('webrtc_answer', handleWebRTCAnswer);
    socket.on('webrtc_ice_candidate', handleWebRTCIce);

    return () => {
      socket.off('call_response', handleCallResponse);
      socket.off('voice_call_end', handleVoiceCallEnd);
      socket.off('webrtc_offer', handleWebRTCOffer);
      socket.off('webrtc_answer', handleWebRTCAnswer);
      socket.off('webrtc_ice_candidate', handleWebRTCIce);
      cleanup();
    };
  }, [socket, startWebRTCCall, cleanupWebRTC, cleanup]);

  const value = useMemo(
    () => ({
      callState,
      startOutgoingCall,
      acceptIncomingCall,
      rejectIncomingCall,
      endCall,
    }),
    [callState]
  );

  return (
    <VoiceCallContext.Provider value={value}>
      {children}
    </VoiceCallContext.Provider>
  );
};
