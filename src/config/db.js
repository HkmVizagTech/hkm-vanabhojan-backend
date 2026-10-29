const mongoose = require('mongoose');
const { env } = require('./env');
const logger = require('../utils/logger');

mongoose.set('strictQuery', true);

async function connectDb() {
  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  logger.info({ db: mongoose.connection.name }, 'MongoDB connected');
}

const disconnectDb = () => mongoose.disconnect();
const isDbReady = () => mongoose.connection.readyState === 1;

module.exports = { connectDb, disconnectDb, isDbReady };
