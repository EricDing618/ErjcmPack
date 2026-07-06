// Made by EricDing618 & DeepSeek

var CONFIG = {
    // ----- 颜色配置 -----
    backgroundColor: 0x1a1a3e,      // 屏幕背景色（深蓝紫色，十六进制颜色值）
    primaryTextColor: 0xd0d0d0,     // 表头及普通文字颜色（浅灰色/白色）
    headerBgColor: 0x0d0d2b,        // 表头背景色（深色）
    rowEvenColor: 0x1e1e4a,         // 偶数行背景色（深蓝紫色）
    rowOddColor: 0x2a2a5a,          // 奇数行背景色（略亮，形成斑马纹）
    bottomLeftColor: 0x00ff66,      // 底部左侧标语颜色（亮绿色）
    bottomRightColor: 0xff4444,     // 底部右侧时间颜色（红色）

    // ----- 文字处理 -----
    removeStationSuffix: true,      // true = 站名去掉“站”字（如“东昌北站”→“东昌北”）

    // ----- 状态保留时间（毫秒）-----
    departedRetentionMs: 6000,      // 【停止检票】后保留时间（毫秒），6000ms = 6秒
    terminatedRetentionMs: 10000,   // 【到达】后保留时间（毫秒），10000ms = 10秒

    // ----- 调试 -----
    DEBUG: false,                    // true = 启用调试输出（在游戏日志中打印列车信息）
    debugInterval: 10000,           // 调试输出间隔（毫秒），10000ms = 10秒

    // ----- 布局核心参数 -----
    fixedRows: 5,                   // 默认显示行数（当第三行动态控制无效时使用）
    showHeader: true,               // 默认是否显示表头（第一行隐藏控制可覆盖）

    rowHeight: 16,                  // 每行数据的高度（像素）
    headerHeight: 22,               // 表头高度（像素）
    paddingLeft: 8,                 // 表格左侧内边距（像素）
    paddingRight: 12,               // 表格右侧内边距（像素）

    // 固定列宽（像素）顺序：车次, 始发站, 终到站, 开点, 站台, 状态
    colWidths: [50, 110, 110, 45, 35, 55],

    // 列间距（像素）顺序：车次-始发, 始发-终到, 终到-开点, 开点-站台, 站台-状态
    colGaps: [25, 25, 20, 20, 20],

    // 整行着色开关（当第二行未勾选时强制开启）
    rowColorByStatus: true,         // true = 整行文字跟随状态颜色（正点黄、晚点红等）

    // ----- 底部信息 -----
    bottomText: '开车前3分钟检票，前1分钟停止检票',  // 默认底部标语（当第四行隐藏时显示）
    bottomTextScale: 0.55,          // 底部文字缩放比例（0.55 = 55% 大小）

    // ----- 站名截断 -----
    maxStationNameLength: 6,        // ★ 站名（去掉“站”后）超过此长度时显示“...”，例如“乌鲁木齐”长度4不截断，若超过6则截断
};

// ---- 截断函数 ----
function truncateName(name, maxLen) {
    if (!name || name === '') return name;
    if (name.length <= maxLen) return name;
    // 保留至少 1 个字符 + "..."
    var keep = Math.max(1, maxLen - 3);
    return name.substring(0, keep) + '...';
}

function parseStationName(name) {
    if (name == null || name === '') return '';
    var str = String(name);
    var parts = str.split(/[|｜]/);
    var chinese = parts[0].trim();
    if (CONFIG.removeStationSuffix && chinese.endsWith('站')) {
        chinese = chinese.slice(0, -1);
    }
    return chinese;
}

function getOriginStation(arrival) {
    try {
        var route = arrival.route();
        if (!route) return '未知';
        var platforms = route.getPlatforms();
        if (!platforms || platforms.size() === 0) return '未知';
        var firstPlatform = platforms.get(0);
        var rawName = firstPlatform.getStationName() || '未知';
        return parseStationName(rawName);
    } catch (e) {
        print('获取始发站失败: ' + e);
        return '未知';
    }
}

