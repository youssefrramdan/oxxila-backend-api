// src/utils/emailTemplates/orderConfirmationTemplate.js

/**
 * HTML for the "order confirmed" email (inline CSS + tables for email clients).
 * Matches the dark purple Oxxila brand used in other templates.
 */
const safe = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const fmtMoney = (n) => {
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  return `${num.toFixed(2)} EGP`;
};

const paymentLabel = (method, status) => {
  if (method === 'cod') return 'Cash on Delivery';
  if (method === 'card') return status === 'paid' ? 'Paid by card' : 'Card';
  return safe(method || '—');
};

const orderConfirmationTemplate = ({
  name,
  orderId,
  orderDetailsUrl,
  items = [],
  subtotal,
  shippingPrice,
  discountAmount = 0,
  storeCreditApplied = 0,
  totalPrice,
  paymentMethod,
  paymentStatus,
  shippingAddress,
  createdAt,
} = {}) => {
  const shortId = String(orderId || '').slice(-8).toUpperCase();
  const dateStr = createdAt
    ? new Date(createdAt).toLocaleString('en-EG', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '';

  const itemRows = items
    .map((item) => {
      const qty = Number(item.quantity) || 1;
      const unit = Number(item.price) || 0;
      const lineTotal = unit * qty;
      const img = item.image
        ? `<img src="${safe(item.image)}" alt="" width="56" height="56"
              style="display:block;width:56px;height:56px;object-fit:cover;border-radius:10px;border:1px solid #2a2a42;" />`
        : `<div style="width:56px;height:56px;border-radius:10px;background:#1f1f36;border:1px solid #2a2a42;"></div>`;

      return `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #2a2a42;vertical-align:middle;">
            <table role="presentation" cellspacing="0" cellpadding="0" width="100%">
              <tr>
                <td width="68" style="vertical-align:middle;">${img}</td>
                <td style="vertical-align:middle;padding-left:4px;">
                  <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#ffffff;line-height:1.35;">
                    ${safe(item.name)}
                  </p>
                  <p style="margin:0;font-size:12px;color:#8d8da8;">
                    Qty ${qty} &middot; ${fmtMoney(unit)} each
                  </p>
                </td>
                <td align="right" style="vertical-align:middle;white-space:nowrap;padding-left:12px;">
                  <p style="margin:0;font-size:14px;font-weight:600;color:#c9c9d6;">
                    ${fmtMoney(lineTotal)}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    })
    .join('');

  const addr = shippingAddress
    ? [
        shippingAddress.addressLine,
        shippingAddress.districtName,
        shippingAddress.governorateName,
        shippingAddress.countryName,
      ]
        .filter(Boolean)
        .map(safe)
        .join(', ')
    : '';

  const discountRow =
    Number(discountAmount) > 0
      ? `<tr>
          <td style="padding:6px 0;font-size:14px;color:#8d8da8;">Discount</td>
          <td align="right" style="padding:6px 0;font-size:14px;color:#34d399;">−${fmtMoney(discountAmount)}</td>
        </tr>`
      : '';

  const creditRow =
    Number(storeCreditApplied) > 0
      ? `<tr>
          <td style="padding:6px 0;font-size:14px;color:#8d8da8;">Store credit</td>
          <td align="right" style="padding:6px 0;font-size:14px;color:#34d399;">−${fmtMoney(storeCreditApplied)}</td>
        </tr>`
      : '';

  const html = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
    <title>Order confirmed — Oxxila</title>
  </head>
  <body style="margin:0;padding:0;background:#0b0b14;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#eaeaf2;-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      Your Oxxila order #${safe(shortId)} is confirmed — total ${fmtMoney(totalPrice)}.
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0b14;padding:40px 16px;">
      <tr>
        <td align="center">

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

          <table role="presentation" width="600" cellspacing="0" cellpadding="0"
            style="max-width:600px;background:#161626;border:1px solid #2a2a42;border-radius:20px;overflow:hidden;">

            <tr>
              <td style="height:4px;background:linear-gradient(90deg,#7c3aed 0%,#a78bfa 50%,#ec4899 100%);font-size:0;line-height:0;">&nbsp;</td>
            </tr>

            <tr>
              <td style="padding:40px 40px 0;text-align:center;">
                <div style="display:inline-block;width:76px;height:76px;border-radius:50%;background:#1f1f36;border:1px solid #3a3a5a;line-height:76px;font-size:32px;">
                  <span style="color:#a78bfa;">&#10003;</span>
                </div>
                <h1 style="margin:24px 0 10px;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:600;color:#ffffff;letter-spacing:0.3px;">
                  Order confirmed
                </h1>
                <p style="margin:0;font-size:14px;color:#8d8da8;">
                  Order <strong style="color:#a78bfa;">#${safe(shortId)}</strong>
                  ${dateStr ? ` &middot; ${safe(dateStr)}` : ''}
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:28px 40px 8px;">
                <p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#c9c9d6;">
                  Hi <strong style="color:#ffffff;">${safe(name || 'there')}</strong>,
                </p>
                <p style="margin:0 0 8px;font-size:15px;line-height:1.65;color:#c9c9d6;">
                  Thanks for shopping with Oxxila. Your order is confirmed — use the button below to view details and track delivery.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:8px 40px 8px;">
                <p style="margin:0 0 12px;font-size:11px;color:#6b6b85;text-transform:uppercase;letter-spacing:1.5px;">
                  Items
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  ${itemRows}
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:16px 40px 8px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
                  style="background:#10101c;border:1px solid #2a2a42;border-radius:12px;padding:4px;">
                  <tr>
                    <td style="padding:14px 16px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td style="padding:6px 0;font-size:14px;color:#8d8da8;">Subtotal</td>
                          <td align="right" style="padding:6px 0;font-size:14px;color:#c9c9d6;">${fmtMoney(subtotal)}</td>
                        </tr>
                        <tr>
                          <td style="padding:6px 0;font-size:14px;color:#8d8da8;">Shipping</td>
                          <td align="right" style="padding:6px 0;font-size:14px;color:#c9c9d6;">${fmtMoney(shippingPrice)}</td>
                        </tr>
                        ${discountRow}
                        ${creditRow}
                        <tr>
                          <td colspan="2" style="padding-top:10px;border-top:1px solid #2a2a42;"></td>
                        </tr>
                        <tr>
                          <td style="padding:8px 0 4px;font-size:15px;font-weight:600;color:#ffffff;">Total</td>
                          <td align="right" style="padding:8px 0 4px;font-size:16px;font-weight:700;color:#a78bfa;">${fmtMoney(totalPrice)}</td>
                        </tr>
                        <tr>
                          <td style="padding:4px 0 0;font-size:12px;color:#6b6b85;">Payment</td>
                          <td align="right" style="padding:4px 0 0;font-size:12px;color:#8d8da8;">${paymentLabel(paymentMethod, paymentStatus)}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            ${
              addr
                ? `<tr>
              <td style="padding:16px 40px 8px;">
                <p style="margin:0 0 8px;font-size:11px;color:#6b6b85;text-transform:uppercase;letter-spacing:1.5px;">
                  Shipping to
                </p>
                <p style="margin:0;font-size:14px;line-height:1.55;color:#c9c9d6;">
                  ${addr}
                </p>
              </td>
            </tr>`
                : ''
            }

            <tr>
              <td style="padding:28px 40px 36px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="center" style="padding:4px 0 24px;">
                      <a href="${safe(orderDetailsUrl)}"
                        style="display:inline-block;padding:16px 48px;background:#8b5cf6;background-image:linear-gradient(135deg,#8b5cf6 0%,#7c3aed 100%);color:#ffffff;text-decoration:none;border-radius:12px;font-weight:600;font-size:15px;letter-spacing:0.3px;">
                        View order &amp; track
                      </a>
                    </td>
                  </tr>
                </table>

                <div style="padding:16px 18px;background:#10101c;border:1px solid #2a2a42;border-radius:10px;">
                  <p style="margin:0 0 8px;font-size:11px;color:#6b6b85;text-transform:uppercase;letter-spacing:1.5px;">
                    Or paste this URL into your browser
                  </p>
                  <p style="margin:0;word-break:break-all;font-size:13px;color:#a78bfa;font-family:'Courier New',Consolas,monospace;">
                    ${safe(orderDetailsUrl)}
                  </p>
                </div>
              </td>
            </tr>
          </table>

          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;">
            <tr>
              <td style="padding:28px 24px 8px;text-align:center;">
                <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#6b6b85;">
                  You received this email because you placed an order on Oxxila.
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

  return {
    subject: `Order confirmed #${shortId} — Oxxila`,
    html,
  };
};

export default orderConfirmationTemplate;
