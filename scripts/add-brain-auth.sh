#!/bin/bash

# Add auth to all Brain API endpoints

for file in app/api/brain/[id]/*.ts app/api/brain/[id]/*/route.ts; do
  if [ ! -f "$file" ]; then continue; fi
  
  # Skip if already has auth
  if grep -q "getSessionUserFromRequest" "$file"; then
    echo "Skipping $file (already has auth)"
    continue
  fi
  
  echo "Adding auth to: $file"
  
  # Replace readBrains() calls with readBrains(user.profile)
  sed -i '' 's/await readBrains()/await readBrains(user.profile)/g' "$file"
  sed -i '' 's/const data = readBrains()/const data = await readBrains(user.profile)/g' "$file"
  
  # Replace writeBrains(data) calls with writeBrains(user.profile, data)
  sed -i '' 's/await writeBrains(data)/await writeBrains(user.profile, data)/g' "$file"
  sed -i '' 's/writeBrains(data)/await writeBrains(user.profile, data)/g' "$file"
  
done

echo "Done!"
