const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const ensureTable = async () => {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS communication_settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      alert_owner BOOLEAN DEFAULT TRUE,
      app_call BOOLEAN DEFAULT TRUE,
      normal_call BOOLEAN DEFAULT TRUE,
      private_call BOOLEAN DEFAULT FALSE,
      emergency_call BOOLEAN DEFAULT TRUE,
      private_emergency BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_communication_user (user_id)
    )
  `);
  await pool.execute(
    `INSERT IGNORE INTO communication_settings (user_id)
     SELECT id FROM users`
  );
  await pool.execute(
    `ALTER TABLE communication_settings
     ADD COLUMN IF NOT EXISTS private_emergency BOOLEAN DEFAULT FALSE
     AFTER emergency_call`
  ).catch(() => {});
};

router.get('/', authenticateToken, async (req, res) => {
  try {
    await ensureTable();
    const [rows] = await pool.execute(
      'SELECT * FROM communication_settings WHERE user_id = ?',
      [req.user.userId]
    );
    if (rows.length === 0) {
      return res.json({
        settings: {
          alert_owner: true, app_call: true, normal_call: true,
          private_call: false, emergency_call: true, private_emergency: false
        }
      });
    }
    const s = rows[0];
    res.json({
      settings: {
        alert_owner: !!s.alert_owner,
        app_call: !!s.app_call,
        normal_call: !!s.normal_call,
        private_call: !!s.private_call,
        emergency_call: !!s.emergency_call,
        private_emergency: !!s.private_emergency,
      }
    });
  } catch (error) {
    console.error('Get communication settings error:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.put('/', authenticateToken, [
  body('alert_owner').optional().isBoolean().toBoolean(),
  body('app_call').optional().isBoolean().toBoolean(),
  body('normal_call').optional().isBoolean().toBoolean(),
  body('private_call').optional().isBoolean().toBoolean(),
  body('emergency_call').optional().isBoolean().toBoolean(),
  body('private_emergency').optional().isBoolean().toBoolean(),
], async (req, res) => {
  try {
    await ensureTable();
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const userId = req.user.userId;
    const fields = ['alert_owner', 'app_call', 'normal_call', 'private_call', 'emergency_call', 'private_emergency'];
    const updates = [];
    const values = [];

    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        values.push(req.body[f]);
      }
    });

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No settings provided' });
    }

    values.push(userId);
    await pool.execute(
      `UPDATE communication_settings SET ${updates.join(', ')} WHERE user_id = ?`,
      values
    );

    const [rows] = await pool.execute(
      'SELECT * FROM communication_settings WHERE user_id = ?',
      [userId]
    );

    const s = rows[0];
    res.json({
      message: 'Settings updated',
      settings: {
        alert_owner: !!s.alert_owner,
        app_call: !!s.app_call,
        normal_call: !!s.normal_call,
        private_call: !!s.private_call,
        emergency_call: !!s.emergency_call,
        private_emergency: !!s.private_emergency,
      }
    });
  } catch (error) {
    console.error('Update communication settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

router.get('/visible-options/:qrCodeId', async (req, res) => {
  try {
    await ensureTable();
    const { qrCodeId } = req.params;

    const [qrRows] = await pool.execute(
      `SELECT qc.user_id, qc.qr_data, u.name, u.phone, u.id,
              v.mobile_number, v.hide_mobile_number,
              v.emergency_number, v.hide_emergency_number
         FROM qr_codes qc
         JOIN users u ON qc.user_id = u.id
    LEFT JOIN vehicles v ON qc.vehicle_id = v.id
        WHERE qc.qr_code_id = ? AND qc.is_active = TRUE`,
      [qrCodeId]
    );

    if (qrRows.length === 0) {
      return res.status(404).json({ error: 'QR code not found or inactive' });
    }

    const owner = qrRows[0];
    const ownerId = owner.user_id;

    const [settingsRows] = await pool.execute(
      'SELECT * FROM communication_settings WHERE user_id = ?',
      [ownerId]
    );

    let settings;
    if (settingsRows.length === 0) {
      settings = { alert_owner: true, app_call: true, normal_call: true, private_call: false, emergency_call: true, private_emergency: false };
    } else {
      const s = settingsRows[0];
      settings = {
        alert_owner: !!s.alert_owner,
        app_call: !!s.app_call,
        normal_call: !!s.normal_call,
        private_call: !!s.private_call,
        emergency_call: !!s.emergency_call,
        private_emergency: !!s.private_emergency,
      };
    }

    const visibleOptions = [];
    if (settings.alert_owner) visibleOptions.push({ id: 'alert_owner', label: 'Alert Owner', icon: 'bell-ring' });
    if (settings.app_call) visibleOptions.push({ id: 'app_call', label: 'App Call', icon: 'phone-classic' });
    if (settings.normal_call) {
      const hasNumber = owner.mobile_number || owner.phone;
      const hidden = owner.hide_mobile_number;
      if (hasNumber && !hidden) {
        visibleOptions.push({ id: 'normal_call', label: 'Normal Call', icon: 'phone' });
      }
    }
    if (settings.private_call) {
      visibleOptions.push({ id: 'private_call', label: 'Private Call / Hidden Number Call', icon: 'shield-checkmark' });
    }
    if (settings.emergency_call) {
      const hasEmergency = owner.emergency_number;
      if (hasEmergency) {
        visibleOptions.push({ id: 'emergency_call', label: 'Emergency Call', icon: 'medical-bag' });
      }
    }
    if (settings.private_emergency) {
      const hasEmergency = owner.emergency_number;
      if (hasEmergency) {
        visibleOptions.push({ id: 'private_emergency', label: 'Private Emergency Call', icon: 'shield-medical' });
      }
    }

    const privateCallEligible = settings.private_call;

    res.json({
      owner: {
        id: owner.id,
        name: owner.name,
        vehicle_data: qrRows[0].qr_data,
      },
      visible_options: visibleOptions,
      private_call_eligible: privateCallEligible,
      owner_service_active: false,
      has_mobile_number: !!(owner.mobile_number || owner.phone),
      mobile_hidden: !!owner.hide_mobile_number,
      has_emergency_number: !!owner.emergency_number,
      emergency_hidden: !!owner.hide_emergency_number,
      private_emergency_enabled: !!settings.private_emergency,
    });
  } catch (error) {
    console.error('Visible options error:', error);
    res.status(500).json({ error: 'Failed to fetch visible options' });
  }
});

module.exports = router;
