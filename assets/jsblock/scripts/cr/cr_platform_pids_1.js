// Made by EricDing618 & DeepSeek
// https://github.com/pyric-studio/ErjcmPack/
// MIT LICENSE

// ===== 全局配置 =====
var ROW_HEIGHT = 23;                // 每行高度（像素，用于第二、三行）
var WAIT_THRESHOLD = 120000;        // 列车到达WAIT_THRESHOLD毫秒前保持显示欢迎语
var HORIZONTAL_MARGIN = 15;         // 第一行左右边距（像素）
var WELCOME_MESSAGES = [            // 欢迎语列表，支持用半角分号“;”分隔多行
    "{车站名}站欢迎您",
    "祝您旅途愉快",
    "安全出行 温馨相伴",
    "温馨旅途 文明相伴",
    "诚信友善 文明出行",
    "旅途漫漫;文明相伴",
    "不忘初心 牢记使命;交通强国 铁路先行",
    "站台严禁;竖立高举杆状物品;骑行平衡车、滑板等",
    "擅自跳入股道危险且违法;将追究法律责任",
    "站台禁止吸烟;严禁将烟蒂扔入股道",
    "讲文明 树新风;有序乘车 文明出行",
    "站台边缘危险;请勿越过安全白线;请搀好儿童 拿好行李箱",
    "自信自强 守正创新;踔厉奋发 勇毅前行"
];
var MAX_STATIC_CHARS = 16;          // 第三行静态显示时允许的最大字符数（不勾选“隐藏到站资料”时生效）

// ===== 第二行控制参数 =====
var STATION_SPACING = 2;           // 始发站/终点站与“开往”之间的固定像素距离
var MAX_STATION_CHARS = 5;          // 站名字符数超过此值时启用走马灯
var KAWANG_OFFSET = 20;             // “开往”文本半宽度的固定估计值（像素），根据字体大小调整

// ===== 辅助函数（保持不变）=====
function removeTrailingStation(name) {
    if (typeof name !== 'string' || name.length === 0) return name || "未知";
    if (name === "未知") return name;
    if (name.charAt(name.length - 1) === '站') {
        return name.substring(0, name.length - 1);
    }
    return name;
}

function splitStationName(fullName) {
    if (!fullName || fullName === "") return "未知";
    fullName = String(fullName);
    var idx = fullName.indexOf('|');
    if (idx === -1) idx = fullName.indexOf('｜');
    if (idx !== -1) {
        var firstPart = fullName.substring(0, idx);
        return firstPart !== "" ? firstPart : "未知";
    }
    return fullName;
}

function getOriginStation(arrival) {
    try {
        var route = arrival.route();
        if (route == null) return "未知";
        var platforms = route.getPlatforms();
        if (platforms == null || platforms.size() == 0) return "未知";
        var firstPlatform = platforms.get(0);
        var rawName = firstPlatform.getStationName() || "未知";
        return splitStationName(rawName);
    } catch (e) {
        print("获取始发站失败: " + e);
        return "未知";
    }
}

function formatTime(timestamp) {
    if (!timestamp) return "--:--";
    var date = new Date(timestamp);
    var hours = date.getHours().toString().padStart(2, '0');
    var minutes = date.getMinutes().toString().padStart(2, '0');
    return hours + ":" + minutes;
}

function getRandomWelcome(stationName) {
    var shortStation = splitStationName(stationName);
    shortStation = removeTrailingStation(shortStation);

    var available = [];
    if (shortStation === "本站" || shortStation === "未知" || shortStation === "") {
        for (var i = 0; i < WELCOME_MESSAGES.length; i++) {
            if (WELCOME_MESSAGES[i].indexOf("{车站名}") === -1) {
                available.push(WELCOME_MESSAGES[i]);
            }
        }
        if (available.length === 0) available = ["祝您旅途愉快"];
    } else {
        available = WELCOME_MESSAGES.slice();
    }
    var randomIndex = Math.floor(Math.random() * available.length);
    var template = available[randomIndex];
    var lines = template.split(';');
    var resultLines = [];
    for (var l = 0; l < lines.length; l++) {
        var line = lines[l];
        var parts = line.split("{车站名}");
        var replaced = "";
        for (var i = 0; i < parts.length; i++) {
            replaced += parts[i];
            if (i < parts.length - 1) replaced += shortStation;
        }
        resultLines.push(replaced);
    }
    return resultLines;
}

function processCustomMessage(msg, pids) {
    if (!msg) return "";
    var station = pids.station();
    var stationName = station ? splitStationName(station.getName()) : "本站";
    var result = "";
    var lastIndex = 0;
    var searchStr = "{station}";
    var idx = msg.indexOf(searchStr);
    while (idx !== -1) {
        result += msg.substring(lastIndex, idx);
        result += stationName;
        lastIndex = idx + searchStr.length;
        idx = msg.indexOf(searchStr, lastIndex);
    }
    result += msg.substring(lastIndex);
    return result;
}

