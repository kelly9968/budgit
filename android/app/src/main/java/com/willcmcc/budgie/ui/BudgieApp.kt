package com.willcmcc.budgie.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.willcmcc.budgie.BuildConfig
import com.willcmcc.budgie.data.BudgetSnapshot
import com.willcmcc.budgie.data.ColumnMapping
import com.willcmcc.budgie.data.ConfigParser
import com.willcmcc.budgie.data.SheetConfig
import com.willcmcc.budgie.data.Transaction
import com.willcmcc.budgie.ui.theme.Amber
import com.willcmcc.budgie.ui.theme.Blue
import com.willcmcc.budgie.ui.theme.Border
import com.willcmcc.budgie.ui.theme.Card
import com.willcmcc.budgie.ui.theme.Green
import com.willcmcc.budgie.ui.theme.Ink
import com.willcmcc.budgie.ui.theme.Ink2
import com.willcmcc.budgie.ui.theme.Ink3
import com.willcmcc.budgie.ui.theme.Paper
import com.willcmcc.budgie.ui.theme.Red
import com.willcmcc.budgie.widget.WidgetPinning
import java.text.DateFormat
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Date
import kotlin.math.max

@Composable
fun BudgieApp(viewModel: BudgieViewModel, onAuthorize: () -> Unit) {
    val state = viewModel.state
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(state.notice) {
        state.notice?.let {
            snackbar.showSnackbar(it)
            viewModel.dismissNotice()
        }
    }

    if (state.config == null) {
        SetupScreen(onSave = viewModel::saveConfig)
        return
    }

    Scaffold(
        containerColor = Paper,
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = { BottomNavigation(state.screen, viewModel::navigate) },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(bottom = padding.calculateBottomPadding())
                .windowInsetsPadding(WindowInsets.statusBars),
        ) {
            Masthead(
                title = state.config.sheetName,
                refreshing = state.refreshing || state.loading,
                onRefresh = { viewModel.refresh() },
                onSettings = { viewModel.navigate(AppScreen.SETTINGS) },
            )
            if (state.authRequired) {
                ConnectionBanner(state.authorizing, onAuthorize)
            } else if (state.error != null) {
                OfflineBanner(state.snapshot.updatedAt, state.error, { viewModel.refresh() })
            }
            when (state.screen) {
                AppScreen.DASHBOARD -> DashboardScreen(state.snapshot, state.loading)
                AppScreen.ADD -> AddScreen(
                    snapshot = state.snapshot,
                    writable = state.config.writeEnabled,
                    working = state.refreshing,
                    onAdd = viewModel::add,
                    onAuthorize = onAuthorize,
                    authRequired = state.authRequired,
                )
                AppScreen.ACTIVITY -> ActivityScreen(state.snapshot, state.loading)
                AppScreen.SETTINGS -> SettingsScreen(
                    config = state.config,
                    accountEmail = state.accountEmail,
                    onSave = viewModel::saveConfig,
                    onAuthorize = onAuthorize,
                    onDisconnect = viewModel::disconnect,
                )
            }
        }
    }
}

