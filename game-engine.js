// ==================== 游戏引擎：霍格沃茨人生模拟 ====================

// ---------- 全局状态 ----------
const GameState = {
    player: null,          // 当前玩家数据
    currentStage: null,    // 当前显示的阶段ID
    weeklyPlan: [],        // 本周计划 [{ locationId, directionId }]
    maxActionPoints: 5,    // 每周行动点上限
    usedActionPoints: 0,   // 已用行动点
    currentPrologueIndex: 0, // 序章进度
    prologueEvents: [],    // 序章事件列表
};

// ---------- 数据存储 ----------
let Locations = {};   // 地点库，以 id 为键
let Actions = {};     // 行动库，以 locationId 为键，值为方向数组
let Events = [];      // 剧情事件库
let NPCs = {};   // NPC 数据，以 id 为键
let Schedule = [];    // 时间事件库

// ---------- 页面元素引用 ----------
const UI = {
    timeDisplay: document.getElementById('time-display'),
    bottomBar: document.getElementById('bottom-bar'),
    playerNameHouse: document.getElementById('player-name-house'),
    playerAttributes: document.getElementById('player-attributes'),
    actionPoints: document.getElementById('action-points'),
    planList: document.getElementById('plan-list'),
    locationGrid: document.getElementById('location-grid'),
    directionList: document.getElementById('direction-list'),
    directionLocationName: document.getElementById('direction-location-name'),
    summaryList: document.getElementById('summary-list'),
    summaryTitle: document.getElementById('summary-title'),
    eventTitle: document.getElementById('event-title'),
    eventDescription: document.getElementById('event-description'),
    eventChoices: document.getElementById('event-choices'),
    eventInputArea: document.getElementById('event-input-area'),
    eventInput: document.getElementById('event-input'),
    menuModal: document.getElementById('menu-modal'),
};

// 所有阶段的section引用
const StageSections = {
    'event': document.getElementById('stage-event'),
    'plan': document.getElementById('stage-plan'),
    'map': document.getElementById('stage-map'),
    'direction': document.getElementById('stage-direction'),
    'summary': document.getElementById('stage-summary'),
};

// ---------- 初始化 ----------
async function initGame() {
    await loadAllData();
    loadPlayerState();
    startPrologue();
}

// 加载所有JSON数据文件
async function loadAllData() {
    try {
        const [locationsData, actionsData, eventsData, scheduleData ,npcsData] = await Promise.all([
            fetch('data/locations.json').then(r => r.json()),
            fetch('data/actions.json').then(r => r.json()),
            fetch('data/events.json').then(r => r.json()),
            fetch('data/schedule.json').then(r => r.json()),
            fetch('data/npcs.json').then(r => r.json())
        ]);
        
        // 地点转为以id为键的对象，方便查找
        Locations = {};
        locationsData.forEach(loc => { Locations[loc.id] = loc; });
        
        // 行动同理
        Actions = {};
        actionsData.forEach(act => { Actions[act.location] = act.directions; });
        
        Events = eventsData;
        Schedule = scheduleData;

        NPCs = {};
        npcsData.forEach(npc => { NPCs[npc.id] = npc; });
        
        console.log('数据加载完成', { Locations, Actions, Events, Schedule, NPCs });
    } catch (error) {
        console.error('数据加载失败:', error);
        alert('游戏数据加载失败，请检查data文件夹中的JSON文件是否存在且格式正确。');
    }
}

// 加载玩家状态（新游戏或从localStorage读档）
function loadPlayerState() {
    const saved = localStorage.getItem('hogwarts_save');
    if (saved) {
        // 有存档，但序章阶段强制新游戏（以后可扩展）
        // GameState.player = JSON.parse(saved);
        // 暂时默认开新档
    }
    // 开新档，从player.json加载初始状态
    GameState.lastWeekPlan = [];  // 新增：保存上一周计划
    GameState.player = {
        name: '',
        house: '',
        gender: '',
        schoolYear: 1,   // 年级（1-7）
        year: 1991,       // 当前现实年份
        month: 9,         // 当前月份（9-6）
        week: 1,          // 当前周（1-4）
        attributes: { courage: 40, wisdom: 40, charm: 40, cunning: 40 },
        tags: [],
        relationships: {},
        inventory: [],
        completedEvents: []
    };
    // 根据 npcs.json 自动初始化所有 NPC 的关系
    Object.keys(NPCs).forEach(npcId => {
        if (!GameState.player.relationships[npcId]) {
            GameState.player.relationships[npcId] = {
                affection: 0,
                tags: []
            };
        }
    });
    GameState.weeklyPlan = [];
    GameState.usedActionPoints = 0;
    GameState.currentPrologueIndex = 0;
}

// 开始序章
function startPrologue() {
    GameState.prologueEvents = Events.filter(e => e.phase === 'prologue').sort((a, b) => a.order - b.order);
    showStage('event');
    showPrologueEvent();
}

// ---------- 阶段切换 ----------
function showStage(stageName) {
    // 隐藏所有阶段
    Object.values(StageSections).forEach(section => {
        section.style.display = 'none';
    });
    // 显示目标阶段
    if (StageSections[stageName]) {
        StageSections[stageName].style.display = 'block';
    }
    GameState.currentStage = stageName;
    
    // 根据阶段控制底部栏和顶部时间
    if (stageName === 'event' && GameState.player.name === '') {
        // 序章中，隐藏底部栏
        UI.bottomBar.style.display = 'none';
        UI.timeDisplay.textContent = '~ 序章 ~';
    } else {
        UI.bottomBar.style.display = 'flex';
        updatePlayerUI();
        updateTimeDisplay();
    }
}

