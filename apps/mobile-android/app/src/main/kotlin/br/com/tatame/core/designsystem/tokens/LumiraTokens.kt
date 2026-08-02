// GENERATED FILE — do not edit. Source: tokens/tokens.json (design-system:tokens).

package com.tatame.designsystem.tokens

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Lumira design tokens for Compose. Static defaults (light); [DarkColors] is
 * the partial dark overlay (applyTema remix + default-brand dark tints).
 * White-label overlays come from DerivePalette.kt at theme-construction time.
 * Tracking values are em multipliers; shadow elevations approximate the
 * purple-tinted web shadows per the ds-01 degradation policy.
 */
object LumiraTokens {
    object Colors {
        val Purple50 = Color(0xFFF8F2FE)
        val Purple100 = Color(0xFFEEDDFB)
        val Purple200 = Color(0xFFDEBFF8)
        val Purple300 = Color(0xFFC695F4)
        val Purple400 = Color(0xFFA968F0)
        val Purple500 = Color(0xFF8B3DEB) // primary vibrant purple
        val Purple600 = Color(0xFF6B2DBA)
        val Purple700 = Color(0xFF4F2389) // primary deep purple
        val Purple800 = Color(0xFF3B1A66)
        val Purple900 = Color(0xFF2A1248)
        val Purple950 = Color(0xFF1A0B2E) // darkest, near-black plum
        val Pink50 = Color(0xFFFEF5F9)
        val Pink100 = Color(0xFFFDE9F3)
        val Pink200 = Color(0xFFFBD2E8)
        val Pink300 = Color(0xFFF7AED8)
        val Pink400 = Color(0xFFF285C5)
        val Pink500 = Color(0xFFEC5BAE) // primary pink accent
        val Pink600 = Color(0xFFD63E96)
        val Pink700 = Color(0xFFB8267A)
        val Gray50 = Color(0xFFFAF9FC)
        val Gray100 = Color(0xFFF2F0F6)
        val Gray200 = Color(0xFFE6E3EC)
        val Gray300 = Color(0xFFD2CED9)
        val Gray400 = Color(0xFFB3ADBC)
        val Gray500 = Color(0xFF8E8799)
        val Gray600 = Color(0xFF6B6378)
        val Gray700 = Color(0xFF4A4258)
        val Gray800 = Color(0xFF2E2839)
        val Gray900 = Color(0xFF1C1726)
        val Gray950 = Color(0xFF0F0B17)
        val White = Color(0xFFFFFFFF)
        val InkPurple = Color(0xFF4F2389)
        val InkPink = Color(0xFFA83C78) // mix(accent 64% #3B0A24) with the default accent
        val Success100 = Color(0xFFD9F2E5)
        val Success500 = Color(0xFF2BB673)
        val Warning100 = Color(0xFFFCEBCC)
        val Warning500 = Color(0xFFF0A020)
        val Danger100 = Color(0xFFFBDDE2)
        val Danger500 = Color(0xFFE04359)
        val Info100 = Color(0xFFDDE5FD)
        val Info500 = Color(0xFF5B7DF5)
        val Fg1 = Color(0xFF1A0B2E) // primary text
        val Fg2 = Color(0xFF3B1A66) // secondary text
        val Fg3 = Color(0xFF6B6378) // muted, captions, helper text
        val Fg4 = Color(0xFF8E8799) // placeholders, disabled
        val FgOnColor = Color(0xFFFFFFFF) // on purple/pink fills
        val BgApp = Color(0xFFFAF9FC) // app canvas
        val BgSurface = Color(0xFFFFFFFF) // cards, sheets
        val BgSunken = Color(0xFFF2F0F6) // inset wells
        val BgOverlay = Color(0x8C1A0B2E) // dialog scrim
        val Brand1 = Color(0xFF4F2389) // primary fill
        val Brand2 = Color(0xFF8B3DEB) // secondary fill
        val BrandAccent = Color(0xFFEC5BAE)
        val BrandTint = Color(0xFFF8F2FE) // subtle wash background
        val Border1 = Color(0xFFE6E3EC) // default border
        val Border2 = Color(0xFFD2CED9) // hover/focus rest
        val BorderStrong = Color(0xFF4F2389)
        val BeltWhite = Color(0xFFEDEAE2)
        val BeltGray = Color(0xFF9A9AA2)
        val BeltYellow = Color(0xFFE8C93D)
        val BeltOrange = Color(0xFFE8833D)
        val BeltGreen = Color(0xFF3D8B4F)
        val BeltBlue = Color(0xFF1E5CB3)
        val BeltPurple = Color(0xFF6B2DBA)
        val BeltBrown = Color(0xFF6B4A2D)
        val BeltBlack = Color(0xFF17141F)
        val BeltRed = Color(0xFFB3261E)
        val BeltTip = Color(0xFF17141F) // default ponteira
        val BeltStripe = Color(0xFFFFFFFF) // degree stripes
        val BeltOutline = Color(0x241A0B2E) // hairline inset border keeping light belts visible
    }

