package br.com.tatame.core.designsystem.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import com.tatame.designsystem.tokens.LumiraTokens

/** Lumira radii mapped to Material3 shapes — pill-forward per the handoff. */
internal val TatameShapes = Shapes(
    extraSmall = RoundedCornerShape(LumiraTokens.Radius.Xs),
    small = RoundedCornerShape(LumiraTokens.Radius.Sm),
    medium = RoundedCornerShape(LumiraTokens.Radius.Md),
    large = RoundedCornerShape(LumiraTokens.Radius.Lg),
    extraLarge = RoundedCornerShape(LumiraTokens.Radius.Xl),
)

/** Fully-rounded pill shape (buttons, chips, tab bar) — radius token `Pill`. */
val PillShape = RoundedCornerShape(LumiraTokens.Radius.Pill)
