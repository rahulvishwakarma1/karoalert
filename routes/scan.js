const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const pushService = require('../services/pushService');
const notificationService = require('../services/notificationService');

const router = express.Router();

// ── Dedupe: same owner + same QR ringing twice within a short window ──
// Stops double-taps / network retries from triggering multiple rings.
const recentRingRequests = new Map();
const RING_DEDUPE_WINDOW_MS = 8000;

const isDuplicateRingRequest = (ownerId, qrCodeId) => {
  const key = `${ownerId}|${qrCodeId}`;
  const now = Date.now();
  const last = recentRingRequests.get(key);
  if (last && now - last < RING_DEDUPE_WINDOW_MS) return true;
  recentRingRequests.set(key, now);
  return false;
};

// ── Public: Get owner details by QR code ID ───────────────────────────
router.get('/public/:qrCodeId', async (req, res) => {
  try {
    const qrCodeId = req.params.qrCodeId;

    // Fetch QR code, user, and primary vehicle in one joined query
    const [rows] = await pool.execute(
      `SELECT u.id, u.name, u.phone, u.car_number,
              v.id   AS vehicle_id,
              v.vehicle_type, v.vehicle_number, v.owner_name, v.mobile_number AS vehicle_mobile,
              v.hide_mobile_number, v.emergency_number, v.hide_emergency_number,
              qc.qr_code_id
         FROM qr_codes qc
         JOIN users     u ON qc.user_id = u.id
    LEFT JOIN vehicles v ON qc.vehicle_id = v.id
        WHERE qc.qr_code_id = ? AND qc.is_active = TRUE`,
      [qrCodeId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found or expired' });
    }

    const r = rows[0];

    // Log the scan
    await pool.execute(
      'INSERT INTO scan_history (qr_code_id, user_id, vehicle_id, scanned_at) VALUES (?, ?, ?, NOW())',
      [qrCodeId, r.id, r.vehicle_id || null]
    ).catch(() => { /* ignore logging errors */ });

    res.status(200).json({
      owner: {
        id: r.id,
        name: r.name,
        car_number: r.car_number,
        vehicle_id: r.vehicle_id || null,
        vehicle_type: r.vehicle_type || null,
        vehicle_number: r.vehicle_number || null,
        vehicle_owner: r.owner_name || null,
        mobile_number: r.hide_mobile_number ? null : (r.vehicle_mobile || r.phone || null),
        hide_mobile_number: !!r.hide_mobile_number,
        emergency_number: r.hide_emergency_number ? null : (r.emergency_number || null),
        hide_emergency_number: !!r.hide_emergency_number,
      }
    });
  } catch (error) {
    console.error('Scan lookup error:', error);
    res.status(500).json({ error: 'Failed to fetch owner details' });
  }
});

// ── Authenticated: Send notification to owner ──────────────────────────
router.post('/notify', authenticateToken, [
  body('owner_id').isInt().withMessage('Owner ID required'),
  body('message').trim().isLength({ min: 1, max: 500 }).withMessage('Message required (1-500 chars)')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { owner_id, message } = req.body;
    const senderId = req.user.userId;

    const [senderRows] = await pool.execute(
      'SELECT name, phone FROM users WHERE id = ?',
      [senderId]
    );
    if (senderRows.length === 0) {
      return res.status(404).json({ error: 'Sender not found' });
    }

    const [notificationInsert] = await pool.execute(
      `INSERT INTO notifications (user_id, sender_name, sender_mobile, message, notification_type, status, sent_at)
       VALUES (?, ?, ?, ?, 'NOTIFICATION', 'SENT', NOW())`,
      [owner_id, senderRows[0].name, senderRows[0].phone, message]
    );

    const io = req.app.get('io');
    const connectedUsers = req.app.get('connectedUsers');
    const ownerSocketId = connectedUsers?.get(String(owner_id));

    if (io && ownerSocketId) {
      io.to(ownerSocketId).emit('notification_created', {
        id: notificationInsert.insertId,
        sender_name: senderRows[0].name,
        sender_mobile: senderRows[0].phone,
        message,
        notification_type: 'NOTIFICATION',
        status: 'SENT',
        sent_at: new Date(),
        created_at: new Date(),
      });
    }

    res.status(201).json({ message: 'Notification sent successfully' });
  } catch (error) {
    console.error('Notification send error:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// ── Authenticated: Get owner's notifications ───────────────────────────
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, sender_name, sender_mobile, message,
              notification_type, status, sent_at, created_at
         FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 50`,
      [req.user.userId]
    );
    res.json({ notifications: rows });
  } catch (error) {
    console.error('Fetch notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// ── Authenticated: Get scan history ────────────────────────────────────
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT sc.id, sc.qr_code_id, sc.vehicle_id,
              sc.scanned_at, sc.notification_sent,
              u.name AS owner_name, u.phone AS owner_phone,
              v.vehicle_type, v.vehicle_number
         FROM scan_history sc
         JOIN users u ON sc.user_id = u.id
    LEFT JOIN vehicles v ON sc.vehicle_id = v.id
        WHERE sc.user_id = ?
        ORDER BY sc.scanned_at DESC
        LIMIT 100`,
      [req.user.userId]
    );
    res.json({ scans: rows });
  } catch (error) {
    console.error('Scan history error:', error);
    res.status(500).json({ error: 'Failed to fetch scan history' });
  }
});