@Composable
private fun SetupScreen(onSave: (SheetConfig) -> Unit) {
    var sheetInput by rememberSaveable { mutableStateOf("") }
    var sheetName by rememberSaveable { mutableStateOf("My budget") }
    var error by rememberSaveable { mutableStateOf<String?>(null) }

    Column(
        Modifier
            .fillMaxSize()
            .background(Paper)
            .windowInsetsPadding(WindowInsets.statusBars)
            .windowInsetsPadding(WindowInsets.navigationBars)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 42.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("B", fontFamily = FontFamily.Serif, fontSize = 68.sp, color = Ink, lineHeight = 68.sp)
        Text(
            "budgie",
            fontFamily = FontFamily.Serif,
            fontSize = 38.sp,
            color = Ink,
        )
        Text(
            "Your budget, close at hand.",
            color = Ink2,
            fontSize = 16.sp,
            modifier = Modifier.padding(top = 4.dp, bottom = 32.dp),
        )
        PaperCard {
            Eyebrow("CONNECT YOUR SHEET")
            Text(
                "Budgie reads the same Google Sheet as the web app. Paste its link below; authorization stays between this device and Google.",
                color = Ink2,
                fontSize = 14.sp,
                lineHeight = 21.sp,
                modifier = Modifier.padding(top = 10.dp, bottom = 18.dp),
            )
            BudgieField(
                value = sheetInput,
                onValueChange = { sheetInput = it; error = null },
                label = "Google Sheet link or ID",
                modifier = Modifier.testTag("sheet_link"),
            )
            Spacer(Modifier.height(10.dp))
            BudgieField(sheetName, { sheetName = it }, "Name in Budgie")
            if (error != null) Text(error!!, color = Red, fontSize = 12.sp, modifier = Modifier.padding(top = 10.dp))
            Spacer(Modifier.height(18.dp))
            PrimaryButton(
                text = "Continue",
                enabled = sheetInput.isNotBlank(),
                modifier = Modifier.fillMaxWidth().testTag("continue_setup"),
            ) {
                runCatching { ConfigParser.sheetId(sheetInput) }
                    .onSuccess { onSave(SheetConfig(sheetId = it, sheetName = sheetName.ifBlank { "My budget" })) }
                    .onFailure { error = it.message }
            }
        }
        Text(
            "Default layout: Transactions!A:E and @metadata. You can map any columns or switch to read-only in Settings.",
            color = Ink3,
            fontSize = 11.sp,
            lineHeight = 16.sp,
            modifier = Modifier.padding(top = 18.dp),
        )
    }
}

@Composable
private fun Masthead(title: String, refreshing: Boolean, onRefresh: () -> Unit, onSettings: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().height(72.dp).background(Card).border(1.dp, Border).padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text("budgie", fontFamily = FontFamily.Serif, fontSize = 26.sp, color = Ink)
            Text(title.uppercase(), color = Ink3, fontSize = 9.sp, letterSpacing = 1.5.sp, maxLines = 1)
        }
        TextAction(if (refreshing) "…" else "↻", "Refresh", onRefresh)
        Spacer(Modifier.width(8.dp))
        TextAction("⚙", "Settings", onSettings)
    }
}

@Composable
private fun TextAction(symbol: String, description: String, onClick: () -> Unit) {
    Box(
        Modifier.size(42.dp).clip(CircleShape).border(1.dp, Border, CircleShape).clickable(onClick = onClick).testTag(description.lowercase()),
        contentAlignment = Alignment.Center,
    ) { Text(symbol, color = Blue, fontSize = 19.sp) }
}

@Composable
private fun BottomNavigation(selected: AppScreen, onSelect: (AppScreen) -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(Card).border(1.dp, Border).windowInsetsPadding(WindowInsets.navigationBars).height(68.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceAround,
    ) {
        NavItem("⌂", "Today", AppScreen.DASHBOARD, selected, onSelect)
        NavItem("＋", "Add", AppScreen.ADD, selected, onSelect)
        NavItem("≡", "Activity", AppScreen.ACTIVITY, selected, onSelect)
        NavItem("···", "More", AppScreen.SETTINGS, selected, onSelect)
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.NavItem(
    symbol: String,
    label: String,
    screen: AppScreen,
    selected: AppScreen,
    onSelect: (AppScreen) -> Unit,
) {
    val active = screen == selected
    Column(
        Modifier.weight(1f).clickable { onSelect(screen) }.padding(vertical = 7.dp).testTag(label.lowercase()),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(symbol, color = if (active) Blue else Ink3, fontSize = 19.sp, lineHeight = 20.sp)
        Text(label, color = if (active) Blue else Ink3, fontSize = 10.sp, fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal)
    }
}

@Composable
private fun ConnectionBanner(authorizing: Boolean, onAuthorize: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(Amber.copy(alpha = .14f)).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("Google permission is needed to sync.", color = Ink2, fontSize = 12.sp, modifier = Modifier.weight(1f))
        Button(
            onClick = onAuthorize,
            enabled = !authorizing,
            contentPadding = PaddingValues(horizontal = 13.dp, vertical = 4.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Blue),
        ) { Text(if (authorizing) "Connecting…" else "Connect", fontSize = 11.sp) }
    }
}

@Composable
private fun OfflineBanner(updatedAt: Long, error: String?, onRetry: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(Red.copy(alpha = .08f)).clickable(onClick = onRetry).padding(horizontal = 16.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            if (updatedAt > 0L) "Offline — showing the last saved budget" else (error ?: "Could not sync"),
            color = Red,
            fontSize = 11.sp,
            modifier = Modifier.weight(1f),
            maxLines = 2,
        )
        Text(
            if (updatedAt > 0L) DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(updatedAt)) else "RETRY",
            color = Ink3,
            fontSize = 10.sp,
        )
    }
}