    /** Dark-mode overrides — same names as [Colors] (plus Glass* colors). */
    object DarkColors {
        val Purple50 = Color(0xFF292143)
        val Purple100 = Color(0xFF312450)
        val Purple200 = Color(0xFF3D2966)
        val Purple300 = Color(0xFF512F86)
        val Purple400 = Color(0xFF6C37B6)
        val Pink50 = Color(0xFF2F2240)
        val Pink100 = Color(0xFF3B2748)
        val Pink200 = Color(0xFF553057)
        val Pink300 = Color(0xFF7A3C6D)
        val Pink400 = Color(0xFFB04B8C)
        val Gray50 = Color(0xFF241E3A)
        val Gray100 = Color(0xFF2E2748)
        val Gray200 = Color(0xFF3D3560)
        val Gray300 = Color(0xFF4D4478)
        val Gray400 = Color(0xFF7E7699)
        val Gray600 = Color(0xFFC7C0DC)
        val InkPurple = Color(0xFFB08AF7)
        val InkPink = Color(0xFFFAA1CE)
        val Success100 = Color(0xFF163526)
        val Warning100 = Color(0xFF3A2F14)
        val Danger100 = Color(0xFF3A1B22)
        val Fg1 = Color(0xFFF2EFFA)
        val Fg2 = Color(0xFFD6D0E8)
        val Fg3 = Color(0xFFA79FC2)
        val Fg4 = Color(0xFF7E7699)
        val BgApp = Color(0xFF141021)
        val BgSurface = Color(0xFF1D1830)
        val Border1 = Color(0xFF2E2748)
        val Border2 = Color(0xFF3D3560)
        val GlassBgDeep = Color(0xEB1A152C)
        val GlassBorder = Color(0x24FFFFFF)
    }

    object Space {
        val S0 = 0.dp
        val S1 = 4.dp
        val S2 = 8.dp
        val S3 = 12.dp
        val S4 = 16.dp
        val S5 = 20.dp
        val S6 = 24.dp
        val S8 = 32.dp
        val S10 = 40.dp
        val S12 = 48.dp
        val S16 = 64.dp
        val S20 = 80.dp
        val S24 = 96.dp
    }

    object Radius {
        val Xs = 6.dp
        val Sm = 10.dp
        val Md = 14.dp
        val Lg = 20.dp
        val Xl = 28.dp
        val Xxl = 36.dp
        val Pill = 999.dp
    }

    object FontSize {
        val Text2xs = 11.sp
        val TextXs = 12.sp
        val TextSm = 14.sp
        val TextBase = 16.sp
        val TextMd = 18.sp
        val TextLg = 20.sp
        val TextXl = 24.sp
        val Text2xl = 30.sp
        val Text3xl = 36.sp
        val Text4xl = 48.sp
        val Text5xl = 60.sp
        val Text6xl = 72.sp
    }

    object FontWeights {
        val Light = FontWeight(300)
        val Regular = FontWeight(400)
        val Medium = FontWeight(500)
        val Semibold = FontWeight(600)
        val Bold = FontWeight(700)
    }

    object LineHeight {
        val Tight = 1.15f
        val Snug = 1.3f
        val Normal = 1.5f
        val Relaxed = 1.65f
    }

    object Tracking {
        val Tight = -0.02f // em
        val Normal = 0f // em
        val Wide = 0.04f // em
        val Caps = 0.08f // em
    }

    object Motion {
        val EaseOut = CubicBezierEasing(0.22f, 1f, 0.36f, 1f)
        val EaseIn = CubicBezierEasing(0.55f, 0f, 1f, 0.45f)
        val EaseSpring = CubicBezierEasing(0.34f, 1.56f, 0.64f, 1f)
        val DurFast = 120 // ms
        val DurBase = 200 // ms
        val DurSlow = 320 // ms
    }

    object Shadow {
        val ElevationXs = 1.dp // approximation of 0 1px 2px rgba(42, 18, 72, 0.06)
        val ColorXs = Color(0x0F2A1248)
        val ElevationSm = 2.dp // approximation of 0 2px 6px rgba(42, 18, 72, 0.08)
        val ColorSm = Color(0x142A1248)
        val ElevationMd = 8.dp // approximation of 0 8px 20px rgba(42, 18, 72, 0.10)
        val ColorMd = Color(0x1A2A1248)
        val ElevationLg = 18.dp // approximation of 0 18px 40px rgba(42, 18, 72, 0.14)
        val ColorLg = Color(0x242A1248)
        val ElevationXl = 30.dp // approximation of 0 30px 60px rgba(42, 18, 72, 0.18)
        val ColorXl = Color(0x2E2A1248)
        val ElevationGlow = 8.dp // approximation of 0 8px 32px rgba(139, 61, 235, 0.35)
        val ColorGlow = Color(0x598B3DEB)
        val ElevationInset = 1.dp // approximation of inset 0 1px 2px rgba(42, 18, 72, 0.06)
        val ColorInset = Color(0x0F2A1248)
    }

    object Glass {
        val Bg = Color(0x8CFFFFFF)
        val BgDeep = Color(0xA6F8F2FE)
        val Border = Color(0xB3FFFFFF)
        val Stroke = Color(0x2E8B3DEB)
        val Blur = 20.dp
        val BlurStrong = 24.dp
        val Saturation = 1.8f
        val ShineAngle = 135f
        val ShineColors = listOf(Color(0xB3FFFFFF), Color(0x26FFFFFF), Color(0x00FFFFFF))
        val ShineStops = listOf(0f, 0.4f, 1f)
    }

    object FocusRing {
        val Width = 3.dp
        const val Alpha = 0.4f
        val RingColor = Color(0xFF8B3DEB)
    }
}
