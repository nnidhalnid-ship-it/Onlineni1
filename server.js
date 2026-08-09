const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

// رابط MongoDB الخاص بك بعد إزالة الزوائد التي تسبب خطأ التمرير
const MONGO_URI = "mongodb+srv://nnidhalnid_db_user:fUgHFe8BfIemZUMy@cluster0.evcrkl0.mongodb.net/onlineni_db";

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected Successfully"))
  .catch(err => console.log("DB Connection Error:", err));

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});
const User = mongoose.model("User", UserSchema);

// مسار إنشاء حساب جديد
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
    console.error("Register Error Details:", err);
    res.status(500).json({ error: "خطأ في السيرفر: " + err.message });
  }
});

// مسار تسجيل الدخول
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: "اسم المستخدم غير موجود" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "كلمة المرور غير صحيحة" });

    res.json({ success: true, username: user.username });
  } catch (err) {
    console.error("Login Error Details:", err);
    res.status(500).json({ error: "خطأ في السيرفر: " + err.message });
  }
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const activeUsers = {};

io.on("connection", (socket) => {
  socket.on("register_online", (username) => {
    activeUsers[username] = socket.id;
    socket.username = username;
    io.emit("update_user_list", Object.keys(activeUsers));
  });

  socket.on("private_message", ({ recipient, text, fileData, fileName, type }) => {
    const recipientSocketId = activeUsers[recipient];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("receive_private_message", {
        sender: socket.username,
        text,
        fileData,
        fileName,
        type
      });
    }
  });

  socket.on("disconnect", () => {
    if (socket.username) {
      delete activeUsers[socket.username];
      io.emit("update_user_list", Object.keys(activeUsers));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
