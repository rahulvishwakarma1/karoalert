const express = require('express');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const PLAN_QR_LIMIT = 3;

const ensureMembershipExpiryColumn = async () => {
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
};

const isMembershipActive = (user) =>
  user?.membership_status === 'active' &&
  !!user?.can_create_qr &&
  (!user.membership_expires_at || new Date(user.membership_expires_at) > new Date());

const getActiveVehicleQrCount = async (userId, connection = pool) => {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS active_qr_count
       FROM qr_codes
      WHERE user_id = ?
        AND vehicle_id IS NOT NULL
        AND is_active = TRUE`,
    [userId]
  );

  return Number(rows[0]?.active_qr_count || 0);
};

// ── Get my QR (user_owned QR, not vehicle-linked) ───────────────────────
// Always returns the single user-level QR code if it exists
router.get('/my-qr', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const [rows] = await pool.execute(
      `SELECT qr_code_id, qr_data, is_active, created_at
         FROM qr_codes
        WHERE user_id = ?
        ORDER BY is_active DESC, created_at DESC
        LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'QR code not generated yet' });
    }

    const qr = rows[0];

    // Generate image on-the-fly (do not store base64 in DB)
    const qrUrl = `${process.env.APP_URL || 'https://app.shreesswpl.com/'}/public/${qr.qr_code_id}`;
    let qrImage;
    try {
      qrImage = await qrcode.toDataURL(qrUrl);
    } catch {
      qrImage = null;
    }

    res.json({
      qr: {
        qr_code_id: qr.qr_code_id,
        qr_image:   qrImage,
        qr_url:     qrUrl,
        is_active:  qr.is_active,
        created_at: qr.created_at
      }
    });
  } catch (error) {
    console.error('Get QR error:', error);
    res.status(500).json({ error: 'Failed to fetch QR code' });
  }
});

// ── Regenerate QR (user-level) ─────────────────────────────────────────
router.post('/regenerate', authenticateToken, async (req, res) => {
  try {
    await ensureMembershipExpiryColumn();
    const userId = req.user.userId;

    // Fetch user
    const [users] = await pool.execute(
      'SELECT id, name, phone, car_number, membership_status, membership_expires_at, can_create_qr FROM users WHERE id = ?',
      [userId]
    );
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];
    if (!isMembershipActive(user)) {
      if (user.membership_expires_at && new Date(user.membership_expires_at) <= new Date()) {
        await pool.execute(
          "UPDATE users SET membership_status = 'inactive', can_create_qr = FALSE, can_hide_number = FALSE WHERE id = ?",
          [userId]
        );
      }
      return res.status(403).json({
        error: 'Your membership is inactive or expired. Please activate a plan to create QR codes.',
        code: 'MEMBERSHIP_REQUIRED',
      });
    }

    const qrCodeId = uuidv4();
    const qrUrl   = `${process.env.APP_URL || 'https://app.shreesswpl.com/'}/public/${qrCodeId}`;
    const qrImage = await qrcode.toDataURL(qrUrl);

    const qrData = JSON.stringify({
      userId,
      userName:    user.name,
      userMobile:  user.phone,
      carNumber:   user.car_number,
      vehicleId:   null
    });

    // Deactivate old user-level QR codes
    await pool.execute(
      'UPDATE qr_codes SET is_active = FALSE WHERE user_id = ? AND vehicle_id IS NULL',
      [userId]
    );

    await pool.execute(
      'INSERT INTO qr_codes (user_id, vehicle_id, qr_code_id, qr_data) VALUES (?, NULL, ?, ?)',
      [userId, qrCodeId, qrData]
    );

    await pool.execute('UPDATE users SET qr_code_id = ? WHERE id = ?', [qrCodeId, userId]);

    res.json({
      message: 'QR code regenerated',
      qr: {
        qr_code_id: qrCodeId,
        qr_image:   qrImage,
        qr_url:     qrUrl
      }
    });
  } catch (error) {
    console.error('QR regenerate error:', error);
    res.status(500).json({ error: 'Failed to regenerate QR code' });
  }
});

