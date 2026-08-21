const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const twilio = require('twilio');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const formatPhoneNumber = (phone) => {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  if (raw.startsWith('+')) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  return digits || raw;
};

const startCallDeduction = (callId, callerUserId, client, callerSid, ownerSid, maxSeconds, activeDeductions, io, userSockets) => {
  const emitBalance = (status, remaining, totalUsed = null) => {
    if (!io || !callerUserId) return;
    const sids = userSockets?.get(String(callerUserId));
    for (const sid of sids || []) {
      const target = io.sockets.sockets.get(sid);
      if (target) {
        target.emit('private_call_balance_update', {
          call_id: callId,
          remaining_seconds: remaining,
          total_seconds_used: totalUsed,
          status,
        });
      }
    }
  };

  const deductionInterval = setInterval(async () => {
    try {
      const [hRow] = await pool.execute(
        'SELECT end_time, call_status FROM private_call_history WHERE id = ?',
        [callId]
      );

      if (hRow[0]?.end_time || ['completed', 'failed', 'no_answer', 'insufficient_balance'].includes(hRow[0]?.call_status)) {
        clearInterval(deductionInterval);
        activeDeductions?.delete(callId);
        emitBalance('ended', -1);
        return;
      }

      const [cRow] = await pool.execute(
        'SELECT remaining_seconds FROM private_call_balances WHERE user_id = ?',
        [callerUserId]
      );
      let currentSec = cRow.length > 0 ? parseInt(cRow[0].remaining_seconds) : 0;

      if (currentSec <= 0) {
        clearInterval(deductionInterval);
        activeDeductions?.delete(callId);
        await pool.execute(
          `UPDATE private_call_history
           SET end_time = NOW(), duration_seconds = TIMESTAMPDIFF(SECOND, start_time, NOW()),
               seconds_used = seconds_used, call_status = 'insufficient_balance',
               disconnect_reason = 'Caller balance reached zero'
           WHERE id = ? AND end_time IS NULL`,
          [callId]
        );
        emitBalance('exhausted', 0);
        for (const sid of [callerSid, ownerSid].filter(Boolean)) {
          await client.calls(sid).update({ status: 'completed' }).catch(() => {});
        }
        return;
      }

      const secondsBefore = currentSec;

      await pool.execute(
        'UPDATE private_call_balances SET remaining_seconds = remaining_seconds - 1, total_seconds_used = total_seconds_used + 1 WHERE user_id = ? AND remaining_seconds > 0',
        [callerUserId]
      );

      await pool.execute(
        'UPDATE private_call_history SET seconds_used = seconds_used + 1 WHERE id = ?',
        [callId]
      );

      const [updatedRow] = await pool.execute(
        'SELECT remaining_seconds, total_seconds_used FROM private_call_balances WHERE user_id = ?',
        [callerUserId]
      );
      const secondsAfter = updatedRow.length > 0 ? parseInt(updatedRow[0].remaining_seconds) : 0;
      const totalUsedAfter = updatedRow.length > 0 ? parseInt(updatedRow[0].total_seconds_used) : null;

      await pool.execute(
        `INSERT INTO private_call_deductions (call_id, user_id, seconds_before, seconds_after)
         VALUES (?, ?, ?, ?)`,
        [callId, callerUserId, secondsBefore, secondsAfter]
      );

      emitBalance('active', secondsAfter, totalUsedAfter);
    } catch (deductError) {
      console.error('Deduction error:', deductError);
    }
  }, 1000);

  activeDeductions?.set(callId, deductionInterval);

  if (maxSeconds > 0) {
    setTimeout(async () => {
      clearInterval(deductionInterval);
      activeDeductions?.delete(callId);
      try {
        const [hRow] = await pool.execute('SELECT end_time FROM private_call_history WHERE id = ?', [callId]);
        if (!hRow[0]?.end_time) {
          await pool.execute(
            `UPDATE private_call_history
             SET end_time = NOW(), duration_seconds = TIMESTAMPDIFF(SECOND, start_time, NOW()),
                 call_status = 'completed', disconnect_reason = 'Call timeout'
             WHERE id = ?`,
            [callId]
          );
        }
        for (const sid of [callerSid, ownerSid].filter(Boolean)) {
          await client.calls(sid).update({ status: 'completed' }).catch(() => {});
        }
      } catch (e) {}
    }, maxSeconds * 1000 + 60000);
  }
};