// ── No-auth: Scan QR code (used by LoginScreen / QRScanner) ─────────────
router.post('/scan', async (req, res) => {
  try {
    const { qr_code_id } = req.body;

    if (!qr_code_id) {
      return res.status(400).json({ error: 'QR code ID is required' });
    }

    const [rows] = await pool.execute(
      `SELECT qc.qr_code_id, qc.qr_data,
              qc.vehicle_id, qc.user_id AS id,
              u.name AS owner_name, u.phone AS owner_phone, u.name, u.phone, u.car_number,
              v.vehicle_type, v.vehicle_number, v.owner_name AS v_owner_name,
              v.mobile_number AS v_mobile, v.hide_mobile_number,
              v.emergency_number, v.hide_emergency_number
         FROM qr_codes qc
         JOIN users u ON qc.user_id = u.id
    LEFT JOIN vehicles v ON qc.vehicle_id = v.id
        WHERE qc.qr_code_id = ? AND qc.is_active = TRUE`,
      [qr_code_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found or inactive' });
    }

    const r = rows[0];
    const now = new Date();

    let scanInsert = null;
    let notificationInsert = null;

    // Log scan
    try {
      const [result] = await pool.execute(
        'INSERT INTO scan_history (qr_code_id, user_id, vehicle_id, scanned_at, notification_sent) VALUES (?, ?, ?, NOW(), FALSE)',
        [qr_code_id, r.id, r.vehicle_id || null]
      );
      scanInsert = result;
    } catch (error) {}

    // Notify owner (store notification only — Twilio SMS optional)
    try {
      const [result] = await pool.execute(
        `INSERT INTO notifications
           (user_id, message, notification_type, status, sent_at)
         VALUES (?, ?, 'NOTIFICATION', 'SENT', NOW())`,
        [r.id, `Your vehicle was scanned at ${now.toLocaleString()}.`]
      );
      notificationInsert = result;
    } catch (error) {}

    const io = req.app.get('io');
    const connectedUsers = req.app.get('connectedUsers');
    const ownerSocketId = connectedUsers?.get(String(r.id));

    if (io && ownerSocketId) {
      const scanPayload = {
        id: scanInsert?.insertId || `${Date.now()}`,
        qr_code_id,
        vehicle_id: r.vehicle_id || null,
        scanned_at: now,
        notification_sent: false,
        owner_name: r.name,
        owner_phone: r.owner_phone || r.phone,
        vehicle_type: r.vehicle_type,
        vehicle_number: r.vehicle_number || r.car_number || 'N/A',
      };
      const notificationPayload = {
        id: notificationInsert?.insertId || `${Date.now()}-notification`,
        sender_name: null,
        sender_mobile: null,
        message: `Your vehicle was scanned at ${now.toLocaleString()}.`,
        notification_type: 'NOTIFICATION',
        status: 'SENT',
        sent_at: now,
        created_at: now,
      };

      io.to(ownerSocketId).emit('scan_created', scanPayload);
      io.to(ownerSocketId).emit('notification_created', notificationPayload);
    }

    res.json({
      message: 'QR code scanned successfully',
      vehicle: {
        vehicle_type:     r.vehicle_type     || 'Car',
        vehicle_number:   r.vehicle_number   || r.car_number  || 'N/A',
        owner_name:       r.v_owner_name     || r.owner_name  || r.name,
        mobile_number:    r.hide_mobile_number ? null : (r.v_mobile || r.phone || null),
        hide_mobile_number: !!r.hide_mobile_number,
        emergency_number: r.hide_emergency_number ? null : (r.emergency_number || null),
        hide_emergency_number: !!r.hide_emergency_number
      },
      scan_info: {
        owner_name:  r.name,
        scan_time:   now
      }
    });
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ error: 'Scan processing failed' });
  }
});

