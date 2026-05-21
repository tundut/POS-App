const { SESClient, SendRawEmailCommand } = require("@aws-sdk/client-ses");
const { generatePDFBuffer } = require('./pdfBuffer');
const nodemailer = require("nodemailer");
require('dotenv').config();

const ses = new SESClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const sendReceiptEmail = async ({ to, storeName, order, items }) => {
  const date = new Date(order.created_at || Date.now()).toLocaleString('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const itemRows = items.map(item => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">${item.product_name}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:center;">${item.quantity}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:right;">${item.product_price.toLocaleString('vi-VN')} ₫</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:right;">${item.subtotal.toLocaleString('vi-VN')} ₫</td>
    </tr>`).join('');

  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
      <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:30px;text-align:center;">
        <h1 style="color:#ffffff;margin:0;font-size:24px;">${storeName}</h1>
        <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;">Receipt</p>
      </div>
      <div style="padding:28px;">
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <tr>
            <td style="width:100%;padding:6px 0;">
              <span style="color:#64748b;font-size:13px;">Order ID </span>
              <span style="font-weight:600;color:#1e293b;"> #${order.id}</span>
            </td>
          </tr>
          <tr>
            <td style="width:100%;padding:6px 0;">
              <span style="color:#64748b;font-size:13px;">Date </span>
              <span style="font-weight:600;color:#1e293b;"> ${date}</span>
            </td>
          </tr>
          <tr>
            <td style="width:100%;padding:6px 0;">
              <span style="color:#64748b;font-size:13px;">From </span>
              <span style="font-weight:600;color:#1e293b;"> ${storeName}</span>
            </td>
          </tr>
          <tr>
            <td style="width:100%;padding:6px 0;">
              <span style="color:#64748b;font-size:13px;">To </span>
              <span style="font-weight:600;color:#1e293b;"> ${to}</span>
            </td>
          </tr>
        </table>
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
          <span style="font-size:18px;font-weight:700;color:#1e293b;">Total: ${parseFloat(order.total_amount).toLocaleString('vi-VN')} ₫</span>
        </div>
        <p style="margin-top:28px;color:#94a3b8;font-size:13px;text-align:center;">Thank you for your purchase!</p>
      </div>
    </div>`;

  const subject = `Receipt from ${storeName} — Order #${order.id}`;

  const pdfBuffer = await generatePDFBuffer(html);

  const transporter = nodemailer.createTransport({
    streamTransport: true,
    buffer: true
  });

  const info = await transporter.sendMail({
    from: `${storeName} <${process.env.SES_FROM_EMAIL}>`,
    to,
    subject,
    html,
    attachments: [
      {
        filename: "receipt.pdf",
        content: pdfBuffer,
        contentType: "application/pdf"
      }
    ]
  });

  await ses.send(
    new SendRawEmailCommand({
      RawMessage: {
        Data: info.message
      }
    })
  );
};

module.exports = { sendReceiptEmail };
