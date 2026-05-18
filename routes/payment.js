const express = require("express");
const crypto = require("crypto");
const qs = require("qs");
const moment = require("moment");
const db = require("../db");
const { auth } = require("../middleware/auth");
const { sendReceiptEmail } = require("../utils/emailService");
const router = express.Router();

const vnp_TmnCode = process.env.VNP_TMN_CODE;
const vnp_HashSecret = process.env.VNP_HASH_SECRET;
const vnp_Url = "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
const vnp_ReturnUrl = process.env.VNP_RETURN_URL;

function sortObject(obj) {
  const sorted = {};
  const keys = Object.keys(obj).map(k => encodeURIComponent(k)).sort();
  for (const key of keys) {
    sorted[key] = encodeURIComponent(obj[key]).replace(/%20/g, "+");
  }
  return sorted;
}

// ── POST /api/payment/create — Generate VNPay payment URL ──
router.post("/create", auth, async (req, res) => {
  const { orderId, amount, orderInfo } = req.body;

  if (!orderId || !amount) {
    return res.status(400).json({ message: "orderId and amount are required" });
  }

  // Verify order belongs to this tenant and is pending
  const orderCheck = await db.query(
    "SELECT id FROM orders WHERE id = $1 AND tenant_id = $2 AND status = 'pending'",
    [orderId, req.tenantId]
  );
  if (orderCheck.rows.length === 0) {
    return res.status(404).json({ message: "Pending order not found" });
  }

  process.env.TZ = "Asia/Ho_Chi_Minh";
  const date = new Date();
  const createDate = moment(date).format("YYYYMMDDHHmmss");
  const txnRef = orderId + "-" + moment(date).format("HHmmss");

  const ipAddr =
    req.headers["x-forwarded-for"] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    "127.0.0.1";

  let vnp_Params = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: vnp_TmnCode,
    vnp_Locale: "vn",
    vnp_CurrCode: "VND",
    vnp_TxnRef: txnRef,
    vnp_OrderInfo: orderInfo || "Payment for Order #" + orderId,
    vnp_OrderType: "other",
    vnp_Amount: Math.round(amount * 100), // VNPay requires amount * 100
    vnp_ReturnUrl: vnp_ReturnUrl,
    vnp_IpAddr: ipAddr,
    vnp_CreateDate: createDate,
  };

  vnp_Params = sortObject(vnp_Params);

  const signData = qs.stringify(vnp_Params, { encode: false });
  const secureHash = crypto
    .createHmac("sha512", vnp_HashSecret)
    .update(Buffer.from(signData, "utf-8"))
    .digest("hex");

  vnp_Params.vnp_SecureHash = secureHash;

  const paymentUrl =
    vnp_Url + "?" + qs.stringify(vnp_Params, { encode: false });

  // Save transaction ref to payment record
  await db.query(
    `UPDATE payments SET transaction_ref = $1, status = 'pending' WHERE order_id = $2`,
    [txnRef, orderId]
  );

  res.json({ paymentUrl, txnRef });
});