@Composable
private fun DashboardScreen(snapshot: BudgetSnapshot, loading: Boolean) {
    if (loading && snapshot.updatedAt == 0L) {
        LoadingPane("Reading your sheet…")
        return
    }
    if (snapshot.updatedAt == 0L) {
        EmptyPane("Connect Google to see this month’s budget.")
        return
    }
    val month = YearMonth.now().format(DateTimeFormatter.ofPattern("MMMM yyyy"))
    LazyColumn(
        Modifier.fillMaxSize().testTag("dashboard_screen"),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Text(month, fontFamily = FontFamily.Serif, fontStyle = FontStyle.Italic, fontSize = 21.sp, color = Ink)
        }
        item { HeroBudgetCard(snapshot) }
        item { SpendingChart(snapshot) }
        item {
            SectionHeading("Recent expenses", "See all")
            Spacer(Modifier.height(8.dp))
            PaperCard {
                if (snapshot.transactions.isEmpty()) {
                    Text("No transactions yet. Add one to get started.", color = Ink3, fontSize = 13.sp)
                } else {
                    snapshot.transactions.take(4).forEachIndexed { index, tx ->
                        if (index > 0) HorizontalDivider(color = Border)
                        TransactionRow(tx)
                    }
                }
            }
        }
    }
}

@Composable
private fun HeroBudgetCard(snapshot: BudgetSnapshot) {
    PaperCard {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Eyebrow("SPENT THIS MONTH")
                Text(
                    formatCurrency(snapshot.spent, 0),
                    fontFamily = FontFamily.Serif,
                    fontSize = 46.sp,
                    color = Ink,
                    modifier = Modifier.padding(top = 5.dp),
                )
            }
            StatusPill(snapshot.onTrack)
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Budget ${formatCurrency(snapshot.budget, 0)}", color = Ink2, fontSize = 12.sp)
            Text("${formatCurrency(snapshot.left, 0)} left", color = if (snapshot.left >= 0) Green else Red, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.height(9.dp))
        LinearProgressIndicator(
            progress = { snapshot.budgetProgress / 100f },
            modifier = Modifier.fillMaxWidth().height(9.dp).clip(RoundedCornerShape(5.dp)),
            color = if (snapshot.left >= 0) Blue else Red,
            trackColor = Border,
            strokeCap = StrokeCap.Round,
        )
        Row(Modifier.fillMaxWidth().padding(top = 18.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Metric("DAILY TARGET", formatCurrency(snapshot.dailyTarget, 0), Modifier.weight(1f))
            Metric("7-DAY PACE", formatCurrency(snapshot.recentDailyAverage, 0), Modifier.weight(1f))
            Metric("FORECAST", formatCurrency(snapshot.forecast, 0), Modifier.weight(1f))
        }
    }
}

@Composable
private fun StatusPill(onTrack: Boolean) {
    val color = if (onTrack) Green else Red
    Text(
        if (onTrack) "ON TRACK" else "OVER PACE",
        color = color,
        fontSize = 9.sp,
        letterSpacing = 1.sp,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.background(color.copy(alpha = .1f), RoundedCornerShape(20.dp)).padding(horizontal = 10.dp, vertical = 6.dp),
    )
}

@Composable
private fun Metric(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier.background(Paper.copy(alpha = .65f), RoundedCornerShape(8.dp)).padding(10.dp)) {
        Text(label, color = Ink3, fontSize = 8.sp, letterSpacing = .7.sp, maxLines = 1)
        Text(value, color = Ink, fontFamily = FontFamily.Serif, fontSize = 18.sp, modifier = Modifier.padding(top = 3.dp))
    }
}

