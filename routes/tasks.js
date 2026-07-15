const express = require('express');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/db');
const { s3, BUCKET_NAME } = require('../config/s3');

const router = express.Router();

// Multer + S3 storage: uploads go directly to the S3 bucket.
// Because the EC2 instance has an IAM role attached, no credentials
// are needed here — multer-s3 uses the same s3 client which relies
// on the instance role.
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    metadata: (req, file, cb) => cb(null, { fieldName: file.fieldname }),
    key: (req, file, cb) => {
      const uniqueName = `attachments/${uuidv4()}-${file.originalname}`;
      cb(null, uniqueName);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
});

// GET /api/tasks - list all tasks
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// GET /api/tasks/:id - get single task
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// POST /api/tasks - create task, optional file attachment
router.post('/', upload.single('attachment'), async (req, res) => {
  try {
    const { title, description, status } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const attachmentUrl = req.file ? req.file.location : null;
    const attachmentKey = req.file ? req.file.key : null;

    const [result] = await pool.query(
      'INSERT INTO tasks (title, description, status, attachment_url, attachment_key) VALUES (?, ?, ?, ?, ?)',
      [title, description || null, status || 'pending', attachmentUrl, attachmentKey]
    );

    const [rows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// PUT /api/tasks/:id - update task, optionally replace attachment
router.put('/:id', upload.single('attachment'), async (req, res) => {
  try {
    const { title, description, status } = req.body;
    const [existingRows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (existingRows.length === 0) return res.status(404).json({ error: 'Task not found' });

    const existing = existingRows[0];
    let attachmentUrl = existing.attachment_url;
    let attachmentKey = existing.attachment_key;

    if (req.file) {
      // Delete old attachment from S3 if present
      if (existing.attachment_key) {
        try {
          await s3.deleteObject({ Bucket: BUCKET_NAME, Key: existing.attachment_key }).promise();
        } catch (e) {
          console.warn('Could not delete old S3 object:', e.message);
        }
      }
      attachmentUrl = req.file.location;
      attachmentKey = req.file.key;
    }

    await pool.query(
      'UPDATE tasks SET title = ?, description = ?, status = ?, attachment_url = ?, attachment_key = ? WHERE id = ?',
      [
        title || existing.title,
        description !== undefined ? description : existing.description,
        status || existing.status,
        attachmentUrl,
        attachmentKey,
        req.params.id
      ]
    );

    const [rows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// DELETE /api/tasks/:id - delete task and its S3 attachment
router.delete('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Task not found' });

    const task = rows[0];
    if (task.attachment_key) {
      try {
        await s3.deleteObject({ Bucket: BUCKET_NAME, Key: task.attachment_key }).promise();
      } catch (e) {
        console.warn('Could not delete S3 object:', e.message);
      }
    }

    await pool.query('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    res.json({ message: 'Task deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

module.exports = router;
