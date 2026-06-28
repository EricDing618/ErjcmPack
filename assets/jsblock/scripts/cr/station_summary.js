// ============================================================
//  cr/station_summary.js - 国铁车站总览大屏 (均衡布局版)
//  功能：汇总车站内所有站台的列车信息，按发车时间升序排列
//  修复：列间距适中，底部字体缩小且不再重叠
// ============================================================

// ============================================================
//  【配置区】
// ============================================================

var CONFIG = {
    backgroundColor: 0x1a1a3e,
    primaryTextColor: 0xd0d0d0,
    headerBgColor: 0x0d0d2b,
    rowEvenColor: 0x1e1e4a,
    rowOddColor: 0x2a2a5a,
    bottomLeftColor: 0x00ff66,
    bottomRightColor: 0xff4444,
    removeStationSuffix: true,
    departedRetentionMs: 120000,
    terminatedRetentionMs: 5000,
    DEBUG: true,
    minRows: 3,                       // 最少显示3行
    columnSpacing: 12,                // ★ 列间距适中，不挤不散
};

// ============================================================
//  工具函数（保持不变）
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

    // 收集列车数据
    var arrivals = pids.arrivals();
    var allTrains = [];

    // 调试输出（每5秒）
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
        }
    }

    // 处理每条Arrival
    if (arrivals) {
        var count = 0;
        if (typeof arrivals.size === 'function') {
            count = arrivals.size();
        } else {
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
                var termTime = departureTime;
                if (typeof entry.arrivalTime === 'function') {
                    termTime = entry.arrivalTime();
                } else if (isRealtime) {
                    termTime = departureTime + deviationMs;
                }
                if (currentTime > termTime + CONFIG.terminatedRetentionMs) {
                    skip = true;
                } else {
                    status = '终到';
                    statusColor = 0xffffff;
                }
            } else {
                var actualDep = departureTime;
                if (isRealtime) {
                    actualDep = departureTime + deviationMs;
                }

                if (currentTime > actualDep) {
                    if (currentTime <= actualDep + CONFIG.departedRetentionMs) {
                        status = '已发车';
                        statusColor = 0x888888;
                    } else {
                        skip = true;
                    }
                } else {
                    var remaining = actualDep - currentTime;
                    if (isRealtime && deviationMs > 60000) {
                        var delayMin = getDelayMinutes(deviationMs);
                        status = '晚点' + delayMin + '分';
                        statusColor = 0xff8800;
                    } else if (remaining <= 60000) {
                        status = '正在检票';
                        statusColor = 0x00ff44;
                    } else if (remaining <= 180000) {
                        status = '即将到站';
                        statusColor = 0xffff00;
                    } else {
                        status = '正点';
                        statusColor = 0x00ff44;
                    }
                }
            }

            if (skip) continue;

            allTrains.push({
                routeNumber: routeNumber,
                origin: parseStationName(getOriginStation(entry)),
                destination: parseStationName(destination),
                departureTime: departureTime,
                actualDeparture: (isTerminating ? (typeof entry.arrivalTime === 'function' ? entry.arrivalTime() : departureTime) : (isRealtime ? departureTime + deviationMs : departureTime)),
                platform: parseStationName(platform),
                status: status,
                statusColor: statusColor,
                isTerminating: isTerminating,
            });
        }
    }

    allTrains.sort(function(a, b) {
        return a.actualDeparture - b.actualDeparture;
    });

    // ----- 布局参数（优化） -----
    var paddingLeft = 8;
    var paddingRight = 12;
    var headerHeight = 22;
    var rowHeight = 16;                // 行高适中
    var bottomInfoHeight = 22;
    var paddingTop = 4;

    // 列权重（车次:始发:终到:时间:站台:状态）
    var colWeights = [50, 80, 80, 60, 45, 55];
    var weightSum = colWeights.reduce(function(a, b) { return a + b; }, 0);

    var columnCount = colWeights.length;
    var totalSpacing = (columnCount - 1) * CONFIG.columnSpacing;
    var availableWidth = screenWidth - paddingLeft - paddingRight - totalSpacing;

    var colRoute = Math.floor(availableWidth * colWeights[0] / weightSum);
    var colOrigin = Math.floor(availableWidth * colWeights[1] / weightSum);
    var colDest = Math.floor(availableWidth * colWeights[2] / weightSum);
    var colTime = Math.floor(availableWidth * colWeights[3] / weightSum);
    var colPlatform = Math.floor(availableWidth * colWeights[4] / weightSum);
    var colStatus = availableWidth - (colRoute + colOrigin + colDest + colTime + colPlatform);

    var colWidths = [colRoute, colOrigin, colDest, colTime, colPlatform, colStatus];
    var colLabels = ['车次', '始发站', '终到站', '开点', '站台', '状态'];
    var colKeys = ['route', 'origin', 'dest', 'time', 'platform', 'status'];

    var tableLeft = paddingLeft;
    var tableRight = paddingLeft + availableWidth + totalSpacing;

    var maxRows = Math.floor((screenHeight - headerHeight - bottomInfoHeight - paddingTop) / rowHeight);
    if (maxRows < CONFIG.minRows) maxRows = CONFIG.minRows;

    // ----- 表头 -----
    var headerY = headerHeight;
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
        xPos += colWidths[h] + CONFIG.columnSpacing;
    }

    // ----- 数据行 -----
    var displayTrains = allTrains.slice(0, maxRows);
    for (var idx = 0; idx < displayTrains.length; idx++) {
        var train = displayTrains[idx];
        var rowY = headerHeight + rowHeight + idx * rowHeight;
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
            (train.origin || '--').slice(0, 8),
            (train.destination || '--').slice(0, 8),
            (function() {
                var d = new Date(train.departureTime);
                return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
            })(),
            (train.platform || '--').slice(0, 4),
            train.status
        ];

        for (var d = 0; d < rowData.length; d++) {
            var color = (d === 5) ? train.statusColor : CONFIG.primaryTextColor;
            Text.create('row_' + idx + '_' + colKeys[d])
                .text(rowData[d])
                .pos(x, rowY)
                .color(color)
                .scale(0.75)
                .draw(ctx);
            x += colWidths[d] + CONFIG.columnSpacing;
        }
    }

    // ----- 底部（优化字体和位置） -----
    var bottomY = screenHeight - bottomInfoHeight + 2;
    Text.create('divider')
        .text(' ')
        .pos(tableLeft, bottomY - 3)
        .size(tableRight - tableLeft, 2)
        .color(0x444466)
        .stretchXY()
        .draw(ctx);

    // 底部标语（左对齐，字体缩小）
    Text.create('bottom_left')
        .text('开车前10分钟检票，前3分钟停止检票')
        .pos(tableLeft, bottomY)
        .color(CONFIG.bottomLeftColor)
        .scale(0.55)                     // 缩小字体
        .leftAlign()
        .draw(ctx);

    // 底部时间（右对齐，与状态栏右侧对齐）
    var timeStr = getFormattedTime();
    Text.create('bottom_right')
        .text(timeStr)
        .pos(tableRight, bottomY)       // 右对齐到表格右边界
        .color(CONFIG.bottomRightColor)
        .scale(0.55)                    // 与标语同大小
        .rightAlign()
        .draw(ctx);

    // 调试输出
    if (CONFIG.DEBUG) {
        print('显示行数: ' + displayTrains.length + ' / 最大行数: ' + maxRows);
        print('列宽分布: 车次=' + colRoute + ', 始发=' + colOrigin + ', 终到=' + colDest + ', 时间=' + colTime + ', 站台=' + colPlatform + ', 状态=' + colStatus);
    }
}

// ============================================================
//  生命周期
// ============================================================

function create(ctx, state, pids) {
    state._lastDebugTime = 0;
}

function dispose(ctx, state, pids) {
    // 清理
}