function updateTimeDisplay() {
    const p = GameState.player;
    const monthNames = ['', '1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
    
    let period = '';
    // 根据当前时间判断学期/假期
    if ((p.month === 12 && p.week === 4) || (p.month === 1 && p.week === 1)) {
        period = '🎄 圣诞假期';
    } else if ((p.month === 3 && p.week === 4) || (p.month === 4 && p.week === 1)) {
        period = '🐣 复活节假期';
    } else if (p.month === 6 && (p.week === 1 || p.week === 2)) {
        period = '📝 期末考试周';
    } else if (p.month === 6 && p.week >= 3) {
        period = '☀️ 暑假';
    } else if (p.month >= 9 && p.month <= 12) {
        period = '第一学期';
    } else if (p.month >= 1 && p.month <= 3) {
        period = '第二学期';
    } else if (p.month >= 4 && p.month <= 6) {
        period = '第三学期';
    }

    const base = `${p.year}年 第${p.schoolYear}学年 ${monthNames[p.month]} 第${p.week}周`;
    UI.timeDisplay.textContent = period ? `${base} · ${period}` : base;
}

function updatePlayerUI() {
    if (!GameState.player.name) return;
    UI.playerNameHouse.textContent = `${GameState.player.name} | ${GameState.player.house}`;
    const a = GameState.player.attributes;
    UI.playerAttributes.textContent = `勇气${a.courage}  智慧${a.wisdom}  魅力${a.charm}  狡黠${a.cunning}`;
}

// 阶段一：显示计划界面
function showPlanStage() {
    showStage('plan');
    renderPlanList();
    UI.actionPoints.textContent = GameState.maxActionPoints - GameState.usedActionPoints;
}

function renderPlanList() {
    UI.planList.innerHTML = '';
    if (GameState.weeklyPlan.length === 0) {
        UI.planList.innerHTML = '<p style="color: #a89b8c; text-align: center;">（暂无计划）</p>';
        return;
    }
    
    // 按地点分组统计
    const grouped = {};
    GameState.weeklyPlan.forEach(entry => {
        const key = `${entry.locationId}|${entry.directionId}`;
        if (!grouped[key]) {
            grouped[key] = { ...entry, count: 0 };
        }
        grouped[key].count++;
    });
    
    Object.values(grouped).forEach(entry => {
        const loc = Locations[entry.locationId];
        const dir = Actions[entry.locationId]?.find(d => d.id === entry.directionId);
        const div = document.createElement('div');
        div.className = 'plan-entry';
        div.innerHTML = `
            <div class="plan-info">
                <span class="plan-location">${loc?.icon || ''} ${loc?.name || entry.locationId}</span>
                <span class="plan-direction">${dir?.name || entry.directionId} ×${entry.count}</span>
            </div>
            <button class="plan-cancel-btn" data-location="${entry.locationId}" data-direction="${entry.directionId}">✕</button>
        `;
        UI.planList.appendChild(div);
    });
    
    // 绑定取消按钮事件
    document.querySelectorAll('.plan-cancel-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const locationId = e.target.dataset.location;
            const directionId = e.target.dataset.direction;
            removeActionFromPlan(locationId, directionId);
        });
    });
}

function removeActionFromPlan(locationId, directionId) {
    // 找到第一个匹配的行动并移除
    const index = GameState.weeklyPlan.findIndex(
        p => p.locationId === locationId && p.directionId === directionId
    );
    if (index !== -1) {
        GameState.weeklyPlan.splice(index, 1);
        GameState.usedActionPoints--;
        renderPlanList();
        UI.actionPoints.textContent = GameState.maxActionPoints - GameState.usedActionPoints;
    }
}

// 阶段二A：显示小地图
function showMapStage() {
    showStage('map');
    renderLocationGrid();
}

function renderLocationGrid() {
    UI.locationGrid.innerHTML = '';
    // 过滤出解锁的地点（无解锁条件或已满足）
    const availableLocations = Object.values(Locations).filter(loc => {
        if (!loc.unlock_condition) return true;
        // 简易条件检查，后续可扩展
        if (loc.unlock_condition.week && GameState.player.week < loc.unlock_condition.week.min) return false;
        if (loc.unlock_condition.year && GameState.player.year < loc.unlock_condition.year.min) return false;
        return true;
    });
    
    availableLocations.forEach(loc => {
        const card = document.createElement('div');
        card.className = 'location-card';
        card.innerHTML = `
            <span class="location-icon">${loc.icon || '📍'}</span>
            <span class="location-name">${loc.name}</span>
        `;
        card.addEventListener('click', () => showDirectionStage(loc.id));
        UI.locationGrid.appendChild(card);
    });
}

// 阶段二B：显示行动方向
function showDirectionStage(locationId) {
    showStage('direction');
    const loc = Locations[locationId];
    UI.directionLocationName.textContent = `${loc?.icon || ''} ${loc?.name || locationId}`;
    renderDirectionList(locationId);
    // 暂存当前选择的地点
    UI.directionList.dataset.locationId = locationId;
}

function renderDirectionList(locationId) {
    UI.directionList.innerHTML = '';
    const directions = Actions[locationId] || [];
    directions.forEach(dir => {
        const card = document.createElement('div');
        card.className = 'direction-card';
        card.innerHTML = `
            <div class="direction-name">${dir.icon || '▶'} ${dir.name}</div>
            <div class="direction-desc">${dir.description}</div>
        `;
        card.addEventListener('click', () => {
            addActionToPlan(locationId, dir.id);
        });
        UI.directionList.appendChild(card);
    });
}

function addActionToPlan(locationId, directionId) {
    if (GameState.usedActionPoints >= GameState.maxActionPoints) {
        alert('本周行动点已用完！');
        return;
    }
    GameState.weeklyPlan.push({ locationId, directionId });
    GameState.usedActionPoints++;
    showPlanStage(); // 返回计划界面
}