@Composable
private fun SpendingChart(snapshot: BudgetSnapshot) {
    val today = LocalDate.now()
    val days = (max(1, today.dayOfMonth - 13)..today.dayOfMonth).toList()
    val daily = days.map { day ->
        snapshot.transactions.filter { tx ->
            runCatching { LocalDate.parse(tx.date) == today.withDayOfMonth(day) }.getOrDefault(false)
        }.sumOf { it.amount }.toFloat()
    }
    val ceiling = max(snapshot.dailyTarget.toFloat(), daily.maxOrNull() ?: 1f).coerceAtLeast(1f)
    PaperCard {
        SectionHeading("Last 14 days", "Target ${formatCurrency(snapshot.dailyTarget, 0)}/day")
        Canvas(Modifier.fillMaxWidth().height(116.dp).padding(top = 16.dp)) {
            val step = size.width / days.size
            val targetY = size.height - (snapshot.dailyTarget.toFloat() / ceiling).coerceIn(0f, 1f) * size.height
            drawLine(Amber.copy(alpha = .65f), Offset(0f, targetY), Offset(size.width, targetY), 1.dp.toPx())
            daily.forEachIndexed { index, amount ->
                val barHeight = (amount / ceiling).coerceIn(0f, 1f) * size.height
                val x = step * index + step * .2f
                drawRoundRect(
                    color = if (amount <= snapshot.dailyTarget) Blue.copy(alpha = .72f) else Red.copy(alpha = .72f),
                    topLeft = Offset(x, size.height - barHeight),
                    size = androidx.compose.ui.geometry.Size(step * .6f, barHeight.coerceAtLeast(2.dp.toPx())),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(3.dp.toPx()),
                )
            }
        }
    }
}

