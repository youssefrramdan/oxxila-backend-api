// src/utils/emailTemplates/askSpecialistTemplate.js

/**
 * HTML + subject for "customer asked a product question" (to admin inbox).
 * Rich product card: image, meta grid, pricing, description excerpt, customer question.
 */
const askSpecialistTemplate = ({
    productName,
    productSlug,
    imageUrl,
    price,
    priceAfterDiscount,
    stock,
    descriptionExcerpt,
    brandName,
    categoryName,
    userQuestion,
  }) => {
    const safe = (s) =>
      String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const fmt = (n) => (typeof n === 'number' && !Number.isNaN(n) ? n.toFixed(2) : null);

    const subject = `Product question: ${productName}`;

    // ── Image block ──────────────────────────────────────────────────────────────
    const imageBlock = imageUrl
      ? `<tr>
          <td style="padding:0 0 20px;">
            <img src="${safe(imageUrl)}" alt="${safe(productName)}"
                 width="100%"
                 style="max-width:100%;height:180px;object-fit:cover;border-radius:8px;border:1px solid #e5e7eb;display:block;" />
          </td>
        </tr>`
      : '';

    // ── Meta grid (2 columns) ────────────────────────────────────────────────────
    const metaCells = [];

    if (categoryName)
      metaCells.push({ label: 'Category', value: safe(categoryName) });
    if (brandName)
      metaCells.push({ label: 'Brand', value: safe(brandName) });

    const p  = fmt(price);
    const pd = priceAfterDiscount != null ? fmt(priceAfterDiscount) : null;
    const hasDiscount = p != null && pd != null && Number(priceAfterDiscount) !== Number(price);

    if (p != null) {
      const priceValue = hasDiscount
        ? `<span style="text-decoration:line-through;color:#6b6b85;font-size:12px;">$${safe(p)}</span>&nbsp;<span style="color:#a78bfa;font-weight:600;">$${safe(pd)}</span>`
        : `$${safe(p)}`;
      metaCells.push({ label: 'Price', value: priceValue });
    }

    if (typeof stock === 'number')
      metaCells.push({ label: 'Stock', value: `${safe(String(stock))} units` });

    if (productSlug)
      metaCells.push({ label: 'Slug', value: `<span style="font-family:monospace;font-size:12px;">${safe(productSlug)}</span>` });

    // Pair cells into rows of 2
    const metaRows = [];
    for (let i = 0; i < metaCells.length; i += 2) {
      const left  = metaCells[i];
      const right = metaCells[i + 1];
      const cellStyle = `width:50%;background:#0d0d1a;border-radius:8px;padding:10px 12px;vertical-align:top;border:1px solid #2a2a3d;`;
      metaRows.push(`
        <tr>
          <td style="${cellStyle}">
            <p style="margin:0 0 3px;font-size:11px;color:#6b6b85;text-transform:uppercase;letter-spacing:0.05em;">${left.label}</p>
            <p style="margin:0;font-size:14px;font-weight:500;color:#eaeaf2;">${left.value}</p>
          </td>
          <td style="width:12px;"></td>
          ${right ? `
          <td style="${cellStyle}">
            <p style="margin:0 0 3px;font-size:11px;color:#6b6b85;text-transform:uppercase;letter-spacing:0.05em;">${right.label}</p>
            <p style="margin:0;font-size:14px;font-weight:500;color:#eaeaf2;">${right.value}</p>
          </td>` : '<td></td>'}
        </tr>
        <tr><td colspan="3" style="height:10px;"></td></tr>
      `);
    }

    const metaGridBlock = metaRows.length
      ? `<tr>
          <td style="padding:0 0 16px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              ${metaRows.join('')}
            </table>
          </td>
        </tr>`
      : '';

    // ── Description excerpt ───────────────────────────────────────────────────────
    const excerptBlock = descriptionExcerpt
      ? `<tr>
          <td style="padding:0 0 16px;">
            <p style="margin:0;padding:12px 14px;background:#0d0d1a;border-radius:8px;border:1px solid #2a2a3d;border-left:3px solid #4b4b6b;font-size:13px;color:#b4b4c6;line-height:1.6;">${safe(descriptionExcerpt)}</p>
          </td>
        </tr>`
      : '';

    // ── Full HTML ─────────────────────────────────────────────────────────────────
    const html = `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>${safe(subject)}</title>
    </head>
    <body style="margin:0;padding:0;background:#0b0b14;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#eaeaf2;">

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
             style="background:#0b0b14;padding:32px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="600" cellspacing="0" cellpadding="0"
                   style="max-width:600px;background:#151522;border-radius:12px;border:1px solid #2a2a3d;overflow:hidden;">

              <!-- Header -->
              <tr>
                <td style="padding:20px 24px 16px;border-bottom:1px solid #2a2a3d;">
                  <p style="margin:0 0 10px;">
                    <span style="
                      display:inline-block;
                      font-size:11px;
                      font-weight:500;
                      letter-spacing:0.06em;
                      color:#a78bfa;
                      background:#1e1b2e;
                      border-radius:6px;
                      padding:3px 10px;
                    ">Oxxila — product question</span>
                  </p>
                  <p style="margin:0 0 4px;font-size:18px;font-weight:500;color:#eaeaf2;">${safe(productName)}</p>
                  ${productSlug ? '' : ''}
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:20px 24px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">

                    ${imageBlock}
                    ${metaGridBlock}
                    ${excerptBlock}

                    <!-- Question label -->
                    <tr>
                      <td style="padding:0 0 8px;">
                        <p style="margin:0;font-size:11px;color:#6b6b85;text-transform:uppercase;letter-spacing:0.05em;">Customer question</p>
                      </td>
                    </tr>

                    <!-- Question block -->
                    <tr>
                      <td style="padding:0 0 0;">
                        <p style="margin:0;padding:14px;background:#0d0d1a;border-radius:8px;border:1px solid #2a2a3d;font-size:14px;color:#eaeaf2;line-height:1.6;white-space:pre-wrap;">${safe(userQuestion)}</p>
                      </td>
                    </tr>

                  </table>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding:14px 24px;border-top:1px solid #2a2a3d;background:#0d0d1a;border-radius:0 0 12px 12px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="font-size:12px;color:#6b6b85;">
                        Add the answer as an FAQ from the dashboard when ready.
                      </td>
                      <td align="right">
                        <a href="#"
                           style="display:inline-block;font-size:12px;font-weight:500;color:#a78bfa;background:#1e1b2e;border-radius:6px;padding:5px 12px;text-decoration:none;">Go to dashboard →</a>
                      </td>
                    </tr>
                  </table>
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