function skipWeek() {
    // 清空本周计划
    GameState.weeklyPlan = [];
    GameState.usedActionPoints = 0;
    
    // 直接进入结算（没有行动，总结为空，不会触发日常事件）
    showStage('summary');
    UI.summaryTitle.textContent = `第${GameState.player.week}周结束`;
    UI.summaryList.innerHTML = '<p style="color:#a89b8c;text-align:center;">你跳过了这一周。</p>';
    
    updatePlayerUI();
    showStage('summary');
}





// 确认本周计划，进入结算
function confirmPlan() {
    if (GameState.usedActionPoints < GameState.maxActionPoints) {
        alert(`你还有 ${GameState.maxActionPoints - GameState.usedActionPoints} 个行动点未使用。`);
        return;
    }
    
    // 重置本周的事件标记
    GameState.hadDailyEvent = false;
    GameState.hasTriggeredEvent = false;
    
    // 第一步：展示所有行动的总结
    showStage('summary');
    UI.summaryTitle.textContent = `第${GameState.player.week}周结束`;
    UI.summaryList.innerHTML = '';
    
    GameState.lastWeekPlan = [...GameState.weeklyPlan];
    
    const grouped = {};
    GameState.weeklyPlan.forEach(entry => {
        const key = `${entry.locationId}|${entry.directionId}`;
        if (!grouped[key]) grouped[key] = { ...entry, count: 0 };
        grouped[key].count++;
    });
    
    Object.values(grouped).forEach(entry => {
        const dir = Actions[entry.locationId]?.find(d => d.id === entry.directionId);
        const loc = Locations[entry.locationId];
        
        if (dir?.reward) {
            const a = GameState.player.attributes;
            if (dir.reward.courage) a.courage += dir.reward.courage * entry.count;
            if (dir.reward.wisdom) a.wisdom += dir.reward.wisdom * entry.count;
            if (dir.reward.charm) a.charm += dir.reward.charm * entry.count;
            if (dir.reward.cunning) a.cunning += dir.reward.cunning * entry.count;
        }
        
        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'summary-entry';
        summaryDiv.innerHTML = `
            <div class="summary-title">${loc?.icon || ''} ${loc?.name || entry.locationId} ${dir?.name || entry.directionId} ×${entry.count}</div>
            <div class="summary-text">${dir?.summary || '你在这里度过了一段时光。'}</div>
        `;
        UI.summaryList.appendChild(summaryDiv);
    });
    
    updatePlayerUI();
    
    // 第二步：收集本周可能触发的日常事件
    GameState.pendingDailyEvents = [];
    GameState.weeklyPlan.forEach(entry => {
        const dir = Actions[entry.locationId]?.find(d => d.id === entry.directionId);
        const chance = dir?.daily_event_chance || 0;
        if (Math.random() * 100 < chance) {
            const dailyEvent = selectDailyEvent(entry.locationId, entry.directionId);
            if (dailyEvent) GameState.pendingDailyEvents.push(dailyEvent);
        }
    });
    
    // 第三步：从所有触发的日常事件中随机选一个留待后续触发
    if (GameState.pendingDailyEvents.length > 0) {
        const chosen = GameState.pendingDailyEvents[Math.floor(Math.random() * GameState.pendingDailyEvents.length)];
        GameState.pendingDailyEvents = [chosen];
    }
    // 底部提示
    const completeMsg = document.createElement('p');
    completeMsg.style.cssText = 'color: #a89b8c; text-align: center; margin-top: 16px;';
    completeMsg.textContent = '本周行动全部完成';
    UI.summaryList.appendChild(completeMsg);

    // 显示总结，玩家点击"继续"后进入事件阶段
    showStage('summary');
}

function triggerNextDailyEvent() {
    const event = GameState.pendingDailyEvents.shift();
    GameState.hadDailyEvent = true; // 标记本周已触发过 daily 事件
    GameState.hasTriggeredEvent = true; // 标记本周已触发过事件
    showStage('event');
    renderEvent(event);
}

// 周结算后进入事件抽取阶段
function proceedToEvent() {
    // 先检查是否有待触发的日常事件
    if (GameState.pendingDailyEvents && GameState.pendingDailyEvents.length > 0) {
        triggerNextDailyEvent();
        return;
    }
    
    // 优先检查主故事事件
    const mainEvent = Events.find(e => {
        if (e.phase !== 'main_story') return false;
        if (GameState.player.completedEvents.includes(e.id)) return false;
        // 互斥组检查：如果同组内已有事件被完成，跳过
        if (e.exclusion_group) {
            const groupCompleted = Events.some(other =>
                other.exclusion_group === e.exclusion_group &&
                other.id !== e.id &&
                GameState.player.completedEvents.includes(other.id)
            );
            if (groupCompleted) return false;
        }
        return checkTriggerCondition(e.trigger_condition);
    });
    
    if (mainEvent) {
        showStage('event');
        renderEvent(mainEvent);
        GameState.hasTriggeredEvent = true; // 标记本周已触发过事件
        return;
    }
    
    // 没有主故事事件，则按原逻辑抽取
    const triggeredEvent = selectWeeklyEvent();
    if (triggeredEvent) {
        showStage('event');
        renderEvent(triggeredEvent);
        GameState.hasTriggeredEvent = true; // 标记本周已触发过事件
    } else if (GameState.hasTriggeredEvent) {
        // 已经触发过事件，直接进入下一周，不显示"平静的一周"
        startNextWeek();
    } else {
        // 无事发生，简短提示后进入下一周
        showStage('event');
        UI.eventTitle.textContent = '平静的一周';
        UI.eventDescription.textContent = '这周你没有遇到什么特别的事，霍格沃茨的日子平静地流淌。';
        UI.eventChoices.innerHTML = '';
        const btn = document.createElement('button');
        btn.textContent = '继续';
        btn.addEventListener('click', startNextWeek);
        UI.eventChoices.appendChild(btn);
    }
}