const requireAdmin = async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT is_admin FROM users WHERE id = ?', [req.user.userId]);
    if (rows.length === 0 || !rows[0].is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Admin check failed' });
  }
};

const getRazorpayClient = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay keys are not configured');
  }
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
};

// ── PRIVATE CALL PLANS (Admin) ──

router.get('/plans', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM private_call_plans ORDER BY plan_order ASC'
    );
    res.json({ plans: rows });
  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

router.get('/plans/all', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM private_call_plans ORDER BY plan_order ASC');
    res.json({ plans: rows });
  } catch (error) {
    console.error('Get all plans error:', error);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

router.post('/plans', authenticateToken, requireAdmin, [
  body('name').trim().notEmpty().withMessage('Plan name required'),
  body('price').isFloat({ min: 1 }).withMessage('Valid price required'),
  body('display_minutes').isFloat({ min: 0.1 }).withMessage('Valid display minutes required'),
  body('actual_seconds').isInt({ min: 1 }).withMessage('Valid actual seconds required'),
  body('description').optional().trim(),
  body('plan_order').optional().isInt(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, description, price, display_minutes, actual_seconds, plan_order } = req.body;
    const [result] = await pool.execute(
      `INSERT INTO private_call_plans (name, description, price, display_minutes, actual_seconds, plan_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, description || '', price, display_minutes, actual_seconds, plan_order || 0]
    );

    res.status(201).json({ message: 'Plan created', plan_id: result.insertId });
  } catch (error) {
    console.error('Create plan error:', error);
    res.status(500).json({ error: 'Failed to create plan' });
  }
});

router.put('/plans/:id', authenticateToken, requireAdmin, [
  body('name').optional().trim().notEmpty(),
  body('price').optional().isFloat({ min: 1 }),
  body('display_minutes').optional().isFloat({ min: 0.1 }),
  body('actual_seconds').optional().isInt({ min: 1 }),
  body('description').optional().trim(),
  body('plan_order').optional().isInt(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const fields = ['name', 'description', 'price', 'display_minutes', 'actual_seconds', 'plan_order', 'is_active'];
    const updates = [];
    const values = [];

    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        values.push(req.body[f]);
      }
    });

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.params.id);
    await pool.execute(`UPDATE private_call_plans SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ message: 'Plan updated' });
  } catch (error) {
    console.error('Update plan error:', error);
    res.status(500).json({ error: 'Failed to update plan' });
  }
});

router.delete('/plans/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await pool.execute('DELETE FROM private_call_plans WHERE id = ?', [req.params.id]);
    res.json({ message: 'Plan deleted' });
  } catch (error) {
    console.error('Delete plan error:', error);
    res.status(500).json({ error: 'Failed to delete plan' });
  }
});

// ── CALLER BALANCE ──

router.get('/balance', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT remaining_seconds, total_seconds_purchased, total_seconds_used, last_purchase_at FROM private_call_balances WHERE user_id = ?',
      [req.user.userId]
    );
    if (rows.length === 0) {
      return res.json({ remaining_seconds: 0, total_seconds_purchased: 0, total_seconds_used: 0, last_purchase_at: null });
    }
    res.json({ balance: rows[0] });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

// ── OWNER SERVICE STATUS ──

router.get('/owner-service', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT is_active, service_expires_at, total_seconds_purchased, last_recharge_at FROM private_call_owner_services WHERE user_id = ?',
      [req.user.userId]
    );
    if (rows.length === 0) {
      return res.json({ service: { is_active: false, service_expires_at: null, total_seconds_purchased: 0, last_recharge_at: null } });
    }
    const s = rows[0];
    const expired = s.service_expires_at && new Date(s.service_expires_at) <= new Date();
    let status = 'inactive';
    if (s.is_active && !expired) status = 'active';
    else if (s.is_active && expired) status = 'expired';

    res.json({
      service: {
        is_active: s.is_active && !expired,
        status,
        service_expires_at: s.service_expires_at,
        total_seconds_purchased: s.total_seconds_purchased,
        last_recharge_at: s.last_recharge_at,
      }
    });
  } catch (error) {
    console.error('Get owner service error:', error);
    res.status(500).json({ error: 'Failed to fetch owner service' });
  }
});

