// src/utils/email.js
import nodemailer from 'nodemailer';
import logger from '../config/logger.js';

/**
 * @desc   Send an email via Gmail SMTP.
 * @param  {Object} options
 * @param  {string} options.email    - recipient address
 * @param  {string} options.subject  - email subject
 * @param  {string} options.html     - HTML body
 * @param  {string} [options.text]   - optional plain-text fallback
 */
const sendEmail = async (options) => {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: `"Oxxila" <${process.env.EMAIL_USER}>`,
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
