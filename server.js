const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const cloudinary = require("cloudinary").v2;
const dns = require("dns");
const path = require("path");

dns.setDefaultResultOrder("ipv4first");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 1e8
});

// إعداد الوسطاء (Middlewares)
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// تقديم الملفات الثابتة (مثل index.html و admin.html)
app.use(express.static(path.join(__dirname, "public")));

// إعداد Cloudinary
cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'yerbm3xu', 
  api_key: process.env.CLOUDINARY_API_KEY || '556822354784538', 
  api_secret: process.env.CLOUDINARY_API_SECRET || 'D_dtbz6U-DBOu3z6G3ijoFxXxZU' 
});

// الاتصال بقاعدة البيانات MongoDB
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://nnidhalnid_db_user:nidhal2014@cluster0.evcrkl0.mongodb.net/onlineni_db?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected Successfully"))
  .catch((err) => console.log("DB Connection Error:", err));

// المخططات (Schemas)
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  avatar: { type: String, default: "" }
});
const User = mongoose.model("User", userSchema);

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

// ==================== مسارات المستخدمين (Public API) ====================

// 1. تسجيل حساب
app.post("/api/register", async (req, res) => {
  try {
    const { username, password, avatar } = req.body;
    if (!username || !password) return res.status(400).json({ error: "يرجى ملء جميع الحقول" });

    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ error: "اسم المستخدم موجود بالفعل" });

    let avatarUrl = "";
    if (avatar && avatar.startsWith("data:image")) {
      const uploadRes = await cloudinary.uploader.upload(avatar, { folder: "chat_avatars" });
      avatarUrl = uploadRes.secure_url;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword, avatar: avatarUrl });
    await newUser.save();

    res.json({ success: true, message: "تم إنشاء الحساب بنجاح" });
  } catch (error) {
    res.status(500).json({ error: "حدث خطأ أثناء التسجيل" });
  }
});

// 2. تسجيل الدخول
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: "اسم المستخدم غير موجود" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "كلمة السر غير صحيحة" });

    res.json({ success: true, username: user.username, avatar: user.avatar });
  } catch (error) {
    res.status(500).json({ error: "حدث خطأ أثناء تسجيل الدخول" });
  }
});

// 3. جلب جميع الحسابات المسجلة
app.get("/api/users", async (req, res) => {
  try {
    const { current } = req.query;
    const query = current ? { username: { $ne: current } } : {};
    const users = await User.find(query).select("username avatar");
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "خطأ في جلب كل المستخدمين" });
  }
});

// 4. البحث عن مستخدمين
app.get("/api/users/search", async (req, res) => {
  try {
    const { q, current } = req.query;
    const users = await User.find({
      username: { $regex: q || "", $options: "i", $ne: current }
    }).select("username avatar");
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "خطأ في البحث" });
  }
});

// 5. جلب قائمة المحادثات
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

// 6. جلب الرسائل بين طرفين
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

// ==================== مسارات لوحة التحكم (ADMIN API) ====================

// 1. جلب كل المستخدمين مع كافة التفاصيل للأدمن
app.get("/api/admin/users", async (req, res) => {
  try {
    const users = await User.find({});
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "خطأ في جلب المستخدمين" });
  }
});

// 2. تعديل بيانات مستخدم (اسم المستخدم / كلمة المرور / الصورة)
app.put("/api/admin/users/:id", async (req, res) => {
  try {
    const { username, password, avatar } = req.body;
    const updateData = {};
    if (username) updateData.username = username;
    if (avatar) updateData.avatar = avatar;
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    await User.findByIdAndUpdate(req.params.id, updateData);
    res.json({ success: true, message: "تم تحديث بيانات المستخدم بنجاح" });
  } catch (err) {
    res.status(500).json({ error: "خطأ في تعديل المستخدم" });
  }
});

// 3. حذف حساب مستخدم
app.delete("/api/admin/users/:id", async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "تم حذف الحساب" });
  } catch (err) {
    res.status(500).json({ error: "خطأ في حذف الحساب" });
  }
});

// 4. جلب كل المحادثات والرسائل في النظام
app.get("/api/admin/messages", async (req, res) => {
  try {
    const messages = await Message.find({}).sort({ timestamp: -1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: "خطأ في جلب الرسائل" });
  }
});

// 5. حذف رسالة معينة
app.delete("/api/admin/messages/:id", async (req, res) => {
  try {
    await Message.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "تم حذف الرسالة" });
  } catch (err) {
    res.status(500).json({ error: "خطأ في حذف الرسالة" });
  }
});

// مسار رئيسي لتمرير الواجهة عند طلب الـ Root
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// إدارة اتصالات Socket.io
io.on("connection", (socket) => {

  socket.on("join_room", (username) => {
    socket.join(username);
  });

  socket.on("private_message", async (data) => {
    try {
      let uploadedFileUrl = null;
      if (data.fileData) {
        let resourceType = "auto";
        if (data.type === "audio") resourceType = "video";

        const uploadResponse = await cloudinary.uploader.upload(data.fileData, {
          resource_type: resourceType,
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

  // إدارة أحداث المكالمات الصوتية والمرئية
  socket.on("make_call", (data) => {
    io.to(data.recipient).emit("incoming_call", {
      caller: data.caller,
      isVideo: data.isVideo,
      peerId: data.peerId
    });
  });

  socket.on("accept_call", (data) => {
    io.to(data.caller).emit("call_accepted_signal", { peerId: data.peerId });
  });

  socket.on("reject_call", (data) => {
    io.to(data.caller).emit("call_rejected_signal");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`السيرفر يعمل على المنفذ ${PORT}`));
