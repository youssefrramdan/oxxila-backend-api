// src/config/db.js
import mongoose from 'mongoose';
import logger from './logger.js';
import dotenv from 'dotenv';
dotenv.config();

const databaseConnection = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    logger.info(`Database connected: ${conn.connection.host}`);
  } catch (error) {
    logger.error(`Database connection failed: ${error.message}`);
    process.exit(1);
  }
};

export default databaseConnection;
