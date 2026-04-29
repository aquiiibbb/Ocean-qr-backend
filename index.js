const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect("mongodb+srv://nitinshaukia_db_user:MKQwGJeaTbyUO5EO@cluster0.uxmmhrg.mongodb.net/feedbackDB?retryWrites=true&w=majority", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB error:", err));

// Updated Schema with user details   mongodb+srv://nitinshaukia_db_user:MKQwGJeaTbyUO5EO@cluster0.uxmmhrg.mongodb.net/
const FeedbackSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  rating: { type: Number, required: true },
  message: { type: String, required: true },
  date: { type: Date, default: Date.now }
});

const Feedback = mongoose.model("Feedback", FeedbackSchema);

// POST - Save Feedback with user details
app.post("/feedback", async (req, res) => {
  try {
    console.log("📥 Received feedback data:", JSON.stringify(req.body, null, 2));

    const { name, email, phone, rating, message } = req.body;

    // Validation
    if (!name || !email || !phone || !rating) {
      console.log("❌ Validation failed - missing fields");
      console.log("Received:", { name, email, phone, rating });
      return res.status(400).json({
        success: false,
        error: "All fields are required",
        received: { name, email, phone, rating }
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

    // Create feedback entry with explicit field mapping
    const feedbackData = {
      name: String(name).trim(),
      email: String(email).trim(),
      phone: String(phone).trim(),
      rating: Number(rating),
      message: message ? String(message).trim() : "No message provided"
    };

    console.log("💾 Saving to database:", JSON.stringify(feedbackData, null, 2));

    const feedback = await Feedback.create(feedbackData);

    console.log("✅ Feedback saved successfully:", {
      id: feedback._id,
      name: feedback.name,
      email: feedback.email,
      phone: feedback.phone,
      rating: feedback.rating,
      message: feedback.message
    });

    res.json({
      success: true,
      message: "Feedback saved successfully",
      id: feedback._id,
      data: feedback
    });

  } catch (err) {
    console.error("❌ Error saving feedback:", err);
    res.status(500).json({
      success: false,
      error: "Server error: " + err.message
    });
  }
});

// GET - Get All Feedback with user details
app.get("/feedback", async (req, res) => {
  try {
    const data = await Feedback.find().sort({ date: -1 });

    console.log(`📊 Retrieved ${data.length} feedback entries`);

    // Log first entry for debugging
    if (data.length > 0) {
      console.log("Sample entry:", JSON.stringify(data[0], null, 2));
    }

    res.json({
      success: true,
      count: data.length,
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
    const { id } = req.params;
    console.log("🗑️ Deleting feedback with ID:", id);

    const deleted = await Feedback.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: "Feedback not found"
      });
    }

    console.log("✅ Feedback deleted successfully");
    res.json({
      success: true,
      message: "Feedback deleted successfully"
    });
  } catch (err) {
    console.error("❌ Delete error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/feedback`);
});
