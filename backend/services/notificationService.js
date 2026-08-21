const { pool } = require('../config/database');

const formatPhoneNumber = (phoneNumber) => {
  const raw = String(phoneNumber || '').trim();
  if (!raw) return raw;
  if (raw.startsWith('+')) return raw;

  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${process.env.DEFAULT_COUNTRY_CODE || '+91'}${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }

  return raw;
};

class NotificationService {
  isConfigured() {
    return false;
  }

  formatPhoneNumber(phoneNumber) {
    return formatPhoneNumber(phoneNumber);
  }

  async sendSMS(phoneNumber, message) {
    console.log('SMS disabled: alerts are delivered via push/email only.');
    return { success: false, error: 'SMS sending is disabled' };
  }

  async sendWhatsApp(phoneNumber, message) {
    return { success: false, error: 'WhatsApp sending is disabled' };
  }

  async makeCall(phoneNumber, message) {
    return { success: false, error: 'Twilio calls are not configured' };
  }

  async processNotification(userId, vehicleId, scanLogId, notificationType = 'SMS') {
    try {
      // Get user and vehicle information
      const [results] = await pool.execute(
        `SELECT u.name, u.phone, u.email, v.license_plate, sl.scanner_location
         FROM users u
         JOIN vehicles v ON u.id = v.user_id
         JOIN scan_logs sl ON v.id = (SELECT vehicle_id FROM qr_codes WHERE qr_code_id = sl.qr_code_id)
         WHERE u.id = ? AND v.id = ? AND sl.id = ?`,
        [userId, vehicleId, scanLogId]
      );

      if (results.length === 0) {
        throw new Error('User or vehicle not found');
      }

      const user = results[0];

      // Create notification message
      const message = `KaroAlert: Hi ${user.name}, your vehicle (${user.license_plate}) has been scanned at your parking spot. Someone may require you to move your car. Kindly check the KaroAlert app. - KaroAlert Team`;

      let notificationResult;

      if (notificationType === 'SMS') {
        notificationResult = await this.sendSMS(user.phone, message);
      } else if (notificationType === 'CALL') {
        notificationResult = await this.makeCall(user.phone, message);
      } else {
        throw new Error('Invalid notification type');
      }

      // Update notification record
      const status = notificationResult.success ? 'SENT' : 'FAILED';
      const sentAt = notificationResult.success ? new Date() : null;

      await pool.execute(
        `UPDATE notifications
         SET status = ?, sent_at = ?, message = ?
         WHERE user_id = ? AND vehicle_id = ? AND scan_log_id = ?`,
        [status, sentAt, message, userId, vehicleId, scanLogId]
      );

      // Update scan log
      if (notificationResult.success) {
        await pool.execute(
          'UPDATE scan_logs SET notification_sent = TRUE WHERE id = ?',
          [scanLogId]
        );
      }

      return notificationResult;
    } catch (error) {
      console.error('Notification processing error:', error);
      throw error;
    }
  }

  async retryFailedNotifications() {
    try {
      const [failedNotifications] = await pool.execute(
        `SELECT n.id, n.user_id, n.vehicle_id, n.scan_log_id, n.notification_type
         FROM notifications n
         WHERE n.status = 'FAILED'
         AND n.created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
         ORDER BY n.created_at ASC
         LIMIT 10`
      );

      for (const notification of failedNotifications) {
        try {
          await this.processNotification(
            notification.user_id,
            notification.vehicle_id,
            notification.scan_log_id,
            notification.notification_type
          );
        } catch (error) {
          console.error(`Retry failed for notification ${notification.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Retry failed notifications error:', error);
    }
  }
}

module.exports = new NotificationService();
