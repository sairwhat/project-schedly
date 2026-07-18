#!/bin/bash
set -euo pipefail

VERSION_NAME="${1:?Usage: $0 <versionName> <versionCode> <apkUrl>}"
VERSION_CODE="${2:?Usage: $0 <versionName> <versionCode> <apkUrl>}"
APK_URL="${3:-}"

# Update android/app/build.gradle
sed -i "s/versionCode [0-9]*/versionCode $VERSION_CODE/" android/app/build.gradle
sed -i "s/versionName \"[^\"]*\"/versionName \"$VERSION_NAME\"/" android/app/build.gradle

echo "Updated android/app/build.gradle → versionCode=$VERSION_CODE, versionName=$VERSION_NAME"

# Update version.json
cat > version.json << VERSION_EOF
{
  "versionCode": $VERSION_CODE,
  "versionName": "$VERSION_NAME",
  "apkUrl": "$APK_URL",
  "updateMessage": "New version $VERSION_NAME is now available with bug fixes, performance improvements, and new features!"
}
VERSION_EOF

echo "Updated version.json → versionCode=$VERSION_CODE, versionName=$VERSION_NAME"
