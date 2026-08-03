import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    // AGP 9 built-in Kotlin — org.jetbrains.kotlin.android must NOT be applied.
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "br.com.tatame"
    compileSdk = 36

    defaultConfig {
        applicationId = "br.com.tatame"
        minSdk = 26
        // Set explicitly — we do not lean on android.sdk.defaultTargetSdkToCompileSdkIfUnset.
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        debug {
            // Local backend through the emulator loopback alias (cleartext allowed in debug manifest).
            buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:3000/\"")
        }
        release {
            isMinifyEnabled = false
            buildConfigField("String", "API_BASE_URL", "\"https://api.tatame.dev/\"")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    // AGP 9 changed the Java default from 8 to 11 — pin 17 explicitly (JDK 17 toolchain decision).
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    // Built-in Kotlin DSL (no android.kotlinOptions in AGP 9).
    jvmToolchain(17)
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

// Ticket mobile-android/02 defines a committed-generated Retrofit client produced by
// openapi-generator (`kotlin` / `jvm-retrofit2` / `kotlinx_serialization`) from
// `packages/shared/src/api/openapi.json` into `core/network/generated`.
//
// FALLBACK IN EFFECT (documented per ticket 02's escape hatch): the current contract
// defeats that generator mode on three concrete points —
//   1. `MeAcademyDto.theme` is `additionalProperties: true` → the generator emits
//      `kotlin.Any`-typed maps that kotlinx.serialization cannot (de)serialize;
//   2. `POST /v1/auth/login` responds 200 (AuthSessionResponseDto) OR 202
//      (MfaChallengeResponseDto) → the generator binds only the 200 shape, silently
//      dropping the MFA challenge branch;
//   3. `MfaChallengeResponseDto.mfaRequired` is a boolean single-value enum — a known
//      generator gap with kotlinx.serialization.
// The auth surface is therefore covered by a hand-written thin Retrofit interface +
// kotlinx.serialization DTOs in `core/network` whose field names mirror the spec 1:1.
// This task stays registered as the wiring point so the committed-generated convention
// can be adopted for the wider (non-auth) surface once the gaps are fixed upstream.
tasks.register("generateApiClient") {
    group = "codegen"
    description =
        "Stub — will run openapi-generator (kotlin/jvm-retrofit2) over packages/shared/src/api/openapi.json " +
            "into core/network/generated. Auth endpoints are currently hand-written (see comment above)."
    doLast {
        logger.lifecycle(
            "generateApiClient is a stub: the auth surface is hand-written in " +
                "app/src/main/kotlin/br/com/tatame/core/network (see app/build.gradle.kts for the rationale). " +
                "Spec source: ../../packages/shared/src/api/openapi.json",
        )
    }
}

dependencies {
    val composeBom = platform(libs.androidx.compose.bom)
    implementation(composeBom)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.material3)
    implementation(libs.kotlinx.collections.immutable)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.androidx.datastore.preferences)

    implementation(libs.retrofit)
    implementation(libs.retrofit.converter.kotlinx.serialization)
    implementation(libs.okhttp)
    // On the main classpath (referenced by NetworkModule) but only *installed* when BuildConfig.DEBUG.
    implementation(libs.okhttp.logging.interceptor)

    implementation(platform(libs.koin.bom))
    implementation(libs.koin.android)
    implementation(libs.koin.androidx.compose)

    debugImplementation(libs.androidx.compose.ui.tooling)

    testImplementation(libs.junit4)
    testImplementation(libs.kotlinx.serialization.json) // JsonElement parsing of golden fixtures only
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.androidx.datastore.preferences.core)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.koin.test)
    testImplementation(libs.koin.test.junit4)
}