@Composable
private fun AddScreen(
    snapshot: BudgetSnapshot,
    writable: Boolean,
    working: Boolean,
    onAdd: (Transaction) -> Unit,
    onAuthorize: () -> Unit,
    authRequired: Boolean,
) {
    var amount by rememberSaveable { mutableStateOf("") }
    var note by rememberSaveable { mutableStateOf("") }
    var date by rememberSaveable { mutableStateOf(LocalDate.now().toString()) }
    var category by rememberSaveable { mutableStateOf(snapshot.categories.firstOrNull()?.name ?: "Other") }
    var error by rememberSaveable { mutableStateOf<String?>(null) }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp).testTag("add_screen"),
    ) {
        Text("Add an expense", fontFamily = FontFamily.Serif, fontStyle = FontStyle.Italic, fontSize = 25.sp)
        Text("A small entry now keeps the month honest.", color = Ink3, fontSize = 12.sp, modifier = Modifier.padding(top = 3.dp, bottom = 16.dp))
        if (!writable) {
            PaperCard {
                Text("This Sheet is connected read-only.", color = Red, fontWeight = FontWeight.SemiBold)
                Text("Turn on two-way sync in Settings to add expenses.", color = Ink2, fontSize = 12.sp, modifier = Modifier.padding(top = 5.dp))
            }
            return
        }
        PaperCard {
            Eyebrow("AMOUNT")
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 8.dp)) {
                Text("$", fontFamily = FontFamily.Serif, fontSize = 35.sp, color = Ink3)
                OutlinedTextField(
                    value = amount,
                    onValueChange = { amount = it; error = null },
                    placeholder = { Text("0.00", fontFamily = FontFamily.Serif, fontSize = 35.sp, color = Ink3.copy(alpha = .5f)) },
                    textStyle = MaterialTheme.typography.headlineLarge.copy(fontFamily = FontFamily.Serif, color = Ink),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.weight(1f).testTag("amount"),
                    colors = fieldColors(),
                )
            }
            Eyebrow("CATEGORY")
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                snapshot.categories.forEach { item ->
                    val selected = category == item.name
                    Column(
                        Modifier
                            .width(78.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(if (selected) Blue.copy(alpha = .12f) else Paper.copy(alpha = .7f))
                            .border(1.dp, if (selected) Blue else Border, RoundedCornerShape(12.dp))
                            .clickable { category = item.name }
                            .padding(vertical = 10.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(item.icon, fontSize = 22.sp)
                        Text(item.name, color = if (selected) Blue else Ink2, fontSize = 9.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
            BudgieField(note, { note = it }, "Note", minLines = 2)
            Spacer(Modifier.height(10.dp))
            BudgieField(date, { date = it }, "Date · YYYY-MM-DD")
            if (error != null) Text(error!!, color = Red, fontSize = 12.sp, modifier = Modifier.padding(top = 10.dp))
        }
        Spacer(Modifier.height(14.dp))
        PrimaryButton(
            text = when {
                working -> "Adding…"
                authRequired -> "Connect Google to add"
                else -> "Add expense"
            },
            enabled = !working && amount.isNotBlank(),
            modifier = Modifier.fillMaxWidth().height(52.dp).testTag("add_expense"),
        ) {
            if (authRequired) {
                onAuthorize()
            } else {
                val parsedAmount = amount.toDoubleOrNull()
                val parsedDate = runCatching { LocalDate.parse(date) }.getOrNull()
                if (parsedAmount == null || parsedAmount <= 0) error = "Enter an amount greater than zero"
                else if (parsedDate == null) error = "Use a date such as 2026-07-13"
                else {
                    onAdd(Transaction(parsedDate.toString(), parsedAmount, note.trim(), category))
                    amount = ""
                    note = ""
                }
            }
        }
    }
}

@Composable
private fun ActivityScreen(snapshot: BudgetSnapshot, loading: Boolean) {
    if (loading && snapshot.updatedAt == 0L) {
        LoadingPane("Loading expenses…")
        return
    }
    LazyColumn(
        Modifier.fillMaxSize().testTag("activity_screen"),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Text("Activity", fontFamily = FontFamily.Serif, fontStyle = FontStyle.Italic, fontSize = 25.sp)
            Text("${snapshot.transactions.size} transactions", color = Ink3, fontSize = 11.sp, modifier = Modifier.padding(top = 3.dp, bottom = 6.dp))
        }
        if (snapshot.transactions.isEmpty()) {
            item { EmptyPane("No expenses yet. Add one and it will appear here.") }
        }
        items(snapshot.transactions, key = { "${it.row}-${it.date}-${it.amount}-${it.note}" }) { tx ->
            Surface(color = Card, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().border(1.dp, Border, RoundedCornerShape(12.dp))) {
                TransactionRow(tx)
            }
        }
    }
}

@Composable
private fun TransactionRow(transaction: Transaction) {
    Row(Modifier.fillMaxWidth().padding(vertical = 12.dp, horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        val date = runCatching { LocalDate.parse(transaction.date) }.getOrNull()
        Column(Modifier.width(54.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(date?.dayOfMonth?.toString() ?: "—", fontFamily = FontFamily.Serif, fontSize = 22.sp, color = Ink)
            Text(date?.month?.name?.take(3) ?: "", color = Ink3, fontSize = 8.sp, letterSpacing = .7.sp)
        }
        Column(Modifier.weight(1f).padding(horizontal = 8.dp)) {
            Text(transaction.note.ifBlank { transaction.category }, color = Ink, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(transaction.category, color = Ink3, fontSize = 10.sp, modifier = Modifier.padding(top = 2.dp))
        }
        Text(formatCurrency(transaction.amount), color = Ink, fontFamily = FontFamily.Serif, fontSize = 17.sp)
    }
}

@Composable
private fun SettingsScreen(
    config: SheetConfig,
    accountEmail: String?,
    onSave: (SheetConfig) -> Unit,
    onAuthorize: () -> Unit,
    onDisconnect: () -> Unit,
) {
    var sheetId by rememberSaveable(config.sheetId) { mutableStateOf(config.sheetId) }
    var sheetName by rememberSaveable(config.sheetId) { mutableStateOf(config.sheetName) }
    var txTab by rememberSaveable(config.sheetId) { mutableStateOf(config.transactionsTab) }
    var metaTab by rememberSaveable(config.sheetId) { mutableStateOf(config.metadataTab) }
    var startRow by rememberSaveable(config.sheetId) { mutableStateOf(config.dataStartRow.toString()) }
    var budget by rememberSaveable(config.sheetId) { mutableStateOf(config.monthlyBudget.toString()) }
    var writable by rememberSaveable(config.sheetId) { mutableStateOf(config.writeEnabled) }
    var dateCol by rememberSaveable(config.sheetId) { mutableStateOf(ConfigParser.columnLabel(config.mapping.date)) }
    var amountCol by rememberSaveable(config.sheetId) { mutableStateOf(ConfigParser.columnLabel(config.mapping.amount)) }
    var noteCol by rememberSaveable(config.sheetId) { mutableStateOf(ConfigParser.columnLabel(config.mapping.note)) }
    var categoryCol by rememberSaveable(config.sheetId) { mutableStateOf(ConfigParser.columnLabel(config.mapping.category)) }
    var subcategoryCol by rememberSaveable(config.sheetId) { mutableStateOf(ConfigParser.columnLabel(config.mapping.subcategory)) }
    var error by rememberSaveable { mutableStateOf<String?>(null) }
    val context = LocalContext.current

    LazyColumn(
        Modifier.fillMaxSize().testTag("settings_screen"),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Text("Settings", fontFamily = FontFamily.Serif, fontStyle = FontStyle.Italic, fontSize = 25.sp)
            Text("Connection details stay in Android’s private app storage.", color = Ink3, fontSize = 11.sp, modifier = Modifier.padding(top = 3.dp))
        }
        item {
            PaperCard {
                SectionHeading("Google", accountEmail ?: "Not connected")
                Text("Budgie asks Google Play services for a short-lived drive.file token. Tokens and credentials are never bundled into the APK.", color = Ink2, fontSize = 11.sp, lineHeight = 16.sp, modifier = Modifier.padding(vertical = 10.dp))
                SecondaryButton("Connect / change Google account", onAuthorize, Modifier.fillMaxWidth())
            }
        }
        item {
            PaperCard {
                SectionHeading("Sheet connection", if (writable) "Two-way" else "Read-only")
                Spacer(Modifier.height(12.dp))
                BudgieField(sheetId, { sheetId = it; error = null }, "Google Sheet link or ID")
                Spacer(Modifier.height(9.dp))
                BudgieField(sheetName, { sheetName = it }, "Display name")
                Spacer(Modifier.height(9.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    BudgieField(txTab, { txTab = it }, "Transactions tab", Modifier.weight(1f))
                    BudgieField(metaTab, { metaTab = it }, "Metadata tab", Modifier.weight(1f))
                }
                Spacer(Modifier.height(9.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    BudgieField(startRow, { startRow = it }, "First data row", Modifier.weight(1f), keyboardType = KeyboardType.Number)
                    BudgieField(budget, { budget = it }, "Fallback budget", Modifier.weight(1f), keyboardType = KeyboardType.Decimal)
                }
                Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Two-way sync", color = Ink, fontSize = 13.sp)
                        Text("Allow this app to append expenses", color = Ink3, fontSize = 10.sp)
                    }
                    Switch(
                        checked = writable,
                        onCheckedChange = { writable = it },
                        colors = SwitchDefaults.colors(checkedTrackColor = Blue, uncheckedTrackColor = Border),
                    )
                }
            }
        }
        item {
            PaperCard {
                SectionHeading("Column map", "Letters")
                Text("Date and amount are required. Leave optional columns blank when your Sheet does not contain them.", color = Ink3, fontSize = 10.sp, lineHeight = 15.sp, modifier = Modifier.padding(top = 6.dp, bottom = 10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    BudgieField(dateCol, { dateCol = it }, "Date", Modifier.weight(1f))
                    BudgieField(amountCol, { amountCol = it }, "Amount", Modifier.weight(1f))
                    BudgieField(noteCol, { noteCol = it }, "Note", Modifier.weight(1f))
                }
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    BudgieField(categoryCol, { categoryCol = it }, "Category", Modifier.weight(1f))
                    BudgieField(subcategoryCol, { subcategoryCol = it }, "Subcategory", Modifier.weight(1f))
                }
                if (error != null) Text(error!!, color = Red, fontSize = 11.sp, modifier = Modifier.padding(top = 10.dp))
                Spacer(Modifier.height(14.dp))
                PrimaryButton("Save connection", modifier = Modifier.fillMaxWidth()) {
                    runCatching {
                        SheetConfig(
                            sheetId = ConfigParser.sheetId(sheetId),
                            sheetName = sheetName.ifBlank { "My budget" },
                            transactionsTab = txTab.ifBlank { "Transactions" },
                            metadataTab = metaTab.ifBlank { "@metadata" },
                            dataStartRow = startRow.toIntOrNull()?.coerceAtLeast(1) ?: 2,
                            writeEnabled = writable,
                            monthlyBudget = budget.toDoubleOrNull()?.takeIf { it > 0 } ?: 5_200.0,
                            mapping = ColumnMapping(
                                date = ConfigParser.column(dateCol, true),
                                amount = ConfigParser.column(amountCol, true),
                                note = ConfigParser.column(noteCol, false),
                                category = ConfigParser.column(categoryCol, false),
                                subcategory = ConfigParser.column(subcategoryCol, false),
                            ),
                        )
                    }.onSuccess(onSave).onFailure { error = it.message }
                }
            }
        }
        item {
            PaperCard {
                SectionHeading("Home screen", "2 widgets")
                Text("Month Pace mirrors the dashboard’s core budget card. Recent Spend keeps the last entries visible and opens straight into quick add.", color = Ink2, fontSize = 11.sp, lineHeight = 17.sp, modifier = Modifier.padding(vertical = 10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SecondaryButton("Add Month Pace", { WidgetPinning.requestPace(context) }, Modifier.weight(1f).testTag("pin_pace"))
                    SecondaryButton("Add Recent Spend", { WidgetPinning.requestRecent(context) }, Modifier.weight(1f).testTag("pin_recent"))
                }
            }
        }
        item {
            PaperCard {
                SectionHeading("About", "v${BuildConfig.VERSION_NAME}")
                Text("Native Compose client · Android 9+ · target API 36", color = Ink2, fontSize = 11.sp, modifier = Modifier.padding(top = 8.dp))
                Spacer(Modifier.height(12.dp))
                SecondaryButton("Disconnect this Sheet", onDisconnect, Modifier.fillMaxWidth(), danger = true)
            }
        }
    }
}

@Composable
private fun PaperCard(content: @Composable () -> Unit) {
    Surface(
        color = Card,
        shape = RoundedCornerShape(14.dp),
        shadowElevation = 2.dp,
        modifier = Modifier.fillMaxWidth().border(1.dp, Border, RoundedCornerShape(14.dp)),
    ) { Column(Modifier.padding(18.dp), content = { content() }) }
}

@Composable
private fun SectionHeading(title: String, detail: String) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(title, fontFamily = FontFamily.Serif, fontStyle = FontStyle.Italic, fontSize = 18.sp, color = Ink, modifier = Modifier.weight(1f))
        Text(detail, color = Ink3, fontSize = 9.sp, letterSpacing = .5.sp, textAlign = TextAlign.End)
    }
}

@Composable
private fun Eyebrow(text: String) {
    Text(text, color = Ink3, fontSize = 9.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.3.sp)
}

@Composable
private fun BudgieField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    minLines: Int = 1,
    keyboardType: KeyboardType = KeyboardType.Text,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label, fontSize = 12.sp) },
        minLines = minLines,
        singleLine = minLines == 1,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp),
        colors = fieldColors(),
    )
}