function selectWeeklyEvent() {
    // 收集本周去过的地点
    const visitedLocations = [...new Set(GameState.weeklyPlan.map(p => p.locationId))];
    // 从事件池筛选
    const candidates = Events.filter(e => {
        if (e.phase === 'prologue' || e.phase === 'daily') return false; // 序章和日常事件不参与
        if (!e.location || !visitedLocations.includes(e.location)) return false;
        if (GameState.player.completedEvents.includes(e.id)) return false;
        if (!checkTriggerCondition(e.trigger_condition)) return false;
        // 互斥组检查：如果同组内已有事件被完成，跳过
        if (e.exclusion_group) {
            const groupCompleted = Events.some(other =>
                other.exclusion_group === e.exclusion_group &&
                other.id !== e.id &&
                GameState.player.completedEvents.includes(other.id)
            );
            if (groupCompleted) return false;
        }
        return true;
    });
    
    if (candidates.length === 0) {
        // 尝试找该地点的通用事件（无触发条件）
        const generic = Events.filter(e => {
            if (e.phase === 'prologue' || e.phase === 'daily') return false;
            if (!e.location || !visitedLocations.includes(e.location)) return false;
            if (GameState.player.completedEvents.includes(e.id)) return false;
            if (e.trigger_condition && Object.keys(e.trigger_condition).length > 0) return false;
            return true;
        });
        if (generic.length > 0) {
            return generic[Math.floor(Math.random() * generic.length)];
        }
        return null;
    }
    
    // 按优先级排序，随机取高优先级的一个
    candidates.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    const topPriority = candidates[0].priority || 0;
    const topCandidates = candidates.filter(c => (c.priority || 0) === topPriority);
    return topCandidates[Math.floor(Math.random() * topCandidates.length)];
}

// 根据地点和方向选择日常事件（概率触发已在调用方处理）
function selectDailyEvent(locationId, directionId) {
    // 筛选符合条件的日常事件
    const candidates = Events.filter(e => {
        if (e.phase !== 'daily') return false;
        if (e.location !== locationId) return false;
        if (e.direction !== directionId) return false;

        // 检查触发条件
        if (!checkTriggerCondition(e.trigger_condition)) return false;

        // 检查是否是一次性事件且已完成
        if (e.trigger_condition?.event_not_completed === e.id) {
            if (GameState.player.completedEvents.includes(e.id)) return false;
        }

        return true;
    });

    if (candidates.length === 0) return null;

    // 按权重随机选择
    const totalWeight = candidates.reduce((sum, e) => sum + (e.weight || 1), 0);
    let random = Math.random() * totalWeight;
    for (const event of candidates) {
        random -= (event.weight || 1);
        if (random <= 0) return event;
    }
    // 兜底返回最后一个
    return candidates[candidates.length - 1];
}

function checkTriggerCondition(condition) {
    if (!condition) return true;
    const p = GameState.player;
    
    // 属性检查
    if (condition.attribute) {
        for (const [attr, range] of Object.entries(condition.attribute)) {
            const val = p.attributes[attr];
            if (range.min !== undefined && val < range.min) return false;
            if (range.max !== undefined && val > range.max) return false;
        }
    }
    // 标签检查
    if (condition.tag_required) {
        for (const tag of condition.tag_required) {
            if (!p.tags.includes(tag)) return false;
        }
    }
    if (condition.tag_forbidden) {
        for (const tag of condition.tag_forbidden) {
            if (p.tags.includes(tag)) return false;
        }
    }
    
    // 新增：NPC 好感度检查
    if (condition.npc_affection) {
        for (const [npcId, range] of Object.entries(condition.npc_affection)) {
            const rel = p.relationships[npcId];
            const val = rel ? rel.affection : 0;
            if (range.min !== undefined && val < range.min) return false;
            if (range.max !== undefined && val > range.max) return false;
        }
    }
    
    // 新增：NPC 标签检查
    if (condition.npc_tags) {
        for (const [npcId, requiredTags] of Object.entries(condition.npc_tags)) {
            const rel = p.relationships[npcId];
            const npcTags = rel ? rel.tags : [];
            for (const tag of requiredTags) {
                if (!npcTags.includes(tag)) return false;
            }
        }
    }
    if (condition.npc_tags_forbidden) {
        for (const [npcId, forbiddenTags] of Object.entries(condition.npc_tags_forbidden)) {
            const rel = p.relationships[npcId];
            const npcTags = rel ? rel.tags : [];
            for (const tag of forbiddenTags) {
                if (npcTags.includes(tag)) return false;
            }
        }
    }

    // 学院检查
    if (condition.player_house) {
        if (p.house !== condition.player_house) return false;
    }
    if (condition.player_house_not) {
        // 支持字符串或数组格式
        const forbiddenHouses = Array.isArray(condition.player_house_not) 
            ? condition.player_house_not 
            : [condition.player_house_not];
        if (forbiddenHouses.includes(p.house)) return false;
    }

    // 性别检查
    if (condition.player_gender) {
        if (p.gender !== condition.player_gender) return false;
    }

    
    //学年检查
    if (condition.schoolYear) {
    if (condition.schoolYear.exact !== undefined && p.schoolYear !== condition.schoolYear.exact) return false;
    }

    // 时间检查（精确匹配）
    if (condition.month) {
        if (condition.month.exact !== undefined && p.month !== condition.month.exact) return false;
    }
    if (condition.week) {
        if (condition.week.exact !== undefined && p.week !== condition.week.exact) return false;
    }


    // 支持“或”逻辑条件组
    if (condition.or_conditions) {
        let anyMatch = false;
        for (const subCondition of condition.or_conditions) {
            if (checkTriggerCondition(subCondition)) {
                anyMatch = true;
                break;
            }
        }
        if (!anyMatch) return false;
    }


    // 检查某事件是否已完成（用于多阶段事件的条件）
    if (condition.event_completed) {
        if (!p.completedEvents.includes(condition.event_completed)) return false;
    }


    return true;
}

