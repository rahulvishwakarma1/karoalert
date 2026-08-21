const nodemailer = require('nodemailer');

const getTransporter = () => {
  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error('Gmail SMTP credentials are not configured');
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: { user, pass },
  });
};

const sendPasswordOtp = async (to, otp, name = 'User') => {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || process.env.GMAIL_USER;
  const appName = process.env.APP_NAME || 'qralertgo';
  const transporter = getTransporter();

  await transporter.sendMail({
    from,
    to,
    subject: `${appName} password update OTP`,
    text: `Hi ${name},\n\nYour ${appName} password update OTP is ${otp}. It is valid for 10 minutes.\n\nIf you did not request this, ignore this email.`,
  });
};

module.exports = {
  sendPasswordOtp,
};
