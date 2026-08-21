plugins { id("com.android.application") }

android {
    namespace = "com.memoryeveryday.app"
    compileSdk = 35
    buildFeatures { buildConfig = true }
    defaultConfig {
        applicationId = "com.memoryeveryday.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 5
        versionName = "1.0.4"
    }
}