// 开始下一周
function startNextWeek() {
    advanceWeekSafely();
}

// 判断当前周是否属于假期或特殊时期（不能自由行动）
function isHolidayWeek() {
    const p = GameState.player;
    // 圣诞假期：12月第4周 或 1月第1周
    if ((p.month === 12 && p.week === 4) || (p.month === 1 && p.week === 1)) return true;
    // 复活节假期：3月第4周 或 4月第1周
    if ((p.month === 3 && p.week === 4) || (p.month === 4 && p.week === 1)) return true;
    // 期末考试周：6月第1-2周
    if (p.month === 6 && (p.week === 1 || p.week === 2)) return true;
    // 暑假：7月、8月全月，以及6月第3周之后
    if (p.month === 7 || p.month === 8) return true;
    if (p.month === 6 && p.week >= 3) return true;
    return false;
}

// 安全推进时间，自动跳过假期和特殊周，直到下一个正常周
function advanceWeekSafely() {
    const p = GameState.player;
    
    // 先推进一周
    p.week++;
    if (p.week > 4) {
        p.week = 1;
        p.month++;
        if (p.month > 12) {
            p.month = 1;
            p.year++;
        }
    }

    // 检查是否处于假期或特殊周，如果是则继续跳过
    let safety = 0;
    while (isHolidayWeek() && safety < 60) {
        // 先尝试触发假期/考试事件（如果有配置）
        if (p.month === 12 && p.week === 4) {
            // 圣诞假期开始
            triggerHolidayEvent('christmas');
            return; // 事件会接管后续流程
        }
        if (p.month === 1 && p.week === 1) {
            // 圣诞假期结束周（也可以触发事件）
            triggerHolidayEvent('christmas_end');
            return;
        }
        if (p.month === 3 && p.week === 4) {
            triggerHolidayEvent('easter');
            return;
        }
        if (p.month === 4 && p.week === 1) {
            triggerHolidayEvent('easter_end');
            return;
        }
        if (p.month === 6 && (p.week === 1 || p.week === 2)) {
            triggerExamEvent();
            return;
        }
        // 暑假开始：6月第3周
        if (p.month === 6 && p.week === 3) {
            triggerHolidayEvent('summer_start');
            return;
        }
        // 暑假结束：8月第4周 → 9月第1周（实际上在我们跳过7、8月后，会直接到9月）
        // 我们在暑假跳到9月之前，先触发暑假结束事件
        // 如果没有对应事件，直接推进到下一周
        p.week++;
        if (p.week > 4) {
            p.week = 1;
            p.month++;
            if (p.month > 12) {
                p.month = 1;
                p.year++;
            }
        if (p.month === 7 || p.month === 8) {
            // 先推进到9月，然后再触发事件
            p.month = 9;
            p.week = 1;
            p.schoolYear++;
            if (p.schoolYear > 7) {
                alert('恭喜毕业！');
                return;
            }
            triggerHolidayEvent('summer_end');
            return;
        }
        }
        safety++;
    }

    if (safety >= 60) {
        console.error('时间推进异常');
        return;
    }

    // 到达正常周，重置计划，进入行动安排
    GameState.weeklyPlan = [];
    GameState.usedActionPoints = 0;
    showPlanStage();
    updateTimeDisplay();
    saveGame();
}

//假期和考试事件触发函数
function triggerHolidayEvent(holidayType) {
    const holidayEvents = Events.filter(e => e.phase === 'holiday' && e.holiday === holidayType);
    if (holidayEvents.length > 0) {
        const event = holidayEvents[Math.floor(Math.random() * holidayEvents.length)];
        event._isHoliday = true; // 标记，用于回调
        showStage('event');
        renderEvent(event);
    } else {
        // 没有配置假期事件，直接继续推进时间
        advanceWeekSafely();
    }
}

function triggerExamEvent() {
    const examEvents = Events.filter(e => e.phase === 'exam');
    if (examEvents.length > 0) {
        const event = examEvents[Math.floor(Math.random() * examEvents.length)];
        event._isHoliday = true; // 同样使用 _isHoliday 标记，表示不能自由行动
        showStage('event');
        renderEvent(event);
    } else {
        advanceWeekSafely();
    }
}

// 存档
function saveGame() {
    localStorage.setItem('hogwarts_save', JSON.stringify(GameState.player));
}

