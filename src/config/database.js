const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Test database connection
const connectDatabase = async () => {
  try {
    await prisma.$connect();
    console.log('✓ PostgreSQL Database connected successfully');
  } catch (error) {
    console.error('✗ Database connection failed:', error.message);
    process.exit(1);
  }
};

// Graceful shutdown
const disconnectDatabase = async () => {
  await prisma.$disconnect();
  console.log('✓ Database disconnected');
};

module.exports = { prisma, connectDatabase, disconnectDatabase };
