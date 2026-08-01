// src/utils/email.js
import nodemailer from 'nodemailer';
import logger from '../config/logger.js';

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!host || !user || !pass) {
    throw new Error('Missing SMTP config: SMTP_HOST, EMAIL_USER, and EMAIL_PASS are required');
  }

  const port = Number(process.env.SMTP_PORT || 465);
  // FastPanel often serves a self-signed mail cert until a real one is issued for mail.*
  const allowSelfSigned = process.env.SMTP_ALLOW_SELF_SIGNED === 'true';

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: !allowSelfSigned },
  });

  return transporter;
}

/**
 * @desc   Send an email via SMTP (FastPanel / any provider).
 * @param  {Object} options
 * @param  {string} options.email    - recipient address
 * @param  {string} options.subject  - email subject
 * @param  {string} options.html     - HTML body
 * @param  {string} [options.text]   - optional plain-text fallback
 */
const sendEmail = async (options) => {
  try {
    const fromName = process.env.EMAIL_FROM_NAME || 'Oxxila';
    const info = await getTransporter().sendMail({
      from: `"${fromName}" <${process.env.EMAIL_USER}>`,
      to: options.email,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    logger.info(`Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error(`Error sending email: ${error.message}`);
    throw error;
  }
};

export default sendEmail;
