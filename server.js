const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const cloudinary = require("cloudinary").v2;
const dns = require("dns");

dns.setDefaultResultOrder("ipv4first");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 1e8
});

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

cloudinary.config({ 
  cloud_name: 'yerbm3xu', 
  api_key: '556822354784538', 
  api_secret: 'D_dtbz6U-DBOu3z6G3ijoFxXxZU' 
});

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://nnidhalnid_db_user:nidhal2014@cluster0.evcrkl0.mongodb.net/onlineni_db?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected Successfully"))
  .catch((err) => console.log("DB Connection Error:", err));

// Schema المستخدمين مع خاصية صورة البروفايل
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  avatar: { type: String, default: "" }
});
const User = mongoose.model("User", userSchema);

// Schema الرسائل
const messageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  recipient: { type: String, required: true },
  text: { type: String, default: "" },
  fileUrl: { type: String, default: null },
  fileName: { type: String, default: "" },
  type: { type: String, default: "text" },
  timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model("Message", messageSchema);

// إنشاء حساب جديد
app.post("/api/register", async (req, res) => {
  try {
    const { username, password, avatar } = req.body;
    if (!username || !password) return res.status(400).json({ error: "يرجى ملء جميع الحقول" });

    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ error: "اسم المستخدم موجود بالفعل" });

    let avatarUrl = "";
    if (avatar) {
      const uploadRes = await cloudinary.uploader.upload(avatar, { folder: "chat_avatars" });
      avatarUrl = uploadRes.secure_url;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword, avatar: avatarUrl });
    await newUser.save();

    res.json({ success: true, message: "تم إنشاء الحساب بنجاح" });
  } catch (error) {
    res.status(500).json({ error: "حدث خطأ في السيرفر أثناء التسجيل" });
  }
});

// تسجيل الدخول
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: "اسم المستخدم غير موجود" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "كلمة السر غير صحيحة" });

    res.json({ success: true, username: user.username, avatar: user.avatar });
  } catch (error) {
    res.status(500).json({ error: "حدث خطأ في السيرفر أثناء تسجيل الدخول" });
  }
});

// البحث عن المستخدمين
app.get("/api/users/search", async (req, res) => {
  try {
    const { q, current } = req.query;
    const users = await User.find({
      username: { $regex: q, $options: "i" },
      username: { $ne: current }
    }).select("username avatar");
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "خطأ في البحث" });
  }
});

// جلب المحادثات السابقة أوتوماتيكيًا
app.get("/api/conversations/:username", async (req, res) => {
  try {
    const { username } = req.params;
    const messages = await Message.find({
      $or: [{ sender: username }, { recipient: username }]
    }).sort({ timestamp: -1 });

    const contactsSet = new Set();
    messages.forEach(m => {
      if (m.sender !== username) contactsSet.add(m.sender);
      if (m.recipient !== username) contactsSet.add(m.recipient);
    });

    const contacts = await User.find({ username: { $in: Array.from(contactsSet) } }).select("username avatar");
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: "خطأ في جلب المحادثات" });
  }
});

// جلب سجل الرسائل بين شخصين
app.get("/api/messages/:user1/:user2", async (req, res) => {
  try {
    const { user1, user2 } = req.params;
    const messages = await Message.find({
      $or: [
        { sender: user1, recipient: user2 },
        { sender: user2, recipient: user1 }
      ]
    }).sort({ timestamp: 1 });
    
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: "فشل في جلب الرسائل" });
  }
});

io.on("connection", (socket) => {
  socket.on("join_room", (username) => {
    socket.join(username);
  });

  socket.on("private_message", async (data) => {
    try {
      let uploadedFileUrl = null;
      if (data.fileData) {
        const uploadResponse = await cloudinary.uploader.upload(data.fileData, {
          resource_type: "auto",
          folder: "chat_app_media"
        });
        uploadedFileUrl = uploadResponse.secure_url;
      }

      const newMessage = new Message({
        sender: data.sender,
        recipient: data.recipient,
        text: data.text || "",
        fileUrl: uploadedFileUrl,
        fileName: data.fileName || "",
        type: data.type || "text",
        timestamp: new Date()
      });

      await newMessage.save();

      io.to(data.recipient).emit("receive_message", newMessage);
      io.to(data.sender).emit("receive_message", newMessage);
    } catch (error) {
      console.error("خطأ في إرسال الرسالة:", error);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`السيرفر يعمل بنجاح على المنفذ ${PORT}`));
