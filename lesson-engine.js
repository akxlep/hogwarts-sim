// ==================== 课堂系统 ====================
// 独立模块，负责每周课程页面，数据源：data/lessons.json
// 依赖全局变量：GameState, checkTriggerCondition, showStage, updateTimeDisplay, saveGame

// 课堂系统自己的数据
let LessonEvents = [];

// 初始化：加载课程事件数据
async function loadLessonData() {
    try {
        const response = await fetch('data/lessons.json');
        LessonEvents = await response.json();
        console.log('课程事件加载完成，共', LessonEvents.length, '条');
    } catch (error) {
        console.error('课程事件加载失败:', error);
        LessonEvents = [];
    }
}

// ---------- 课程页面 ----------

function showLessonStage() {
    // 切换到课程页面
    showStage('lesson');
    
    // 随机抽取课程片段
    const lessons = selectWeeklyLessons();
    
    // 渲染文本
    renderLessonTexts(lessons);
    
    // 更新时间和保存
    updateTimeDisplay();
    saveGame();
}

function selectWeeklyLessons() {
    // 1. 筛选所有满足条件的课程事件
    const allCandidates = LessonEvents.filter(e => {
        if (e.phase !== 'lesson') return false;
        if (!checkTriggerCondition(e.trigger_condition || {})) return false;
        return true;
    });
    
    if (allCandidates.length === 0) return [];
    
    // 2. 按课程分组
    const grouped = {};
    allCandidates.forEach(e => {
        const subject = e.subject || '其他';
        if (!grouped[subject]) grouped[subject] = [];
        grouped[subject].push(e);
    });
    
    // 3. 获取所有有候选事件的课程列表
    const availableSubjects = Object.keys(grouped);
    
    if (availableSubjects.length === 0) return [];
    
    // 4. 随机决定本周抽取几门课（3-5门，但不能超过可用课程数）
    const maxCount = Math.min(5, availableSubjects.length);
    const minCount = Math.min(3, availableSubjects.length);
    const count = Math.floor(Math.random() * (maxCount - minCount + 1)) + minCount;
    
    // 5. 随机选择本周的课程
    const shuffledSubjects = [...availableSubjects].sort(() => Math.random() - 0.5);
    const selectedSubjects = shuffledSubjects.slice(0, count);
    
    // 6. 从每门被选中的课程中随机抽取一个事件
    const selectedEvents = [];
    selectedSubjects.forEach(subject => {
        const candidates = grouped[subject];
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        selectedEvents.push(chosen);
    });
    
    return selectedEvents;
}

function renderLessonTexts(lessons) {
    const list = document.getElementById('lesson-list');
    list.innerHTML = '';
    
    if (lessons.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'lesson-text';
        emptyDiv.innerHTML = `
            <p>本学期的课程已经全部结束。</p>
            <p>你现在可以自由安排时间，为期末考试做准备。</p>
        `;
        list.appendChild(emptyDiv);
        return;
    }
    
    lessons.forEach(lesson => {
        // 如果有变体，随机选一个；否则用默认文本
        let text = lesson.text || '';
        if (lesson.text_variants && lesson.text_variants.length > 0) {
            const chosen = lesson.text_variants[Math.floor(Math.random() * lesson.text_variants.length)];
            text = chosen.text;
        }
        
        const div = document.createElement('div');
        div.className = 'lesson-text';
        div.innerHTML = `<p>${text}</p>`;
        list.appendChild(div);
        
        // 记录为已完成（课程事件只触发一次）
        if (!GameState.player.completedEvents.includes(lesson.id)) {
            GameState.player.completedEvents.push(lesson.id);
        }
    });
}

// 暴露到全局，供 game-engine.js 和测试调用
window.showLessonStage = showLessonStage;

// 页面加载时自动初始化
window.addEventListener('DOMContentLoaded', () => {
    loadLessonData();
});