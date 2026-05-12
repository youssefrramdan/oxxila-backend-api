// src/utils/emailTemplates/askSpecialistTemplate.js

/**
 * HTML + subject for "customer asked a product question" (to admin inbox).
 */
const askSpecialistTemplate = ({
  productName,
  productId,
  userQuestion,
  userName,
  userEmail,
}) => {
  const safe = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const subject = `Product question: ${productName}`;
  const html = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${safe(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#0b0b14;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#eaeaf2;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0b14;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#151522;border-radius:12px;padding:28px 24px;">
            <tr>
              <td style="font-size:20px;font-weight:700;color:#a78bfa;padding-bottom:16px;">Oxxila — product question</td>
            </tr>
            <tr>
              <td style="font-size:14px;line-height:1.6;color:#c9c9d4;">
                <p style="margin:0 0 12px;"><strong>Product:</strong> ${safe(productName)}</p>
                <p style="margin:0 0 12px;"><strong>Product ID:</strong> ${safe(String(productId))}</p>
                <p style="margin:0 0 12px;"><strong>From:</strong> ${safe(userName)} &lt;${safe(userEmail)}&gt;</p>
                <p style="margin:16px 0 8px;"><strong>Question</strong></p>
                <p style="margin:0;padding:14px;background:#0b0b14;border-radius:8px;border:1px solid #2a2a3d;white-space:pre-wrap;">${safe(userQuestion)}</p>
                <p style="margin:20px 0 0;font-size:12px;color:#6b6b85;">Reply from the dashboard after you add an FAQ, or email the customer directly.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

  return { subject, html };
};

export default askSpecialistTemplate;
