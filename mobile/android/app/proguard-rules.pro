# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# React Native
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
}

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Hermes
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }

# Axios / Network
-keepattributes Signature
-keepattributes *Annotation*
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**

# AsyncStorage
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# WebRTC
-keep class org.webrtc.** { *; }
-dontwarn org.webrtc.**
-keepattributes JavascriptInterface

# Expo modules
-keep class expo.modules.** { *; }
-keepclassmembers class expo.modules.** { *; }

# React Native WebView (agar ishlatilsa)
-keep class com.reactnativecommunity.webview.** { *; }

# Zustand (state management)
-keep class zustand.** { *; }

# JSON Serialization
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# General
-keepattributes SourceFile,LineNumberTable
-keep public class * extends java.lang.Exception
-keep class * implements android.os.Parcelable {
  public static final android.os.Parcelable$Creator *;
}

# React Native Firebase (agar kelajakda qo'shilsa)
# -keep class io.invertase.firebase.** { *; }
# -dontwarn io.invertase.firebase.**

# Add any project specific keep options here:
