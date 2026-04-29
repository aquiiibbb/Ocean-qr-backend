// Fix for path resolution issues
process.chdir(__dirname);

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// CORS configuration for your domains
const corsOptions = {
  origin: [
    'https://ocean-qr-dashboard.vercel.app',
    'https://oceanparradisefeedback.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173', // Vite dev server
    'http://localhost:5174'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// MongoDB Connection with improved timeout settings
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://nitinshaukia_db_user:MKQwGJeaTbyUO5EO@cluster0.uxmmhrg.mongodb.net/feedbackDB?retryWrites=true&w=majority";

const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 30000, // 30 seconds
      socketTimeoutMS: 45000, // 45 seconds
      bufferMaxEntries: 0,
      maxPoolSize: 10, // Maintain up to 10 socket connections
      minPoolSize: 5, // Maintain a minimum of 5 socket connections
    });
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    // Retry after 5 seconds
    setTimeout(connectDB, 5000);
  }
};

connectDB();

// Schema with better validation and indexing
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

// Add indexes for better performance
FeedbackSchema.index({ date: -1 }); // Index for sorting by date
FeedbackSchema.index({ rating: 1 }); // Index for filtering by rating
FeedbackSchema.index({ email: 1 }); // Index for email lookups

const Feedback = mongoose.model("Feedback", FeedbackSchema);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Ocean Paradise Feedback API",
    version: "1.0.0",
    status: "running",
    endpoints: {
      health: "GET /health",
      feedback: {
        get: "GET /feedback",
        post: "POST /feedback",
        delete: "DELETE /feedback/:id"
      }
    }
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});

// POST - Save Feedback
app.post("/feedback", async (req, res) => {
  try {
    console.log("📥 Received feedback data:", JSON.stringify(req.body, null, 2));

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

    console.log("💾 Saving to database:", JSON.stringify(feedbackData, null, 2));

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

    res.status(500).json({
      success: false,
      error: "Server error: " + err.message
    });
  }
});

// GET - Get All Feedback (Optimized)
app.get("/feedback", async (req, res) => {
  try {
    // Pagination support with reasonable limits
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100); // Cap at 100
    const skip = (page - 1) * limit;

    // Optional filtering by rating
    const ratingFilter = req.query.rating ? { rating: parseInt(req.query.rating) } : {};

    // Use lean() for faster queries and add timeout
    const data = await Feedback.find(ratingFilter)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .lean() // Returns plain objects, faster
      .maxTimeMS(20000); // 20 second timeout

    const total = await Feedback.countDocuments(ratingFilter);

    console.log(`📊 Retrieved ${data.length} feedback entries (page ${page})`);

    // Log first entry for debugging (without sensitive data)
    if (data.length > 0) {
      console.log("Sample entry:", {
        id: data[0]._id,
        name: data[0].name,
        rating: data[0].rating,
        date: data[0].date
      });
    }

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

    if (err.name === 'MongooseError' && err.message.includes('timeout')) {
      return res.status(408).json({
        success: false,
        error: "Database timeout - please try again or reduce the page size"
      });
    }

    res.status(500).json({
      success: false,
      error: "Server error: " + err.message
    });
  }
});

// DELETE - Delete feedback by ID
app.delete("/feedback/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid feedback ID format"
      });
    }

    console.log("🗑️ Deleting feedback with ID:", id);

    const deleted = await Feedback.findByIdAndDelete(id).maxTimeMS(10000); // 10 second timeout

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: "Feedback not found"
      });
    }

    console.log("✅ Feedback deleted successfully");
    res.json({
      success: true,
      message: "Feedback deleted successfully",
      deletedId: id
    });
  } catch (err) {
    console.error("❌ Delete error:", err);

    if (err.name === 'MongooseError' && err.message.includes('timeout')) {
      return res.status(408).json({
        success: false,
        error: "Delete operation timeout - please try again"
      });
    }

    res.status(500).json({
      success: false,
      error: "Server error: " + err.message
    });
  }
});

// 404 handler for unknown routes
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
    path: req.originalUrl,
    availableEndpoints: ["/", "/health", "/feedback"]
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

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

const PORT = process.env.PORT || 5000;

// Only listen in development (Vercel handles this in production)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}/feedback`);
  });
}

// Export for Vercel
module.exports = app;