// ── PURCHASE: CALLER SECONDS ──

router.post('/purchase/create-order', authenticateToken, [
  body('plan_id').isInt().withMessage('Plan ID required'),
], async (req, res) => {
  try {
    const { plan_id } = req.body;
    const [plans] = await pool.execute(
      'SELECT * FROM private_call_plans WHERE id = ?',
      [plan_id]
    );
    if (plans.length === 0) return res.status(404).json({ error: 'Plan not found' });

    const plan = plans[0];
    const razorpay = getRazorpayClient();
    const amountPaise = Math.round(parseFloat(plan.price) * 100);
    const receipt = `pc_${req.user.userId}_${Date.now()}`;

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt,
      notes: {
        user_id: String(req.user.userId),
        plan_id: String(plan_id),
        type: 'caller_seconds',
      },
    });

    res.json({
      key_id: process.env.RAZORPAY_KEY_ID,
      plan: {
        id: plan.id,
        name: plan.name,
        price: plan.price,
        display_minutes: plan.display_minutes,
        actual_seconds: plan.actual_seconds,
      },
      order: { id: order.id, amount: order.amount, currency: order.currency, receipt: order.receipt },
    });
  } catch (error) {
    console.error('Purchase create order error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

router.post('/purchase/success', authenticateToken, [
  body('razorpay_payment_id').trim().notEmpty(),
  body('razorpay_order_id').trim().notEmpty(),
  body('razorpay_signature').trim().notEmpty(),
  body('plan_id').isInt(),
  body('type').optional().isIn(['caller_seconds', 'owner_service']),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const userId = req.user.userId;
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, plan_id, type = 'caller_seconds' } = req.body;

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    const [existing] = await pool.execute(
      'SELECT id FROM private_call_transactions WHERE payment_id = ? AND provider = ?',
      [razorpay_payment_id, 'razorpay']
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Payment already processed' });
    }

    const [plans] = await pool.execute('SELECT * FROM private_call_plans WHERE id = ?', [plan_id]);
    if (plans.length === 0) return res.status(404).json({ error: 'Plan not found' });

    const plan = plans[0];
    const secondsToAdd = parseInt(plan.actual_seconds);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      if (type === 'caller_seconds') {
        const [balRows] = await connection.execute(
          'SELECT remaining_seconds, total_seconds_purchased FROM private_call_balances WHERE user_id = ? FOR UPDATE',
          [userId]
        );

        const currentSeconds = balRows.length > 0 ? parseInt(balRows[0].remaining_seconds) : 0;
        const totalPurchased = balRows.length > 0 ? parseInt(balRows[0].total_seconds_purchased) : 0;

        await connection.execute(
          `INSERT INTO private_call_balances (user_id, remaining_seconds, total_seconds_purchased, last_purchase_at)
           VALUES (?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             remaining_seconds = remaining_seconds + ?,
             total_seconds_purchased = total_seconds_purchased + ?,
             last_purchase_at = NOW()`,
          [userId, currentSeconds + secondsToAdd, totalPurchased + secondsToAdd, secondsToAdd, secondsToAdd]
        );
      } else if (type === 'owner_service') {
        await connection.execute(
          `INSERT INTO private_call_owner_services (user_id, is_active, service_expires_at, total_seconds_purchased, last_recharge_at)
           VALUES (?, TRUE, DATE_ADD(NOW(), INTERVAL 30 DAY), ?, NOW())
           ON DUPLICATE KEY UPDATE
             is_active = TRUE,
             service_expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY),
             total_seconds_purchased = total_seconds_purchased + ?,
             last_recharge_at = NOW()`,
          [userId, secondsToAdd, secondsToAdd]
        );
      }

      await connection.execute(
        `INSERT INTO private_call_transactions
         (user_id, plan_id, type, payment_id, order_id, signature, amount, seconds_added, status, provider, raw_payload)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'paid', 'razorpay', ?)`,
        [userId, plan_id, type, razorpay_payment_id, razorpay_order_id, razorpay_signature, plan.price, secondsToAdd, JSON.stringify(req.body)]
      );

      await connection.commit();

      res.json({
        message: 'Payment successful',
        type,
        seconds_added: secondsToAdd,
      });
    } catch (txnError) {
      await connection.rollback();
      throw txnError;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Purchase success error:', error);
    res.status(500).json({ error: 'Failed to process payment' });
  }
});

