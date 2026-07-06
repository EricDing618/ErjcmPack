// ============================================================
// 南京地铁二号线 PIDS（修正对齐 - 标签左置但右对齐）
// 本次列车/Arrival 和 开往/Dest. 左对齐放置，但文本右对齐，使得“车”与“往”对齐
// ============================================================

// ==================== 全局配置 ====================
const LANG_SWITCH_INTERVAL = 15000;

const COLOR_YELLOW = 0xFFD700;
const COLOR_RED    = 0xFF0000;
const COLOR_GREEN  = 0x32CD32;

const TOP_PADDING = 5;
const SIDE_PADDING = 3;
const ROW_HEIGHT = 23;
const LARGE_SCALE = 1.725;
const SMALL_SCALE = 1.0;

// 第二行标签宽度估算（仅用于计算终点站的可用区域，但不再需要因为终点站靠右）
// 但为了限制终点站宽度，我们保留区域计算
const LABEL_WIDTH_EST = 30;   // 可不使用

// ==================== 辅助函数 ====================

function getLocalizedName(stationName, isEnglish) {
    if (!stationName) return "未知";
    stationName = String(stationName);
    var idx = stationName.indexOf('|');
    if (idx === -1) idx = stationName.indexOf('｜');
    if (idx !== -1) {
        var before = stationName.substring(0, idx).trim();
        var after  = stationName.substring(idx + 1).trim();
        if (isEnglish) {
            return after !== "" ? after : before;
        } else {
            return before !== "" ? before : stationName;
        }
    }
    return stationName;
}

function getArrivalStatusText(arrivalTime, isEnglish) {
    var now = Date.now();
    var diffMs = arrivalTime - now;
    var diffSec = Math.floor(diffMs / 1000);

    if (diffSec <= 10) {
        return { text: isEnglish ? "Arrive" : "列车进站", isArriving: true };
    }
    if (diffSec < 60) {
        return { text: isEnglish ? "1 min" : "1分钟内到", isArriving: false };
    }
    var minutes = Math.floor(diffSec / 60);
    return { text: isEnglish ? minutes + " min" : minutes + "分钟到达", isArriving: false };
}

// ==================== 生命周期 ====================

function create(ctx, state, pids) {
    state.lang = "zh";
    state.lastSwitch = Date.now();
    print("南京地铁二号线 PIDS 已加载");
}

