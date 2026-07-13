package com.willcmcc.budgie.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Ink = Color(0xFF1A1610)
val Ink2 = Color(0xFF5A4F3E)
val Ink3 = Color(0xFF9C907C)
val Paper = Color(0xFFEDE5D2)
val Card = Color(0xFFFCF7E6)
val Border = Color(0xFFE0D6C2)
val Blue = Color(0xFF3B5E8E)
val Red = Color(0xFFC25B3F)
val Green = Color(0xFF6B8C4A)
val Amber = Color(0xFFB89146)

private val Colors = lightColorScheme(
    primary = Blue,
    onPrimary = Card,
    secondary = Amber,
    onSecondary = Ink,
    error = Red,
    onError = Card,
    background = Paper,
    onBackground = Ink,
    surface = Card,
    onSurface = Ink,
    surfaceVariant = Paper,
    onSurfaceVariant = Ink2,
    outline = Border,
)

@Composable
fun BudgieTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Colors, content = content)
}

