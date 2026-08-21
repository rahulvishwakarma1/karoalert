const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

const communicationDefaults = {
  alert_owner: true, app_call: true, normal_call: true,
  private_call: false, emergency_call: true, private_emergency: false
};

const cleanNumber = (num) => {
  if (!num) return null;
  return String(num).replace(/[\s\-\(\)\+]/g, '').replace(/^91/, '').replace(/^0/, '');
};

router.get('/:qrCodeId', async (req, res) => {
  try {
    const qrCodeId = req.params.qrCodeId;

    const [qrCodes] = await pool.execute(
      `SELECT u.id, u.name, u.phone,
              v.mobile_number, v.hide_mobile_number,
              v.emergency_number, v.hide_emergency_number
         FROM qr_codes qc
         JOIN users u ON qc.user_id = u.id
    LEFT JOIN vehicles v ON qc.vehicle_id = v.id
        WHERE qc.qr_code_id = ? AND qc.is_active = TRUE`,
      [qrCodeId]
    );

    if (qrCodes.length === 0) {
      return res.status(404).send(errorPage('QR Code Not Found', 'This QR code is expired or invalid.'));
    }

    const owner = qrCodes[0];

    await pool.execute(
      'INSERT INTO scan_history (qr_code_id, user_id, scanned_at) VALUES (?, ?, NOW())',
      [qrCodeId, owner.id]
    ).catch(() => {});

    const [settingsRows] = await pool.execute(
      'SELECT * FROM communication_settings WHERE user_id = ?',
      [owner.id]
    );

    const settings = settingsRows.length > 0
      ? {
          alert_owner: !!settingsRows[0].alert_owner,
          app_call: !!settingsRows[0].app_call,
          normal_call: !!settingsRows[0].normal_call,
          private_call: !!settingsRows[0].private_call,
          emergency_call: !!settingsRows[0].emergency_call,
          private_emergency: !!settingsRows[0].private_emergency,
        }
      : { ...communicationDefaults };

    const mobileNumber = cleanNumber(owner.mobile_number || owner.phone);
    const emergencyNumber = cleanNumber(owner.emergency_number);
    const mobileHidden = !!owner.hide_mobile_number;
    const emergencyHidden = !!owner.hide_emergency_number;

    const whatsappTarget = mobileNumber || emergencyNumber || owner.phone || null;
    const whatsappUrl = whatsappTarget
      ? `https://wa.me/91${whatsappTarget}?text=Hi%20${encodeURIComponent(owner.name)}%2C%20I%20scanned%20your%20QR%20code.`
      : '#';

    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Owner Details</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh; display: flex; justify-content: center; align-items: center; padding: 20px;
    }
    .container {
      background: white; border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-width: 500px; width: 100%; padding: 40px; animation: slideUp 0.5s ease;
    }
    @keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    .header { text-align: center; margin-bottom: 30px; }
    .icon { font-size: 40px; margin-bottom: 10px; }
    h1 { color: #333; font-size: 24px; margin-bottom: 10px; }
    .subtitle { color: #999; font-size: 14px; }
    .info-box { background: #f9f9f9; border-left: 4px solid #667eea; padding: 20px; margin-bottom: 20px; border-radius: 8px; }
    .info-item { margin-bottom: 12px; }
    .info-label { color: #999; font-size: 12px; text-transform: uppercase; margin-bottom: 4px; }
    .info-value { color: #333; font-size: 18px; font-weight: bold; }
    .actions { display: flex; flex-direction: column; gap: 10px; }
    a, button {
      padding: 14px; border: none; border-radius: 8px; font-size: 16px; font-weight: bold;
      cursor: pointer; text-decoration: none; text-align: center; display: block;
      transition: all 0.3s ease; width: 100%;
    }
    .btn-call { background: #4CAF50; color: white; }
    .btn-call:hover { background: #45a049; }
    .btn-whatsapp { background: #25D366; color: white; }
    .btn-whatsapp:hover { background: #20ba5f; }
    .btn-emergency { background: #D84315; color: white; }
    .btn-emergency:hover { background: #bf360c; }
    .btn-private-emergency { background: #E65100; color: white; }
    .btn-private-emergency:hover { background: #bf360c; }
    .btn-sms { background: #2196F3; color: white; }
    .btn-sms:hover { background: #0b7dda; }
    .footer { text-align: center; margin-top: 20px; color: #999; font-size: 12px; }
    .qr-safe { background: #e8f5e9; border: 1px solid #4CAF50; padding: 12px; border-radius: 8px; margin-top: 20px; text-align: center; color: #2e7d32; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="icon">🚗</div>
      <h1>Owner Details</h1>
      <p class="subtitle">Contact the vehicle owner</p>
    </div>

    <div class="info-box">
      <div class="info-item">
        <div class="info-label">Owner Name</div>
        <div class="info-value">${owner.name}</div>
      </div>
      ${!mobileHidden && mobileNumber ? '<div class="info-item"><div class="info-label">Mobile Number</div><div class="info-value">' + mobileNumber + '</div></div>' : ''}
      ${!emergencyHidden && emergencyNumber ? '<div class="info-item"><div class="info-label">Emergency Number</div><div class="info-value">' + emergencyNumber + '</div></div>' : ''}
    </div>

    <div class="actions" id="actionButtons">
    </div>

    <div class="qr-safe">✅ This is a legitimate car contact QR code.</div>
    <div class="footer"><p>qralertgo &bull; Safe & Secure</p></div>
  </div>

  <script>
    var _s = ${JSON.stringify(settings)};
    var _m = ${JSON.stringify(mobileNumber)};
    var _e = ${JSON.stringify(emergencyNumber)};
    var _mh = ${JSON.stringify(mobileHidden)};
    var _eh = ${JSON.stringify(emergencyHidden)};
    var _wt = ${JSON.stringify(whatsappTarget)};
    var _wu = ${JSON.stringify(whatsappUrl)};

    var container = document.getElementById('actionButtons');

    function addLink(cls, href, html) {
      var el = document.createElement('a');
      el.className = cls;
      el.href = href;
      el.innerHTML = html;
      container.appendChild(el);
      return el;
    }

    if (_s.normal_call && _m && !_mh) {
      addLink('btn-call', 'tel:' + _m, '📞 Call Owner');
      addLink('btn-sms', 'sms:' + _m, '📧 Send SMS');
    }

    if (_s.emergency_call && _e && !_eh) {
      addLink('btn-emergency', 'tel:' + _e, '🚑 Call Emergency');
    }

    if (_s.private_emergency && _e) {
      addLink('btn-private-emergency', '#', 'Private Emergency Call - open app scanner');
    }

    if (_wt) {
      addLink('btn-whatsapp', _wu, '💬 Send WhatsApp');
    }
  </script>
</body>
</html>`);
  } catch (error) {
    console.error('Public page error:', error);
    res.status(500).send(errorPage('Something went wrong', 'Please try again later.'));
  }
});

function errorPage(title, message) {
  return '<!DOCTYPE html><html><head><title>' + title + '</title><style>body{font-family:Arial;text-align:center;padding:50px;background:#f5f5f5}h1{color:#d32f2f}</style></head><body><h1>❌ ' + title + '</h1><p>' + message + '</p></body></html>';
}

module.exports = router;
