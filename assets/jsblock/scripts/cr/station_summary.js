// ============================================================
//  cr/station_summary.js - 国铁车站总览大屏 (真实国铁版)
//  功能：汇总车站内所有站台的列车信息，按发车时间升序排列
//  特点：终到列车也参与正点/晚点判断，不单独显示"终到"
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
    removeStationSuffix: true,
    departedRetentionMs: 120000,      // 停止检票后保留2分钟
    terminatedRetentionMs: 120000,    // 终到后保留2分钟
    DEBUG: true,
    minRows: 3,
    columnSpacing: 30,
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
            var departureTime = entry.departureTime();      // 终到列车：计划到达时间
            var deviationMs = entry.deviation() || 0;
            var isRealtime = entry.realtime();
            var isTerminating = entry.terminating();
            var platform = entry.platformName() || '';
            var routeNumber = entry.routeNumber() || '';

            var status = '';
            var statusColor = CONFIG.primaryTextColor;
            var skip = false;

            // ---- 终到列车 ----
            // 使用到达时间作为基准，判断正点/晚点
            // 不显示"终到"状态，而是像普通列车一样显示正点或晚点
            if (isTerminating) {
                // 计算实际到达时间
                var actualTime = departureTime;
                if (typeof entry.arrivalTime === 'function') {
                    actualTime = entry.arrivalTime();
                } else if (isRealtime) {
                    actualTime = departureTime + deviationMs;
                }

                // 如果已过到达时间 + 保留期，移除
                if (currentTime > actualTime + CONFIG.terminatedRetentionMs) {
                    skip = true;
                } else {
                    // 判断晚点：偏差 > 1分钟
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
            // ---- 非终到列车（正常发车） ----
            else {
                var actualDep = departureTime;
                if (isRealtime) {
                    actualDep = departureTime + deviationMs;
                }

                // 已发车 → 停止检票（红色）
                if (currentTime > actualDep) {
                    if (currentTime <= actualDep + CONFIG.departedRetentionMs) {
                        status = '停止检票';
                        statusColor = 0xFF0000;
                    } else {
                        skip = true;
                    }
                }
                // 未发车
                else {
                    var remaining = actualDep - currentTime;

                    // 晚点（偏差>1分钟）→ 红色
                    if (isRealtime && deviationMs > 60000) {
                        var delayMin = getDelayMinutes(deviationMs);
                        status = '晚点' + delayMin + '分';
                        statusColor = 0xFF0000;
                    } 
                    // 1分钟内发车 → 正在检票（绿色）
                    else if (remaining <= 60000) {
                        status = '正在检票';
                        statusColor = 0x00ff44;
                    } 
                    // 其他所有情况 → 正点（黄色）
                    else {
                        status = '正点';
                        statusColor = 0xFFFF00;
                    }
                }
            }

            if (skip) continue;

            // 对于终到列车，"开点"列显示计划到达时间
            // 对于普通列车，"开点"列显示计划发车时间
            var displayTime = departureTime;

            allTrains.push({
                routeNumber: routeNumber,
                origin: parseStationName(getOriginStation(entry)),
                destination: parseStationName(destination),
                departureTime: displayTime,
                actualDeparture: (isTerminating ? actualTime : (isRealtime ? departureTime + deviationMs : departureTime)),
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

    // ----- 布局参数 -----
    var paddingLeft = 8;
    var paddingRight = 12;
    var headerHeight = 22;
    var rowHeight = 14;
    var paddingTop = 4;

    // 列权重（车次:始发:终到:时间:站台:状态）
    var colWeights = [45, 75, 75, 55, 40, 55];
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

    // 计算最大行数（无底部）
    var maxRows = Math.floor((screenHeight - headerHeight - paddingTop) / rowHeight);
    if (maxRows < CONFIG.minRows) maxRows = CONFIG.minRows;
    if (maxRows > allTrains.length) maxRows = allTrains.length;

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

    // 调试输出
    if (CONFIG.DEBUG) {
        print('显示行数: ' + displayTrains.length + ' / 最大行数: ' + maxRows);
        print('列宽: 车次=' + colRoute + ' 始发=' + colOrigin + ' 终到=' + colDest + ' 时间=' + colTime + ' 站台=' + colPlatform + ' 状态=' + colStatus);
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