-- CloudTask Manager database schema
-- Run this once against your RDS MySQL instance:
--   mysql -h <rds-endpoint> -u admin -p < sql/schema.sql

CREATE DATABASE IF NOT EXISTS cloudtask
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE cloudtask;

CREATE TABLE IF NOT EXISTS tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status ENUM('pending', 'in_progress', 'completed') NOT NULL DEFAULT 'pending',
  attachment_url VARCHAR(1024) DEFAULT NULL,
  attachment_key VARCHAR(512) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Sample seed data (optional)
INSERT INTO tasks (title, description, status) VALUES
  ('Set up EC2 instance', 'Launch and configure the EC2 instance for hosting the app', 'completed'),
  ('Configure RDS MySQL', 'Create the RDS instance and run schema.sql', 'in_progress'),
  ('Set up S3 bucket', 'Create bucket and attach IAM role permissions', 'pending');
