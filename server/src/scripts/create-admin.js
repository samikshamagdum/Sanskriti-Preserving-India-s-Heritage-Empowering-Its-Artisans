require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });

const readline = require('readline');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');

async function createAdmin() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  
  function question(prompt) {
    return new Promise(resolve => rl.question(prompt, resolve));
  }
  
  try {
    const email = await question('Admin email: ');
    const password = await question('Admin password (min 10 chars): ');
    rl.close();
    
    if (!email || !password) {
      console.error('Email and password required');
      process.exit(1);
    }
    if (password.length < 10) {
      console.error('Password must be at least 10 characters');
      process.exit(1);
    }
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      console.error('JWT_SECRET must be configured and at least 32 chars');
      process.exit(1);
    }
    
    const adminEmail = email.toLowerCase().trim();
    const existing = await db.findOne('users', { email: adminEmail });
    if (existing) {
      console.error('Admin user already exists');
      process.exit(1);
    }
    
    const user = {
      id: (db.uid ? db.uid('u') : u),
      name: 'Admin',
      email: adminEmail,
      password: bcrypt.hashSync(password, 10),
      role: 'admin',
      stateId: 'dl',
      interests: ['dance', 'art-craft'],
      xp: 1000,
      badges: [],
      streak: 0,
      contributions: [],
      createdAt: new Date().toISOString()
    };
    await db.insert('users', user);
    console.log(Admin created: );
    process.exit(0);
  } catch (e) {
    rl.close();
    console.error(e.message);
    process.exit(1);
  }
}

createAdmin();