// ---------- 事件渲染 ----------
function renderEvent(eventData) {
    // 性别代词替换
    const genderReplace = (text) => {
        if (!text || !GameState.player.gender) return text;
        const isMale = GameState.player.gender === 'male';
        return text
            .replace(/\{他\/她\}/g, isMale ? '他' : '她')
            .replace(/\{先生\/小姐\}/g, isMale ? '先生' : '小姐')
            .replace(/\{男孩\/女孩\}/g, isMale ? '男孩' : '女孩');
    };
    // 处理 description 是数组的函数（支持嵌套）
    function resolveDescription(desc) {
        if (Array.isArray(desc)) {
            const validVariants = desc.filter(v => {
                return !v.condition || checkTriggerCondition(v.condition);
            });
            if (validVariants.length > 0) {
                const chosen = validVariants[Math.floor(Math.random() * validVariants.length)];
                return chosen.text;
            }
            return '';
        }
        return desc;
    }
    
    eventData = JSON.parse(JSON.stringify(eventData));
    eventData.description = resolveDescription(eventData.description);
    if (eventData.title) eventData.title = genderReplace(eventData.title);
    if (eventData.description) eventData.description = genderReplace(eventData.description);
    if (eventData.choices) {
        eventData.choices = eventData.choices.map(c => ({
            ...c,
            text: genderReplace(c.text),
            follow_up: c.follow_up ? {
                ...c.follow_up,
                description: genderReplace(resolveDescription(c.follow_up.description)),
                sub_choices: c.follow_up.sub_choices ? c.follow_up.sub_choices.map(sc => ({
                    ...sc,
                    text: genderReplace(sc.text),
                    description: genderReplace(resolveDescription(sc.description)),
                    follow_up: sc.follow_up ? {
                        ...sc.follow_up,
                        description: genderReplace(resolveDescription(sc.follow_up.description))
                    } : undefined
                })) : undefined
            } : undefined
        }));
    }
    // 支持描述变体（description_variants）
    if (eventData.description_variants) {
        // 筛选满足条件的变体
        const validVariants = eventData.description_variants.filter(v => {
            return !v.condition || checkTriggerCondition(v.condition);
        });
        // 随机选一个
        if (validVariants.length > 0) {
            const chosen = validVariants[Math.floor(Math.random() * validVariants.length)];
            eventData.description = chosen.text;
        }
    }
    UI.eventTitle.textContent = eventData.title || '';
    UI.eventDescription.textContent = eventData.description || '';
    UI.eventChoices.innerHTML = '';
    UI.eventInputArea.style.display = 'none';
    UI.eventInput.value = '';
    
    // 处理文本输入类型（如序章输入名字）
    if (eventData.input) {
        UI.eventInputArea.style.display = 'block';
        UI.eventInput.placeholder = eventData.input.placeholder || '';
        UI.eventInput.focus();
        // 绑定回车事件
        UI.eventInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                const value = UI.eventInput.value.trim();
                if (value) {
                    handleEventInput(eventData, value);
                }
            }
        };
        return;
    }
    
    if (eventData.input) {
    UI.eventInputArea.style.display = 'block';
    UI.eventInput.placeholder = eventData.input.placeholder || '';
    UI.eventInput.focus();
    
    // 回车键提交（桌面端）
    UI.eventInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            const value = UI.eventInput.value.trim();
            if (value) {
                handleEventInput(eventData, value);
            }
        }
    };
    
    
    return;
}
    // 处理选项
    if (eventData.choices && eventData.choices.length > 0) {
        eventData.choices.forEach(choice => {
            const btn = document.createElement('button');
            btn.textContent = choice.text;
            
            // 检查条件
            if (choice.condition && !checkTriggerCondition(choice.condition)) {
                btn.disabled = true;
                btn.style.opacity = '0.5';
                btn.title = '条件不满足';
            } else {
                btn.addEventListener('click', () => handleEventChoice(eventData, choice));
            }
            
            UI.eventChoices.appendChild(btn);
        });
    }
    else {
        // 无选项，显示继续按钮
        const btn = document.createElement('button');
        btn.textContent = '继续';
        btn.addEventListener('click', () => handleEventEnd(eventData));
        UI.eventChoices.appendChild(btn);
    }
}

function handleEventInput(eventData, value) {
    if (eventData.input?.key === 'player_name') {
        GameState.player.name = value;
        updatePlayerUI();
        // 序章名字输入后，立刻显示底部栏
        UI.bottomBar.style.display = 'flex';
        proceedPrologue();
    }
}

function handleEventChoice(eventData, choice) {
    // 支持结果变体（outcome_variants）
    let actualEffect = choice.effect;
    let actualFollowUp = choice.follow_up;
    
    if (choice.outcome_variants) {
        const validOutcomes = choice.outcome_variants.filter(o => {
            return !o.condition || checkTriggerCondition(o.condition);
        });
        if (validOutcomes.length > 0) {
            const chosen = validOutcomes[Math.floor(Math.random() * validOutcomes.length)];
            actualEffect = chosen.effect;
            if (chosen.follow_up) {
                actualFollowUp = chosen.follow_up;
            }
        }
    }
    
    if (actualEffect) {
        applyEffect(actualEffect);
    }
    // 记录已完成事件（主线、一次性日常事件等）
    const isOneTime = eventData.trigger_condition?.event_not_completed === eventData.id;
    if ((eventData.phase !== 'daily' || isOneTime) && !GameState.player.completedEvents.includes(eventData.id)) {
        GameState.player.completedEvents.push(eventData.id);
    }
    updatePlayerUI();

    // 处理 follow_up
    if (actualFollowUp) {
        if (actualFollowUp.effect) {
            applyEffect(actualFollowUp.effect);
        }
        if (actualFollowUp.sub_choices) {
            renderSubChoices(eventData, actualFollowUp);
            return;
        }
        showFollowUpDescription(actualFollowUp, eventData);
        return;
    }

    // 没有 follow_up，直接进入下一阶段
    if (eventData.phase === 'daily') {
        // daily 事件结束后直接检查主线事件
        proceedToEvent();
    } else if (eventData.phase === 'prologue') {
        proceedPrologue();
    } else if (eventData.phase === 'main_story') {
        // 主故事事件结束后，重新检测是否有下一阶段事件
        proceedToEvent();
    } else if (eventData._isHoliday || eventData.phase === 'exam' || eventData.phase === 'holiday' || eventData.phase === 'main_story') {
        advanceWeekSafely();
    } else {
        startNextWeek();
    }
}

// 显示 follow_up 的文本，然后给一个继续按钮
function showFollowUpDescription(followUp, parentEvent) {
    UI.eventTitle.textContent = parentEvent.title || '';
    UI.eventDescription.textContent = followUp.description || '';
    UI.eventChoices.innerHTML = '';
    UI.eventInputArea.style.display = 'none';

    const btn = document.createElement('button');
    btn.textContent = '继续';
    btn.addEventListener('click', () => {
        // 继续流程
        if (parentEvent.phase === 'daily') {
            proceedToEvent();
        } else if (parentEvent.phase === 'prologue') {
            proceedPrologue();
        } else if (parentEvent.phase === 'main_story') {
            proceedToEvent();
        } else if (parentEvent._isHoliday || parentEvent.phase === 'exam' || parentEvent.phase === 'holiday' || parentEvent.phase === 'main_story') {
            advanceWeekSafely();
        } else {
            startNextWeek();
        }
    });
    UI.eventChoices.appendChild(btn);
}