// ===== 主渲染函数 =====
function render(ctx, state, pids) {
    var screenWidth = pids.width;
    var screenHeight = pids.height;
    var rows = pids.rows;

    var stationObj = pids.station();
    var stationName = stationObj ? stationObj.getName() : "本站";

    var firstArrival = pids.arrivals().get(0);
    var hasTrain = (firstArrival != null);

    var waitTime = 0;
    if (hasTrain) {
        var arrivalTime = firstArrival.arrivalTime();
        if (arrivalTime) {
            waitTime = arrivalTime - Date.now();
        }
    }

    var shouldShowWelcome = (!hasTrain) || (hasTrain && waitTime > WAIT_THRESHOLD);

    if (shouldShowWelcome) {
        // ===== 欢迎语（不变）=====
        var now = Date.now();
        if (!state.lastWelcomeChange || (now - state.lastWelcomeChange >= 18000)) {
            var stationNameForWelcome = stationObj ? stationObj.getName() : "本站";
            state.welcomeLines = getRandomWelcome(stationNameForWelcome);
            state.lastWelcomeChange = now;
        }
        var welcomeLines = state.welcomeLines;
        if (welcomeLines && welcomeLines.length > 0) {
            var lineSpacing = 16;
            var totalHeight = welcomeLines.length * lineSpacing;
            var startY = (screenHeight - totalHeight) / 2;
            for (var i = 0; i < welcomeLines.length; i++) {
                Text.create("Welcome line " + i)
                    .text(welcomeLines[i])
                    .color(0xFF0000)
                    //.bold()
                    .centerAlign()
                    .pos(screenWidth / 2, startY + i * lineSpacing)
                    .scale(1.3)
                    .draw(ctx);
            }
        } else {
            Text.create("fallback_welcome")
                .text("祝您旅途愉快！")
                .color(0xFF0000)
                //.bold()
                .centerAlign()
                .pos(screenWidth / 2, screenHeight / 2)
                .draw(ctx);
        }
    } else {
        // ===== 正常显示三行 =====

        // --- 第一行：车次左对齐，时间右对齐（不变）---
        if (hasTrain) {
            var trainNumber = firstArrival.routeNumber() || "??";
            var depTime = firstArrival.departureTime() || firstArrival.arrivalTime();
            var timeStr = formatTime(depTime);
            var leftText = trainNumber + " 次";
            var rightText = timeStr + " 开";

            Text.create("First line left")
                .text(leftText)
                .color(0x00FF00)
                .leftAlign()
                .pos(HORIZONTAL_MARGIN, 5)
                .scale(1.5)
                .draw(ctx);
            Text.create("First line right")
                .text(rightText)
                .color(0x00FF00)
                .rightAlign()
                .pos(screenWidth - HORIZONTAL_MARGIN, 5)
                .scale(1.5)
                .draw(ctx);
        } else {
            Text.create("First line")
                .text("暂无列车信息")
                .color(0x666666)
                .centerAlign()
                .pos(screenWidth / 2, 5)
                .draw(ctx);
        }

        // --- 第二行：始发站 + “开往”居中 + 终点站（独立走马灯）---
        if (hasTrain) {
            var originRaw = getOriginStation(firstArrival);
            var destRaw = firstArrival.destination();
            var destRawSplit = destRaw ? splitStationName(destRaw) : "未知";
            var origin = removeTrailingStation(originRaw);
            var dest = removeTrailingStation(destRawSplit);
            
            var scaleSecond = 1.3;
            var kaiwangText = "开往";
            var yPos = ROW_HEIGHT;

            // 使用固定偏移估计“开往”的半宽度
            var centerX = screenWidth / 2;
            var kaiwangLeft = centerX - KAWANG_OFFSET;
            var kaiwangRight = centerX + KAWANG_OFFSET;

            // 计算站名锚点（边界位置）
            var originBoundary = kaiwangLeft - STATION_SPACING;   // 始发站右边界（右对齐）
            var destBoundary   = kaiwangRight + STATION_SPACING;  // 终点站左边界（左对齐）

            // ---- 绘制始发站 ----
            if (origin.length <= MAX_STATION_CHARS) {
                // 静态短文本：保持 2px 间距
                Text.create("Second origin")
                    .text(origin)
                    .color(0xFFFF00)
                    .rightAlign()
                    .pos(originBoundary, yPos)
                    .scale(scaleSecond)
                    .draw(ctx);
            } else {
                // 走马灯长文本：使用较大的间距（例如 20px）
                var MARQUEE_SPACING = 20;           // 可根据视觉调整
                var marqueeRightBound = kaiwangLeft - MARQUEE_SPACING;
                var leftBound = HORIZONTAL_MARGIN;
                var areaWidth = marqueeRightBound - leftBound;
                if (areaWidth < 20) areaWidth = 20;
                Text.create("Second origin marquee")
                    .text(origin)
                    .color(0xFFFF00)
                    .leftAlign()
                    .pos(leftBound, yPos)
                    .size(areaWidth, ROW_HEIGHT)
                    .scale(scaleSecond)
                    .marquee()
                    .draw(ctx);
}
            // ---- 绘制终点站 ----
            if (dest.length <= MAX_STATION_CHARS) {
                // 静态左对齐
                Text.create("Second dest")
                    .text(dest)
                    .color(0xFFFF00)
                    .leftAlign()
                    .pos(destBoundary, yPos)
                    .scale(scaleSecond)
                    .draw(ctx);
            } else {
                // 走马灯：区域为 [destBoundary, screenWidth - HORIZONTAL_MARGIN]
                var rightBound = screenWidth - HORIZONTAL_MARGIN*2;
                var areaWidth = rightBound - destBoundary;
                if (areaWidth < 20) areaWidth = 20;
                Text.create("Second dest marquee")
                    .text(dest)
                    .color(0xFFFF00)
                    .leftAlign()
                    .pos(destBoundary, yPos)
                    .size(areaWidth, ROW_HEIGHT)
                    .scale(scaleSecond)
                    .marquee()
                    .draw(ctx);
            }

            // ---- 绘制居中的“开往”（始终静态） ----
            Text.create("Second kaiwang")
                .text(kaiwangText)
                .color(0xFFFF00)
                .centerAlign()
                .pos(centerX, yPos)
                .scale(scaleSecond)
                .draw(ctx);
        }

        // --- 第三行：自定义消息（受“隐藏到站资料”勾选框影响）---
        if (rows >= 3) {
            // 获取自定义消息，若为空则使用 fallback
            var customMsg = pids.getCustomMessage(2);
            var thirdLineContent = "";
            if (customMsg && customMsg.trim() !== "") {
                // 有自定义消息则替换占位符
                thirdLineContent = processCustomMessage(customMsg, pids);
                // 如果替换后意外为空，也 fallback
                if (!thirdLineContent || thirdLineContent.trim() === "") {
                    thirdLineContent = "请您看管好携带的儿童，请勿在站台边、车门处停留、玩耍，避免发生危险";
                }
            } else {
                // 没有自定义消息，直接使用 fallback
                thirdLineContent = "请您看管好携带的儿童，请勿在站台边、车门处停留、玩耍，避免发生危险";
            }

            // 使用官方 API 检查第三行是否被隐藏（即勾选了“隐藏到站资料”）
            var hideInfo = pids.isRowHidden(2);   // 索引从0开始，第三行索引为2
            var yPos3 = ROW_HEIGHT * 2;

            if (hideInfo) {
                // 勾选时强制走马灯
                Text.create("Third line marquee forced")
                    .text(thirdLineContent)
                    .color(0xFFFF00)
                    .leftAlign()
                    .pos(HORIZONTAL_MARGIN, yPos3)
                    .size(screenWidth - HORIZONTAL_MARGIN * 2, ROW_HEIGHT)
                    .marquee()
                    .draw(ctx);
            } else {
                // 未勾选：短则居中，长则走马灯
                if (thirdLineContent.length <= MAX_STATIC_CHARS) {
                    Text.create("Third line")
                        .text(thirdLineContent)
                        .color(0xFFFF00)
                        .centerAlign()
                        .pos(screenWidth / 2, yPos3)
                        .draw(ctx);
                } else {
                    Text.create("Third line marquee")
                        .text(thirdLineContent)
                        .color(0xFFFF00)
                        .leftAlign()
                        .pos(HORIZONTAL_MARGIN, yPos3)
                        .size(screenWidth - HORIZONTAL_MARGIN * 2, ROW_HEIGHT)
                        .marquee()
                        .draw(ctx);
                }
            }
        }
    }
}

// ===== 生命周期函数（不变）=====
function create(ctx, state, pids) {
    print("国铁站台PIDS已创建，GitHub: pyric-studio/ErjcmPack");
    var station = pids.station();
    var stationName = station ? station.getName() : "本站";
    state.lastWelcomeChange = Date.now();
    state.welcomeLines = getRandomWelcome(stationName);
    //print("生成的欢迎语行数: " + state.welcomeLines.length);
    //for (var i = 0; i < state.welcomeLines.length; i++) {
        //print("  行" + i + ": " + state.welcomeLines[i]);
    //}
}

function dispose(ctx, state, pids) {
    print("国铁站台PIDS已销毁");
}