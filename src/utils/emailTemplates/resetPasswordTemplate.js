// src/utils/emailTemplates/resetPasswordTemplate.js

/**
 * HTML for the "reset your password" email.
 * Styling is inlined because most email clients strip <style> blocks.
 * Layout uses tables so it renders in Outlook too.
 */
const resetPasswordTemplate = (resetUrl, { name, expiresInMinutes = 60 } = {}) => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
    <title>Reset your Oxxila password</title>
  </head>
  <body style="margin:0;padding:0;background:#0b0b14;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#eaeaf2;-webkit-font-smoothing:antialiased;">
    <!-- Pre-header text shown in inbox previews but hidden in the body -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      Reset your Oxxila password — this link expires in ${expiresInMinutes} minutes.
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0b14;padding:40px 16px;">
      <tr>
        <td align="center">

          <!-- Brand / wordmark -->
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;">
            <tr>
              <td align="center" style="padding-bottom:28px;">
                <div style="font-family:Georgia,'Times New Roman',serif;font-size:34px;font-weight:700;color:#a78bfa;letter-spacing:1px;line-height:1;">
                  Oxxila
                </div>
                <div style="font-size:11px;color:#6b6b85;text-transform:uppercase;letter-spacing:4px;margin-top:6px;">
                  Cosmetics Store
                </div>
              </td>
            </tr>
          </table>

          <!-- Card -->
          <table role="presentation" width="600" cellspacing="0" cellpadding="0"
            style="max-width:600px;background:#161626;border:1px solid #2a2a42;border-radius:20px;overflow:hidden;">

            <!-- Gradient accent bar -->
            <tr>
              <td style="height:4px;background:linear-gradient(90deg,#7c3aed 0%,#a78bfa 50%,#ec4899 100%);font-size:0;line-height:0;">&nbsp;</td>
            </tr>

            <!-- Icon + heading -->
            <tr>
              <td style="padding:44px 40px 0;text-align:center;">
                <div style="display:inline-block;width:76px;height:76px;border-radius:50%;background:#1f1f36;border:1px solid #3a3a5a;line-height:76px;font-size:32px;">
                  <span style="color:#a78bfa;">&#128274;</span>
                </div>
                <h1 style="margin:24px 0 10px;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:600;color:#ffffff;letter-spacing:0.3px;">
                  Reset your password
                </h1>
                <p style="margin:0;font-size:14px;color:#8d8da8;">
                  We received a request to reset your Oxxila password
                </p>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:32px 40px 8px;">
                <p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#c9c9d6;">
                  Hi <strong style="color:#ffffff;">${name || 'there'}</strong>,
                </p>
                <p style="margin:0 0 28px;font-size:15px;line-height:1.65;color:#c9c9d6;">
                  Click the button below to choose a new password. For your security, this link will expire in
                  <strong style="color:#a78bfa;">${expiresInMinutes} minutes</strong>.
                </p>

                <!-- CTA -->
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="center" style="padding:4px 0 28px;">
                      <a href="${resetUrl}"
                        style="display:inline-block;padding:16px 48px;background:#8b5cf6;background-image:linear-gradient(135deg,#8b5cf6 0%,#7c3aed 100%);color:#ffffff;text-decoration:none;border-radius:12px;font-weight:600;font-size:15px;letter-spacing:0.3px;">
                        Reset Password
                      </a>
                    </td>
                  </tr>
                </table>

                <!-- Fallback URL -->
                <div style="padding:16px 18px;background:#10101c;border:1px solid #2a2a42;border-radius:10px;margin:0 0 24px;">
                  <p style="margin:0 0 8px;font-size:11px;color:#6b6b85;text-transform:uppercase;letter-spacing:1.5px;">
                    Or paste this URL into your browser
                  </p>
                  <p style="margin:0;word-break:break-all;font-size:13px;color:#a78bfa;font-family:'Courier New',Consolas,monospace;">
                    ${resetUrl}
                  </p>
                </div>

                <!-- Security note -->
                <div style="padding:14px 18px;background:#1a1530;border-left:3px solid #8b5cf6;border-radius:6px;margin-bottom:8px;">
                  <p style="margin:0;font-size:13px;line-height:1.55;color:#a8a8bd;">
                    <strong style="color:#c9c9d6;">Didn't request this?</strong>
                    You can safely ignore this email — your password won't change unless you click the link above.
                  </p>
                </div>
              </td>
            </tr>

            <!-- Inner divider + sign-off -->
            <tr>
              <td style="padding:16px 40px 36px;">
                <hr style="border:none;border-top:1px solid #2a2a42;margin:0 0 20px;" />
                <p style="margin:0;font-size:14px;line-height:1.6;color:#8d8da8;">
                  Need help? Reach us anytime at
                  <a href="mailto:support@oxxila.com" style="color:#a78bfa;text-decoration:none;">support@oxxila.com</a>.
                </p>
              </td>
            </tr>
          </table>

          <!-- Footer -->
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;">
            <tr>
              <td style="padding:28px 24px 8px;text-align:center;">
                <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#6b6b85;">
                  You received this email because a password reset was requested for your Oxxila account.
                </p>
                <p style="margin:0;font-size:12px;color:#4a4a60;">
                  &copy; ${new Date().getFullYear()} Oxxila Cosmetics. All rights reserved.
                </p>
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>
  </body>
</html>
`;

export default resetPasswordTemplate;
