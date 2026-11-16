plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
android {
    namespace = "br.com.paggio.cardapio"
    compileSdk = 34
    defaultConfig {
        applicationId = "br.com.paggio.cardapio"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }
    signingConfigs {
        create("paggio") {
            storeFile = file("paggio.keystore"); storePassword = "paggio123"; keyAlias = "paggio"; keyPassword = "paggio123"
        }
    }
    buildTypes {
        getByName("release") { signingConfig = signingConfigs.getByName("paggio"); isMinifyEnabled = false }
        getByName("debug") { signingConfig = signingConfigs.getByName("paggio") }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}
