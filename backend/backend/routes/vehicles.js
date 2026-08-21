const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();



// Register a new vehicle
router.post('/', authenticateToken, [
  body('vehicle_type').trim().isLength({ min: 2, max: 50 }).withMessage('Vehicle type is required'),
  body('vehicle_number').trim().isLength({ min: 1, max: 50 }).withMessage('Vehicle number is required'),
  body('vehicle_model').optional().trim().isLength({ max: 100 }),
  body('vehicle_color').optional().trim().isLength({ max: 50 }),
  body('owner_name').optional().trim().isLength({ min: 2, max: 100 }),
  body('mobile_number').optional().trim().matches(/^\d{10}$/).withMessage('Mobile number must be exactly 10 digits'),
  body('hide_mobile_number').optional().isBoolean().toBoolean(),
  body('emergency_number').optional({ nullable: true }).trim().matches(/^\d{10}$/).withMessage('Emergency number must be exactly 10 digits'),
  body('hide_emergency_number').optional().isBoolean().toBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { vehicle_type, vehicle_number, vehicle_model, vehicle_color, owner_name, mobile_number, hide_mobile_number, emergency_number, hide_emergency_number } = req.body;

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [result] = await connection.execute(
        `INSERT INTO vehicles
         (user_id, vehicle_type, vehicle_number, vehicle_model, vehicle_color, owner_name, mobile_number, hide_mobile_number, emergency_number, hide_emergency_number)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.userId, vehicle_type, vehicle_number, vehicle_model || null, vehicle_color || null, owner_name || null, mobile_number || null, !!hide_mobile_number, emergency_number || null, !!hide_emergency_number]
      );

      await connection.commit();

      res.status(201).json({
        message: 'Vehicle added successfully',
        vehicle: {
          id: result.insertId,
          vehicle_type,
          vehicle_number,
          vehicle_model,
          vehicle_color,
          owner_name,
          mobile_number,
          hide_mobile_number: !!hide_mobile_number,
          emergency_number: emergency_number || null,
          hide_emergency_number: !!hide_emergency_number
        }
      });
    } catch (error) {
      await connection.rollback();
      console.error('Vehicle add error:', error);
      res.status(500).json({ error: 'Failed to add vehicle' });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Vehicle add error:', error);
    res.status(500).json({ error: 'Failed to add vehicle' });
  }
});

// Get all vehicles for the authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const [vehicles] = await pool.execute(
      `SELECT id, user_id, vehicle_type, vehicle_number, vehicle_model,
              vehicle_color, owner_name, mobile_number, hide_mobile_number,
              emergency_number, hide_emergency_number, created_at
         FROM vehicles
        WHERE user_id = ?
        ORDER BY created_at DESC`,
      [req.user.userId]
    );

    // Fetch QR codes for each vehicle
    const vehiclesWithQr = await Promise.all(
      vehicles.map(async (vehicle) => {
        const [qrCodes] = await pool.execute(
          'SELECT qr_code_id, is_active, created_at FROM qr_codes WHERE vehicle_id = ? AND is_active = TRUE',
          [vehicle.id]
        );
        return { ...vehicle, qr_codes: qrCodes };
      })
    );

    res.json({ vehicles: vehiclesWithQr });
  } catch (error) {
    console.error('Get vehicles error:', error);
    res.status(500).json({ error: 'Failed to fetch vehicles' });
  }
});

// Get a specific vehicle
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const vehicleId = req.params.id;

    const [vehicles] = await pool.execute(
      `SELECT id, user_id, vehicle_type, vehicle_number, vehicle_model,
              vehicle_color, owner_name, mobile_number, hide_mobile_number,
              emergency_number, hide_emergency_number, created_at
         FROM vehicles
        WHERE id = ? AND user_id = ?`,
      [vehicleId, req.user.userId]
    );

    if (vehicles.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const vehicle = vehicles[0];

    const [qrCodes] = await pool.execute(
      'SELECT qr_code_id, is_active, created_at FROM qr_codes WHERE vehicle_id = ?',
      [vehicle.id]
    );
    vehicle.qr_codes = qrCodes;

    res.json({ vehicle });
  } catch (error) {
    console.error('Get vehicle error:', error);
    res.status(500).json({ error: 'Failed to fetch vehicle' });
  }
});

// Update vehicle details
router.put('/:id', authenticateToken, [
  body('vehicle_type').optional().trim().isLength({ min: 2, max: 50 }),
  body('vehicle_number').optional().trim().isLength({ min: 1, max: 50 }),
  body('vehicle_model').optional().trim().isLength({ max: 100 }),
  body('vehicle_color').optional().trim().isLength({ max: 50 }),
  body('owner_name').optional().trim().isLength({ min: 2, max: 100 }),
  body('mobile_number').optional().trim().matches(/^\d{10}$/).withMessage('Mobile number must be exactly 10 digits'),
  body('hide_mobile_number').optional().isBoolean().toBoolean(),
  body('emergency_number').optional({ nullable: true }).trim().matches(/^\d{10}$/).withMessage('Emergency number must be exactly 10 digits'),
  body('hide_emergency_number').optional().isBoolean().toBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const vehicleId = req.params.id;
    const { vehicle_type, vehicle_number, vehicle_model, vehicle_color, owner_name, mobile_number, hide_mobile_number, emergency_number, hide_emergency_number } = req.body;

    const [vehicles] = await pool.execute(
      'SELECT id FROM vehicles WHERE id = ? AND user_id = ?',
      [vehicleId, req.user.userId]
    );
    if (vehicles.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const updates = [];
    const values = [];

    if (vehicle_type !== undefined) { updates.push('vehicle_type = ?'); values.push(vehicle_type); }
    if (vehicle_number !== undefined) { updates.push('vehicle_number = ?'); values.push(vehicle_number); }
    if (vehicle_model !== undefined) { updates.push('vehicle_model = ?'); values.push(vehicle_model); }
    if (vehicle_color !== undefined) { updates.push('vehicle_color = ?'); values.push(vehicle_color); }
    if (owner_name !== undefined) { updates.push('owner_name = ?'); values.push(owner_name); }
    if (mobile_number !== undefined) { updates.push('mobile_number = ?'); values.push(mobile_number); }
    if (hide_mobile_number !== undefined) { updates.push('hide_mobile_number = ?'); values.push(!!hide_mobile_number); }
    if (emergency_number !== undefined) { updates.push('emergency_number = ?'); values.push(emergency_number || null); }
    if (hide_emergency_number !== undefined) { updates.push('hide_emergency_number = ?'); values.push(!!hide_emergency_number); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(vehicleId);
    await pool.execute(
      `UPDATE vehicles SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    res.json({ message: 'Vehicle updated successfully' });
  } catch (error) {
    console.error('Vehicle update error:', error);
    res.status(500).json({ error: 'Failed to update vehicle' });
  }
});

// Delete a vehicle
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const vehicleId = req.params.id;

    const [vehicles] = await pool.execute(
      'SELECT id FROM vehicles WHERE id = ? AND user_id = ?',
      [vehicleId, req.user.userId]
    );
    if (vehicles.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    await pool.execute('DELETE FROM vehicles WHERE id = ?', [vehicleId]);
    res.json({ message: 'Vehicle deleted successfully' });
  } catch (error) {
    console.error('Vehicle delete error:', error);
    res.status(500).json({ error: 'Failed to delete vehicle' });
  }
});

module.exports = router;