// 渲染子选项
function renderSubChoices(parentEvent, followUp) {
    UI.eventTitle.textContent = parentEvent.title || '';
    UI.eventDescription.textContent = followUp.description || '';
    UI.eventChoices.innerHTML = '';
    UI.eventInputArea.style.display = 'none';

    followUp.sub_choices.forEach(sub => {
        const btn = document.createElement('button');
        btn.textContent = sub.text;
        
        // 检查子选项条件
        if (sub.condition && !checkTriggerCondition(sub.condition)) {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.title = '条件不满足';
        } else {
            btn.addEventListener('click', () => {
                // 应用子选项效果
                if (sub.effect) {
                    applyEffect(sub.effect);
                }
                updatePlayerUI();
                
                // 如果子选项有描述，先展示描述文本
                if (sub.description) {
                    UI.eventTitle.textContent = parentEvent.title || '';
                    UI.eventDescription.textContent = sub.description;
                    UI.eventChoices.innerHTML = '';
                    UI.eventInputArea.style.display = 'none';
                    
                    // 然后提供"继续"按钮进入后续流程
                    const nextBtn = document.createElement('button');
                    nextBtn.textContent = '继续';
                    nextBtn.addEventListener('click', () => {
                        // 子选项也可能有 follow_up
                        if (sub.follow_up) {
                            if (sub.follow_up.effect) {
                                applyEffect(sub.follow_up.effect);
                            }
                            showFollowUpDescription(sub.follow_up, parentEvent);
                        } else {
                            // 子选项结束，推进时间
                            if (parentEvent.phase === 'daily') {
                                proceedToEvent();
                            } else if (parentEvent.phase === 'prologue') {
                                proceedPrologue();
                            } else if (parentEvent.phase === 'main_story') {
                                proceedToEvent();
                            } else if (parentEvent._isHoliday || parentEvent.phase === 'exam' || parentEvent.phase === 'holiday' || parentEvent.phase === 'main_story') {
                                advanceWeekSafely();
                            } else {
                                startNextWeek();
                            }
                        }
                    });
                    UI.eventChoices.appendChild(nextBtn);
                } else {
                    // 没有描述，直接进入后续流程
                    if (sub.follow_up) {
                        if (sub.follow_up.effect) {
                            applyEffect(sub.follow_up.effect);
                        }
                        showFollowUpDescription(sub.follow_up, parentEvent);
                    } else {
                        if (parentEvent.phase === 'daily') {
                            proceedToEvent();
                        } else if (parentEvent.phase === 'prologue') {
                            proceedPrologue();
                        } else if (parentEvent.phase === 'main_story') {
                            proceedToEvent();
                        } else if (parentEvent._isHoliday || parentEvent.phase === 'exam' || parentEvent.phase === 'holiday' || parentEvent.phase === 'main_story') {
                            advanceWeekSafely();
                        } else {
                            startNextWeek();
                        }
                    }
                }
            });
        }
        UI.eventChoices.appendChild(btn);
    });
}



function handleEventEnd(eventData) {
    // 记录已完成事件（主线、一次性日常事件等）
    const isOneTime = eventData.trigger_condition?.event_not_completed === eventData.id;
    if ((eventData.phase !== 'daily' || isOneTime) && !GameState.player.completedEvents.includes(eventData.id)) {
        GameState.player.completedEvents.push(eventData.id);
    }

    if (eventData.phase === 'daily') {
        // daily 事件结束后直接检查主线事件
        proceedToEvent();
    } else if (eventData.phase === 'prologue') {
        proceedPrologue();
    } else if (eventData.phase === 'main_story') {
        // 主故事事件结束后，重新检测是否有下一阶段事件
        proceedToEvent();
    } else if (eventData._isHoliday || eventData.phase === 'exam' || eventData.phase === 'holiday') {
        // 假期或考试事件结束后，安全推进时间
        advanceWeekSafely();
    } else {
        startNextWeek();
    }
}

function applyEffect(effect) {
    const p = GameState.player;
    
    if (effect.house) {
        p.house = effect.house;
    }
    if (effect.set_gender) {
        p.gender = effect.set_gender;
    }
    if (effect.attributes) {
        Object.entries(effect.attributes).forEach(([attr, val]) => {
            p.attributes[attr] = (p.attributes[attr] || 0) + val;
        });
    }
    if (effect.tags_add) {
        effect.tags_add.forEach(tag => {
            if (!p.tags.includes(tag)) p.tags.push(tag);
        });
    }
    if (effect.tags_remove) {
        p.tags = p.tags.filter(t => !effect.tags_remove.includes(t));
    }
    if (effect.record_event) {
        p.completedEvents.push(effect.record_event);
    }
    
    // 新增：处理 NPC 关系变化
    if (effect.relationships) {
        // effect.relationships 可以是两种格式：
        // 1. 直接加减好感度：{ "harry_potter": 20 }
        // 2. 设置标签：{ "harry_potter": { "affection_change": 20, "tags_add": ["羁绊"], "tags_remove": ["对手"] } }
        Object.entries(effect.relationships).forEach(([npcId, value]) => {
            if (!p.relationships[npcId]) {
                p.relationships[npcId] = { affection: 0, tags: [] };
            }
            const rel = p.relationships[npcId];
            
            if (typeof value === 'number') {
                // 简单格式：数字直接加减好感度
                rel.affection += value;
            } else if (typeof value === 'object') {
                // 对象格式：可包含 affection_change, tags_add, tags_remove
                if (value.affection_change) {
                    rel.affection += value.affection_change;
                }
                if (value.tags_add) {
                    value.tags_add.forEach(tag => {
                        if (!rel.tags.includes(tag)) rel.tags.push(tag);
                    });
                }
                if (value.tags_remove) {
                    rel.tags = rel.tags.filter(t => !value.tags_remove.includes(t));
                }
            }
            
            // 限制好感度范围
            if (rel.affection > 100) rel.affection = 100;
            if (rel.affection < -50) rel.affection = -50;
        });
    }
}

