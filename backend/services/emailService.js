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

const sendOtp = async ({ to, otp, purpose, name = 'User' }) => {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || process.env.GMAIL_USER;
  const appName = process.env.APP_NAME || 'KaroAlert';

  const subjectMap = {
    register: 'Registration OTP',
    'password-reset': 'Password Reset OTP',
  };
  const subject = `${appName}: ${subjectMap[purpose] || 'OTP'}`;

  const introMap = {
    register: `Thank you for registering with ${appName}.`,
    'password-reset': `You requested to reset the password for your ${appName} account.`,
  };

  const transporter = getTransporter();

  await transporter.sendMail({
    from,
    to,
    subject,
    text: [
      `Hi ${name},`,
      '',
      introMap[purpose] || `One-Time Password for your ${appName} account.`,
      '',
      `Your One-Time Password (OTP) is: ${otp}`,
      '',
      'This OTP is valid for 10 minutes. If you did not request this, please ignore this email.',
      '',
      'Regards,',
      `${appName} Team`,
    ].join('\n'),
  });
};

module.exports = {
  sendPasswordOtp: (to, otp, name = 'User') => sendOtp({ to, otp, purpose: 'password-reset', name }),
  sendRegistrationOtp: (to, otp, name = 'User') => sendOtp({ to, otp, purpose: 'register', name }),
};
