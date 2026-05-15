# POS System

A Point of Sale system built with Node.js, Express, PostgreSQL, and VNPay integration.

## Features

- User registration and login
- Product management
- Shopping cart
- Order management
- VNPay payment gateway integration (sandbox)

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Set up PostgreSQL locally:
   - Install PostgreSQL
   - Create a database named `pos`
   - Update `DATABASE_URL_LOCAL` in `.env` if needed

3. Initialize the database schema:

   ```bash
   psql -d pos -f db/init.sql
   ```

4. Configure VNPay:
   - Register for VNPay sandbox at https://sandbox.vnpayment.vn/
   - Get your TMN Code and Hash Secret
   - Update `VNP_TMN_CODE` and `VNP_HASH_SECRET` in `.env`
   - For localhost testing, use ngrok to expose port 5000 publicly and set `VNP_RETURN_URL` to the ngrok URL

5. Configure email sending:
   - Add SMTP settings to `.env`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
   - The system will use these settings to send invoice emails to customers without storing their email address in the database

6. Run the server:

   ```bash
   npm start
   ```

7. Open [http://localhost:5000](http://localhost:5000) in your browser.

## Deployment to AWS

- Database: Use Amazon RDS for PostgreSQL or another managed Postgres service
- Application: Deploy to an EC2 instance or Elastic Beanstalk
- Update `.env` with the production PostgreSQL connection string
