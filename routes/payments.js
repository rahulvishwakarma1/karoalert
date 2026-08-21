const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const PLAN_AMOUNT = 499;
const PLAN_AMOUNT_PAISE = PLAN_AMOUNT * 100;
const PLAN_CURRENCY = 'INR';

const ensureMembershipPlansTable = async () => {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS membership_plans (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      price DECIMAL(10,2) NOT NULL,
      duration_days INT NOT NULL DEFAULT 365,
      qr_limit INT NOT NULL DEFAULT 3,
      plan_order INT NOT NULL DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_plan_active (is_active),
      INDEX idx_plan_order (plan_order)
    )
  `);

  const [rows] = await pool.execute('SELECT COUNT(*) AS cnt FROM membership_plans');
  if (Number(rows[0]?.cnt || 0) === 0) {
    await pool.execute(
      `INSERT INTO membership_plans (name, description, price, duration_days, qr_limit, plan_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
      ['Membership Plan', 'One plan for QR parking access', 499, 365, 3, 0]
    );
  }
};

const getPlanById = async (id) => {
  const [rows] = await pool.execute(
    `SELECT id, name, description, price, duration_days, qr_limit, plan_order, is_active
       FROM membership_plans WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
};

const getRazorpayClient = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay keys are not configured');
  }

  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

const ensurePaymentTables = async () => {
  const [columns] = await pool.execute(
    `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'membership_expires_at'`
  );
  if (columns.length === 0) {
    await pool.execute('ALTER TABLE users ADD COLUMN membership_expires_at DATETIME NULL AFTER membership_status');
  }
  await pool.execute(
    `UPDATE users
        SET membership_expires_at = DATE_ADD(NOW(), INTERVAL 1 YEAR)
      WHERE membership_status = 'active'
        AND membership_expires_at IS NULL`
  );

  await pool.execute(
    `CREATE TABLE IF NOT EXISTS payment_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      provider VARCHAR(40) NOT NULL DEFAULT 'razorpay',
      payment_id VARCHAR(120) NOT NULL,
      order_id VARCHAR(120) NULL,
      signature VARCHAR(255) NULL,
      amount DECIMAL(10,2) NOT NULL DEFAULT 499.00,
      currency VARCHAR(10) NOT NULL DEFAULT 'INR',
      status ENUM('paid', 'failed') NOT NULL DEFAULT 'paid',
      raw_payload JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY uniq_provider_payment (provider, payment_id),
      INDEX idx_user_id (user_id),
      INDEX idx_status (status)
    )
  `);
  await pool.execute(
    'ALTER TABLE payment_records MODIFY amount DECIMAL(10,2) NOT NULL DEFAULT 499.00'
  ).catch(() => {});
  await pool.execute(
    'ALTER TABLE payment_records ADD COLUMN plan_id INT NULL AFTER user_id'
  ).catch(() => {});
};

router.post('/razorpay/create-order', authenticateToken, async (req, res) => {
  try {
    await ensurePaymentTables();
    await ensureMembershipPlansTable();

    const razorpay = getRazorpayClient();

    let plan = null;
    if (req.body.plan_id) {
      plan = await getPlanById(req.body.plan_id);
    }

    const amount = plan ? Math.round(parseFloat(plan.price) * 100) : PLAN_AMOUNT_PAISE;
    const planMeta = plan
      ? { plan_id: String(plan.id), plan_name: plan.name, plan_price: String(plan.price) }
      : { plan: 'qr_membership_499' };

    const receipt = `qr_${req.user.userId}_${Date.now()}`;
    const order = await razorpay.orders.create({
      amount,
      currency: PLAN_CURRENCY,
      receipt,
      notes: {
        user_id: String(req.user.userId),
        ...planMeta,
      },
    });

    res.json({
      key_id: process.env.RAZORPAY_KEY_ID,
      plan: plan
        ? { id: plan.id, name: plan.name, price: plan.price, duration_days: plan.duration_days, qr_limit: plan.qr_limit }
        : null,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
      },
    });
  } catch (error) {
    console.error('Razorpay create order error:', error);
    res.status(500).json({ error: 'Failed to create Razorpay order' });
  }
});

router.post('/razorpay/success', authenticateToken, [
  body('razorpay_payment_id').trim().notEmpty().withMessage('Razorpay payment id required'),
  body('razorpay_order_id').trim().notEmpty().withMessage('Razorpay order id required'),
  body('razorpay_signature').trim().notEmpty().withMessage('Razorpay signature required'),
  body('plan_id').optional().isInt().withMessage('Valid plan id required'),
], async (req, res) => {
  try {
    await ensurePaymentTables();
    await ensureMembershipPlansTable();

    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const userId = req.user.userId;
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      plan_id,
    } = req.body;

    if (!process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ error: 'Razorpay key secret is not configured' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid Razorpay payment signature' });
    }

    let plan = null;
    if (plan_id) {
      plan = await getPlanById(plan_id);
    }

    const paidAmount = plan ? parseFloat(plan.price) : PLAN_AMOUNT;

    await pool.execute(
      `INSERT INTO payment_records
        (user_id, plan_id, provider, payment_id, order_id, signature, amount, currency, status, raw_payload)
       VALUES (?, ?, 'razorpay', ?, ?, ?, ?, ?, 'paid', ?)
       ON DUPLICATE KEY UPDATE
        user_id = VALUES(user_id),
        plan_id = VALUES(plan_id),
        order_id = VALUES(order_id),
        signature = VALUES(signature),
        amount = VALUES(amount),
        currency = VALUES(currency),
        status = 'paid',
        raw_payload = VALUES(raw_payload)`,
      [
        userId,
        plan?.id || null,
        razorpay_payment_id,
        razorpay_order_id,
        razorpay_signature,
        paidAmount,
        PLAN_CURRENCY,
        JSON.stringify(req.body),
      ]
    );

    await pool.execute(
      `UPDATE users
          SET membership_status = 'active',
              membership_expires_at = DATE_ADD(NOW(), INTERVAL ? DAY),
              can_create_qr = TRUE,
              can_hide_number = TRUE
        WHERE id = ?`,
      [plan?.duration_days || 365, userId]
    );

    const [users] = await pool.execute(
      `SELECT id, name, email, phone, car_number, qr_code_id, is_admin,
              membership_status, membership_expires_at, can_create_qr, can_hide_number, created_at
         FROM users WHERE id = ?`,
      [userId]
    );

    res.json({
      message: 'Payment recorded. Membership activated.',
      payment: {
        provider: 'razorpay',
        payment_id: razorpay_payment_id,
        order_id: razorpay_order_id,
        plan: plan ? { id: plan.id, name: plan.name, qr_limit: plan.qr_limit } : null,
        amount: paidAmount,
        currency: PLAN_CURRENCY,
        status: 'paid',
        verification_status: 'verified',
      },
      user: users[0] ? {
        ...users[0],
        is_admin: !!users[0].is_admin,
        membership_active: true,
        can_create_qr: !!users[0].can_create_qr,
        can_hide_number: !!users[0].can_hide_number,
        active_plan: plan ? { id: plan.id, name: plan.name, qr_limit: plan.qr_limit, duration_days: plan.duration_days } : null,
      } : null,
    });
  } catch (error) {
    console.error('Razorpay payment success error:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

module.exports = router;
