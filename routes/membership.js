const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

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

const getPlanById = async (id) => {
  const [rows] = await pool.execute(
    `SELECT id, name, description, price, duration_days, qr_limit, plan_order, is_active, created_at
       FROM membership_plans WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
};

router.get('/plans', async (req, res) => {
  try {
    await ensureMembershipPlansTable();
    const [rows] = await pool.execute(
      `SELECT id, name, description, price, duration_days, qr_limit, plan_order, is_active, created_at
         FROM membership_plans
        WHERE is_active = TRUE
        ORDER BY plan_order ASC`
    );
    res.json({ plans: rows });
  } catch (error) {
    console.error('Get membership plans error:', error);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

router.get('/plans/all', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await ensureMembershipPlansTable();
    const [rows] = await pool.execute(
      `SELECT id, name, description, price, duration_days, qr_limit, plan_order, is_active, created_at
         FROM membership_plans
        ORDER BY plan_order ASC`
    );
    res.json({ plans: rows });
  } catch (error) {
    console.error('Get all membership plans error:', error);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

router.post('/plans', authenticateToken, requireAdmin, [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Plan name required'),
  body('description').optional().trim().isLength({ max: 500 }),
  body('price').isFloat({ min: 1 }).withMessage('Valid price required'),
  body('duration_days').isInt({ min: 1 }).withMessage('Valid duration in days required'),
  body('qr_limit').optional().isInt({ min: 1 }),
  body('plan_order').optional().isInt(),
], async (req, res) => {
  try {
    await ensureMembershipPlansTable();

    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, description, price, duration_days, qr_limit, plan_order } = req.body;
    const [result] = await pool.execute(
      `INSERT INTO membership_plans (name, description, price, duration_days, qr_limit, plan_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
      [name, description || '', price, duration_days, qr_limit || 3, plan_order || 0]
    );

    const plan = await getPlanById(result.insertId);
    res.status(201).json({ message: 'Plan created', plan });
  } catch (error) {
    console.error('Create membership plan error:', error);
    res.status(500).json({ error: 'Failed to create plan' });
  }
});

router.put('/plans/:id', authenticateToken, requireAdmin, [
  body('name').optional().trim().isLength({ min: 2, max: 100 }),
  body('description').optional().trim().isLength({ max: 500 }),
  body('price').optional().isFloat({ min: 1 }),
  body('duration_days').optional().isInt({ min: 1 }),
  body('qr_limit').optional().isInt({ min: 1 }),
  body('plan_order').optional().isInt(),
  body('is_active').optional().isBoolean().toBoolean(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const fields = ['name', 'description', 'price', 'duration_days', 'qr_limit', 'plan_order', 'is_active'];
    const updates = [];
    const values = [];

    fields.forEach((f) => {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        values.push(req.body[f]);
      }
    });

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.params.id);
    await pool.execute(`UPDATE membership_plans SET ${updates.join(', ')} WHERE id = ?`, values);

    const plan = await getPlanById(req.params.id);
    res.json({ message: 'Plan updated', plan });
  } catch (error) {
    console.error('Update membership plan error:', error);
    res.status(500).json({ error: 'Failed to update plan' });
  }
});

router.delete('/plans/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM membership_plans WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    res.json({ message: 'Plan deleted' });
  } catch (error) {
    console.error('Delete membership plan error:', error);
    res.status(500).json({ error: 'Failed to delete plan' });
  }
});

module.exports = router;