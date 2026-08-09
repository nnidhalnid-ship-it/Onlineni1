const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50mb" })); // زيادة الحجم لدعم الصوتيات والملفات

// رابط MongoDB الخاص بك
const MONGO_URI = "mongodb+srv://nnidhalnid_db_user:fUgHFe8BfIemZUMy@cluster0.evcrkl0.mongodb.net/onlineni_db";

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected Successfully"))
  .catch(err => console.log("DB Connection Error:", err));

// نموذج المستخدمين
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});
const User = mongoose.model("User", UserSchema);

// نموذج حفظ الرسائل
const MessageSchema = new mongoose.Schema({
  sender: String,
  recipient: String,
  text: String,
  fileData: String,
  fileName: String,
  type: String, // 'text', 'file', 'audio'
  timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model("Message", MessageSchema);

// إنشاء حساب
app.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "يرجى إدخال جميع البيانات" });

    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ error: "اسم المستخدم مستعمل بالفعل" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();

    res.json({ success: true, message: "تم إنشاء الحساب بنجاح" });
  } catch (err) {
    res.status(500).json({ error: "خطأ في السيرفر: " + err.message });
  }
});

// تسجيل الدخول
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: "اسم المستخدم غير موجود" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "كلمة المرور غير صحيحة" });

    res.json({ success: true, username: user.username });
  } catch (err) {
    res.status(500).json({ error: "خطأ في السيرفر: " + err.message });
  }
});

// جلب جميع المستخدمين المسجلين في التطبيق
app.get("/users", async (req, res) => {
  try {
    const users = await User.find({}, "username");
    res.json(users.map(u => u.username));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// جلب سجل الرسائل السابق بين مستخدمين
app.get("/messages/:user1/:user2", async (req, res) => {
  try {
    const { user1, user2 } = req.params;
    const messages = await Message.find({
      $or: [
        { sender: user1, recipient: user2 },
        { sender: user2, recipient: user1 }
      ]
    }).sort({ timestamp: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 1e8 });

const activeUsers = {};

io.on("connection", (socket) => {
  socket.on("register_online", (username) => {
    activeUsers[username] = socket.id;
    socket.username = username;
    io.emit("update_online_users", Object.keys(activeUsers));
  });

  socket.on("private_message", async ({ recipient, text, fileData, fileName, type }) => {
    // 1. حفظ الرسالة في قاعدة البيانات
    const msgData = {
      sender: socket.username,
      recipient,
      text,
      fileData,
      fileName,
      type: type || "text",
      timestamp: new Date()
    };
    
    if (recipient !== "AI Assistant") {
      const savedMsg = new Message(msgData);
      await savedMsg.save();
    }

    // 2. إرسال للمستلم إذا كان متصلاً
    const recipientSocketId = activeUsers[recipient];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("receive_private_message", msgData);
    }
  });

  socket.on("disconnect", () => {
    if (socket.username) {
      delete activeUsers[socket.username];
      io.emit("update_online_users", Object.keys(activeUsers));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
