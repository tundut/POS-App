const nodemailer = require('nodemailer');

const createTransporter = () => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    throw new Error('SMTP configuration is incomplete. Please set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM in .env');
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
};

const sendInvoiceEmail = async ({ to, order, products }) => {
  const transporter = createTransporter();
  const itemRows = products.map(item => `
      <tr>
        <td>${item.name}</td>
        <td style="text-align:center">${item.quantity}</td>
        <td style="text-align:right">${item.price.toFixed(2)}</td>
        <td style="text-align:right">${(item.price * item.quantity).toFixed(2)}</td>
      </tr>`).join('');

  const html = `
    <p>Dear Customer,</p>
    <p>Thank you for your order. Please find your invoice below:</p>
    <h3>Order #${order.id}</h3>
    <table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%;">
      <thead>
        <tr>
          <th>Product</th>
          <th>Quantity</th>
          <th>Price</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>
    <p><strong>Order total: ${Number(order.total).toFixed(2)}</strong></p>
    <p>Status: ${order.status}</p>
    <p>If you have questions, please reply to this email.</p>
    <p>Best regards,<br/>POS Team</p>
  `;

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: `Invoice for Order #${order.id}`,
    html
  });
};

module.exports = { sendInvoiceEmail };