function getFormattedTime() {
    var now = new Date();
    var pad = function(n) { return String(n).padStart(2, '0'); };
    return now.getFullYear() + '/' + pad(now.getMonth() + 1) + '/' + pad(now.getDate()) +
        ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
}

function getDelayMinutes(deviationMs) {
    if (deviationMs <= 0) return 0;
    return Math.ceil(deviationMs / 60000);
}

function render(ctx, state, pids) {
    var currentTime = Date.now();
    var screenWidth = pids.width;
    var screenHeight = pids.height;

    Text.create('background')
        .text(' ')
        .pos(0, 0)
        .size(screenWidth, screenHeight)
        .color(CONFIG.backgroundColor)
        .stretchXY()
        .draw(ctx);

    // ---- 动态控制 ----
    var hideRow0 = pids.isRowHidden(0);
    var showHeader = !hideRow0;

    var hideRow1 = pids.isRowHidden(1);

    var hideRow2 = pids.isRowHidden(2);
    var customMsg2 = pids.getCustomMessage(2) || '';
    var fixedRows = CONFIG.fixedRows;
    if (!hideRow2) {
        var num = parseInt(customMsg2, 10);
        if (!isNaN(num) && num > 0) fixedRows = num;
    }

    var customMsg0 = (pids.getCustomMessage(0) || '').toLowerCase();
    var customMsg1 = (pids.getCustomMessage(1) || '').toLowerCase();
    var enableHideOrigin = (customMsg0.indexOf('true') !== -1);
    var enableHideDest   = (customMsg1.indexOf('true') !== -1);

    var stationObj = pids.station();
    var stationName = stationObj ? parseStationName(stationObj.getName()) : '';

    // ---- 缓存管理 ----
    if (!state.cache) state.cache = [];
    state.cache = state.cache.filter(function(item) {
        var retention = (item.status === '停止检票') ? CONFIG.departedRetentionMs : CONFIG.terminatedRetentionMs;
        return (currentTime - item.cacheTime) <= retention;
    });

    var arrivals = pids.arrivals();
    var allTrains = [];
    var processedKeys = {};

    // 调试输出（间隔控制）
    if (CONFIG.DEBUG) {
        var now = Date.now();
        if (!state._lastDebugTime || (now - state._lastDebugTime) >= CONFIG.debugInterval) {
            state._lastDebugTime = now;
            var count = 0;
            try {
                count = arrivals.size();
            } catch(e) {
                for (var i = 0; i < 20; i++) {
                    if (arrivals.get(i)) count = i + 1;
                    else break;
                }
            }
            print('===== 调试 (列车数: ' + count + ') =====');
            if (count > 0) {
                for (var i = 0; i < count; i++) {
                    var entry = arrivals.get(i);
                    if (!entry) continue;
                    print('#' + i + ' 车次:' + (entry.routeNumber() || '--') +
                          ' 目的地:' + (entry.destination() || '--') +
                          ' 站台:' + (entry.platformName() || '--') +
                          ' 终到:' + entry.terminating() +
                          ' 实时:' + entry.realtime() +
                          ' 偏差:' + (entry.deviation() || 0));
                }
            } else {
                print('无列车');
            }
            print('===== 调试结束 =====');
            print('缓存大小: ' + state.cache.length);
            print('表头显示: ' + (showHeader ? '开启' : '关闭'));
            print('显示行数: ' + fixedRows);
            print('隐藏始发本站: ' + enableHideOrigin);
            print('隐藏终到本站: ' + enableHideDest);
        }
    }

    function makeKey(routeNumber, destination, platform, departureTime) {
        var d = new Date(departureTime);
        var timeStr = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        return routeNumber + '|' + destination + '|' + platform + '|' + timeStr;
    }

    // 处理 arrivals
    if (arrivals) {
        var count = 0;
        try {
            count = arrivals.size();
        } catch(e) {
            for (var i = 0; i < 20; i++) {
                if (arrivals.get(i)) count = i + 1;
                else break;
            }
        }
        for (var i = 0; i < count; i++) {
            var entry = arrivals.get(i);
            if (!entry) continue;

            var destination = entry.destination() || '';
            var departureTime = entry.departureTime();
            var deviationMs = entry.deviation() || 0;
            var isRealtime = entry.realtime();
            var isTerminating = entry.terminating();
            var platform = entry.platformName() || '';
            var routeNumber = entry.routeNumber() || '';

            var status = '';
            var statusColor = CONFIG.primaryTextColor;
            var skip = false;

            if (isTerminating) {
                var actualTime = departureTime;
                if (typeof entry.arrivalTime === 'function') {
                    actualTime = entry.arrivalTime();
                } else if (isRealtime) {
                    actualTime = departureTime + deviationMs;
                }
                if (currentTime > actualTime + CONFIG.terminatedRetentionMs) {
                    skip = true;
                } else {
                    if (currentTime >= actualTime) {
                        status = '到达';
                        statusColor = 0x00ff44;
                    } else {
                        if (isRealtime && deviationMs > 60000) {
                            var delayMin = getDelayMinutes(deviationMs);
                            status = '晚点' + delayMin + '分';
                            statusColor = 0xFF0000;
                        } else {
                            status = '正点';
                            statusColor = 0xFFFF00;
                        }
                    }
                }
            } else {
                var actualDep = departureTime;
                if (isRealtime) actualDep = departureTime + deviationMs;
                if (currentTime > actualDep) {
                    if (currentTime <= actualDep + CONFIG.departedRetentionMs) {
                        status = '停止检票';
                        statusColor = 0xFF0000;
                    } else {
                        skip = true;
                    }
                } else {
                    var remaining = actualDep - currentTime;
                    if (isRealtime && deviationMs > 60000) {
                        var delayMin = getDelayMinutes(deviationMs);
                        status = '晚点' + delayMin + '分';
                        statusColor = 0xFF0000;
                    } else if (remaining <= 60000) {
                        status = '正在检票';
                        statusColor = 0x00ff44;
                    } else {
                        status = '正点';
                        statusColor = 0xFFFF00;
                    }
                }
            }

            if (skip) continue;

            var origin = parseStationName(getOriginStation(entry));
            var dest = parseStationName(destination);
            var plat = parseStationName(platform);

            if (enableHideOrigin && origin === stationName) continue;
            if (enableHideDest && dest === stationName) continue;

            if (enableHideOrigin && status === '正在检票') {
                status = '到达';
                statusColor = 0x00ff44;
            }
            if (enableHideDest && status === '到达') {
                status = '正在检票';
                statusColor = 0x00ff44;
            }

            var key = makeKey(routeNumber, destination, platform, departureTime);
            if (processedKeys[key]) continue;
            processedKeys[key] = true;

            if (status === '停止检票' || status === '到达') {
                var cachedItem = null;
                for (var c = 0; c < state.cache.length; c++) {
                    if (state.cache[c].key === key) {
                        cachedItem = state.cache[c];
                        break;
                    }
                }
                if (cachedItem) {
                    cachedItem.status = status;
                    cachedItem.statusColor = statusColor;
                    cachedItem.cacheTime = currentTime;
                } else {
                    state.cache.push({
                        key: key,
                        routeNumber: routeNumber,
                        origin: origin,
                        destination: dest,
                        departureTime: departureTime,
                        platform: plat,
                        status: status,
                        statusColor: statusColor,
                        cacheTime: currentTime,
                    });
                }
            }

            allTrains.push({
                routeNumber: routeNumber,
                origin: origin,
                destination: dest,
                departureTime: departureTime,
                platform: plat,
                status: status,
                statusColor: statusColor,
                isTerminating: isTerminating,
                key: key,
            });
        }
    }

    // 从缓存添加（同样应用过滤和状态转换）
    for (var cIdx = 0; cIdx < state.cache.length; cIdx++) {
        var cached = state.cache[cIdx];
        var key = cached.key;
        if (processedKeys[key]) continue;
        var retention = (cached.status === '停止检票') ? CONFIG.departedRetentionMs : CONFIG.terminatedRetentionMs;
        if ((currentTime - cached.cacheTime) > retention) continue;

        if (enableHideOrigin && cached.origin === stationName) continue;
        if (enableHideDest && cached.destination === stationName) continue;

        var status = cached.status;
        var statusColor = cached.statusColor;
        if (enableHideOrigin && status === '正在检票') {
            status = '到达';
            statusColor = 0x00ff44;
        }
        if (enableHideDest && status === '到达') {
            status = '正在检票';
            statusColor = 0x00ff44;
        }

        allTrains.push({
            routeNumber: cached.routeNumber,
            origin: cached.origin,
            destination: cached.destination,
            departureTime: cached.departureTime,
            platform: cached.platform,
            status: status,
            statusColor: statusColor,
            isTerminating: false,
            key: key,
        });
        processedKeys[key] = true;
    }

    allTrains.sort(function(a, b) {
        return a.departureTime - b.departureTime;
    });

    // ---- 布局计算 ----
    var paddingLeft = CONFIG.paddingLeft;
    var paddingRight = CONFIG.paddingRight;
    var headerHeight = CONFIG.headerHeight;
    var rowHeight = CONFIG.rowHeight;

    var colWidths = CONFIG.colWidths.slice();
    var colGaps = CONFIG.colGaps.slice();

    var totalColWidth = 0;
    for (var i = 0; i < colWidths.length; i++) totalColWidth += colWidths[i];
    var totalGaps = 0;
    for (var i = 0; i < colGaps.length; i++) totalGaps += colGaps[i];

    var availableWidth = screenWidth - paddingLeft - paddingRight;
    var neededWidth = totalColWidth + totalGaps;
    var scale = 1.0;
    if (neededWidth > availableWidth) {
        scale = availableWidth / neededWidth;
        for (var i = 0; i < colWidths.length; i++) colWidths[i] = Math.floor(colWidths[i] * scale);
        totalColWidth = 0;
        for (var i = 0; i < colWidths.length; i++) totalColWidth += colWidths[i];
        neededWidth = totalColWidth + totalGaps;
    }

    var tableLeft = paddingLeft;
    var tableRight = paddingLeft + neededWidth;

    var colLabels = ['车次', '始发站', '终到站', '开点', '站台', '状态'];
    var colKeys = ['route', 'origin', 'dest', 'time', 'platform', 'status'];

    var displayTrains = allTrains.slice(0, fixedRows);
    while (displayTrains.length < fixedRows) {
        displayTrains.push({
            isEmpty: true,
            routeNumber: '',
            origin: '',
            destination: '',
            departureTime: 0,
            platform: '',
            status: '',
            statusColor: CONFIG.primaryTextColor,
            isTerminating: false,
            key: null,
        });
    }

    // ---- 绘制 ----
    if (showHeader) {
        var headerY = 0;
        Text.create('header_bg')
            .text(' ')
            .pos(0, headerY)
            .size(screenWidth, headerHeight)
            .color(CONFIG.headerBgColor)
            .stretchXY()
            .draw(ctx);

        var xPos = paddingLeft;
        for (var h = 0; h < colLabels.length; h++) {
            var textY = headerY + (headerHeight - rowHeight) / 2 + 2;
            Text.create('header_' + colKeys[h])
                .text(colLabels[h])
                .pos(xPos, textY)
                .color(CONFIG.primaryTextColor)
                .scale(0.8)
                .draw(ctx);
            xPos += colWidths[h];
            if (h < colGaps.length) xPos += colGaps[h];
        }
    }

    var dataStartY = showHeader ? headerHeight : 0;

    for (var idx = 0; idx < displayTrains.length; idx++) {
        var train = displayTrains[idx];
        var rowY = dataStartY + idx * rowHeight;
        var bgColor = (idx % 2 === 0) ? CONFIG.rowEvenColor : CONFIG.rowOddColor;
        Text.create('row_bg_' + idx)
            .text(' ')
            .pos(0, rowY - 1)
            .size(screenWidth, rowHeight + 1)
            .color(bgColor)
            .stretchXY()
            .draw(ctx);

        if (train.isEmpty) continue;

        var x = paddingLeft;
        var rowColor = hideRow1 ? CONFIG.primaryTextColor : train.statusColor;

        // ★ 对站名应用截断（基于去掉“站”后的名称）
        var displayOrigin = truncateName(train.origin, CONFIG.maxStationNameLength);
        var displayDest   = truncateName(train.destination, CONFIG.maxStationNameLength);

        var rowData = [
            (train.routeNumber || '').slice(0, 6),
            displayOrigin,
            displayDest,
            (function() {
                if (!train.departureTime) return '';
                var d = new Date(train.departureTime);
                return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
            })(),
            (train.platform || '').slice(0, 4),
            train.status
        ];

        for (var d = 0; d < rowData.length; d++) {
            var color = (d === 5) ? train.statusColor : rowColor;
            Text.create('row_' + idx + '_' + colKeys[d])
                .text(rowData[d])
                .pos(x, rowY)
                .color(color)
                .scale(0.75)
                .draw(ctx);
            x += colWidths[d];
            if (d < colGaps.length) x += colGaps[d];
        }
    }

    // ---- 底部信息 ----
    var hideRow3 = pids.isRowHidden(3);
    var customMsg3 = pids.getCustomMessage(3);

    var bottomDisplayText = '';
    if (hideRow3) {
        bottomDisplayText = CONFIG.bottomText;
    } else {
        if (customMsg3 && customMsg3.trim() !== '') {
            bottomDisplayText = customMsg3;
        } else {
            bottomDisplayText = '';
        }
    }

    var dataBottom = dataStartY + fixedRows * rowHeight;

    if (bottomDisplayText && bottomDisplayText.trim() !== '') {
        var dividerY = dataBottom + 2;
        var bottomTextY = dividerY + 2 + 3;
        var bottomTextHeight = 14;

        if (bottomTextY + bottomTextHeight > screenHeight) {
            var over = (bottomTextY + bottomTextHeight) - screenHeight;
            bottomTextY -= over;
            dividerY -= over;
            if (dividerY < dataBottom + 1) {
                dividerY = dataBottom + 1;
                bottomTextY = dividerY + 2 + 3;
            }
        }

        if (dividerY < screenHeight - 1) {
            Text.create('divider')
                .text(' ')
                .pos(tableLeft, dividerY)
                .size(tableRight - tableLeft, 2)
                .color(0x444466)
                .stretchXY()
                .draw(ctx);
        }

        Text.create('bottom_left')
            .text(bottomDisplayText)
            .pos(tableLeft, bottomTextY)
            .color(CONFIG.bottomLeftColor)
            .scale(CONFIG.bottomTextScale)
            .leftAlign()
            .draw(ctx);

        var timeStr = getFormattedTime();
        Text.create('bottom_right')
            .text(timeStr)
            .pos(tableRight, bottomTextY)
            .color(CONFIG.bottomRightColor)
            .scale(CONFIG.bottomTextScale)
            .rightAlign()
            .draw(ctx);
    }
}

function create(ctx, state, pids) {
    print("国铁车站大屏已加载，GitHub: pyric-studio/ErjcmPack");
    state._lastDebugTime = 0;
    state.cache = [];
}

function dispose(ctx, state, pids) {
    // 清理
}