// ── START PRIVATE CALL ──

router.post('/start-call', authenticateToken, [
  body('qr_code_id').trim().notEmpty(),
  body('call_type').optional().isIn(['private_call', 'private_emergency']),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const callerUserId = req.user.userId;
    const { qr_code_id, call_type = 'private_call' } = req.body;

    const [qrRows] = await pool.execute(
      `SELECT qc.user_id AS owner_user_id,
              COALESCE(NULLIF(v.mobile_number, ''), u.phone) AS owner_phone,
              v.emergency_number,
              u.name AS owner_name
         FROM qr_codes qc
         JOIN users u ON qc.user_id = u.id
    LEFT JOIN vehicles v ON qc.vehicle_id = v.id
        WHERE qc.qr_code_id = ? AND qc.is_active = TRUE`,
      [qr_code_id]
    );

    if (qrRows.length === 0) {
      return res.status(404).json({ error: 'QR code not found or inactive' });
    }

    const ownerUserId = qrRows[0].owner_user_id;
    const receiverPhone = call_type === 'private_emergency'
      ? qrRows[0].emergency_number
      : qrRows[0].owner_phone;

    if (parseInt(callerUserId) === parseInt(ownerUserId)) {
      return res.status(400).json({ error: 'You cannot call yourself' });
    }

    if (!receiverPhone) {
      return res.status(400).json({
        error: call_type === 'private_emergency'
          ? 'Emergency number is not available'
          : 'Owner phone number is not available',
      });
    }

    const [balRows] = await pool.execute(
      'SELECT remaining_seconds FROM private_call_balances WHERE user_id = ?',
      [callerUserId]
    );
    const callerSeconds = balRows.length > 0 ? parseInt(balRows[0].remaining_seconds) : 0;

    if (callerSeconds <= 0) {
      return res.status(402).json({
        error: 'Insufficient balance. Please purchase call seconds.',
        code: 'insufficient_balance',
        remaining_seconds: 0,
      });
    }

    const [callerRows] = await pool.execute('SELECT phone FROM users WHERE id = ?', [callerUserId]);
    const callerPhone = callerRows[0]?.phone;

    if (!callerPhone) {
      return res.status(400).json({ error: 'Caller phone number not found' });
    }

    const [callResult] = await pool.execute(
      `INSERT INTO private_call_history
       (caller_user_id, owner_user_id, qr_code_id, receiver_phone_encrypted, start_time, call_status, disconnect_reason)
       VALUES (?, ?, ?, AES_ENCRYPT(?, UNHEX(SHA2(?, 32))), NOW(), 'initiated', ?)`,
      [
        callerUserId,
        ownerUserId,
        qr_code_id,
        receiverPhone,
        process.env.JWT_SECRET || 'private_call_secret',
        call_type === 'private_emergency' ? 'Private emergency call' : 'Private call',
      ]
    );

    const callId = callResult.insertId;
    const roomId = `pc_${callId}_${Date.now()}`;
    const activeDeductions = req.app.get('activeDeductions');

    try {
      const {
        TWILIO_ACCOUNT_SID,
        TWILIO_AUTH_TOKEN,
        TWILIO_PHONE_NUMBER,
      } = process.env;

      if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
        await pool.execute(
          'UPDATE private_call_history SET call_status = ? WHERE id = ?',
          ['failed', callId]
        );
        return res.status(500).json({ error: 'Twilio credentials not configured' });
      }

      const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
      const safeRoomId = String(roomId).replace(/[<>&'"]/g, (c) => ({
        '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
      }[c]));

      const conferenceTwiml = `<Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false" waitUrl="" beep="false">${safeRoomId}</Conference></Dial></Response>`;

      const callOptions = {
        twiml: conferenceTwiml,
        statusCallback: `${req.protocol}://${req.get('host')}/api/private-call/twilio-status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST',
        timeout: 120,
      };

      const [callerCall, ownerCall] = await Promise.all([
        client.calls.create({
          ...callOptions,
          to: formatPhoneNumber(callerPhone),
          from: TWILIO_PHONE_NUMBER,
        }),
        client.calls.create({
          ...callOptions,
          to: formatPhoneNumber(receiverPhone),
          from: TWILIO_PHONE_NUMBER,
        }),
      ]);

      await pool.execute(
        `UPDATE private_call_history SET call_status = ?, twilio_call_sid = ?, twilio_conference_sid = NULL WHERE id = ?`,
        ['ringing', callerCall.sid, callId]
      );

      await pool.execute(
        `UPDATE private_call_history SET owner_twilio_call_sid = ? WHERE id = ?`,
        [ownerCall.sid, callId]
      ).catch(async () => {
        await pool.execute(
          `ALTER TABLE private_call_history
           ADD COLUMN owner_twilio_call_sid VARCHAR(255) DEFAULT NULL AFTER twilio_call_sid,
           ADD INDEX idx_owner_twilio_sid (owner_twilio_call_sid(64))`
        ).catch(() => {});
        await pool.execute(
          'UPDATE private_call_history SET owner_twilio_call_sid = ? WHERE id = ?',
          [ownerCall.sid, callId]
        );
      });

      const io = req.app.get('io');
      const connectedUsers = req.app.get('connectedUsers');
      const ownerSocketId = connectedUsers?.get(String(ownerUserId));
      if (io && ownerSocketId) {
        io.to(ownerSocketId).emit('private_call_started', {
          call_id: callId,
          caller_name: req.user.name || 'Someone',
          room: roomId,
        });
      }

      res.json({
        message: call_type === 'private_emergency' ? 'Private emergency call initiated' : 'Private call initiated',
        call_id: callId,
        room: roomId,
        twilio_call_sid: callerCall.sid,
        call_type,
      });
    } catch (twilioError) {
      console.error('Twilio private call error:', twilioError);

      const interval = activeDeductions?.get(callId);
      if (interval) {
        clearInterval(interval);
        activeDeductions.delete(callId);
      }

      const [hRow] = await pool.execute('SELECT end_time FROM private_call_history WHERE id = ?', [callId]);
      if (!hRow[0]?.end_time) {
        await pool.execute(
          `UPDATE private_call_history
           SET end_time = NOW(), call_status = 'failed',
               disconnect_reason = ?
           WHERE id = ?`,
          [twilioError.message, callId]
        );
      }

      res.status(500).json({
        error: twilioError?.code === 21219
          ? 'Twilio trial account restriction. Please upgrade.'
          : twilioError.message || 'Failed to start private call',
      });
    }
  } catch (error) {
    console.error('Start private call error:', error);
    res.status(500).json({ error: 'Failed to start private call' });
  }
});

// ── TWILIO STATUS CALLBACK ──

router.all('/twilio-status', async (req, res) => {
  try {
    const { CallSid, CallStatus, ConferenceSid } = { ...req.query, ...req.body };
    if (!CallSid) return res.status(200).end();

    let callStatus = 'completed';
    switch (CallStatus) {
      case 'ringing': callStatus = 'ringing'; break;
      case 'in-progress': case 'answered': callStatus = 'connected'; break;
      case 'completed': callStatus = 'completed'; break;
      case 'busy': case 'no-answer': callStatus = 'no_answer'; break;
      case 'failed': callStatus = 'failed'; break;
    }

    const [callRows] = await pool.execute(
      `SELECT id, caller_user_id, twilio_call_sid, owner_twilio_call_sid,
              TIMESTAMPDIFF(SECOND, start_time, NOW()) AS elapsed,
              call_status AS current_status
         FROM private_call_history
        WHERE twilio_call_sid = ? OR owner_twilio_call_sid = ?`,
      [CallSid, CallSid]
    );

    if (callRows.length === 0) return res.status(200).end();

    const call = callRows[0];
    const callId = call.id;
    const updates = ['call_status = ?'];
    const values = [callStatus];

    if (ConferenceSid) {
      updates.push('twilio_conference_sid = ?');
      values.push(ConferenceSid);
    }

    if (CallStatus === 'completed' || callStatus === 'no_answer' || callStatus === 'failed') {
      updates.push('end_time = COALESCE(end_time, NOW())');
      updates.push('duration_seconds = TIMESTAMPDIFF(SECOND, start_time, NOW())');
    }

    await pool.execute(
      `UPDATE private_call_history SET ${updates.join(', ')} WHERE id = ?`,
      [...values, callId]
    );

    const activeDeductions = req.app.get('activeDeductions');

    if ((CallStatus === 'in-progress' || CallStatus === 'answered') && !activeDeductions?.has(callId) && call.caller_user_id) {
      try {
        const [balRows] = await pool.execute(
          'SELECT remaining_seconds FROM private_call_balances WHERE user_id = ?',
          [call.caller_user_id]
        );
        const remainingSec = balRows.length > 0 ? parseInt(balRows[0].remaining_seconds) : 0;

        if (remainingSec > 0) {
          const {
            TWILIO_ACCOUNT_SID,
            TWILIO_AUTH_TOKEN,
          } = process.env;
          if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
            const twilioClient = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
            startCallDeduction(callId, call.caller_user_id, twilioClient, call.twilio_call_sid, call.owner_twilio_call_sid, remainingSec, activeDeductions, req.app.get('io'), req.app.get('userSockets'));
          }
        }
      } catch (deductionStartError) {
        console.error('Failed to start call deduction on answer:', deductionStartError);
      }
    }

    if (CallStatus === 'completed' || callStatus === 'no_answer' || callStatus === 'failed') {
      const interval = activeDeductions?.get(callId);
      if (interval) {
        clearInterval(interval);
        activeDeductions.delete(callId);
      }
    }

    res.status(200).end();
  } catch (error) {
    console.error('Twilio status error:', error);
    res.status(200).end();
  }
});

// ── END PRIVATE CALL ──

router.post('/end-call/:callId', authenticateToken, async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.user.userId;

    const activeDeductions = req.app.get('activeDeductions');
    const interval = activeDeductions?.get(Number(callId));
    if (interval) {
      clearInterval(interval);
      activeDeductions.delete(Number(callId));
    }

    const [rows] = await pool.execute(
      'SELECT * FROM private_call_history WHERE id = ? AND (caller_user_id = ? OR owner_user_id = ?)',
      [callId, userId, userId]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Call not found' });

    const call = rows[0];
    const twilioSids = [call.twilio_call_sid, call.owner_twilio_call_sid].filter(Boolean);
    if (twilioSids.length > 0) {
      const {
        TWILIO_ACCOUNT_SID,
        TWILIO_AUTH_TOKEN,
      } = process.env;
      if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
        const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
        for (const sid of twilioSids) {
          await client.calls(sid).update({ status: 'completed' }).catch(() => {});
        }
      }
    }

    await pool.execute(
      `UPDATE private_call_history
       SET end_time = NOW(), duration_seconds = TIMESTAMPDIFF(SECOND, start_time, NOW()),
           call_status = 'completed', disconnect_reason = 'User ended call'
       WHERE id = ? AND end_time IS NULL`,
      [callId]
    );

    res.json({ message: 'Call ended' });
  } catch (error) {
    console.error('End call error:', error);
    res.status(500).json({ error: 'Failed to end call' });
  }
});

// ── CALL HISTORY ──

router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const [rows] = await pool.execute(
      `SELECT pc.id, pc.qr_code_id, pc.start_time, pc.end_time,
              pc.duration_seconds, pc.seconds_used, pc.cost,
              pc.call_status, pc.disconnect_reason,
              CASE WHEN pc.caller_user_id = ? THEN 'outgoing' ELSE 'incoming' END AS direction,
              CASE WHEN pc.caller_user_id = ? THEN uo.name ELSE uc.name END AS other_party_name
         FROM private_call_history pc
         JOIN users uc ON pc.caller_user_id = uc.id
         JOIN users uo ON pc.owner_user_id = uo.id
        WHERE pc.caller_user_id = ? OR pc.owner_user_id = ?
        ORDER BY pc.start_time DESC
        LIMIT 50`,
      [userId, userId, userId, userId]
    );
    res.json({ calls: rows });
  } catch (error) {
    console.error('Call history error:', error);
    res.status(500).json({ error: 'Failed to fetch call history' });
  }
});

// ── PURCHASE HISTORY ──

router.get('/purchase-history', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT t.*, p.name AS plan_name, p.display_minutes, p.actual_seconds
         FROM private_call_transactions t
         JOIN private_call_plans p ON t.plan_id = p.id
        WHERE t.user_id = ?
        ORDER BY t.created_at DESC
        LIMIT 50`,
      [req.user.userId]
    );
    res.json({ transactions: rows });
  } catch (error) {
    console.error('Purchase history error:', error);
    res.status(500).json({ error: 'Failed to fetch purchase history' });
  }
});