// ── No-auth: Ring owner (Triggered by scanner) ─────────────
router.post('/ring', async (req, res) => {
  try {
    const { qr_code_id, scanner_socket_id, scanner_user_id } = req.body;
    if (!qr_code_id) return res.status(400).json({ error: 'QR code ID is required' });

    const [rows] = await pool.execute(
      `SELECT qc.user_id FROM qr_codes qc WHERE qc.qr_code_id = ? AND qc.is_active = TRUE`,
      [qr_code_id]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'QR code not found' });

    const ownerId = String(rows[0].user_id);
    const io = req.app.get('io');
    const connectedUsers = req.app.get('connectedUsers');
    const pendingCalls = req.app.get('pendingCalls');

    if (isDuplicateRingRequest(ownerId, qr_code_id)) {
      return res.json({
        message: 'Owner is already being alerted for this vehicle.',
        already_ringing: true,
      });
    }

    let scannerPhone = null;
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const now = new Date().toISOString();
    const alertPayload = {
      request_id: requestId,
      qr_code_id,
      scanner_socket_id: scanner_socket_id || null,
      scanner_user_id: scanner_user_id || null,
      scanner_phone: null,
      sent_at: now,
      sms_gateway_configured: !!(
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_PHONE_NUMBER
      ),
      message: 'Your vehicle is blocking the way!'
    };

    if (scanner_user_id) {
      const [scannerRows] = await pool.execute(
        'SELECT phone FROM users WHERE id = ?',
        [scanner_user_id]
      );
      scannerPhone = scannerRows[0]?.phone || null;
      alertPayload.scanner_phone = scannerPhone;
    }

    const socketId = connectedUsers.get(ownerId);
    if (socketId) {
      io.to(socketId).emit('incoming_alert', alertPayload);
      return res.json({
        message: 'Ringing started on owner device',
        push_sent: false,
      });
    }

    const ownerPushTokens = await pushService.getUserPushTokens(ownerId);
    if (ownerPushTokens && ownerPushTokens.hasAny) {
      const pushResult = await pushService.pushWithFallback({
        userId: ownerId,
        fcmToken: ownerPushTokens.fcmToken,
        expoToken: ownerPushTokens.expoToken,
        send: pushService.sendIncomingAlertPush,
        args: {
          qrCodeId: qr_code_id,
          requestId,
          scannerSocketId: scanner_socket_id || null,
          scannerUserId: scanner_user_id || null,
          scannerPhone,
          message: alertPayload.message,
        },
      });

      if (pushResult.sent) {
        pushService.scheduleCallReminders({
          requestId, fcmToken: pushResult.usedToken, qrCodeId: qr_code_id,
          scannerSocketId: scanner_socket_id, scannerUserId: scanner_user_id,
          scannerPhone, message: alertPayload.message,
          type: 'alert',
        });

        pendingCalls?.set(requestId, {
          ownerId,
          qrCodeId: qr_code_id,
          callerSocketId: scanner_socket_id || null,
          fcmToken: pushResult.usedToken,
          scannerUserId: scanner_user_id || null,
          type: 'ring',
        });

        return res.status(202).json({
          message: 'Owner app is closed. Push notification sent.',
          push_sent: true,
          push_channel: pushResult.channel,
          request_id: requestId,
        });
      }
    }

    const [ownerRows] = await pool.execute('SELECT phone FROM users WHERE id = ?', [ownerId]);
    const ownerPhone = ownerRows[0]?.phone;
    if (ownerPhone) {
      const smsResult = await notificationService.sendSMS(ownerPhone, alertPayload.message + ' Reply or open the app.');
      if (smsResult.success) {
        return res.status(202).json({
          message: 'Owner is offline. SMS sent.',
          sms_sent: true,
          request_id: requestId,
        });
      }
    }

    return res.status(404).json({ error: 'Owner is currently offline and push notification is not available' });
  } catch (error) {
    console.error('Ring error:', error);
    res.status(500).json({ error: 'Failed to ring owner' });
  }
});

