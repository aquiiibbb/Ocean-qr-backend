// Fix for path resolution issues
process.chdir(__dirname);

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// CORS configuration
const corsOptions = {
  origin: [
    'https://ocean-qr-dashboard.vercel.app',
    'https://oceanparradisefeedback.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://localhost:5174'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://nitinshaukia_db_user:MKQwGJeaTbyUO5EO@cluster0.uxmmhrg.mongodb.net/feedbackDB?retryWrites=true&w=majority";

console.log("🔗 Connecting to MongoDB...");
console.log("📍 URI (masked):", MONGODB_URI.replace(/\/\/.*@/, '//***:***@'));

// Simple connection without complex retry logic
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log("✅ MongoDB connected successfully");
})
.catch((err) => {
  console.error("❌ MongoDB connection failed:", err.message);
});

// Connection event handlers
mongoose.connection.on('connected', () => {
  console.log('✅ Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ Mongoose disconnected');
});

// Schema
const FeedbackSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name too long']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    required: [true, 'Phone is required'],
    trim: true
  },
  rating: {
    type: Number,
    required: [true, 'Rating is required'],
    min: [1, 'Rating must be at least 1'],
    max: [5, 'Rating cannot exceed 5']
  },
  message: {
    type: String,
    trim: true,
    default: "No message provided"
  },
  date: {
    type: Date,
    default: Date.now
  }
});

const Feedback = mongoose.model("Feedback", FeedbackSchema);

// Root endpoint
app.get("/", (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = {
    0: "disconnected",
    1: "connected", 
    2: "connecting",
    3: "disconnecting"
  };

  res.json({
    success: true,
    message: "Ocean Paradise Feedback API",
    version: "1.0.0",
    status: "running",
    database: dbStatus[dbState] || "unknown",
    dbState: dbState
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = {
    0: "disconnected",
    1: "connected", 
    2: "connecting",
    3: "disconnecting"
  };

  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    database: dbStatus[dbState] || "unknown",
    dbState: dbState,
    mongooseVersion: mongoose.version
  });
});

// POST - Save Feedback
app.post("/feedback", async (req, res) => {
  try {
    console.log("📥 Received feedback data:", JSON.stringify(req.body, null, 2));
    console.log("🔍 DB State:", mongoose.connection.readyState);

    // Check if database is connected
    if (mongoose.connection.readyState !== 1) {
      console.log("❌ Database not connected. State:", mongoose.connection.readyState);
      return res.status(503).json({
        success: false,
        error: "Database connection unavailable. Please try again in a moment.",
        dbState: mongoose.connection.readyState
      });
    }

    const { name, email, phone, rating, message } = req.body;

    // Basic validation
    if (!name || !email || !phone || !rating) {
      console.log("❌ Validation failed - missing fields");
      return res.status(400).json({
        success: false,
        error: "Name, email, phone, and rating are required",
        received: { name: !!name, email: !!email, phone: !!phone, rating: !!rating }
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log("❌ Invalid email format:", email);
      return res.status(400).json({
        success: false,
        error: "Invalid email format"
      });
    }

    // Rating validation
    const ratingNum = Number(rating);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({
        success: false,
        error: "Rating must be a number between 1 and 5"
      });
    }

    // Create feedback entry
    const feedbackData = {
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      phone: String(phone).trim(),
      rating: ratingNum,
      message: message ? String(message).trim() : "No message provided"
    };

    console.log("💾 Attempting to save to database...");

    const feedback = await Feedback.create(feedbackData);

    console.log("✅ Feedback saved successfully:", feedback._id);

    res.status(201).json({
      success: true,
      message: "Feedback saved successfully",
      id: feedback._id,
      data: {
        name: feedback.name,
        email: feedback.email,
        phone: feedback.phone,
        rating: feedback.rating,
        message: feedback.message,
        date: feedback.date
      }
    });

  } catch (err) {
    console.error("❌ Error saving feedback:", err);

    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: errors
      });
    }

    // Check if it's a connection error
    if (err.message.includes('buffering timed out') || 
        err.message.includes('connection') ||
        err.name === 'MongoNetworkError') {
      return res.status(503).json({
        success: false,
        error: "Database connection issue. Please try again.",
        details: err.message
      });
    }

    res.status(500).json({
      success: false,
      error: "Server error: " + err.message
    });
  }
});

// GET - Get All Feedback
app.get("/feedback", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        error: "Database connection unavailable"
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const data = await Feedback.find()
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Feedback.countDocuments();

    console.log(`📊 Retrieved ${data.length} feedback entries`);

    res.json({
      success: true,
      count: data.length,
      total: total,
      page: page,
      totalPages: Math.ceil(total / limit),
      data: data
    });
  } catch (err) {
    console.error("❌ Error fetching feedback:", err);
    res.status(500).json({
      success: false,
      error: "Server error: " + err.message
    });
  }
});

// DELETE - Delete feedback by ID
app.delete("/feedback/:id", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        error: "Database connection unavailable"
      });
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid feedback ID format"
      });
    }

    const deleted = await Feedback.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: "Feedback not found"
      });
    }

    res.json({
      success: true,
      message: "Feedback deleted successfully",
      deletedId: id
    });
  } catch (err) {
    console.error("❌ Delete error:", err);
    res.status(500).json({
      success: false,
      error: "Server error: " + err.message
    });
  }
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
    path: req.originalUrl
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("💥 Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: "Internal server error"
  });
});

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;