// ── ADMIN REPORTS ──

router.post('/admin/grant-access', authenticateToken, requireAdmin, [
  body('user_id').isInt({ min: 1 }).withMessage('Valid user id required'),
  body('seconds').optional().isInt({ min: 0 }).withMessage('Seconds must be zero or more'),
  body('days').optional().isInt({ min: 0 }).withMessage('Days must be zero or more'),
  body('note').optional().trim(),
], async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const userId = Number(req.body.user_id);
    const seconds = Number(req.body.seconds || 0);
    const days = Number(req.body.days || 0);
    const note = req.body.note || '';

    if (seconds <= 0 && days <= 0) {
      return res.status(400).json({ error: 'Provide seconds or days to grant' });
    }

    const [users] = await connection.execute('SELECT id, name, email, phone FROM users WHERE id = ?', [userId]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS private_call_admin_grants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        admin_user_id INT NOT NULL,
        user_id INT NOT NULL,
        seconds_added INT NOT NULL DEFAULT 0,
        days_added INT NOT NULL DEFAULT 0,
        note VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_admin_grants_user (user_id),
        INDEX idx_admin_grants_created (created_at)
      )
    `);

    await connection.beginTransaction();

    if (seconds > 0) {
      await connection.execute(
        `INSERT INTO private_call_balances (user_id, remaining_seconds, total_seconds_purchased, last_purchase_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           remaining_seconds = remaining_seconds + VALUES(remaining_seconds),
           total_seconds_purchased = total_seconds_purchased + VALUES(total_seconds_purchased),
           last_purchase_at = NOW()`,
        [userId, seconds, seconds]
      );
    }

    if (days > 0) {
      await connection.execute(
        `INSERT INTO private_call_owner_services (user_id, is_active, service_expires_at, last_recharge_at)
         VALUES (?, TRUE, DATE_ADD(NOW(), INTERVAL ? DAY), NOW())
         ON DUPLICATE KEY UPDATE
           is_active = TRUE,
           service_expires_at = CASE
             WHEN service_expires_at IS NULL OR service_expires_at < NOW()
               THEN DATE_ADD(NOW(), INTERVAL ? DAY)
             ELSE DATE_ADD(service_expires_at, INTERVAL ? DAY)
           END,
           last_recharge_at = NOW()`,
        [userId, days, days, days]
      );
    }

    await connection.execute(
      `INSERT INTO private_call_admin_grants (admin_user_id, user_id, seconds_added, days_added, note)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.userId, userId, seconds, days, note]
    );

    await connection.commit();

    res.json({
      message: 'Private call access granted',
      user: users[0],
      seconds_added: seconds,
      days_added: days,
    });
  } catch (error) {
    await connection.rollback().catch(() => {});
    console.error('Admin grant access error:', error);
    res.status(500).json({ error: 'Failed to grant access' });
  } finally {
    connection.release();
  }
});

