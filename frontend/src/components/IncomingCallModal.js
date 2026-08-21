import React, { useEffect, useState, useRef } from 'react';
import { Alert, View, Text, StyleSheet, Modal, Vibration, TouchableOpacity, Dimensions } from 'react-native';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useSocket } from '../context/SocketContext';
import { useVoiceCall } from '../context/VoiceCallContext';
import Ionicons from '@expo/vector-icons/Ionicons';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { RINGTONE_SOURCE } from '../config/ringtone';
import {
  clearActiveCall,
  handleIncomingCallPayload,
  subscribeIncomingCalls,
} from '../services/callNotificationService';
import { stopNativeIncomingRingtone } from '../services/nativeRingtoneService';

const { width } = Dimensions.get('window');
const RING_TIMEOUT_MS = 300000;

const isExpired = (sentAt) => {
  if (!sentAt) return false;
  return Date.now() - new Date(sentAt).getTime() > RING_TIMEOUT_MS;
};

const IncomingCallModal = () => {
  const socket = useSocket();
  const voiceCall = useVoiceCall();
  const [isRinging, setIsRinging] = useState(false);
  const ringtonePlayer = useAudioPlayer(isRinging ? RINGTONE_SOURCE : null, { keepAudioSessionActive: true });
  const [callerInfo, setCallerInfo] = useState(null);
  const [autoAccepting, setAutoAccepting] = useState(false);
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const autoAcceptTimeoutRef = useRef(null);
  const callerInfoRef = useRef(null);
  const handleAcceptRef = useRef(null);
  const dismissedCallIdRef = useRef(null);
  const ringingCallIdRef = useRef(null);
  // Stable references so the ring-start effect can register exactly once
  // and never re-subscribe (re-subscribing replays the active call and
  // restarts the ringing -> "2-3 baar bajna").
  const ringtonePlayerRef = useRef(ringtonePlayer);
  ringtonePlayerRef.current = ringtonePlayer;
  const voiceCallRef = useRef(voiceCall);
  voiceCallRef.current = voiceCall;

  const stopRinging = () => {
    stopNativeIncomingRingtone(callerInfoRef.current?.call_id || callerInfoRef.current?.request_id || '');

    if (autoAcceptTimeoutRef.current) {
      clearTimeout(autoAcceptTimeoutRef.current);
      autoAcceptTimeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    try {
      if (ringtonePlayerRef.current) {
        Promise.resolve(ringtonePlayerRef.current.pause()).catch(() => {});
        Promise.resolve(ringtonePlayerRef.current.seekTo(0)).catch(() => {});
      }
    } catch (error) {}

    Vibration.cancel();
  };

  const dismissIncoming = (callId) => {
    if (socket && callId) {
      socket.emit('dismiss_incoming', { call_id: callId });
    }
  };

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'duckOthers',
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isRinging || !ringtonePlayer) return;
    ringtonePlayer.loop = true;
    ringtonePlayer.volume = 1;
    ringtonePlayer.seekTo(0).catch(() => {});
    ringtonePlayer.play();
    return () => {
      Promise.resolve(ringtonePlayer.pause()).catch(() => {});
      Promise.resolve(ringtonePlayer.seekTo(0)).catch(() => {});
    };
  }, [isRinging, ringtonePlayer]);

  useEffect(() => {
    if (!socket) return;

    const handleIncomingCall = (data) => {
      handleIncomingCallPayload(data);
    };

    socket.on('incoming_call', handleIncomingCall);

    return () => {
      socket.off('incoming_call', handleIncomingCall);
      stopRinging();
    };
  }, [socket]);

  useEffect(() => {
    const showIncomingCall = (data) => {
      if (!data) {
        handleDismiss();
        return;
      }
      if (isExpired(data.sent_at)) return;
      if (data.call_id && ringingCallIdRef.current === data.call_id) return;
      if (data.call_id && dismissedCallIdRef.current === data.call_id) return;

      stopNativeIncomingRingtone();
      ringingCallIdRef.current = data.call_id;
      setCallerInfo(data);
      callerInfoRef.current = data;
      setIsRinging(true);

      if (intervalRef.current) clearInterval(intervalRef.current);
      Vibration.vibrate([0, 1000, 1000, 1000]);
      intervalRef.current = setInterval(() => {
        Vibration.vibrate([0, 1000, 1000, 1000]);
      }, 3000);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        const currentCall = callerInfoRef.current;
        if (currentCall) {
          voiceCallRef.current?.rejectIncomingCall(currentCall);
        }
        ringingCallIdRef.current = null;
        setIsRinging(false);
        setCallerInfo(null);
        callerInfoRef.current = null;
        setAutoAccepting(false);
        clearActiveCall();
        stopRinging();
      }, RING_TIMEOUT_MS);

      // App band/background se push notification tap karke khula hai —
      // jese hi app khule, 2 second baad call ko automatically accept kar
      // do. Usse pehle user Answer/Decline dabayega to timer cancel.
      if (data.fromPush) {
        if (autoAcceptTimeoutRef.current) clearTimeout(autoAcceptTimeoutRef.current);
        setAutoAccepting(true);
        autoAcceptTimeoutRef.current = setTimeout(() => {
          autoAcceptTimeoutRef.current = null;
          setAutoAccepting(false);
          const pendingCall = callerInfoRef.current;
          if (pendingCall && ringingCallIdRef.current === pendingCall.call_id) {
            handleAcceptRef.current?.();
          }
        }, 2000);
      }
    };

    const unsubscribe = subscribeIncomingCalls(showIncomingCall);

    return () => {
      unsubscribe();
      stopRinging();
    };
  }, []);

  const handleDismiss = () => {
    if (callerInfoRef.current?.call_id) {
      dismissedCallIdRef.current = callerInfoRef.current.call_id;
      dismissIncoming(callerInfoRef.current.call_id);
    }
    ringingCallIdRef.current = null;
    setIsRinging(false);
    setCallerInfo(null);
    callerInfoRef.current = null;
    setAutoAccepting(false);
    clearActiveCall();
    stopRinging();
  };

  const acceptCall = async (call) => {
    await voiceCallRef.current?.acceptIncomingCall(call);
    handleDismiss();
  };

  const rejectCall = (call) => {
    voiceCallRef.current?.rejectIncomingCall(call);
    handleDismiss();
  };

  const handleAccept = async () => {
    if (callerInfo) {
      try {
        await acceptCall(callerInfo);
      } catch (error) {
        Alert.alert('Call Not Ready', error.message || 'Please wait a moment and try again.');
      }
    }
  };
  handleAcceptRef.current = handleAccept;

  const handleReject = () => {
    if (callerInfo) {
      rejectCall(callerInfo);
    }
  };

  if (!isRinging) return null;

  const callerName = callerInfo?.caller_name || 'Someone';
  const vehicleInfo = callerInfo?.vehicle_number || callerInfo?.vehicle_name || '';
  const initials = callerName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <Modal visible={isRinging} transparent animationType="fade" onRequestClose={handleDismiss}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.topSection}>
            <Text style={styles.incomingLabel}>Incoming Call</Text>

            <View style={styles.avatarContainer}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <View style={styles.pulseRing} />
              <View style={styles.pulseRing2} />
              <View style={styles.pulseRing3} />
            </View>

            <Text style={styles.callerName}>{callerName}</Text>
            {vehicleInfo ? (
              <Text style={styles.vehicleInfo}>{vehicleInfo}</Text>
            ) : null}
            <Text style={styles.callType}>Voice Call via Karo Alert</Text>
          </View>

          <View style={styles.bottomSection}>
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.actionItem}
                onPress={handleReject}
                activeOpacity={0.7}
              >
                <View style={styles.rejectCircle}>
                  <Icon name="phone-hangup" size={30} color="#fff" />
                </View>
                <Text style={styles.actionLabel}>Decline</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={handleAccept}
                activeOpacity={0.7}
              >
                <View style={styles.acceptCircle}>
                  <Icon name="phone" size={30} color="#fff" />
                </View>
                <Text style={styles.actionLabel}>Accept</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.remindBtn} onPress={handleDismiss} activeOpacity={0.7}>
              <Ionicons name="time-outline" size={18} color="rgba(255,255,255,0.6)" />
              <Text style={styles.remindText}>Remind Me</Text>
            </TouchableOpacity>

            {autoAccepting ? (
              <Text style={styles.autoAcceptText}>Auto-connecting your call…</Text>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.97)',
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 70,
    paddingBottom: 50,
  },
  topSection: {
    alignItems: 'center',
  },
  incomingLabel: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 30,
  },
  avatarContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FF6D00',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#FF6D00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    zIndex: 1,
  },
  avatarText: {
    fontSize: 44,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 2,
  },
  pulseRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: 'rgba(255,109,0,0.3)',
    top: -10,
    zIndex: 0,
  },
  pulseRing2: {
    width: 170,
    height: 170,
    borderRadius: 85,
    borderColor: 'rgba(255,109,0,0.15)',
    top: -25,
  },
  pulseRing3: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderColor: 'rgba(255,109,0,0.07)',
    top: -40,
  },
  callerName: {
    fontSize: 30,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
    textAlign: 'center',
  },
  vehicleInfo: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 4,
  },
  callType: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
  bottomSection: {
    alignItems: 'center',
    gap: 30,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 80,
  },
  actionItem: {
    alignItems: 'center',
    gap: 12,
  },
  acceptCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#43A047',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#43A047',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  rejectCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E53935',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#E53935',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  actionLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  remindBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 24,
  },
  remindText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '500',
  },
  autoAcceptText: {
    color: '#81C784',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default IncomingCallModal;