// ---------- 序章流程 ----------
function showPrologueEvent() {
    if (GameState.currentPrologueIndex >= GameState.prologueEvents.length) {
        // 序章结束，进入第一周
        finishPrologue();
        return;
    }
    const eventData = GameState.prologueEvents[GameState.currentPrologueIndex];
    renderEvent(eventData);
}

function proceedPrologue() {
    // 记录当前序章事件为已完成（防止重复）
    const currentEvent = GameState.prologueEvents[GameState.currentPrologueIndex];
    if (currentEvent && !GameState.player.completedEvents.includes(currentEvent.id)) {
        GameState.player.completedEvents.push(currentEvent.id);
    }
    GameState.currentPrologueIndex++;
    
    // 短暂延迟后显示下一个事件
    setTimeout(() => {
        showPrologueEvent();
    }, 100);
}

function finishPrologue() {
    UI.bottomBar.style.display = 'flex';
    GameState.player.schoolYear = 1;
    GameState.player.year = 1991;
    GameState.player.month = 9;
    GameState.player.week = 1;
    updatePlayerUI();
    updateTimeDisplay();
    showPlanStage();
    saveGame();
}

// ---------- 事件绑定 ----------
function bindEvents() {
    // 菜单
    document.getElementById('menu-btn').addEventListener('click', () => {
        UI.menuModal.style.display = 'flex';
    });
    document.getElementById('btn-close-menu').addEventListener('click', () => {
        UI.menuModal.style.display = 'none';
    });
    document.getElementById('btn-save').addEventListener('click', () => {
        saveGame();
        alert('游戏已保存！');
        UI.menuModal.style.display = 'none';
    });
    document.getElementById('btn-load').addEventListener('click', () => {
        const saved = localStorage.getItem('hogwarts_save');
        if (saved) {
            GameState.player = JSON.parse(saved);
            GameState.weeklyPlan = [];
            GameState.usedActionPoints = 0;
            GameState.currentPrologueIndex = 999; // 跳过序章
            updatePlayerUI();
            updateTimeDisplay();
            showPlanStage();
            UI.menuModal.style.display = 'none';
        } else {
            alert('没有找到存档。');
        }
    });
    
    // 阶段一按钮
    document.getElementById('btn-add-action').addEventListener('click', showMapStage);
    document.getElementById('btn-confirm').addEventListener('click', confirmPlan);
    document.getElementById('btn-skip-week').addEventListener('click', skipWeek);

    // 阶段二按钮
    document.getElementById('btn-back-from-map').addEventListener('click', showPlanStage);
    document.getElementById('btn-back-from-direction').addEventListener('click', showMapStage);
    
    // 阶段三按钮
    document.getElementById('btn-continue').addEventListener('click', proceedToEvent);

    // 输入确认按钮（移动端）
    document.getElementById('event-input-btn').addEventListener('click', () => {
    const value = UI.eventInput.value.trim();
    if (value) {
        // 通过当前序章事件来处理输入
        const currentEvent = GameState.prologueEvents[GameState.currentPrologueIndex];
        if (currentEvent && currentEvent.input) {
            handleEventInput(currentEvent, value);
        }
    }
    });
    // 同上一周行动
    document.getElementById('btn-repeat-last').addEventListener('click', () => {
        if (GameState.lastWeekPlan.length === 0) {
            alert('没有上一周的行动记录。');
            return;
        }
        // 检查行动点是否够用
        if (GameState.lastWeekPlan.length > (GameState.maxActionPoints - GameState.usedActionPoints)) {
            alert('行动点不足，无法完全复制上一周计划。');
            return;
        }
        // 清空当前计划
        GameState.weeklyPlan = [];
        GameState.usedActionPoints = 0;
        // 复制上一周计划
        GameState.weeklyPlan = [...GameState.lastWeekPlan];
        GameState.usedActionPoints = GameState.weeklyPlan.length;
        renderPlanList();
        UI.actionPoints.textContent = GameState.maxActionPoints - GameState.usedActionPoints;
    });

    // 人际关系面板
    document.getElementById('btn-relationships').addEventListener('click', () => {
        renderRelationships();
        document.getElementById('relationships-modal').style.display = 'flex';
    });
    document.getElementById('btn-close-relationships').addEventListener('click', () => {
        document.getElementById('relationships-modal').style.display = 'none';
    });
}

function renderRelationships() {
    const list = document.getElementById('relationships-list');
    list.innerHTML = '';
    
    const houseIcons = { '格兰芬多': '🦁', '斯莱特林': '🐍', '赫奇帕奇': '🦡', '拉文克劳': '🦅' };
    
    const rels = GameState.player.relationships;
    Object.entries(rels).forEach(([npcId, data]) => {
        const npc = NPCs[npcId];
        if (!npc) return;
        
        const row = document.createElement('div');
        row.className = 'npc-row';
        
        // 好感度颜色
        let affectionClass = 'neutral';
        if (data.affection >= 30) affectionClass = 'positive';
        else if (data.affection <= -10) affectionClass = 'negative';
        
        // 标签显示
        const tagDisplay = data.tags.length > 0 
            ? data.tags.map(t => `【${t}】`).join(' ') 
            : '';
        
        // 学院图标
        const icon = houseIcons[npc.house] || '';
        
        row.innerHTML = `
            <div class="npc-name">${icon ? icon + ' ' : ''}${npc.name}</div>
            <div class="npc-affection ${affectionClass}">好感度：${data.affection}</div>
            ${tagDisplay ? `<div class="npc-tags">${tagDisplay}</div>` : ''}
        `;
        list.appendChild(row);
    });
}



// ---------- 启动游戏 ----------
window.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    initGame();
});