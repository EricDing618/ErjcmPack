// ============================================================
//  【配置区】—— 所有参数均可按需调整
// ============================================================

var CONFIG = {
    // ----- 颜色配置 -----
    backgroundColor: 0x1a1a3e,      // 屏幕背景色（深蓝紫色）
    primaryTextColor: 0xd0d0d0,     // 普通文字颜色（浅灰色）
    headerBgColor: 0x0d0d2b,        // 表头背景色（深色）—— 如果 showHeader=false，此颜色无效
    rowEvenColor: 0x1e1e4a,         // 偶数行背景色
    rowOddColor: 0x2a2a5a,          // 奇数行背景色
    bottomLeftColor: 0x00ff66,      // 底部左侧标语颜色（亮绿色）
    bottomRightColor: 0xff4444,     // 底部右侧时间颜色（红色）

    // ----- 文字处理 -----
    removeStationSuffix: true,      // true = 站名去掉“站”字

    // ----- ★★★ 状态保留时间（毫秒）★★★ -----
    departedRetentionMs: 12000,     // 【停止检票】后保留 12000ms = 12秒（测试用，可调大）
    terminatedRetentionMs: 12000,   // 【到达】后保留 12000ms = 12秒（测试用，可调大）

    // ----- 调试 -----
    DEBUG: true,                    // true = 每5秒输出调试信息

    // ----- 布局核心参数 -----
    fixedRows: 5,                   // ★ 固定显示行数，不足时用空行补齐
    showHeader: true,              // ★★★ 新增：true=显示表头，false=隐藏表头且不留空白 ★★★

    rowHeight: 16,                  // 每行数据的高度（像素）
    headerHeight: 22,               // 表头高度（像素）—— 仅当 showHeader=true 时有效
    paddingLeft: 8,                 // 表格左侧内边距（像素）
    paddingRight: 12,               // 表格右侧内边距（像素）

    // ★★★ 固定列宽（像素）顺序：车次, 始发站, 终到站, 开点, 站台, 状态
    colWidths: [50, 110, 110, 45, 35, 55],

    // ★★★ 列间距（像素）顺序：车次-始发, 始发-终到, 终到-开点, 开点-站台, 站台-状态
    colGaps: [25, 25, 20, 20, 20],

    // ★★★ 整行着色开关 ★★★
    rowColorByStatus: true,         // true = 整行文字跟随状态颜色

    // ----- 底部信息 -----
    bottomText: '开车前10分钟检票，前3分钟停止检票',
    bottomTextScale: 0.55,
};

// ============================================================
//  工具函数
// ============================================================

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

// ============================================================
//  核心渲染函数
// ============================================================

