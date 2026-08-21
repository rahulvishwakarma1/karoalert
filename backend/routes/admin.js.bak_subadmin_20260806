const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const ensurePaymentRecordsTable = async () => {
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

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS payment_records (
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

const requireAdmin = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT is_admin FROM users WHERE id = ?',
      [req.user.userId]
    );
    if (rows.length === 0 || !rows[0].is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Admin check failed' });
  }
};

router.use(authenticateToken, requireAdmin);

router.get('/stats', async (req, res) => {
  try {
    await ensurePaymentRecordsTable();

    const [[userStats]] = await pool.execute(
      `SELECT COUNT(*) AS total_users,
              SUM(membership_status = 'active' AND (membership_expires_at IS NULL OR membership_expires_at > NOW())) AS active_members,
              SUM(can_create_qr = TRUE) AS qr_allowed,
              SUM(can_hide_number = TRUE) AS hide_allowed
         FROM users`
    );
    const [[vehicleStats]] = await pool.execute('SELECT COUNT(*) AS total_vehicles FROM vehicles');
    const [[qrStats]] = await pool.execute(
      `SELECT COUNT(*) AS total_qrs,
              SUM(is_active = TRUE) AS active_qrs
         FROM qr_codes`
    );
    const [[paymentStats]] = await pool.execute(
      `SELECT COUNT(*) AS paid_count,
              COALESCE(SUM(amount), 0) AS paid_amount
         FROM payment_records
        WHERE status = 'paid'`
    );

    const [[privateRevenue]] = await pool.execute(
      `SELECT COALESCE(SUM(amount), 0) AS private_revenue,
              COUNT(*) AS private_count
         FROM private_call_transactions
        WHERE status = 'paid'`
    );

    res.json({
      stats: {
        total_users: Number(userStats.total_users || 0),
        active_members: Number(userStats.active_members || 0),
        qr_allowed: Number(userStats.qr_allowed || 0),
        hide_allowed: Number(userStats.hide_allowed || 0),
        total_vehicles: Number(vehicleStats.total_vehicles || 0),
        total_qrs: Number(qrStats.total_qrs || 0),
        active_qrs: Number(qrStats.active_qrs || 0),
        paid_count: Number(paymentStats.paid_count || 0),
        paid_amount: Number(paymentStats.paid_amount || 0),
        private_revenue: Number(privateRevenue.private_revenue || 0),
        private_count: Number(privateRevenue.private_count || 0),
      },
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
});

router.get('/users', async (req, res) => {
  try {
    await ensurePaymentRecordsTable();

    const [users] = await pool.execute(
      `SELECT u.id, u.name, u.email, u.phone, u.password, u.car_number, u.is_admin,
              u.membership_status, u.membership_expires_at, u.can_create_qr, u.can_hide_number, u.created_at,
              COALESCE(vc.vehicle_count, 0) AS vehicle_count,
              COALESCE(qc_stats.qr_count, 0) AS qr_count,
              COALESCE(qc_stats.active_qr_count, 0) AS active_qr_count,
              lp.payment_id AS latest_payment_id,
              lp.amount AS latest_payment_amount,
              lp.currency AS latest_payment_currency,
              lp.status AS latest_payment_status,
              lp.created_at AS latest_payment_at
         FROM users u
    LEFT JOIN (
              SELECT user_id, COUNT(*) AS vehicle_count
                FROM vehicles
               GROUP BY user_id
        ) vc ON vc.user_id = u.id
    LEFT JOIN (
              SELECT user_id,
                     COUNT(*) AS qr_count,
                     SUM(is_active = TRUE) AS active_qr_count
                FROM qr_codes
               GROUP BY user_id
        ) qc_stats ON qc_stats.user_id = u.id
    LEFT JOIN (
          SELECT pr.*
            FROM payment_records pr
            JOIN (
              SELECT user_id, MAX(id) AS max_id
                FROM payment_records
               GROUP BY user_id
            ) latest ON latest.max_id = pr.id
        ) lp ON lp.user_id = u.id
        ORDER BY u.created_at DESC`
    );

    res.json({
      users: users.map((user) => ({
        ...user,
        is_admin: !!user.is_admin,
        membership_active: user.membership_status === 'active' && (!user.membership_expires_at || new Date(user.membership_expires_at) > new Date()),
        can_create_qr: !!user.can_create_qr,
        can_hide_number: !!user.can_hide_number,
        vehicle_count: Number(user.vehicle_count || 0),
        qr_count: Number(user.qr_count || 0),
        active_qr_count: Number(user.active_qr_count || 0),
      })),
    });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/password-reset-requests', async (req, res) => {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS password_reset_otps (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        email VARCHAR(255) NULL,
        phone VARCHAR(20) NULL,
        otp VARCHAR(4) NOT NULL,
        status ENUM('requested', 'auto_accepted', 'verified', 'expired', 'failed') DEFAULT 'requested',
        send_status ENUM('pending', 'sent', 'failed') DEFAULT 'pending',
        send_error TEXT NULL,
        expires_at DATETIME NOT NULL,
        verified_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_email (email),
        INDEX idx_phone (phone),
        INDEX idx_status (status),
        INDEX idx_expires_at (expires_at)
      )
    `);

    const [columns] = await pool.execute(
      `SELECT COLUMN_NAME, IS_NULLABLE
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'password_reset_otps'`
    );
    const columnMap = new Map(columns.map((column) => [column.COLUMN_NAME, column]));

    if (!columnMap.has('email')) {
      await pool.execute('ALTER TABLE password_reset_otps ADD COLUMN email VARCHAR(255) NULL AFTER user_id');
      await pool.execute('CREATE INDEX idx_email ON password_reset_otps (email)');
    }
    if (columnMap.get('phone')?.IS_NULLABLE === 'NO') {
      await pool.execute('ALTER TABLE password_reset_otps MODIFY phone VARCHAR(20) NULL');
    }

    const [requests] = await pool.execute(
      `SELECT pro.id, pro.user_id, u.name, u.email, pro.email AS reset_email, pro.phone, pro.otp,
              pro.status, pro.send_status, pro.send_error, pro.expires_at,
              pro.verified_at, pro.created_at
         FROM password_reset_otps pro
         JOIN users u ON u.id = pro.user_id
        ORDER BY pro.created_at DESC
        LIMIT 50`
    );

    res.json({ requests });
  } catch (error) {
    console.error('Admin password reset requests error:', error);
    res.status(500).json({ error: 'Failed to fetch password reset requests' });
  }
});

router.put('/users/:id/permissions', [
  body('membership_status').optional().isIn(['inactive', 'active']),
  body('can_create_qr').optional().isBoolean().toBoolean(),
  body('can_hide_number').optional().isBoolean().toBoolean(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const updates = [];
    const values = [];
    ['membership_status', 'can_create_qr', 'can_hide_number'].forEach((field) => {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    });

    if (req.body.membership_status === 'active') {
      updates.push('membership_expires_at = COALESCE(membership_expires_at, DATE_ADD(NOW(), INTERVAL 1 YEAR))');
    } else if (req.body.membership_status === 'inactive') {
      updates.push('membership_expires_at = NULL');
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No permissions provided' });
    }

    values.push(req.params.id);
    await pool.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ message: 'Permissions updated' });
  } catch (error) {
    console.error('Admin permission update error:', error);
    res.status(500).json({ error: 'Failed to update permissions' });
  }
});

router.post('/users/:id/activate-membership', [
  body('plan_id').optional().isInt().withMessage('Valid plan id required'),
  body('duration_days').optional().isInt({ min: 1 }),
  body('qr_limit').optional().isInt({ min: 1 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const userId = Number(req.params.id);
    if (!userId) return res.status(400).json({ error: 'Invalid user ID' });

    const [rows] = await pool.execute(
      'SELECT id, name FROM users WHERE id = ?',
      [userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

    let plan = null;
    if (req.body.plan_id) {
      const [planRows] = await pool.execute(
        'SELECT id, name, duration_days, qr_limit FROM membership_plans WHERE id = ?',
        [req.body.plan_id]
      );
      if (planRows.length === 0) return res.status(404).json({ error: 'Plan not found' });
      plan = planRows[0];
    }

    const durationDays = req.body.duration_days || plan?.duration_days || 365;
    const qrLimit = req.body.qr_limit || plan?.qr_limit || 3;

    await pool.execute(
      `UPDATE users
          SET membership_status = 'active',
              membership_expires_at = DATE_ADD(NOW(), INTERVAL ? DAY),
              can_create_qr = TRUE,
              can_hide_number = TRUE
        WHERE id = ?`,
      [durationDays, userId]
    );

    res.json({
      message: 'Membership activated successfully',
      user: {
        id: userId,
        name: rows[0].name,
        plan: plan ? { id: plan.id, name: plan.name } : null,
        duration_days: durationDays,
        qr_limit: qrLimit,
        membership_status: 'active',
      },
    });
  } catch (error) {
    console.error('Admin activate membership error:', error);
    res.status(500).json({ error: 'Failed to activate membership' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!userId) return res.status(400).json({ error: 'Invalid user ID' });
    if (userId === req.user.userId) {
      return res.status(400).json({ error: 'You cannot delete your own admin account' });
    }

    const [rows] = await pool.execute(
      'SELECT id, is_admin FROM users WHERE id = ?',
      [userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    if (rows[0].is_admin) return res.status(403).json({ error: 'Admin users cannot be deleted here' });

    await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Admin delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
