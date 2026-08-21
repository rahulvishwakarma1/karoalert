import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Modal, Vibration, TouchableOpacity } from 'react-native';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useSocket } from '../context/SocketContext';
import { Title, Paragraph } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { RINGTONE_SOURCE } from '../config/ringtone';
import {
  clearActiveAlert,
  handleIncomingAlertPayload,
  subscribeIncomingAlerts,
} from '../services/callNotificationService';
import { stopNativeIncomingRingtone } from '../services/nativeRingtoneService';

const RING_TIMEOUT_MS = 300000;

const isExpired = (sentAt) => {
  if (!sentAt) return false;
  return Date.now() - new Date(sentAt).getTime() > RING_TIMEOUT_MS;
};

const IncomingAlertModal = () => {
  const socket = useSocket();
  const [isRinging, setIsRinging] = useState(false);
  const ringtonePlayer = useAudioPlayer(isRinging ? RINGTONE_SOURCE : null, { keepAudioSessionActive: true });
  const [message, setMessage] = useState('');
  const [alertData, setAlertData] = useState(null);
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const dismissedAlertIdRef = useRef(null);
  const alertKeyRef = useRef('');
  const ringingAlertIdRef = useRef(null);
  // Stable reference so the ring-start effect registers exactly once and
  // never re-subscribes (re-subscribing replays the active alert and
  // restarts the ringing -> "2-3 baar bajna").
  const ringtonePlayerRef = useRef(ringtonePlayer);
  ringtonePlayerRef.current = ringtonePlayer;

  const stopRinging = () => {
    stopNativeIncomingRingtone(alertKeyRef.current || '');

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
    } catch (error) {
      // The native audio handle may already be released during unmount.
    }

    Vibration.cancel();
  };

  const dismissIncoming = (alertId) => {
    if (socket && alertId) {
      socket.emit('dismiss_incoming', { request_id: alertId });
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
    const handleIncomingAlert = (data) => {
      handleIncomingAlertPayload(data);
    };

    socket?.on('incoming_alert', handleIncomingAlert);

    return () => {
      socket?.off('incoming_alert', handleIncomingAlert);
      stopRinging();
    };
  }, [socket]);

  useEffect(() => {
    const showIncomingAlert = (data) => {
      if (!data) {
        handleDismiss();
        return;
      }
      if (isExpired(data.sent_at)) return;
      const alertId = data.request_id || data.qr_code_id;
      if (alertId && ringingAlertIdRef.current === alertId) return;
      if (alertId && dismissedAlertIdRef.current === alertId) return;

      stopNativeIncomingRingtone();
      const alertMessage = data.message || 'Someone is trying to contact you about your vehicle!';
      alertKeyRef.current = data.request_id || data.qr_code_id || '';
      ringingAlertIdRef.current = data.request_id || data.qr_code_id || null;
      setMessage(alertMessage);
      setAlertData(data);
      setIsRinging(true);

      if (intervalRef.current) clearInterval(intervalRef.current);
      Vibration.vibrate([0, 1000, 1000, 1000]);
      intervalRef.current = setInterval(() => {
        Vibration.vibrate([0, 1000, 1000, 1000]);
      }, 3000);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        ringingAlertIdRef.current = null;
        setIsRinging(false);
        setAlertData(null);
        clearActiveAlert();
        stopRinging();
      }, RING_TIMEOUT_MS);
    };

    const unsubscribe = subscribeIncomingAlerts(showIncomingAlert);

    return () => {
      unsubscribe();
      stopRinging();
    };
  }, []);

  const handleDismiss = () => {
    const alertId = alertData?.request_id || alertData?.qr_code_id;
    if (alertId) {
      dismissedAlertIdRef.current = alertId;
      dismissIncoming(alertData.request_id || alertId);
    }
    ringingAlertIdRef.current = null;
    setIsRinging(false);
    setAlertData(null);
    clearActiveAlert();
    stopRinging();
  };

  const sendResponse = (responseText) => {
    if (socket && alertData) {
      if (!alertData.scanner_socket_id && !alertData.scanner_user_id) {
        console.warn('Cannot deliver alert response: scanner details are missing.');
      }

      socket.emit('alert_response', {
        request_id: alertData.request_id,
        scanner_socket_id: alertData.scanner_socket_id,
        scanner_user_id: alertData.scanner_user_id,
        response_text: responseText,
      });
    }

    handleDismiss();
  };

  if (!isRinging) return null;

  return (
    <Modal visible={isRinging} transparent animationType="slide" onRequestClose={handleDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Icon name="bell-ring" size={60} color="#f44336" style={styles.icon} />
          <Title style={styles.title}>Vehicle Alert!</Title>
          <Paragraph style={styles.message}>{message}</Paragraph>

          <TouchableOpacity
            style={[styles.responseButton, styles.primaryButton]}
            onPress={() => sendResponse('I am on my way to move the vehicle. Please wait for a moment.')}
          >
            <Text style={styles.responseText}>I am coming</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.responseButton, styles.secondaryButton]}
            onPress={() => sendResponse('The vehicle has been moved. You are clear to park now.')}
          >
            <Text style={styles.responseText}>Vehicle moved</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.responseButton, styles.warningButton]}
            onPress={() => sendResponse('I am unable to move the vehicle right now. Kindly try calling me or wait a few minutes.')}
          >
            <Text style={styles.responseText}>Cannot move now</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.stopButton} onPress={handleDismiss}>
            <Text style={styles.stopText}>Stop ringing</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#1C2333',
    padding: 30,
    borderRadius: 24,
    alignItems: 'center',
    width: '85%',
    elevation: 10,
    shadowColor: '#FF6D00',
    shadowOpacity: 0.3,
    shadowRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  icon: {
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    color: '#FF6D00',
    fontWeight: 'bold',
    marginBottom: 10,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 30,
  },
  stopButton: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    marginTop: 8,
  },
  stopText: {
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
    fontSize: 15,
    textAlign: 'center',
  },
  responseButton: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    width: '100%',
    marginBottom: 10,
  },
  primaryButton: {
    backgroundColor: '#43A047',
  },
  secondaryButton: {
    backgroundColor: '#1565C0',
  },
  warningButton: {
    backgroundColor: '#FF6D00',
  },
  responseText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center',
  },
});

export default IncomingAlertModal;