function render(ctx, state, pids) {
    var currentTime = Date.now();
    var screenWidth = pids.width;
    var screenHeight = pids.height;

    // 背景
    Text.create('background')
        .text(' ')
        .pos(0, 0)
        .size(screenWidth, screenHeight)
        .color(CONFIG.backgroundColor)
        .stretchXY()
        .draw(ctx);

    // ----- ★★★ 缓存管理 ★★★ -----
    if (!state.cache) state.cache = [];

    state.cache = state.cache.filter(function(item) {
        var retention = (item.status === '停止检票') ? CONFIG.departedRetentionMs : CONFIG.terminatedRetentionMs;
        return (currentTime - item.cacheTime) <= retention;
    });

    var arrivals = pids.arrivals();
    var allTrains = [];
    var processedKeys = {};

    // 调试输出
    if (CONFIG.DEBUG) {
        var now = Date.now();
        if (!state._lastDebugTime || (now - state._lastDebugTime) > 5000) {
            state._lastDebugTime = now;
            var count = 0;
            if (arrivals && typeof arrivals.size === 'function') {
                count = arrivals.size();
            } else if (arrivals) {
                for (var i = 0; i < 20; i++) {
                    if (arrivals.get(i)) count = i + 1;
                    else break;
                }
            }
            print('===== 调试 (当前列车数: ' + count + ') =====');
            if (arrivals && count > 0) {
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
        if (typeof arrivals.size === 'function') {
            count = arrivals.size();
        } else {
            for (var i = 0; i < 30; i++) {
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
                if (isRealtime) {
                    actualDep = departureTime + deviationMs;
                }

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

            var key = makeKey(routeNumber, destination, platform, departureTime);
            if (processedKeys[key]) {
                if (CONFIG.DEBUG) print('去重跳过: ' + key);
                continue;
            }
            processedKeys[key] = true;

            var origin = parseStationName(getOriginStation(entry));
            var dest = parseStationName(destination);
            var plat = parseStationName(platform);

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

    // 从缓存添加
    for (var cIdx = 0; cIdx < state.cache.length; cIdx++) {
        var cached = state.cache[cIdx];
        var key = cached.key;
        if (processedKeys[key]) continue;
        var retention = (cached.status === '停止检票') ? CONFIG.departedRetentionMs : CONFIG.terminatedRetentionMs;
        if ((currentTime - cached.cacheTime) > retention) continue;
        allTrains.push({
            routeNumber: cached.routeNumber,
            origin: cached.origin,
            destination: cached.destination,
            departureTime: cached.departureTime,
            platform: cached.platform,
            status: cached.status,
            statusColor: cached.statusColor,
            isTerminating: false,
            key: key,
        });
        processedKeys[key] = true;
    }

    allTrains.sort(function(a, b) {
        return a.departureTime - b.departureTime;
    });

    // ----- 固定列宽布局 -----
    var paddingLeft = CONFIG.paddingLeft;
    var paddingRight = CONFIG.paddingRight;
    var headerHeight = CONFIG.headerHeight;
    var rowHeight = CONFIG.rowHeight;
    var showHeader = CONFIG.showHeader;

    // ★★★ 根据 showHeader 决定数据起始 Y 坐标 ★★★
    // 如果显示表头，数据行从 headerHeight + rowHeight 开始（表头在 headerHeight 处）
    // 如果不显示表头，数据行从 y=0 开始（不留空白）
    var dataStartY = showHeader ? headerHeight : 0;

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

    var fixedRows = CONFIG.fixedRows;
    var displayTrains = allTrains.slice(0, fixedRows);
    while (displayTrains.length < fixedRows) {
        displayTrains.push({
            routeNumber: '--',
            origin: '--',
            destination: '--',
            departureTime: 9999999999999,
            platform: '--',
            status: ' ',
            statusColor: CONFIG.primaryTextColor,
            isTerminating: false,
            key: null,
        });
    }

    // ============================================================
    //  区域绘制
    // ============================================================

    // 1. 表头区域（仅当 showHeader = true）
    var headerY = dataStartY;  // 如果显示表头，headerY = headerHeight；否则为 0
    if (showHeader) {
        Text.create('header_bg')
            .text(' ')
            .pos(0, headerY - 2)
            .size(screenWidth, rowHeight + 2)
            .color(CONFIG.headerBgColor)
            .stretchXY()
            .draw(ctx);

        var xPos = paddingLeft;
        for (var h = 0; h < colLabels.length; h++) {
            Text.create('header_' + colKeys[h])
                .text(colLabels[h])
                .pos(xPos, headerY)
                .color(CONFIG.primaryTextColor)
                .scale(0.8)
                .draw(ctx);
            xPos += colWidths[h];
            if (h < colGaps.length) xPos += colGaps[h];
        }
    }

    // 2. 数据行区域
    for (var idx = 0; idx < displayTrains.length; idx++) {
        var train = displayTrains[idx];
        // 行 Y 位置 = 数据起始 Y + 表头占用的高度（如果显示表头，则偏移 headerHeight，否则偏移 0）+ idx * rowHeight
        var rowY = dataStartY + (showHeader ? headerHeight : 0) + idx * rowHeight;
        var bgColor = (idx % 2 === 0) ? CONFIG.rowEvenColor : CONFIG.rowOddColor;
        Text.create('row_bg_' + idx)
            .text(' ')
            .pos(0, rowY - 1)
            .size(screenWidth, rowHeight + 1)
            .color(bgColor)
            .stretchXY()
            .draw(ctx);

        var x = paddingLeft;
        var rowData = [
            (train.routeNumber || '--').slice(0, 6),
            (train.origin || '--').slice(0, 10),
            (train.destination || '--').slice(0, 10),
            (function() {
                var d = new Date(train.departureTime);
                return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
            })(),
            (train.platform || '--').slice(0, 4),
            train.status
        ];

        for (var d = 0; d < rowData.length; d++) {
            var color;
            if (CONFIG.rowColorByStatus) {
                color = train.statusColor;
            } else {
                color = (d === 5) ? train.statusColor : CONFIG.primaryTextColor;
            }
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

    // 3. 底部信息区域
    // 数据区域底部位置：数据起始 Y + 表头偏移（如果有）+ rowHeight * fixedRows
    var dataBottom = dataStartY + (showHeader ? headerHeight : 0) + rowHeight * fixedRows;
    // 为了兼容，我们仍然使用原来的底部计算逻辑，但用新的 dataBottom
    // 为了保持之前的间距，我们沿用之前的偏移量
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
        .text(CONFIG.bottomText)
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

    // 调试输出
    if (CONFIG.DEBUG) {
        print('固定行数: ' + fixedRows + ' / 实际数据: ' + allTrains.length);
        print('屏幕高度: ' + screenHeight);
        print('dataBottom: ' + dataBottom + ', dividerY: ' + dividerY + ', bottomTextY: ' + bottomTextY);
        print('列宽: ' + colWidths.join(', '));
        print('列间距: ' + colGaps.join(', '));
        print('缓存大小: ' + state.cache.length);
        print('处理键数: ' + Object.keys(processedKeys).length);
        var sortedSample = allTrains.slice(0, Math.min(3, allTrains.length));
        for (var s = 0; s < sortedSample.length; s++) {
            print('排序样例 ' + s + ': 车次=' + sortedSample[s].routeNumber + ' 开点=' + new Date(sortedSample[s].departureTime).toLocaleTimeString() + ' 状态=' + sortedSample[s].status);
        }
        print('表头显示: ' + (showHeader ? '开启' : '关闭'));
    }
}

// ============================================================
//  生命周期
// ============================================================

function create(ctx, state, pids) {
    state._lastDebugTime = 0;
    state.cache = [];
}

function dispose(ctx, state, pids) {
    // 清理
}