// ============================================================
// 南京地铁二号线 PIDS（英文站名大写且去空格）
// 第一二行布局保持不变，第三行所有X坐标集中管理
// ============================================================

const LANG_SWITCH_INTERVAL = 15000;
const COLOR_YELLOW = 0xFFD700;
const COLOR_RED    = 0xFF0000;
const COLOR_GREEN  = 0x32CD32;

const TOP_PADDING = 5;
const SIDE_PADDING = 3;
const ROW_HEIGHT = 23;
const LARGE_SCALE = 1.725;
const SMALL_SCALE = 1.0;

// 左标签右对齐锚点（第一二行标签的右端对齐位置）
const LEFT_LABEL_ANCHOR = 70;   // 调整此值可整体左右移动第一二行标签

// ===== 第三行各元素X坐标（可单独调整） =====
const THIRD_ROW_Y = TOP_PADDING + ROW_HEIGHT * 2;   // 第三行Y坐标（固定）

// 元素1：“下次列车/Next”（绿色）
const THIRD_COL1_X = SIDE_PADDING;    // 默认3

// 元素2：到达剩余时间（红色）
const THIRD_COL2_X = 45;              // 调整此值移动时间文本

// 元素3：“开往/Dest.”（黄色）
const THIRD_COL3_X = 100;              // 调整此值移动“开往”

// 元素4：终点站名（红色，自动拉伸压缩）
const THIRD_COL4_X = 130;              // 调整此值移动终点站起始位置

// ===== 辅助函数（不变）=====
function getLocalizedName(stationName, isEnglish) {
    if (!stationName) return "未知站";
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
    return { text: isEnglish ? minutes + " min" : minutes + " 分钟到达", isArriving: false };
}

function create(ctx, state, pids) {
    state.lang = "zh";
    state.lastSwitch = Date.now();
    print("南京地铁二号线 PIDS 已加载，GitHub: pyric-studio/ErjcmPack");
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

    // ---- 第一行（保持不变） ----
    var label1 = isEnglish ? "Arrival" : "本次列车";
    Text.create("第一行标签")
        .text(label1)
        .color(COLOR_YELLOW)
        .fontMC()
        .rightAlign()
        .pos(LEFT_LABEL_ANCHOR, TOP_PADDING)
        .scale(LARGE_SCALE)
        .draw(ctx);

    if (firstArrival != null) {
        var arrivalTime = firstArrival.arrivalTime();
        if (arrivalTime != null) {
            var status = getArrivalStatusText(arrivalTime, isEnglish);
            var statusColor = status.isArriving ? COLOR_RED : COLOR_YELLOW;
            Text.create("第一行状态")
                .text(status.text)
                .color(statusColor)
                .fontMC()
                .rightAlign()
                .pos(screenWidth - SIDE_PADDING, TOP_PADDING)
                .scale(LARGE_SCALE)
                .draw(ctx);
        }
    }

    // ---- 第二行（保持不变） ----
    var label2 = isEnglish ? "Dest." : "开往";
    Text.create("第二行标签")
        .text(label2)
        .color(COLOR_YELLOW)
        .fontMC()
        .rightAlign()
        .pos(LEFT_LABEL_ANCHOR, TOP_PADDING + ROW_HEIGHT)
        .scale(LARGE_SCALE)
        .draw(ctx);

    if (firstArrival != null) {
        var dest = firstArrival.destination();
        if (dest != null) {
            var destName = getLocalizedName(dest, isEnglish);
            // 英文站名转大写并移除空格
            if (isEnglish) destName = destName.toUpperCase().replace(/ /g, '');

            var rightInfoStartX = LEFT_LABEL_ANCHOR + 10;
            var availableWidth = screenWidth - SIDE_PADDING - rightInfoStartX;
            var MAX_DEST_WIDTH = 60;
            availableWidth = Math.min(availableWidth, MAX_DEST_WIDTH);
            if (availableWidth < 20) availableWidth = 20;
            Text.create("第二行终点站")
                .text(destName)
                .color(COLOR_RED)
                .fontMC()
                .leftAlign()
                .pos(rightInfoStartX, TOP_PADDING + ROW_HEIGHT)
                .size(availableWidth, ROW_HEIGHT)
                .stretchXY()
                .scale(LARGE_SCALE)
                .draw(ctx);
        }
    }

    // ---- 第三行（使用可调常量） ----
    if (secondArrival != null) {
        var label3 = isEnglish ? "Next" : "下次列车";
        Text.create("第三行标签")
            .text(label3)
            .color(COLOR_GREEN)
            .fontMC()
            .leftAlign()
            .pos(THIRD_COL1_X, THIRD_ROW_Y)
            .scale(SMALL_SCALE)
            .draw(ctx);

        var secondTime = secondArrival.arrivalTime();
        if (secondTime != null) {
            var status2 = getArrivalStatusText(secondTime, isEnglish);
            Text.create("第三行时间")
                .text(status2.text)
                .color(COLOR_RED)
                .fontMC()
                .leftAlign()
                .pos(THIRD_COL2_X, THIRD_ROW_Y)
                .scale(SMALL_SCALE)
                .draw(ctx);
        }

        var label4 = isEnglish ? "Dest." : "开往";
        Text.create("第三行开往标签")
            .text(label4)
            .color(COLOR_YELLOW)
            .fontMC()
            .leftAlign()
            .pos(THIRD_COL3_X, THIRD_ROW_Y)
            .scale(SMALL_SCALE)
            .draw(ctx);

        var secondDest = secondArrival.destination();
        if (secondDest != null) {
            var destName2 = getLocalizedName(secondDest, isEnglish);
            // 英文站名转大写并移除空格
            if (isEnglish) destName2 = destName2.toUpperCase().replace(/ /g, '');

            var areaWidth2 = screenWidth - THIRD_COL4_X - SIDE_PADDING;
            Text.create("第三行终点站")
                .text(destName2)
                .color(COLOR_RED)
                .fontMC()
                .leftAlign()
                .pos(THIRD_COL4_X, THIRD_ROW_Y)
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