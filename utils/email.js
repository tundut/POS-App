const nodemailer = require('nodemailer');

const createTransporter = () => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error('SMTP configuration is incomplete. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env');
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
};

const sendReceiptEmail = async ({ to, storeName, order, items }) => {
  const transporter = createTransporter();
  const date = new Date(order.created_at || Date.now()).toLocaleString('en-US', {
    dateStyle: 'medium', timeStyle: 'short',
  });

  const itemRows = items.map(item => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">${item.product_name}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:center;">${item.quantity}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:right;">$${item.product_price.toFixed(2)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:right;">$${item.subtotal.toFixed(2)}</td>
    </tr>`).join('');

  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
      <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:30px;text-align:center;">
        <h1 style="color:#ffffff;margin:0;font-size:24px;">${storeName}</h1>
        <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;">Receipt</p>
      </div>
      <div style="padding:28px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:20px;">
          <div>
            <p style="margin:0;color:#64748b;font-size:13px;">Order ID</p>
            <p style="margin:4px 0 0;font-weight:600;color:#1e293b;">#${order.id}</p>
          </div>
          <div style="text-align:right;">
            <p style="margin:0;color:#64748b;font-size:13px;">Date</p>
            <p style="margin:4px 0 0;font-weight:600;color:#1e293b;">${date}</p>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:10px 14px;text-align:left;color:#64748b;font-size:13px;font-weight:600;">Product</th>
              <th style="padding:10px 14px;text-align:center;color:#64748b;font-size:13px;font-weight:600;">Qty</th>
              <th style="padding:10px 14px;text-align:right;color:#64748b;font-size:13px;font-weight:600;">Price</th>
              <th style="padding:10px 14px;text-align:right;color:#64748b;font-size:13px;font-weight:600;">Subtotal</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
        <div style="text-align:right;margin-top:16px;padding-top:16px;border-top:2px solid #e2e8f0;">
          <span style="font-size:18px;font-weight:700;color:#1e293b;">Total: $${parseFloat(order.total_amount).toFixed(2)}</span>
        </div>
        <p style="margin-top:28px;color:#94a3b8;font-size:13px;text-align:center;">Thank you for your purchase!</p>
      </div>
    </div>`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `Receipt from ${storeName} — Order #${order.id}`,
    html,
  });
};

module.exports = { sendReceiptEmail };