// ── Generate QR for a specific vehicle ──────────────────────────────────
router.post('/generate', authenticateToken, async (req, res) => {
  try {
    await ensureMembershipExpiryColumn();
    const { vehicle_id } = req.body;
    if (!vehicle_id) {
      return res.status(400).json({ error: 'vehicle_id is required' });
    }

    const [permissionRows] = await pool.execute(
      'SELECT membership_status, membership_expires_at, can_create_qr FROM users WHERE id = ?',
      [req.user.userId]
    );
    const permission = permissionRows[0];
    if (!isMembershipActive(permission)) {
      if (permission?.membership_expires_at && new Date(permission.membership_expires_at) <= new Date()) {
        await pool.execute(
          "UPDATE users SET membership_status = 'inactive', can_create_qr = FALSE, can_hide_number = FALSE WHERE id = ?",
          [req.user.userId]
        );
      }
      return res.status(403).json({
        error: 'Your membership is inactive or expired. Please activate a plan to create QR codes.',
        code: 'MEMBERSHIP_REQUIRED',
      });
    }

    // Verify vehicle belongs to user
    const [vehicles] = await pool.execute(
      'SELECT id, vehicle_type, vehicle_number, vehicle_model, vehicle_color, owner_name, mobile_number, hide_mobile_number, emergency_number, hide_emergency_number FROM vehicles WHERE id = ? AND user_id = ?',
      [vehicle_id, req.user.userId]
    );
    if (vehicles.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const vehicle = vehicles[0];

    const [existingActiveRows] = await pool.execute(
      'SELECT id FROM qr_codes WHERE user_id = ? AND vehicle_id = ? AND is_active = TRUE LIMIT 1',
      [req.user.userId, vehicle_id]
    );

    if (existingActiveRows.length === 0) {
      const activeQrCount = await getActiveVehicleQrCount(req.user.userId);
      if (activeQrCount >= PLAN_QR_LIMIT) {
        return res.status(403).json({
          error: `Your active plan allows up to ${PLAN_QR_LIMIT} active QR codes. Deactivate one QR before creating another.`,
          code: 'QR_LIMIT_REACHED',
          limit: PLAN_QR_LIMIT,
          active_qr_count: activeQrCount,
        });
      }
    }

    // Deactivate existing QR for this vehicle
    await pool.execute(
      'UPDATE qr_codes SET is_active = FALSE WHERE vehicle_id = ?',
      [vehicle_id]
    );

    const qrCodeId = uuidv4();
    const qrUrl    = `${process.env.APP_URL || 'https://app.shreesswpl.com/'}/public/${qrCodeId}`;
    const qrImage  = await qrcode.toDataURL(qrUrl, { width: 400, margin: 2 });

    const qrData = JSON.stringify({
      vehicle_id,
      vehicle_type: vehicle.vehicle_type,
      vehicle_number: vehicle.vehicle_number,
      vehicle_model: vehicle.vehicle_model,
      vehicle_color: vehicle.vehicle_color,
      owner_name: vehicle.owner_name,
      mobile_number: vehicle.mobile_number,
      hide_mobile_number: !!vehicle.hide_mobile_number,
      emergency_number: vehicle.emergency_number,
      hide_emergency_number: !!vehicle.hide_emergency_number,
      userId: req.user.userId
    });

    const [result] = await pool.execute(
      'INSERT INTO qr_codes (user_id, vehicle_id, qr_code_id, qr_data) VALUES (?, ?, ?, ?)',
      [req.user.userId, vehicle_id, qrCodeId, qrData]
    );

    res.status(201).json({
      message: 'QR code generated successfully',
      qr_code: {
        id:           result.insertId,
        qr_code_id:   qrCodeId,
        qr_image:     qrImage,
        qr_url:       qrUrl,
        vehicle_id,
        vehicle_type:  vehicle.vehicle_type,
        vehicle_number: vehicle.vehicle_number
      }
    });
  } catch (error) {
    console.error('QR generate error:', error);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// ── Get QR codes for a vehicle ─────────────────────────────────────────
router.get('/vehicle/:vehicleId', authenticateToken, async (req, res) => {
  try {
    const vehicleId = req.params.vehicleId;

    const [vehicles] = await pool.execute(
      'SELECT id FROM vehicles WHERE id = ? AND user_id = ?',
      [vehicleId, req.user.userId]
    );
    if (vehicles.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const [qrCodes] = await pool.execute(
      'SELECT id, qr_code_id, is_active, created_at FROM qr_codes WHERE vehicle_id = ? ORDER BY created_at DESC',
      [vehicleId]
    );
    res.json({ qr_codes: qrCodes });
  } catch (error) {
    console.error('Get QR list error:', error);
    res.status(500).json({ error: 'Failed to fetch QR codes' });
  }
});

// ── Activate / Deactivate QR ───────────────────────────────────────────
router.put('/deactivate/:qrCodeId', authenticateToken, async (req, res) => {
  try {
    const qrCodeId = req.params.qrCodeId;
    const userId   = req.user.userId;

    const [rows] = await pool.execute(
      `SELECT qc.id
         FROM qr_codes qc
         JOIN users u ON qc.user_id = u.id
        WHERE qc.qr_code_id = ? AND u.id = ? AND qc.is_active = TRUE`,
      [qrCodeId, userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'QR not found' });
    }

    await pool.execute(
      'UPDATE qr_codes SET is_active = FALSE WHERE qr_code_id = ?',
      [qrCodeId]
    );
    res.json({ message: 'QR deactivated' });
  } catch (error) {
    console.error('Deactivate error:', error);
    res.status(500).json({ error: 'Failed to deactivate' });
  }
});

router.put('/activate/:qrCodeId', authenticateToken, async (req, res) => {
  try {
    await ensureMembershipExpiryColumn();
    const qrCodeId = req.params.qrCodeId;
    const userId   = req.user.userId;

    const [rows] = await pool.execute(
      `SELECT qc.id, qc.vehicle_id, u.membership_status, u.membership_expires_at, u.can_create_qr
         FROM qr_codes qc
         JOIN users u ON qc.user_id = u.id
        WHERE qc.qr_code_id = ? AND u.id = ?`,
      [qrCodeId, userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'QR not found' });
    }

    const { vehicle_id } = rows[0];
    if (!isMembershipActive(rows[0])) {
      if (rows[0].membership_expires_at && new Date(rows[0].membership_expires_at) <= new Date()) {
        await pool.execute(
          "UPDATE users SET membership_status = 'inactive', can_create_qr = FALSE, can_hide_number = FALSE WHERE id = ?",
          [userId]
        );
      }
      return res.status(403).json({
        error: 'Your membership is inactive or expired. Please activate a plan to activate QR codes.',
        code: 'MEMBERSHIP_REQUIRED',
      });
    }

    // Deactivate all other QRs on same vehicle
    if (vehicle_id) {
      const [sameVehicleActiveRows] = await pool.execute(
        'SELECT id FROM qr_codes WHERE user_id = ? AND vehicle_id = ? AND is_active = TRUE LIMIT 1',
        [userId, vehicle_id]
      );

      if (sameVehicleActiveRows.length === 0) {
        const activeQrCount = await getActiveVehicleQrCount(userId);
        if (activeQrCount >= PLAN_QR_LIMIT) {
          return res.status(403).json({
            error: `Your active plan allows up to ${PLAN_QR_LIMIT} active QR codes. Deactivate one QR before activating another.`,
            code: 'QR_LIMIT_REACHED',
            limit: PLAN_QR_LIMIT,
            active_qr_count: activeQrCount,
          });
        }
      }

      await pool.execute(
        'UPDATE qr_codes SET is_active = FALSE WHERE vehicle_id = ?',
        [vehicle_id]
      );
    }

    await pool.execute(
      'UPDATE qr_codes SET is_active = TRUE WHERE qr_code_id = ?',
      [qrCodeId]
    );
    res.json({ message: 'QR activated' });
  } catch (error) {
    console.error('Activate error:', error);
    res.status(500).json({ error: 'Failed to activate' });
  }
});

module.exports = router;
