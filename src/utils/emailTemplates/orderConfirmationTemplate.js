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

const fmtMoney = (n, isAr = false) => {
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  return `${num.toFixed(2)} ${isAr ? 'ج.م' : 'EGP'}`;
};

const paymentLabel = (method, status, isAr) => {
  if (method === 'cod') return isAr ? 'الدفع عند الاستلام' : 'Cash on Delivery';
  if (method === 'card') {
    if (status === 'paid') return isAr ? 'مدفوع بالبطاقة' : 'Paid by card';
    return isAr ? 'بطاقة' : 'Card';
  }
  return safe(method || '—');
};

const orderConfirmationTemplate = ({
  locale = 'ar',
  /** General delivery-time message from site settings (the courier/ETA is set later). */
  deliveryNote = '',
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
  const isAr = locale !== 'en';
  const tr = (en, ar) => (isAr ? ar : en);
  const money = (n) => fmtMoney(n, isAr);
  const itemName = (item) =>
    isAr ? item.nameAr || item.name : item.nameEn || item.name;
  const shortId = String(orderId || '').slice(-8).toUpperCase();
  const dateStr = createdAt
    ? new Date(createdAt).toLocaleString(isAr ? 'ar-EG' : 'en-EG', {
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
                <td style="vertical-align:middle;padding-inline-start:4px;">
                  <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#ffffff;line-height:1.35;">
                    ${safe(itemName(item))}
                  </p>
                  <p style="margin:0;font-size:12px;color:#8d8da8;">
                    ${tr('Qty', 'الكمية')} ${qty} &middot; ${money(unit)} ${tr('each', 'للقطعة')}
                  </p>
                </td>
                <td align="right" style="vertical-align:middle;white-space:nowrap;padding-inline-start:12px;">
                  <p style="margin:0;font-size:14px;font-weight:600;color:#c9c9d6;">
                    ${money(lineTotal)}
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
          <td style="padding:6px 0;font-size:14px;color:#8d8da8;">${tr('Discount', 'الخصم')}</td>
          <td align="right" style="padding:6px 0;font-size:14px;color:#34d399;">−${money(discountAmount)}</td>
        </tr>`
      : '';

  const creditRow =
    Number(storeCreditApplied) > 0
      ? `<tr>
          <td style="padding:6px 0;font-size:14px;color:#8d8da8;">${tr('Store credit', 'رصيد المتجر')}</td>
          <td align="right" style="padding:6px 0;font-size:14px;color:#34d399;">−${money(storeCreditApplied)}</td>
        </tr>`
      : '';

  const html = `
<!DOCTYPE html>
<html lang="${isAr ? 'ar' : 'en'}" dir="${isAr ? 'rtl' : 'ltr'}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
    <title>${tr('Order confirmed', 'تم تأكيد الطلب')} — Oxxila</title>
  </head>
  <body style="margin:0;padding:0;background:#0b0b14;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#eaeaf2;-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${tr('Your Oxxila order', 'طلبك من أوكسيلا رقم')} #${safe(shortId)} ${tr('is confirmed — total', 'تم تأكيده — الإجمالي')} ${money(totalPrice)}.
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
                  ${tr('Cosmetics Store', 'متجر مستحضرات التجميل')}
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
                  ${tr('Order confirmed', 'تم تأكيد طلبك')}
                </h1>
                <p style="margin:0;font-size:14px;color:#8d8da8;">
                  ${tr('Order', 'الطلب')} <strong style="color:#a78bfa;">#${safe(shortId)}</strong>
                  ${dateStr ? ` &middot; ${safe(dateStr)}` : ''}
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:28px 40px 8px;">
                <p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#c9c9d6;">
                  ${tr('Hi', 'مرحبًا')} <strong style="color:#ffffff;">${safe(name || tr('there', 'بك'))}</strong>,
                </p>
                <p style="margin:0 0 8px;font-size:15px;line-height:1.65;color:#c9c9d6;">
                  ${tr(
                    'Thanks for shopping with Oxxila. Your order is confirmed — use the button below to view details and track delivery.',
                    'شكرًا لتسوقك من أوكسيلا. تم تأكيد طلبك — استخدم الزر أدناه لعرض التفاصيل وتتبع التوصيل.',
                  )}
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:8px 40px 8px;">
                <p style="margin:0 0 12px;font-size:11px;color:#6b6b85;text-transform:uppercase;letter-spacing:1.5px;">
                  ${tr('Items', 'المنتجات')}
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
                          <td style="padding:6px 0;font-size:14px;color:#8d8da8;">${tr('Subtotal', 'المجموع الفرعي')}</td>
                          <td align="right" style="padding:6px 0;font-size:14px;color:#c9c9d6;">${money(subtotal)}</td>
                        </tr>
                        <tr>
                          <td style="padding:6px 0;font-size:14px;color:#8d8da8;">${tr('Shipping', 'الشحن')}</td>
                          <td align="right" style="padding:6px 0;font-size:14px;color:#c9c9d6;">${money(shippingPrice)}</td>
                        </tr>
                        ${discountRow}
                        ${creditRow}
                        <tr>
                          <td colspan="2" style="padding-top:10px;border-top:1px solid #2a2a42;"></td>
                        </tr>
                        <tr>
                          <td style="padding:8px 0 4px;font-size:15px;font-weight:600;color:#ffffff;">${tr('Total', 'الإجمالي')}</td>
                          <td align="right" style="padding:8px 0 4px;font-size:16px;font-weight:700;color:#a78bfa;">${money(totalPrice)}</td>
                        </tr>
                        <tr>
                          <td style="padding:4px 0 0;font-size:12px;color:#6b6b85;">${tr('Payment', 'الدفع')}</td>
                          <td align="right" style="padding:4px 0 0;font-size:12px;color:#8d8da8;">${paymentLabel(paymentMethod, paymentStatus, isAr)}</td>
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
                  ${tr('Shipping to', 'التوصيل إلى')}
                </p>
                <p style="margin:0;font-size:14px;line-height:1.55;color:#c9c9d6;">
                  ${addr}
                </p>
                ${
                  shippingAddress?.phone
                    ? `<p style="margin:6px 0 0;font-size:13px;color:#8d8da8;" dir="ltr">${safe(shippingAddress.phone)}</p>`
                    : ''
                }
              </td>
            </tr>`
                : ''
            }

            ${
              deliveryNote
                ? `<tr>
              <td style="padding:16px 40px 0;">
                <div style="padding:14px 18px;background:#10101c;border:1px solid #2a2a42;border-radius:12px;">
                  <p style="margin:0 0 6px;font-size:11px;color:#6b6b85;text-transform:uppercase;letter-spacing:1.5px;">
                    ${tr('Delivery', 'التوصيل')}
                  </p>
                  <p style="margin:0;font-size:14px;line-height:1.6;color:#c9c9d6;">${safe(deliveryNote)}</p>
                </div>
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
                        ${tr('View order &amp; track', 'عرض الطلب وتتبعه')}
                      </a>
                    </td>
                  </tr>
                </table>

                <div style="padding:16px 18px;background:#10101c;border:1px solid #2a2a42;border-radius:10px;">
                  <p style="margin:0 0 8px;font-size:11px;color:#6b6b85;text-transform:uppercase;letter-spacing:1.5px;">
                    ${tr('Or paste this URL into your browser', 'أو الصق هذا الرابط في المتصفح')}
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
                  ${tr('You received this email because you placed an order on Oxxila.', 'وصلتك هذه الرسالة لأنك أجريت طلبًا على أوكسيلا.')}
                </p>
                <p style="margin:0;font-size:12px;color:#4a4a60;">
                  &copy; ${new Date().getFullYear()} Oxxila Cosmetics. ${tr('All rights reserved.', 'جميع الحقوق محفوظة.')}
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
    subject: isAr ? `تم تأكيد طلبك #${shortId} — أوكسيلا` : `Order confirmed #${shortId} — Oxxila`,
    html,
  };
};

export default orderConfirmationTemplate;
