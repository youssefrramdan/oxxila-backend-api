// src/utils/emailTemplates/contactMessageTemplate.js

/**
 * HTML + subject for storefront "Contact us" form → inbox.
 */
const contactMessageTemplate = ({ name, email, message }) => {
  const safe = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const subject = `Contact form: ${name}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><title>${safe(subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f3ff;font-family:Arial,Helvetica,sans-serif;color:#1f1635;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ff;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e9e4ff;">
          <tr>
            <td style="padding:20px 24px;background:#6b5b95;color:#fff;">
              <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.85;">Oxxila</p>
              <h1 style="margin:6px 0 0;font-size:20px;font-weight:700;">New contact message</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">From</p>
              <p style="margin:0 0 16px;font-size:16px;font-weight:600;">${safe(name)}</p>
              <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Email</p>
              <p style="margin:0 0 16px;font-size:15px;">
                <a href="mailto:${safe(email)}" style="color:#6b5b95;text-decoration:none;">${safe(email)}</a>
              </p>
              <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Message</p>
              <div style="padding:14px 16px;border-radius:12px;background:#f8f6ff;border:1px solid #ebe6ff;font-size:15px;line-height:1.55;white-space:pre-wrap;">${safe(message)}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `New contact message from ${name} <${email}>\n\n${message}`;

  return { subject, html, text };
};

export default contactMessageTemplate;