// ── No-auth: Start app-to-app voice call ─────────────
router.post('/call', async (req, res) => {
  try {
    const { qr_code_id, scanner_socket_id, scanner_user_id } = req.body;

    if (!qr_code_id) return res.status(400).json({ error: 'QR code ID is required' });
    if (!scanner_socket_id) return res.status(400).json({ error: 'Scanner socket ID is required' });

    const [rows] = await pool.execute(
      `SELECT qc.user_id, u.name AS owner_name
         FROM qr_codes qc
         JOIN users u ON qc.user_id = u.id
        WHERE qc.qr_code_id = ? AND qc.is_active = TRUE`,
      [qr_code_id]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'QR code not found' });

        const ownerId = String(rows[0].user_id);
    const ownerName = rows[0].owner_name || 'Owner';
    const io = req.app.get('io');
    const connectedUsers = req.app.get('connectedUsers');
    const pendingCalls = req.app.get('pendingCalls');

    if (isDuplicateRingRequest(ownerId, qr_code_id)) {
      return res.json({
        message: 'Owner is already being called for this vehicle.',
        already_ringing: true,
      });
    }

    const ownerSocketId = connectedUsers.get(ownerId);
    const callId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    let scannerName = 'Someone';

    if (scanner_user_id) {
      const [scannerRows] = await pool.execute(
        'SELECT name FROM users WHERE id = ?',
        [scanner_user_id]
      );
      scannerName = scannerRows[0]?.name || scannerName;
    }

    const callPayload = {
      call_id: callId,
      qr_code_id,
      caller_socket_id: scanner_socket_id,
      caller_user_id: scanner_user_id || null,
      owner_user_id: ownerId,
      owner_name: ownerName,
      caller_name: scannerName,
      sent_at: new Date().toISOString(),
      message: 'Incoming app call for your vehicle',
    };

    if (ownerSocketId) {
      io.to(ownerSocketId).emit('incoming_call', callPayload);
      return res.json({
        message: 'App call request sent to owner',
        call_id: callId,
        owner_socket_id: ownerSocketId,
        owner_name: ownerName,
        push_sent: false,
      });
    }

    const ownerPushTokens = await pushService.getUserPushTokens(ownerId);
    if (ownerPushTokens && ownerPushTokens.hasAny) {
      const pushResult = await pushService.pushWithFallback({
        userId: ownerId,
        fcmToken: ownerPushTokens.fcmToken,
        expoToken: ownerPushTokens.expoToken,
        send: pushService.sendIncomingCallPush,
        args: {
          callerName: scannerName,
          qrCodeId: qr_code_id,
          callId,
          scannerSocketId: scanner_socket_id,
          scannerUserId: scanner_user_id || null,
          ownerUserId: ownerId,
        },
      });

      if (pushResult.sent) {
        pushService.scheduleCallReminders({
          callId, fcmToken: pushResult.usedToken, callerName: scannerName, qrCodeId: qr_code_id,
          scannerSocketId: scanner_socket_id, scannerUserId: scanner_user_id, ownerUserId: ownerId,
          type: 'call',
        });

        const timeoutMs = Number(process.env.MISSED_CALL_TIMEOUT_MS) || 300000;
        const timeoutId = setTimeout(async () => {
          try {
            if (!pendingCalls?.has(callId)) return;
            pushService.stopCallReminders(callId);
            pendingCalls.delete(callId);
            await pushService.pushWithFallback({
              userId: ownerId,
              fcmToken: ownerPushTokens.fcmToken,
              expoToken: ownerPushTokens.expoToken,
              send: pushService.sendMissedCallPush,
              args: {
                callerName: scannerName,
                qrCodeId: qr_code_id,
                callId,
                scannerUserId: scanner_user_id || null,
                ownerUserId: ownerId,
              },
            });

            if (scanner_socket_id) {
              io.to(scanner_socket_id).emit('call_response', {
                call_id: callId,
                caller_socket_id: scanner_socket_id,
                caller_user_id: scanner_user_id || null,
                response: 'missed',
                message: 'Owner did not answer the app call.',
              });
            }
          } catch (missedCallError) {
            console.error('Missed call push failed:', missedCallError);
          }
        }, timeoutMs);

        pendingCalls?.set(callId, {
          ownerId,
          scannerUserId: scanner_user_id || null,
          timeoutId,
          fcmToken: pushResult.usedToken,
          scannerName,
          qrCodeId: qr_code_id,
          callerSocketId: scanner_socket_id,
        });

        return res.status(202).json({
          message: 'Owner is offline. Push notification sent for incoming call.',
          call_id: callId,
          owner_name: ownerName,
          push_sent: true,
          push_channel: pushResult.channel,
        });
      }
    }

    const [ownerRows] = await pool.execute('SELECT phone FROM users WHERE id = ?', [ownerId]);
    const ownerPhone = ownerRows[0]?.phone;
    if (ownerPhone) {
      const smsResult = await notificationService.sendSMS(ownerPhone, `${scannerName} is trying to call you about your vehicle. Open the app to answer.`);
      if (smsResult.success) {
        return res.status(202).json({
          message: 'Owner is offline. SMS sent.',
          call_id: callId,
          sms_sent: true,
        });
      }
    }

    return res.status(404).json({ error: 'Owner is currently offline' });
  } catch (error) {
    console.error('Call initiate error:', error);
    res.status(500).json({ error: 'Failed to initiate app call' });
  }
});

