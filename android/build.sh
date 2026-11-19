#!/bin/sh
# Builds Lull-<version>.apk with Ubuntu's Android tools (apt: dalvik-exchange android-sdk-platform-23 aapt apksigner zipalign)
set -e
: "${LULL_KS_PASS:?Set LULL_KS_PASS to your keystore password}"
cd "$(dirname "$0")"
JAR=/usr/lib/android-sdk/platforms/android-23/android.jar
BT=/usr/lib/android-sdk/build-tools/debian
VER=$(sed -n 's/.*android:versionName="\([^"]*\)".*/\1/p' AndroidManifest.xml)
rm -rf build && mkdir -p build/classes build/gen
javac -nowarn -Xlint:-options -source 8 -target 8 -bootclasspath "$JAR" -d build/classes src/com/caffeinenotincluded/lull/*.java
java -jar $BT/lib/dx.jar --dex --min-sdk-version=26 --output=build/classes.dex build/classes
aapt package -f -M AndroidManifest.xml -S res -A assets -I "$JAR" -F build/unsigned.apk --min-sdk-version 26 --target-sdk-version 33 -0 woff2
( cd build && cp classes.dex classes.dex.tmp && mv classes.dex.tmp classes.dex && aapt add unsigned.apk classes.dex >/dev/null )
zipalign -f -p 4 build/unsigned.apk build/aligned.apk
if [ ! -f keys/lull.keystore ]; then
  keytool -genkeypair -keystore keys/lull.keystore -storepass "$LULL_KS_PASS" -keypass "$LULL_KS_PASS" -alias lull -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=Lull, O=Caffeine Not Included" >/dev/null 2>&1
fi
apksigner sign --ks keys/lull.keystore --ks-pass env:LULL_KS_PASS --key-pass env:LULL_KS_PASS --ks-key-alias lull --v1-signing-enabled true --v2-signing-enabled true --out "Lull-$VER.apk" build/aligned.apk
apksigner verify --verbose "Lull-$VER.apk" | head -4
ls -la "Lull-$VER.apk"
