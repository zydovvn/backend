import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  ensureDMConversation,
  listConversations,
  listMessages,
  sendMessage,
  markRead
} from "../controllers/messageController.js";

const router = express.Router();

// Multer cấu hình riêng cho ảnh chat (lưu chung /uploads)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9) + ext;
    cb(null, unique);
  },
});
const upload = multer({ storage });

router.use(authMiddleware);

// (upload ảnh chat) -> trả { filename, url }
router.post("/upload", upload.single("image"), (req, res) => {
  const filename = req.file?.filename || null;
  if (!filename) return res.status(400).json({ error: "No file" });
  const url = `${process.env.BASE_URL || "http://localhost:5000"}/uploads/${filename}`;
  res.json({ filename, url });
});

// ensure/generate conversation 1-1
router.post("/ensure", ensureDMConversation);

// list conversations
router.get("/conversations", listConversations);

// list messages by conversation
router.get("/conversations/:id/messages", listMessages);

// send message (text/image_url filename)
router.post("/conversations/:id/messages", sendMessage);

// mark read to last_message_id
router.post("/conversations/:id/read", markRead);

export default router;