// ── No-auth: Cancel pending call / ring (scanner cancels) ─────────────
router.post('/cancel-call', async (req, res) => {
  try {
    const { call_id, qr_code_id } = req.body;
    if (!call_id && !qr_code_id) {
      return res.status(400).json({ error: 'call_id or qr_code_id is required' });
    }

    const io = req.app.get('io');
    const pendingCalls = req.app.get('pendingCalls');

    let resolvedCallId = call_id;

    if (!resolvedCallId && qr_code_id) {
      for (const [cid, data] of pendingCalls || []) {
        if (data.qrCodeId === qr_code_id) {
          resolvedCallId = cid;
          break;
        }
      }
    }

    if (!resolvedCallId || !pendingCalls?.has(resolvedCallId)) {
      return res.status(404).json({ error: 'No pending call found' });
    }

    const pendingCall = pendingCalls.get(resolvedCallId);
    if (pendingCall?.timeoutId) clearTimeout(pendingCall.timeoutId);
    pushService.stopCallReminders(resolvedCallId);
    pendingCalls.delete(resolvedCallId);

    if (pendingCall?.fcmToken) {
      await pushService.sendCancelCallPush({
        fcmToken: pendingCall.fcmToken,
        callId: resolvedCallId,
        ownerUserId: pendingCall.ownerId,
      }).catch(err => console.error('Cancel push failed:', err));
    }

    if (pendingCall?.callerSocketId) {
      if (pendingCall.type === 'ring') {
        io.to(pendingCall.callerSocketId).emit('alert_response', {
          request_id: resolvedCallId,
          response_text: 'You cancelled the alert request.',
        });
      } else {
        io.to(pendingCall.callerSocketId).emit('call_response', {
          call_id: resolvedCallId,
          caller_socket_id: pendingCall.callerSocketId,
          response: 'cancelled',
          message: 'You cancelled the call request.',
        });
      }
    }

    res.json({ message: 'Call request cancelled successfully' });
  } catch (error) {
    console.error('Cancel call error:', error);
    res.status(500).json({ error: 'Failed to cancel call' });
  }
});

module.exports = router;
