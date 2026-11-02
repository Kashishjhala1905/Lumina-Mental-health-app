const mongoose = require('mongoose');
const dns = require('dns');

dns.setServers(['8.8.8.8', '1.1.1.1']);

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      // 15 seconds timeout for DNS resolution / server selection
      serverSelectionTimeoutMS: 15000,
    });
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    console.error('Full error details:', error);
    // Do not exit the process; allow the server to continue (useful for dev)
    // Optionally, you can set a flag to retry or handle gracefully
  }
};

module.exports = connectDB;