router.get('/admin/reports', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [[revenue]] = await pool.execute(
      `SELECT COUNT(*) AS total_transactions,
              COALESCE(SUM(amount), 0) AS total_revenue
         FROM private_call_transactions WHERE status = 'paid'`
    );

    const [planSales] = await pool.execute(
      `SELECT p.id, p.name, COUNT(t.id) AS sales_count,
              COALESCE(SUM(t.amount), 0) AS revenue
         FROM private_call_plans p
    LEFT JOIN private_call_transactions t ON t.plan_id = p.id AND t.status = 'paid'
        GROUP BY p.id, p.name`
    );

    const [[secondsStat]] = await pool.execute(
      `SELECT COALESCE(SUM(total_seconds_purchased), 0) AS total_seconds_purchased,
              COALESCE(SUM(total_seconds_used), 0) AS total_seconds_used
         FROM private_call_balances`
    );

    const [[activeUsers]] = await pool.execute(
      `SELECT COUNT(*) AS active_users
         FROM private_call_owner_services
        WHERE is_active = TRUE AND (service_expires_at IS NULL OR service_expires_at > NOW())`
    );

    const [[expiredUsers]] = await pool.execute(
      `SELECT COUNT(*) AS expired_users
         FROM private_call_owner_services
        WHERE is_active = TRUE AND service_expires_at IS NOT NULL AND service_expires_at <= NOW()`
    );

    const [[todayCalls]] = await pool.execute(
      `SELECT COUNT(*) AS today_calls
         FROM private_call_history
        WHERE DATE(start_time) = CURDATE()`
    );

    const [[monthlyCalls]] = await pool.execute(
      `SELECT COUNT(*) AS monthly_calls
         FROM private_call_history
        WHERE MONTH(start_time) = MONTH(CURDATE()) AND YEAR(start_time) = YEAR(CURDATE())`
    );

    const [topUsers] = await pool.execute(
      `SELECT u.id, u.name, u.email, u.phone, cb.total_seconds_used, cb.total_seconds_purchased,
              cb.remaining_seconds
         FROM private_call_balances cb
         JOIN users u ON cb.user_id = u.id
        ORDER BY cb.total_seconds_used DESC
        LIMIT 10`
    );

    const [[failedCalls]] = await pool.execute(
      `SELECT COUNT(*) AS failed_calls
         FROM private_call_history
        WHERE call_status IN ('failed', 'insufficient_balance', 'owner_service_inactive')`
    );

    const [allUsers] = await pool.execute(
      `SELECT u.id, u.name, u.email, u.phone,
              COALESCE(cb.remaining_seconds, 0) AS remaining_seconds,
              COALESCE(cb.total_seconds_purchased, 0) AS total_seconds_purchased,
              COALESCE(cb.total_seconds_used, 0) AS total_seconds_used,
              os.is_active AS owner_service_active,
              os.service_expires_at,
              COUNT(pc.id) AS total_calls,
              COALESCE(SUM(pc.seconds_used), 0) AS call_seconds_used
         FROM users u
    LEFT JOIN private_call_balances cb ON cb.user_id = u.id
    LEFT JOIN private_call_owner_services os ON os.user_id = u.id
    LEFT JOIN private_call_history pc ON pc.caller_user_id = u.id OR pc.owner_user_id = u.id
        GROUP BY u.id, u.name, u.email, u.phone,
                 cb.remaining_seconds, cb.total_seconds_purchased, cb.total_seconds_used,
                 os.is_active, os.service_expires_at
        ORDER BY u.created_at DESC`
    );

    res.json({
      reports: {
        revenue: {
          total_transactions: Number(revenue.total_transactions),
          total_revenue: Number(revenue.total_revenue),
        },
        plan_sales: Array.isArray(planSales) ? planSales.map(p => ({ ...p, sales_count: Number(p.sales_count), revenue: Number(p.revenue) })) : [],
        seconds: {
          total_seconds_purchased: Number(secondsStat.total_seconds_purchased),
          total_seconds_used: Number(secondsStat.total_seconds_used),
        },
        users: {
          active: Number(activeUsers.active_users),
          expired: Number(expiredUsers.expired_users),
          all: allUsers.map((u) => ({
            ...u,
            remaining_seconds: Number(u.remaining_seconds || 0),
            total_seconds_purchased: Number(u.total_seconds_purchased || 0),
            total_seconds_used: Number(u.total_seconds_used || 0),
            owner_service_active: !!u.owner_service_active,
            total_calls: Number(u.total_calls || 0),
            call_seconds_used: Number(u.call_seconds_used || 0),
          })),
          current_balance_users: topUsers,
        },
        calls: {
          today: Number(todayCalls.today_calls),
          monthly: Number(monthlyCalls.monthly_calls),
          failed: Number(failedCalls.failed_calls),
        },
        top_users: topUsers,
      }
    });
  } catch (error) {
    console.error('Admin reports error:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

module.exports = router;
