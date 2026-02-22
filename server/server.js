const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const mongoose = require('mongoose');
const connectDB = require('./config/db');

dotenv.config();
console.log("Mongo URI:", process.env.MONGO_URI);

const app = express();

// Middleware
app.use(express.json());
// app.use(cors({
//     origin: [
//         "http://localhost:5173",
//         "http://localhost:5174",
//         "https://lumina-mental-health-9pbez5l7f-kashishjhala1905s-projects.vercel.app/",
//         process.env.FRONTEND_URL
//     ].filter(Boolean),
//     methods: ["GET", "POST", "PUT", "DELETE"],
//     credentials: true
// }));

// app.use(cors({
//   origin: [
//     "http://localhost:5173",
//     "https://lumina-mental-health-app.vercel.app/"
//   ],
//   methods: ["GET", "POST", "PUT", "DELETE"],
//   credentials: true
// }));

app.use(cors({
  origin: true,
  credentials: true
}));

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/appointment', require('./routes/appointmentRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/chatbot', require('./routes/chatbotRoutes'));

// Root route
app.get('/', (req, res) => {
    res.send('API is running...');
});

const PORT = process.env.PORT || 5000;

// Connect to DB
connectDB();

// Only listen if running directly (dev/local), not when imported by Vercel
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;