// ── GET /api/payment/return — Handle redirect back from VNPay ──
router.get("/return", async (req, res) => {
  let vnp_Params = { ...req.query };
  const secureHash = vnp_Params.vnp_SecureHash;

  delete vnp_Params.vnp_SecureHash;
  delete vnp_Params.vnp_SecureHashType;

  vnp_Params = sortObject(vnp_Params);

  const signData = qs.stringify(vnp_Params, { encode: false });
  const checkHash = crypto
    .createHmac("sha512", vnp_HashSecret)
    .update(Buffer.from(signData, "utf-8"))
    .digest("hex");

  const isValid = secureHash === checkHash;
  const responseCode = req.query.vnp_ResponseCode;
  const txnRef = req.query.vnp_TxnRef;
  const isSuccess = isValid && responseCode === "00";

  // Update order and payment status
  if (txnRef) {
    const orderId = txnRef.split("-")[0];
    const newStatus = isSuccess ? "completed" : "failed";

    // Atomically update order to prevent double processing
    const updateResult = await db.query(
      "UPDATE orders SET status = $1 WHERE id = $2 AND status = 'pending' RETURNING *",
      [newStatus, orderId]
    );

    if (updateResult.rows.length > 0) {
      await db.query("UPDATE payments SET status = $1 WHERE transaction_ref = $2", [newStatus, txnRef]);

      // If successful, deduct stock and send receipt email
      if (isSuccess) {
        try {
          const orderResult = await db.query(
            `SELECT o.*, t.name AS store_name FROM orders o JOIN tenants t ON t.id = o.tenant_id WHERE o.id = $1`,
            [orderId]
          );
          const order = orderResult.rows[0];
          
          if (order) {
            const itemsResult = await db.query("SELECT * FROM order_items WHERE order_id = $1", [orderId]);
            
            // Deduct stock
            for (const item of itemsResult.rows) {
              await db.query(
                "UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2",
                [item.quantity, item.product_id]
              );
            }

            if (order.customer_email) {
              sendReceiptEmail({
                to: order.customer_email,
                storeName: order.store_name,
                order,
                items: itemsResult.rows.map(i => ({
                  product_name: i.product_name,
                  product_price: parseFloat(i.product_price),
                  quantity: i.quantity,
                  subtotal: parseFloat(i.subtotal),
                })),
              }).catch(err => console.error("Email send error:", err.message));
            }
          }
        } catch (e) {
          console.error("Post-payment error:", e.message);
        }
      }
    }
  }

  // Serve a result page
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment ${isSuccess ? "Successful" : "Failed"}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Inter',sans-serif; min-height:100vh; display:flex; align-items:center; justify-content:center;
      background:radial-gradient(ellipse at 30% 20%,rgba(99,102,241,0.15),transparent 60%),#0a0e1a; color:#f1f5f9; }
    .card { background:#131a2b; border:1px solid rgba(255,255,255,0.06); border-radius:20px; padding:3rem; text-align:center;
      max-width:440px; width:100%; box-shadow:0 20px 60px rgba(0,0,0,0.4); }
    .icon { font-size:4rem; margin-bottom:1rem; }
    h1 { font-size:1.5rem; margin-bottom:0.5rem; }
    p { color:#94a3b8; margin-bottom:1.5rem; font-size:0.95rem; }
    .info { background:rgba(255,255,255,0.04); border-radius:10px; padding:1rem; margin-bottom:1.5rem; font-size:0.85rem; color:#94a3b8; }
    .info strong { color:#f1f5f9; }
    a { display:inline-block; padding:0.75rem 2rem; background:#6366f1; color:#fff; border-radius:10px;
      text-decoration:none; font-weight:600; transition:0.2s; }
    a:hover { background:#818cf8; transform:translateY(-1px); }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${isSuccess ? "✅" : "❌"}</div>
    <h1>${isSuccess ? "Payment Successful!" : "Payment Failed"}</h1>
    <p>${isSuccess ? "Your transaction has been completed and a receipt has been sent to your email." : "The transaction could not be completed. Please try again."}</p>
    <div class="info">
      <p>Transaction Ref: <strong>${txnRef || "N/A"}</strong></p>
      <p>Response Code: <strong>${responseCode || "N/A"}</strong></p>
    </div>
    <a href="/dashboard">Back to Dashboard</a>
  </div>
</body>
</html>`);
});

// ── GET /api/payment/ipn — VNPay IPN callback ──
router.get("/ipn", async (req, res) => {
  let vnp_Params = { ...req.query };
  const secureHash = vnp_Params.vnp_SecureHash;
  const rspCode = vnp_Params.vnp_ResponseCode;
  const txnRef = vnp_Params.vnp_TxnRef;

  delete vnp_Params.vnp_SecureHash;
  delete vnp_Params.vnp_SecureHashType;

  vnp_Params = sortObject(vnp_Params);

  const signData = qs.stringify(vnp_Params, { encode: false });
  const checkHash = crypto
    .createHmac("sha512", vnp_HashSecret)
    .update(Buffer.from(signData, "utf-8"))
    .digest("hex");

  if (secureHash !== checkHash) {
    return res.status(200).json({ RspCode: "97", Message: "Checksum failed" });
  }

  // Verify order exists
  if (!txnRef) {
    return res.status(200).json({ RspCode: "01", Message: "Order not found" });
  }

  const orderId = txnRef.split("-")[0];
  const orderResult = await db.query("SELECT * FROM orders WHERE id = $1", [orderId]);
  if (orderResult.rows.length === 0) {
    return res.status(200).json({ RspCode: "01", Message: "Order not found" });
  }

  const order = orderResult.rows[0];
  if (order.status !== "pending") {
    return res.status(200).json({ RspCode: "02", Message: "Order already updated" });
  }

  // Verify amount
  const vnpAmount = parseInt(vnp_Params.vnp_Amount || req.query.vnp_Amount) / 100;
  if (Math.abs(vnpAmount - parseFloat(order.total_amount)) > 1) {
    return res.status(200).json({ RspCode: "04", Message: "Amount invalid" });
  }

  const newStatus = rspCode === "00" ? "completed" : "failed";
  
  // Atomically update order to prevent double processing
  const updateResult = await db.query(
    "UPDATE orders SET status = $1 WHERE id = $2 AND status = 'pending' RETURNING *",
    [newStatus, orderId]
  );

  if (updateResult.rows.length === 0) {
    return res.status(200).json({ RspCode: "02", Message: "Order already updated" });
  }

  await db.query("UPDATE payments SET status = $1 WHERE transaction_ref = $2", [newStatus, txnRef]);

  // If successful, deduct stock and send receipt email
  if (rspCode === "00") {
    try {
      const itemsResult = await db.query("SELECT * FROM order_items WHERE order_id = $1", [orderId]);
      
      // Deduct stock
      for (const item of itemsResult.rows) {
        await db.query(
          "UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2",
          [item.quantity, item.product_id]
        );
      }

      if (order.customer_email) {
        const tenantResult = await db.query("SELECT name FROM tenants WHERE id = $1", [order.tenant_id]);
        sendReceiptEmail({
          to: order.customer_email,
          storeName: tenantResult.rows[0]?.name || "POS Store",
          order,
          items: itemsResult.rows.map(i => ({
            product_name: i.product_name,
            product_price: parseFloat(i.product_price),
            quantity: i.quantity,
            subtotal: parseFloat(i.subtotal),
          })),
        }).catch(err => console.error("IPN email error:", err.message));
      }
    } catch (e) {
      console.error("IPN processing error:", e.message);
    }
  }

  res.status(200).json({ RspCode: "00", Message: "Success" });
});

module.exports = router;
