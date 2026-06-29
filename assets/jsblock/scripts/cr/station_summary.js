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
    terminatedRetentionMs: 120000,
    DEBUG: true,

    // ★ 固定显示行数
    fixedRows: 5,

    // ★ 行高和表头高度
    rowHeight: 16,
    headerHeight: 22,
    paddingLeft: 8,
    paddingRight: 12,

    // ★ 底部信息与数据区域底部之间的间距（像素）
    bottomOffset: 4,

    // ★ 固定列宽和间距
    colWidths: [50, 110, 110, 45, 35, 55],
    colGaps: [25, 25, 20, 20, 20],

    // ★ 整行着色
    rowColorByStatus: true,

    // ★ 底部文字
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
                    // ★★★ 新增判断：是否已经到达 ★★★
                    if (currentTime >= actualTime) {
                        // 已经到达终点 → 显示“到达”，绿色
                        status = '到达';
                        statusColor = 0x00ff44;  // 与“正在检票”相同
                    } else {
                        // 尚未到达，判断正点/晚点
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
            }
            // ---- 非终到列车（正常发车） ----
            else {
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

            allTrains.push({
                routeNumber: routeNumber,
                origin: parseStationName(getOriginStation(entry)),
                destination: parseStationName(destination),
                departureTime: departureTime,
                platform: parseStationName(platform),
                status: status,
                statusColor: statusColor,
                isTerminating: isTerminating,
            });
        }
    }

    // ★ 按计划发车时间（departureTime）升序排列
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
        });
    }

    // ============================================================
    //  区域绘制
    // ============================================================

    // 1. 表头区域
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
        xPos += colWidths[h];
        if (h < colGaps.length) xPos += colGaps[h];
    }

    // 2. 数据行区域（固定行数）
    for (var idx = 0; idx < displayTrains.length; idx++) {
        var train = displayTrains[idx];
        var rowY = headerY + rowHeight + idx * rowHeight;
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

    // 3. 底部信息区域（紧贴数据行下方）
    var dataBottom = headerY + rowHeight * (fixedRows + 1);
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
        var sortedSample = allTrains.slice(0, Math.min(3, allTrains.length));
        for (var s = 0; s < sortedSample.length; s++) {
            print('排序样例 ' + s + ': 车次=' + sortedSample[s].routeNumber + ' 开点=' + new Date(sortedSample[s].departureTime).toLocaleTimeString() + ' 状态=' + sortedSample[s].status);
        }
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