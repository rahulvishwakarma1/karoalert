# ============================================
# KAROALERT PROGUARD/R8 RULES
# ============================================
# This file is auto-picked by Expo/EAS when enableProguardInReleaseBuilds: true
# Place in project root: android/proguard-rules.pro

# --------------------------------------------
# FIREBASE (CRITICAL for OTP, Auth, FCM)
# --------------------------------------------
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-keep class com.google.android.gms.tasks.** { *; }
-keep class com.google.firebase.auth.** { *; }
-keep class com.google.firebase.messaging.** { *; }
-keep class com.google.firebase.installations.** { *; }
-keep class com.google.firebase.components.** { *; }

# --------------------------------------------
# WEBRTC (CRITICAL for app-to-app calls)
# --------------------------------------------
-keep class org.webrtc.** { *; }
-keep interface org.webrtc.** { *; }

# --------------------------------------------
# REACT NATIVE / HERMES / SOLOADER
# --------------------------------------------
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.soloader.** { *; }
-keep class com.facebook.yoga.** { *; }
-keep class com.facebook.fbreact.** { *; }
-keep class com.facebook.flipper.** { *; }
-keep class com.facebook.proguard.annotations.** { *; }

# Keep React Native bridge and TurboModule interfaces
-keep class * implements com.facebook.react.bridge.JavaScriptModule { *; }
-keep class * implements com.facebook.react.bridge.NativeModule { *; }
-keep class * implements com.facebook.react.turbomodule.core.TurboModule { *; }
-keepclassmembers,includedescriptorclasses class * { native <methods>; }
-keepclassmembers class * { @com.facebook.react.uimanager.annotations.ReactProp <methods>; }
-keepclassmembers class * { @com.facebook.react.uimanager.annotations.ReactPropGroup <methods>; }
-keepclassmembers class * { @com.facebook.react.uimanager.annotations.ReactPropWithDefault <methods>; }

# --------------------------------------------
# EXPO MODULES
# --------------------------------------------
-keep class expo.modules.** { *; }
-keep class expo.modules.notifications.** { *; }
-keep class expo.modules.camera.** { *; }
-keep class expo.modules.audio.** { *; }
-keep class expo.modules.medialibrary.** { *; }
-keep class expo.modules.imagepicker.** { *; }
-keep class expo.modules.assets.** { *; }
-keep class expo.modules.sharing.** { *; }
-keep class expo.modules.filesystem.** { *; }
-keep class expo.modules.constants.** { *; }
-keep class expo.modules.buildproperties.** { *; }

# --------------------------------------------
# REACT NATIVE FIREBASE (RNFB)
# --------------------------------------------
-keep class io.invertase.firebase.** { *; }
-keep class io.invertase.firebase.auth.** { *; }
-keep class io.invertase.firebase.messaging.** { *; }
-keep class io.invertase.firebase.app.** { *; }

# --------------------------------------------
# REACT NATIVE WEBRTC
# --------------------------------------------
-keep class com.oney.webrtc.** { *; }
-keep class com.mrousavy.webrtc.** { *; }

# --------------------------------------------
# OKHTTP / OKIO (Network)
# --------------------------------------------
-keep class okhttp3.** { *; }
-keep class okio.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**

# --------------------------------------------
# GSON (JSON parsing)
# --------------------------------------------
-keep class com.google.gson.** { *; }
-keep class com.google.gson.stream.** { *; }

# --------------------------------------------
# KOTLIN COROUTINES / STDLIB
# --------------------------------------------
-keep class kotlin.** { *; }
-keep class kotlinx.coroutines.** { *; }

# --------------------------------------------
# JAVA/ANDROID STDLIB
# --------------------------------------------
-keep class java.lang.** { *; }
-keep class java.util.** { *; }
-keep class android.** { *; }
-keep class androidx.** { *; }

# --------------------------------------------
# SUPPRESS WARNINGS
# --------------------------------------------
-dontwarn com.facebook.react.**
-dontwarn com.facebook.hermes.**
-dontwarn com.facebook.jni.**
-dontwarn com.facebook.soloader.**
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**
-dontwarn org.webrtc.**
-dontwarn expo.modules.**
-dontwarn io.invertase.firebase.**
-dontwarn okio.**
-dontwarn okhttp3.**
-dontwarn kotlin.**
-dontwarn kotlinx.coroutines.**

# --------------------------------------------
# KEEP ANNOTATIONS
# --------------------------------------------
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses
-keepattributes EnclosingMethod