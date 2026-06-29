// ============================================================
//  station_summary.js - 国铁车站总览大屏（精简稳定版）
//  功能：汇总列车信息，固定行数（可动态调整），底部标语+时间
//  特点：无动态颜色自定义，状态列独立，调试间隔可调
// ============================================================

// ============================================================
//  【配置区】
// ============================================================

var CONFIG = {
    // ----- 颜色配置 -----
    backgroundColor: 0x1a1a3e,      // 屏幕背景色（深蓝紫色）
    primaryTextColor: 0xd0d0d0,     // 表头及普通文字颜色（浅灰色/白色）
    headerBgColor: 0x0d0d2b,        // 表头背景色（深色）
    rowEvenColor: 0x1e1e4a,         // 偶数行背景色
    rowOddColor: 0x2a2a5a,          // 奇数行背景色（略亮，形成斑马纹）
    bottomLeftColor: 0x00ff66,      // 底部左侧标语颜色（亮绿色）
    bottomRightColor: 0xff4444,     // 底部右侧时间颜色（红色）

    // ----- 文字处理 -----
    removeStationSuffix: true,      // true = 站名去掉“站”字

    // ----- 状态保留时间（毫秒）-----
    departedRetentionMs: 12000,     // 【停止检票】后保留 12000ms = 12秒
    terminatedRetentionMs: 12000,   // 【到达】后保留 12000ms = 12秒

    // ----- 调试 -----
    DEBUG: true,                    // true = 启用调试输出
    debugInterval: 30000,           // 调试输出间隔（毫秒），默认30秒

    // ----- 布局核心参数 -----
    fixedRows: 5,                   // ★ 固定显示行数（当第三行动态控制无效时使用）
    showHeader: true,               // 默认显示表头（第一行隐藏控制可覆盖）

    rowHeight: 16,                  // 每行数据的高度（像素）
    headerHeight: 22,               // 表头高度（像素）
    paddingLeft: 8,                 // 表格左侧内边距（像素）
    paddingRight: 12,               // 表格右侧内边距（像素）

    // ★★★ 固定列宽（像素）顺序：车次, 始发站, 终到站, 开点, 站台, 状态
    colWidths: [50, 110, 110, 45, 35, 55],

    // ★★★ 列间距（像素）顺序：车次-始发, 始发-终到, 终到-开点, 开点-站台, 站台-状态
    colGaps: [25, 25, 20, 20, 20],

    // ★★★ 整行着色开关 ★★★（当第二行未勾选时强制开启）
    rowColorByStatus: true,         // true = 整行文字跟随状态颜色

    // ----- 底部信息 -----
    bottomText: '开车前10分钟检票，前3分钟停止检票',  // 默认标语
    bottomTextScale: 0.55,          // 底部文字缩放
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

    // ===== ★★★ 动态控制参数读取 ★★★ =====

    // 第一行：表头显示控制（勾选=隐藏表头）
    var hideRow0 = pids.isRowHidden(0);
    var showHeader = !hideRow0;

    // 第二行：整行颜色控制
    // 未勾选 = 整行跟随状态颜色；勾选 = 整行为白色（不再支持自定义颜色）
    var hideRow1 = pids.isRowHidden(1);

    // 第三行：显示行数控制
    // 未勾选且自订信息为数字 → 显示该数量；否则使用 CONFIG.fixedRows
    var hideRow2 = pids.isRowHidden(2);
    var customMsg2 = pids.getCustomMessage(2) || '';
    var fixedRows = CONFIG.fixedRows;
    if (!hideRow2) {
        var num = parseInt(customMsg2, 10);
        if (!isNaN(num) && num > 0) {
            fixedRows = num;
        }
    }

    // ----- 缓存管理（用于“停止检票/到达”的保留显示）-----
    if (!state.cache) state.cache = [];

    state.cache = state.cache.filter(function(item) {
        var retention = (item.status === '停止检票') ? CONFIG.departedRetentionMs : CONFIG.terminatedRetentionMs;
        return (currentTime - item.cacheTime) <= retention;
    });

    var arrivals = pids.arrivals();
    var allTrains = [];
    var processedKeys = {};

    // 调试输出（间隔由 CONFIG.debugInterval 控制）
    if (CONFIG.DEBUG) {
        var now = Date.now();
        if (!state._lastDebugTime || (now - state._lastDebugTime) >= CONFIG.debugInterval) {
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
            print('===== 调试 (列车数: ' + count + ') =====');
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
            print('表头显示: ' + (showHeader ? '开启' : '关闭'));
            print('显示行数: ' + fixedRows);
        }
    }

    // 生成唯一键
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

            // ---- 终到列车 ----
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
                        statusColor = 0x00ff44;      // 绿色
                    } else {
                        if (isRealtime && deviationMs > 60000) {
                            var delayMin = getDelayMinutes(deviationMs);
                            status = '晚点' + delayMin + '分';
                            statusColor = 0xFF0000;  // 红色
                        } else {
                            status = '正点';
                            statusColor = 0xFFFF00;  // 黄色
                        }
                    }
                }
            }
            // ---- 非终到列车 ----
            else {
                var actualDep = departureTime;
                if (isRealtime) {
                    actualDep = departureTime + deviationMs;
                }

                if (currentTime > actualDep) {
                    if (currentTime <= actualDep + CONFIG.departedRetentionMs) {
                        status = '停止检票';
                        statusColor = 0xFF0000;      // 红色
                    } else {
                        skip = true;
                    }
                } else {
                    var remaining = actualDep - currentTime;
                    if (isRealtime && deviationMs > 60000) {
                        var delayMin = getDelayMinutes(deviationMs);
                        status = '晚点' + delayMin + '分';
                        statusColor = 0xFF0000;      // 红色
                    } else if (remaining <= 60000) {
                        status = '正在检票';
                        statusColor = 0x00ff44;      // 绿色
                    } else {
                        status = '正点';
                        statusColor = 0xFFFF00;      // 黄色
                    }
                }
            }

            if (skip) continue;

            var key = makeKey(routeNumber, destination, platform, departureTime);
            if (processedKeys[key]) continue;
            processedKeys[key] = true;

            var origin = parseStationName(getOriginStation(entry));
            var dest = parseStationName(destination);
            var plat = parseStationName(platform);

            // 写入缓存
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

    // ★ 按计划发车时间升序排列
    allTrains.sort(function(a, b) {
        return a.departureTime - b.departureTime;
    });

    // ----- 固定列宽布局 -----
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
    //  绘制
    // ============================================================

    // 1. 表头
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
                .color(CONFIG.primaryTextColor)   // ★ 固定白色
                .scale(0.8)
                .draw(ctx);
            xPos += colWidths[h];
            if (h < colGaps.length) xPos += colGaps[h];
        }
    }

    // 2. 数据行
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

        var x = paddingLeft;

        // 整行颜色（除状态列外）
        // 未勾选 → 跟随状态颜色；勾选 → 固定白色
        var rowColor;
        if (hideRow1) {
            rowColor = CONFIG.primaryTextColor;   // 白色
        } else {
            rowColor = train.statusColor;
        }

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
            // ★★★ 状态列（索引5）始终使用状态颜色，不受整行设置影响 ★★★
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

    // 3. 底部信息
    // 第四行：勾选隐藏 → 显示默认标语；未勾选 → 若有自定义则显示，否则不显示
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

        // 防止超出屏幕
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

        // 标语（左对齐）
        Text.create('bottom_left')
            .text(bottomDisplayText)
            .pos(tableLeft, bottomTextY)
            .color(CONFIG.bottomLeftColor)
            .scale(CONFIG.bottomTextScale)
            .leftAlign()
            .draw(ctx);

        // 时间（右对齐）
        var timeStr = getFormattedTime();
        Text.create('bottom_right')
            .text(timeStr)
            .pos(tableRight, bottomTextY)
            .color(CONFIG.bottomRightColor)
            .scale(CONFIG.bottomTextScale)
            .rightAlign()
            .draw(ctx);
    }

    // 调试输出（补充底部文字信息）
    if (CONFIG.DEBUG) {
        var now = Date.now();
        if (!state._lastDebugTime || (now - state._lastDebugTime) >= CONFIG.debugInterval) {
            // 已在上面输出完整调试信息，这里不再重复
            // 但需确保 state._lastDebugTime 已更新（已在上面更新）
        }
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