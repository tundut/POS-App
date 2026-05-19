const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

/**
 * Uploads a buffer to AWS S3 and returns the public URL.
 * 
 * @param {Buffer} buffer - The buffer to upload
 * @param {string} fileName - The target filename in S3 (can include folders, e.g., 'receipts/order-123.pdf')
 * @param {string} mimeType - The content type (e.g., 'application/pdf')
 * @returns {Promise<string>} - The URL of the uploaded object
 */
async function uploadBufferToS3(buffer, fileName, mimeType = 'application/pdf') {
  const bucketName = process.env.AWS_S3_BUCKET;
  
  if (!bucketName) {
    throw new Error('AWS_S3_BUCKET is not defined in environment variables');
  }

  const params = {
    Bucket: bucketName,
    Key: fileName,
    Body: buffer,
    ContentType: mimeType,
    // Note: To make the file publicly accessible, the bucket must allow public read access
    // or you can generate a presigned URL. Here we return the standard S3 URL.
  };

  await s3Client.send(new PutObjectCommand(params));

  // Construct and return the S3 URL
  return `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
}

module.exports = {
  uploadBufferToS3
};
