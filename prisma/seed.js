const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...\n');

  try {
    // Check if admin already exists
    const existingAdmin = await prisma.user.findUnique({
      where: { email: 'admin@gmail.com' }
    });

    if (existingAdmin) {
      console.log('✅ Admin user already exists');
      console.log('   Email:', existingAdmin.email);
      console.log('   Role:', existingAdmin.role);
      console.log('   ID:', existingAdmin.id);
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash('admin', 10);

    // Create admin user
    const admin = await prisma.user.create({
      data: {
        name: 'Admin User',
        email: 'admin@gmail.com',
        password: hashedPassword,
        role: 'ADMIN',
        phone: '+91-0000000000'
      }
    });

    console.log('✅ Admin user created successfully!');
    console.log('   Email:', admin.email);
    console.log('   Password: admin');
    console.log('   Role:', admin.role);
    console.log('   ID:', admin.id);
    console.log('\n⚠️  Please change the default password after first login!\n');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
