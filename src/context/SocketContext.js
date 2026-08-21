import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { getSocketBaseUrl } from '../config/network';

const SocketContext = createContext(null);

export const useSocket = () => useContext(SocketContext);

const RECONNECTION_DELAYS = [1000, 2000, 5000, 10000, 30000];

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const socketRef = useRef(null);
  const reconnectIndexRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const createSocketRef = useRef(null);
  const userIdRef = useRef(user?.id);

  userIdRef.current = user?.id;

  const cleanupSocket = (sock) => {
    if (!sock) return;
    sock.off('connect');
    sock.off('disconnect');
    sock.off('connect_error');
    sock.off('error');
    sock.disconnect();
  };

  createSocketRef.current = () => {
    if (!userIdRef.current) return;
    if (socketRef.current) {
      cleanupSocket(socketRef.current);
    }
    const API_URL = getSocketBaseUrl();
    const newSocket = io(API_URL, {
      reconnection: false,
      transports: ['websocket', 'polling'],
      timeout: 10000,
    });

    newSocket.on('connect', () => {
      reconnectIndexRef.current = 0;
      const uid = userIdRef.current;
      if (uid) newSocket.emit('register', uid);
    });

    newSocket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect' || reason === 'transport close') {
        scheduleReconnect();
      }
    });

    newSocket.on('connect_error', () => {
      scheduleReconnect();
    });

    newSocket.on('error', () => {
      scheduleReconnect();
    });

    socketRef.current = newSocket;
    setSocket(newSocket);
  };

  const scheduleReconnect = () => {
    if (!userIdRef.current) return;
    const delay = RECONNECTION_DELAYS[reconnectIndexRef.current] || RECONNECTION_DELAYS[RECONNECTION_DELAYS.length - 1];
    reconnectIndexRef.current = Math.min(reconnectIndexRef.current + 1, RECONNECTION_DELAYS.length - 1);
    reconnectTimerRef.current = setTimeout(() => {
      if (createSocketRef.current) createSocketRef.current();
    }, delay);
  };

  useEffect(() => {
    if (user?.id) {
      createSocketRef.current();
    } else if (socketRef.current) {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      cleanupSocket(socketRef.current);
      socketRef.current = null;
      setSocket(null);
    }
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [user]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};
