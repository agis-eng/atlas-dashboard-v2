#!/usr/bin/env node

const { createUser } = require('../lib/auth.ts');

async function main() {
  try {
    const user = await createUser({
      email: 'anton@chelimitless.com',
      name: 'Anton',
      password: 'Anton2026!Secure',
      profile: 'anton'
    });
    
    console.log('✅ Anton user created successfully!');
    console.log('Email:', user.email);
    console.log('Password: Anton2026!Secure');
    console.log('\nAnton can now log in at the dashboard.');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
