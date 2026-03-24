#!/bin/bash

# Safe Deployment Script
# Always test build before pushing to Vercel

set -e

echo "🚀 Safe Deployment Pipeline"
echo "=========================="

# 1. Test build
echo ""
echo "📦 Step 1: Testing build..."
npm run build

if [ $? -ne 0 ]; then
  echo ""
  echo "❌ BUILD FAILED!"
  echo "Fix errors above before deploying."
  exit 1
fi

echo "✅ Build passed!"

# 2. Commit
echo ""
echo "📝 Step 2: Commit changes"
read -p "Commit message: " commit_msg

git add -A
git commit -m "$commit_msg"

# 3. Push
echo ""
echo "🚢 Step 3: Deploying to Vercel..."
git push origin main

echo ""
echo "✅ Deployed! Check https://vercel.com/agis-eng/atlas-dashboard-v2"
echo ""
echo "🔗 Live: https://atlas-dashboard-v2-ten.vercel.app"
