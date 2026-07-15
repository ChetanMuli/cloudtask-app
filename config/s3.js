const AWS = require('aws-sdk');
require('dotenv').config();

// When running on EC2 with an IAM Role attached, aws-sdk automatically
// retrieves temporary credentials from the instance metadata service.
// No hardcoded keys are needed. AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
// in .env are only used as a local-dev fallback.
AWS.config.update({ region: process.env.AWS_REGION || 'ap-south-1' });

const s3 = new AWS.S3();

const BUCKET_NAME = process.env.S3_BUCKET_NAME;

module.exports = { s3, BUCKET_NAME };