function render(ctx, state, pids) {
    var screenWidth = pids.width;
    var screenHeight = pids.height;

    var now = Date.now();
    if (now - state.lastSwitch >= LANG_SWITCH_INTERVAL) {
        state.lang = (state.lang === "zh") ? "en" : "zh";
        state.lastSwitch = now;
    }
    var isEnglish = (state.lang === "en");

    var arrivals = pids.arrivals();
    var firstArrival = arrivals.get(0);
    var secondArrival = arrivals.get(1);

    // ---- 第一行 ----
    var label1 = isEnglish ? "Arrival" : "本次列车";
    var labelColor = COLOR_YELLOW;  // 统一黄色

    // 标签：左对齐放置，但文本右对齐，使得文字右端对齐
    Text.create("第一行标签")
        .text(label1)
        .color(labelColor)
        .fontMC()
        .rightAlign()               // 文本右对齐
        .pos(SIDE_PADDING, TOP_PADDING)   // 位置靠左
        .scale(LARGE_SCALE)
        .draw(ctx);

    // 右侧状态：右对齐，靠右放置
    if (firstArrival != null) {
        var arrivalTime = firstArrival.arrivalTime();
        if (arrivalTime != null) {
            var status = getArrivalStatusText(arrivalTime, isEnglish);
            var statusColor = status.isArriving ? COLOR_RED : COLOR_YELLOW;
            Text.create("第一行状态")
                .text(status.text)
                .color(statusColor)
                .fontMC()
                .rightAlign()               // 右对齐
                .pos(screenWidth - SIDE_PADDING, TOP_PADDING) // 靠右
                .scale(LARGE_SCALE)
                .draw(ctx);
        }
    }

    // ---- 第二行 ----
    var label2 = isEnglish ? "Dest." : "开往";
    // 标签：同样左置右对齐
    Text.create("第二行标签")
        .text(label2)
        .color(labelColor)          // 黄色
        .fontMC()
        .rightAlign()
        .pos(SIDE_PADDING, TOP_PADDING + ROW_HEIGHT)
        .scale(LARGE_SCALE)
        .draw(ctx);

    // 终点站：右对齐靠右放置，并使用 stretchXY 防止过长
    if (firstArrival != null) {
        var dest = firstArrival.destination();
        if (dest != null) {
            var destName = getLocalizedName(dest, isEnglish);
            // 终点站显示在右侧，右对齐，但为了限制宽度，使用 size + stretchXY
            var areaWidth = screenWidth - SIDE_PADDING - SIDE_PADDING; // 预留左右边距，但实际可更宽
            // 为了不与左侧标签重叠，我们可以让终点站占满右侧区域，但为了安全，限制起始X为屏幕一半或更右
            // 因为标签是左置右对齐，终点站右置右对齐，它们之间可能有重叠，所以需要估算标签长度并错开。
            // 简单起见，我们让终点站从屏幕中间偏左开始，但右对齐，这样它的左边界会动态变化。
            // 更可靠的方式：使用左对齐并指定区域，确保不与标签重叠。
            // 但用户要求“本次列车、开往都在显示屏最左侧”，所以终点站应该在右侧。
            // 我们采用右对齐，并让位置在屏幕右侧，这样如果文本短则贴右，长则向左延伸，可能会覆盖标签。
            // 为避免覆盖，我们限制宽度并拉伸。
            // 我们使用 leftAlign 并指定起始X为标签右侧预估位置。
            // 但简单起见，我们使用右对齐并设置pos为屏幕宽度-SIDE_PADDING，同时使用size限制宽度。
            // 这样文本会从右向左延伸，但size会限制其最大宽度，超过则拉伸。
            var labelWidthGuess = 30; // 估算标签宽度
            var startX = SIDE_PADDING + labelWidthGuess; // 从标签右侧开始
            var availWidth = screenWidth - startX - SIDE_PADDING;
            if (availWidth < 20) availWidth = 20;
            Text.create("第二行终点站")
                .text(destName)
                .color(COLOR_RED)
                .fontMC()
                .leftAlign()               // 左对齐，从startX开始
                .pos(startX, TOP_PADDING + ROW_HEIGHT)
                .size(availWidth, ROW_HEIGHT)
                .stretchXY()               // 拉伸压缩
                .scale(LARGE_SCALE)
                .draw(ctx);
        }
    }

    // ---- 第三行 ----
    if (secondArrival != null) {
        var label3 = isEnglish ? "Next" : "下次列车";
        Text.create("第三行标签")
            .text(label3)
            .color(COLOR_GREEN)
            .fontMC()
            .leftAlign()
            .pos(SIDE_PADDING, TOP_PADDING + ROW_HEIGHT * 2)
            .scale(SMALL_SCALE)
            .draw(ctx);

        var secondTime = secondArrival.arrivalTime();
        if (secondTime != null) {
            var status2 = getArrivalStatusText(secondTime, isEnglish);
            var col2X = 24;
            Text.create("第三行时间")
                .text(status2.text)
                .color(COLOR_RED)
                .fontMC()
                .leftAlign()
                .pos(col2X, TOP_PADDING + ROW_HEIGHT * 2)
                .scale(SMALL_SCALE)
                .draw(ctx);
        }

        var label4 = isEnglish ? "Dest." : "开往";
        var col3X = 46;
        Text.create("第三行开往标签")
            .text(label4)
            .color(COLOR_YELLOW)
            .fontMC()
            .leftAlign()
            .pos(col3X, TOP_PADDING + ROW_HEIGHT * 2)
            .scale(SMALL_SCALE)
            .draw(ctx);

        var secondDest = secondArrival.destination();
        if (secondDest != null) {
            var destName2 = getLocalizedName(secondDest, isEnglish);
            var col4X = 64;
            var areaWidth2 = screenWidth - col4X - SIDE_PADDING;
            Text.create("第三行终点站")
                .text(destName2)
                .color(COLOR_RED)
                .fontMC()
                .leftAlign()
                .pos(col4X, TOP_PADDING + ROW_HEIGHT * 2)
                .size(areaWidth2, ROW_HEIGHT)
                .stretchXY()
                .scale(SMALL_SCALE)
                .draw(ctx);
        }
    }
}

function dispose(ctx, state, pids) {
    print("南京地铁二号线 PIDS 已卸载");
}