@Composable
private fun fieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = Blue,
    unfocusedBorderColor = Border,
    focusedContainerColor = Color.Transparent,
    unfocusedContainerColor = Color.Transparent,
    focusedLabelColor = Blue,
    unfocusedLabelColor = Ink3,
    cursorColor = Blue,
)

@Composable
private fun PrimaryButton(
    text: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier,
        shape = RoundedCornerShape(10.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Ink, contentColor = Card),
    ) { Text(text, fontWeight = FontWeight.SemiBold) }
}

@Composable
private fun SecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    danger: Boolean = false,
) {
    Button(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(10.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = if (danger) Red.copy(alpha = .1f) else Paper,
            contentColor = if (danger) Red else Blue,
        ),
        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 10.dp),
    ) { Text(text, fontSize = 11.sp, textAlign = TextAlign.Center) }
}

@Composable
private fun LoadingPane(message: String) {
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        CircularProgressIndicator(color = Blue, strokeWidth = 2.dp, modifier = Modifier.size(30.dp))
        Text(message, color = Ink3, fontSize = 12.sp, modifier = Modifier.padding(top = 14.dp))
    }
}

@Composable
private fun EmptyPane(message: String) {
    Column(Modifier.fillMaxWidth().padding(36.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("B", fontFamily = FontFamily.Serif, fontSize = 42.sp, color = Ink3.copy(alpha = .45f))
        Text(message, color = Ink3, fontSize = 13.sp, lineHeight = 19.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 8.dp))
    }
}
