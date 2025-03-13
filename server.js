require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 5000;

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5176";

// ✅ Enable CORS for frontend
const corsOptions = {
  origin: [FRONTEND_URL, "https://round-robin-frontend.vercel.app"],
  credentials: true,
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// ✅ Rate limiter (prevents abuse)
const limiter = rateLimit({ windowMs: 60 * 1000, max: 10 });
app.use(limiter);

const COOLDOWN_TIME = 60 * 60 * 1000; // 1 hour

// ✅ Hash IP for privacy
function hashIP(ip) {
  return crypto.createHash("sha256").update(ip).digest("hex");
}

// ✅ Initialize Counter
async function initializeCounter() {
  try {
    const counter = await prisma.counter.findFirst();
    if (!counter) {
      await prisma.counter.create({ data: { value: 0 } });
    }
  } catch (error) {
    console.error("❌ Error initializing counter:", error);
  }
}
initializeCounter();

// ✅ Claim Coupon API
app.post("/api/claim", async (req, res) => {
  try {
    console.log("Received POST /api/claim request");

    const userIp = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    const hashedIp = hashIP(userIp);
    const userCookie = req.cookies.claimed;

    // ✅ Check cooldown
    const recentClaim = await prisma.claimHistory.findFirst({
      where: { OR: [{ claimedBy: hashedIp }, { claimedBy: userCookie }] },
      orderBy: { claimedAt: "desc" },
    });

    if (recentClaim && new Date() - recentClaim.claimedAt < COOLDOWN_TIME) {
      return res.status(429).json({ message: "⏳ Please wait before claiming another coupon." });
    }

    // ✅ Check if Coupons Exist
    const totalCoupons = await prisma.coupon.count();
    if (totalCoupons === 0) {
      console.log("❌ No coupons available.");
      return res.status(404).json({ message: "🚫 No coupons available." });
    }

    // ✅ Get the next available coupon using Round-Robin
    let counter = await prisma.counter.findFirst();
    if (!counter) {
      counter = await prisma.counter.create({ data: { value: 0 } });
    }

    let currentIndex = counter.value;

    const coupon = await prisma.coupon.findFirst({
      orderBy: { id: "asc" },
      skip: currentIndex % totalCoupons, // Round-Robin selection
    });

    if (!coupon) {
      console.log("❌ No available coupon found.");
      return res.status(404).json({ message: "🚫 No available coupons." });
    }

    // ✅ Store claim in history
    await prisma.claimHistory.create({
      data: { couponId: coupon.id, claimedBy: hashedIp, claimedAt: new Date() },
    });

    // ✅ Update Counter (Increment in Round-Robin fashion)
    await prisma.counter.update({
      where: { id: counter.id },
      data: { value: (currentIndex + 1) % totalCoupons },
    });

    res.cookie("claimed", hashedIp, {
      maxAge: COOLDOWN_TIME,
      httpOnly: true,
      secure: true, // ✅ Required for HTTPS
      sameSite: "none", // ✅ Required for cross-origin cookies
    });

    res.json({
      coupon: coupon.code,
      message: "🎉 Coupon claimed successfully!",
      timeRemaining: COOLDOWN_TIME / 60000,
    });

  } catch (error) {
    console.error("❌ Error claiming coupon:", error);
    res.status(500).json({ message: "⚠️ Internal Server Error" });
  }
});

// ✅ Check Cooldown API
app.get("/api/cooldown", async (req, res) => {
  console.log("Received GET /api/cooldown request");

  const userIp = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
  const hashedIp = hashIP(userIp);

  const recentClaim = await prisma.claimHistory.findFirst({
    where: { claimedBy: hashedIp },
    orderBy: { claimedAt: "desc" },
  });

  if (recentClaim) {
    const timeLeft = COOLDOWN_TIME - (new Date() - recentClaim.claimedAt);
    return res.json({ timeRemaining: timeLeft > 0 ? Math.ceil(timeLeft / 60000) : null });
  }

  res.json({ timeRemaining: null });
});

// ✅ Start Server
app.listen(PORT, () => console.log(`✅ Server running on port: ${PORT}`));
