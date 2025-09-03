// static/js/planner.js (ハイライト機能改良・最終版)

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素の取得 ---
    const calendarContainer = document.getElementById('calendar-container');
    const unassignedList = document.getElementById('unassigned-lessons-list');
    const analysisSummary = document.getElementById('analysis-summary');
    const teacherFilterBar = document.getElementById('teacher-filter-bar');
    const tooltip = document.getElementById('planner-tooltip');
    const teacherSelectModal = document.getElementById('teacher-select-modal');
    const teacherOptionsContainer = document.getElementById('teacher-options-container');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const lessonEditModal = document.getElementById('lesson-edit-modal');
    const lessonEditModalTitle = document.getElementById('lesson-edit-modal-title');
    const lessonEditModalBody = document.getElementById('lesson-edit-modal-body');
    const lessonEditModalCloseBtn = document.getElementById('modal-close-btn');
    const lessonSwapModal = document.getElementById('lesson-swap-modal');
    const lessonSwapModalBody = document.getElementById('lesson-swap-modal-body');
    const lessonSwapModalCancelBtn = document.getElementById('modal-swap-cancel-btn');
    const lockModeToggleBtn = document.getElementById('lock-mode-toggle-btn');
    const studentGradeFilterBar = document.getElementById('student-grade-filter-bar');

    // ▼▼▼ 自動配置関連のDOM要素をまとめて取得 ▼▼▼
    const autoAssign = {
        openModalBtn: document.getElementById('open-auto-assign-modal-btn'),
        modal: document.getElementById('auto-assign-modal'),
        executeBtn: document.getElementById('execute-auto-assign-btn'),
        cancelBtn: document.getElementById('cancel-auto-assign-btn'),
        loadingOverlay: document.getElementById('loading-overlay'),
        loadingProgress: document.getElementById('loading-progress'),
        // オプション入力要素
        enableIntervalRule: document.getElementById('enable-interval-rule'),
        intervalDays: document.getElementById('interval-days'),
        intervalStrength: document.getElementById('interval-strength'),
        enablePreferredRule: document.getElementById('enable-preferred-rule'),
        preferredStrength: document.getElementById('preferred-strength')
    };

    // --- 状態管理 ---
    const periodId = window.location.pathname.split('/').pop();
    let plannerData = {};
    let activeTeacherIds = [];
    let selection = { mode: 'add', studentId: null, subjectId: null, lessonId: null, element: null };
    let placementInfo = {};
    let isLockMode = false
    let activeGradeFilter = 'all';
    const timeSlotsMaster = [ { id: 1, weekday: '9:00-10:00', weekend: '9:00-10:00' }, { id: 2, weekday: '10:10-11:10', weekend: '10:10-11:10' }, { id: 3, weekday: '11:20-12:20', weekend: '11:20-12:20' }, { id: 4, weekday: '12:30-13:30', weekend: '12:30-13:30' }, { id: 5, weekday: '14:10-15:10', weekend: '13:40-14:40' }, { id: 6, weekday: '15:15-16:15', weekend: '14:50-15:50' }, { id: 7, weekday: '16:20-17:20', weekend: '16:00-17:00' }, { id: 8, weekday: '17:25-18:25', weekend: '17:10-18:10' }, { id: 9, weekday: '18:30-19:30', weekend: '18:20-19:20' }, { id: 10, weekday: '19:35-20:35', weekend: '19:30-20:30' }, { id: 11, weekday: '20:40-21:40', weekend: '20:40-21:40' } ];

    async function initializePlanner() {
        if (!periodId) {
            calendarContainer.innerHTML = '<p>エラー: 計画期間IDが見つかりません。</p>';
            return;
        }
        try {
            const response = await fetch(`/api/planner-data/${periodId}`);
            if (!response.ok) throw new Error('プランナーデータの取得に失敗しました。');
            plannerData = await response.json();
            renderTeacherFilter();
            activeTeacherIds = plannerData.teachers.map(t => t.id);
            updateTeacherFilterUI();
            updateStudentGradeFilterUI();
            renderAll();
        } catch (error) {
            console.error(error);
            calendarContainer.innerHTML = `<p>エラーが発生しました: ${error.message}</p>`;
        }
    }

    function renderAll() {
        renderCalendar();
        renderUnassignedLessons();
        renderAnalysisSummary();
        highlightSlots(); // ★★★ 関数名を変更 ★★★
        updateRuleViolationHighlights();
    }

    function renderTeacherFilter() {
        while (teacherFilterBar.children.length > 1) {
            teacherFilterBar.removeChild(teacherFilterBar.lastChild);
        }
        plannerData.teachers.forEach(teacher => {
            const btn = document.createElement('button');
            btn.className = 'teacher-filter-btn';
            btn.dataset.teacherId = teacher.id;
            btn.textContent = teacher.display_name; 
            teacherFilterBar.appendChild(btn);
        });
    }

    function updateTeacherFilterUI() {
        const allBtn = document.querySelector('[data-teacher-id="all"]');
        const teacherBtns = document.querySelectorAll('.teacher-filter-btn:not([data-teacher-id="all"])');
        
        allBtn.classList.toggle('active', activeTeacherIds.length === plannerData.teachers.length);
        teacherBtns.forEach(btn => {
            const teacherId = parseInt(btn.dataset.teacherId, 10);
            btn.classList.toggle('active', activeTeacherIds.includes(teacherId));
        });

        // ロックモードボタンの有効/無効を切り替え
        if (activeTeacherIds.length === 1) {
            lockModeToggleBtn.disabled = false;
        } else {
            lockModeToggleBtn.disabled = true;
            if (isLockMode) { // 複数講師選択になったら強制的にロックモードOFF
                toggleLockMode(); 
            }
        }
    }

    function updateStudentGradeFilterUI() {
        studentGradeFilterBar.querySelectorAll('.teacher-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.grade === activeGradeFilter);
        });
    }
    
    // (renderCalendar, renderUnassignedLessons, renderAnalysisSummary は変更なし)
    function renderCalendar() {
        const { period, assignments } = plannerData;
        const startDate = new Date(period.start_date);
        const endDate = new Date(period.end_date);
        const aWeek = ['日', '月', '火', '水', '木', '金', '土'];
        const table = document.createElement('table');
        table.className = 'schedule-table';
        const thead = table.createTHead();
        const headerRow = thead.insertRow();
        headerRow.innerHTML = '<th class="time-header">時間</th>';
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            let dayClass = d.getDay() === 0 ? 'sunday' : d.getDay() === 6 ? 'saturday' : 'weekday';
            headerRow.innerHTML += `<th class="${dayClass}">${d.getMonth() + 1}/${d.getDate()}<br>${aWeek[d.getDay()]}</th>`;
        }
        const tbody = table.createTBody();
        timeSlotsMaster.forEach(ts => {
            const row = tbody.insertRow();
            row.innerHTML = `<td class="time-slot"><div class="weekday-time">${ts.weekday}</div><div class="weekend-time">${ts.weekend}</div></td>`;
            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const cell = row.insertCell();
                cell.dataset.date = dateStr;
                cell.dataset.timeSlotId = ts.id;
                const key = `${dateStr}-${ts.id}`;
                const assignmentsInSlot = assignments[key] || [];
                const activeAssignments = assignmentsInSlot.filter(a => activeTeacherIds.includes(a.teacher_id));

                if (activeAssignments.length > 0) {
                    const isDetailMode = activeTeacherIds.length === 1;
                    if (isDetailMode) {
                        cell.classList.add('assigned-slot');
                        const lessonContainer = document.createElement('div');
                        lessonContainer.className = 'lesson-container';
                        const assignment = activeAssignments[0];
                        assignment.lessons.forEach(l => {
                            const lessonEl = document.createElement('div');
                            lessonEl.className = 'lesson-item';
                            lessonEl.dataset.lessonId = l.id;
                            if (l.status === 'locked') {
                                lessonEl.classList.add('locked');
                            }
                            lessonEl.textContent = `${l.student_name}: ${l.subject_name.slice(0, 2)}`;
                            lessonContainer.appendChild(lessonEl);
                        });
                        cell.appendChild(lessonContainer);
                    } else { // 複数講師モード (変更なし)
                        const totalTeachers = activeAssignments.length;
                        const totalLessons = activeAssignments.reduce((sum, a) => sum + a.lessons.length, 0);
                        cell.innerHTML = `👨‍🏫 ${totalTeachers}人<br>🎓 ${totalLessons}人`;
                        cell.classList.add('summary-slot');
                        const tooltipContent = activeAssignments.map(a => `[${a.teacher_name}]\n` + a.lessons.map(l => `  - ${l.student_name}: ${l.subject_name}`).join('\n')).join('\n------------------\n');
                        cell.dataset.tooltipContent = tooltipContent;
                    }
                }
            }
        });
        calendarContainer.innerHTML = '';
        calendarContainer.appendChild(table);
    }
    function renderUnassignedLessons() {
        // ▼▼▼ この関数を全面的に置き換え ▼▼▼
        const { unassigned_lessons } = plannerData;
        
        if (!unassigned_lessons || unassigned_lessons.length === 0) {
            unassignedList.innerHTML = '<p>全てのレッスンが配置済みです！</p>';
            return;
        }

        // 1. 学年でフィルタリング
        const filtered_lessons = unassigned_lessons.filter(lesson => {
            if (activeGradeFilter === 'all') return true;
            if (activeGradeFilter === '小学') return lesson.student_grade.startsWith('小');
            return lesson.student_grade === activeGradeFilter;
        });

        if (filtered_lessons.length === 0) {
            unassignedList.innerHTML = '<p>この学年の未配置レッスンはありません。</p>';
            return;
        }

        // 2. 生徒ごとにデータを再構成
        const studentsMap = {};
        filtered_lessons.forEach(lesson => {
            if (!studentsMap[lesson.student_id]) {
                studentsMap[lesson.student_id] = {
                    student_name: lesson.student_name,
                    total_lessons: 0,
                    subjects: []
                };
            }
            studentsMap[lesson.student_id].total_lessons += lesson.count;
            studentsMap[lesson.student_id].subjects.push({
                name: lesson.subject_name,
                count: lesson.count,
                student_id: lesson.student_id,
                subject_id: lesson.subject_id
            });
        });

        // 3. 新しい形式でHTMLを生成 (この部分は変更なし)
        let listHTML = '<ul>';
        for (const studentId in studentsMap) {
            const student = studentsMap[studentId];
            const subjectsHTML = student.subjects.map(subject => 
                `<span class="unassigned-subject" data-student-id="${subject.student_id}" data-subject-id="${subject.subject_id}">
                    ${subject.name.slice(0, 2)}(${subject.count})
                </span>`
            ).join(' ');
            listHTML += `
                <li class="unassigned-student-group">
                    <div class="student-name-header">
                        <span class="student-name">${student.student_name}</span>
                        <span class="lesson-count">[残り${student.total_lessons}コマ]</span>
                    </div>
                    <div class="subjects-container">${subjectsHTML}</div>
                </li>
            `;
        }
        listHTML += '</ul>';
        unassignedList.innerHTML = listHTML;
    }

    function renderAnalysisSummary() {
        const { unassigned_lessons, assignments } = plannerData;
        const totalAssigned = Object.values(assignments).flat().reduce((sum, a) => sum + a.lessons.length, 0);
        const totalRequested = (unassigned_lessons || []).reduce((sum, l) => sum + l.count, 0) + totalAssigned;
        const fulfillmentRate = totalRequested > 0 ? ((totalAssigned / totalRequested) * 100).toFixed(1) : '---';
        analysisSummary.innerHTML = `<p>授業消化率: ${fulfillmentRate}%</p><p>配置済レッスン数: ${totalAssigned}</p><p>総希望レッスン数: ${totalRequested}</p>`;
    }


    // --- イベントリスナー ---
    teacherFilterBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.teacher-filter-btn');
        if (!btn) return;
        const teacherIdStr = btn.dataset.teacherId;
        if (teacherIdStr === 'all') {
            activeTeacherIds = activeTeacherIds.length === plannerData.teachers.length ? [] : plannerData.teachers.map(t => t.id);
        } else {
            const teacherId = parseInt(teacherIdStr, 10);
            const index = activeTeacherIds.indexOf(teacherId);
            if (index > -1) activeTeacherIds.splice(index, 1);
            else activeTeacherIds.push(teacherId);
        }
        updateTeacherFilterUI();
        renderCalendar();
        highlightSlots(); // ★★★ 関数名を変更 ★★★
        updateRuleViolationHighlights();
    });

    teacherFilterBar.addEventListener('dblclick', (e) => {
        const btn = e.target.closest('.teacher-filter-btn');
        if (!btn) return;

        const teacherIdStr = btn.dataset.teacherId;
        // 「全員」ボタンのダブルクリックは無視します
        if (teacherIdStr === 'all') {
            return;
        }

        const teacherId = parseInt(teacherIdStr, 10);
        
        // ダブルクリックされた講師IDのみを activeTeacherIds に設定
        activeTeacherIds = [teacherId];

        // UIとカレンダー全体を再描画
        updateTeacherFilterUI();
        renderAll();
    });

    unassignedList.addEventListener('click', (e) => {
        // ▼▼▼ クリック対象を li から .unassigned-subject に変更 ▼▼▼
        const subjectSpan = e.target.closest('.unassigned-subject');
        if (!subjectSpan) {
            // 科目ボックス以外がクリックされた場合は、選択をリセットする
            resetSelection();
            return;
        }

        // すでに選択されている科目を再度クリックした場合
        if (subjectSpan.classList.contains('selected')) {
            resetSelection();
            return;
        }

        // 新しい科目を選択
        resetSelection(); // まず全選択を解除
        selection.mode = 'add';
        selection.studentId = subjectSpan.dataset.studentId;
        selection.subjectId = subjectSpan.dataset.subjectId;
        selection.element = subjectSpan; // 選択要素をspanに変更
        
        subjectSpan.classList.add('selected'); // クリックされた科目ボックスのみをハイライト
        highlightSlots(); // カレンダーの配置可能コマを更新
    });

    // ▼▼▼ 自動配置モーダルを開く ▼▼▼
    autoAssign.openModalBtn.addEventListener('click', () => {
        autoAssign.modal.classList.remove('hidden');
    });

    // ▼▼▼ 自動配置モーダルを閉じる ▼▼▼
    autoAssign.cancelBtn.addEventListener('click', () => {
        autoAssign.modal.classList.add('hidden');
    });

    // ▼▼▼ 自動配置を実行する ▼▼▼
    autoAssign.executeBtn.addEventListener('click', async () => {
        autoAssign.modal.classList.add('hidden');
        autoAssign.loadingOverlay.classList.remove('hidden');

        try {
            // オプションを取得
            const options = {};
            if (autoAssign.enableIntervalRule.checked) {
                options.subject_interval_days = parseInt(autoAssign.intervalDays.value, 10);
                options.interval_strength = autoAssign.intervalStrength.value;
            }
            if (autoAssign.enablePreferredRule.checked) {
                options.preferred_strength = autoAssign.preferredStrength.value;
            }

            // APIを呼び出し
            const response = await fetch('/api/planner/auto-assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ period_id: periodId, options: options })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || '自動配置に失敗しました。');
            
            alert('自動配置が完了しました！');
            initializePlanner();

        } catch (error) {
            alert(`エラーが発生しました: ${error.message}`);
            console.error(error);
        } finally {
            autoAssign.loadingOverlay.classList.add('hidden');
            resetSelection();
        }
    });
    
    calendarContainer.addEventListener('click', async (e) => {
        const lessonEl = e.target.closest('.lesson-item');
        // ロックモード時の処理
        if (isLockMode && lessonEl && activeTeacherIds.length === 1) {
            const lessonId = lessonEl.dataset.lessonId;
            try {
                const response = await fetch(`/api/planner/lessons/${lessonId}/toggle-lock`, { method: 'POST' });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'ロック状態の変更に失敗');
                
                // UIを即時更新
                lessonEl.classList.toggle('locked', result.new_status === 'locked');

                // 内部データも更新
                const { date, timeSlotId } = lessonEl.closest('td').dataset;
                const key = `${date}-${timeSlotId}`;
                const assignment = plannerData.assignments[key]?.find(a => a.teacher_id === activeTeacherIds[0]);
                if (assignment) {
                    const lessonData = assignment.lessons.find(l => l.id == lessonId);
                    if (lessonData) lessonData.status = result.new_status;
                }
                
            } catch (error) {
                alert(`エラー: ${error.message}`);
            }
            return; // 通常のクリック処理を中断
        }

        const cell = e.target.closest('td');
        if (!cell || !cell.dataset.date) return;

        if (cell.classList.contains('possible-slot')) {
            const { date, timeSlotId, availableTeacherIds } = cell.dataset;
            const teacherIds = availableTeacherIds.split(',').map(id => parseInt(id));
            if (teacherIds.length === 1) {
                handleSlotClick(date, timeSlotId, teacherIds[0]);
            } else if (teacherIds.length > 1) {
                placementInfo = { date, timeSlotId };
                showTeacherSelectModal(teacherIds);
            }
            return;
        }

        if (cell.classList.contains('assigned-slot') || cell.classList.contains('summary-slot')) {
            showLessonEditModal(cell.dataset.date, cell.dataset.timeSlotId);
        }
    });
    lessonEditModalBody.addEventListener('click', async (e) => {
        const target = e.target;
        if (target.classList.contains('delete-lesson-btn')) {
            const lessonId = target.dataset.lessonId;
            const lessonText = target.closest('.lesson-item').querySelector('span').textContent;
            if (confirm(`「${lessonText}」のレッスンを削除しますか？`)) {
                try {
                    const response = await fetch(`/api/planner/lessons/${lessonId}`, { method: 'DELETE' });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error || '削除に失敗しました。');
                    alert(result.message);
                    lessonEditModal.classList.add('hidden');
                    initializePlanner();
                } catch (error) {
                    alert(`エラー: ${error.message}`);
                    console.error(error);
                }
            }
        }
        if (target.classList.contains('edit-lesson-btn')) {
            const lessonId = target.dataset.lessonId;
            const lesson = findLessonById(lessonId);
            if(lesson){
                selection.mode = 'move';
                selection.lessonId = lesson.id;
                selection.studentId = lesson.student_id;
                selection.subjectId = lesson.subject_id;
                lessonEditModal.classList.add('hidden');
                alert('移動先のコマを選択してください。');
                highlightSlots(); // ★★★ 関数名を変更 ★★★
            }
        }
    });
    lessonSwapModalBody.addEventListener('click', (e) => {
        const target = e.target.closest('.swap-option');
        if (target) {
            const lessonToDeleteId = target.dataset.lessonId;
            placeLesson(placementInfo.date, placementInfo.timeSlotId, placementInfo.teacherId, lessonToDeleteId);
        }
    });
    calendarContainer.addEventListener('mouseover', (e) => {
        const cell = e.target.closest('td.summary-slot');
        if (cell && cell.dataset.tooltipContent) {
            // 1. ツールチップに内容をセットして表示状態にする
            tooltip.textContent = cell.dataset.tooltipContent;
            tooltip.style.display = 'block';

            // 2. 必要なサイズと位置情報を取得
            const rect = cell.getBoundingClientRect();
            const tooltipHeight = tooltip.offsetHeight;
            const tooltipWidth = tooltip.offsetWidth;
            const windowHeight = window.innerHeight;
            const windowWidth = window.innerWidth;

            // 3. 垂直位置（Y軸）を決定
            if (rect.bottom + tooltipHeight + 5 > windowHeight) {
                // 下にはみ出す場合 -> セルの「上」に表示
                tooltip.style.top = `${rect.top + window.scrollY - tooltipHeight - 5}px`;
            } else {
                // 通常 -> セルの「下」に表示
                tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
            }

            // 4. 水平位置（X軸）を決定
            if (rect.left + tooltipWidth > windowWidth) {
                // 右にはみ出す場合 -> 画面の右端に合わせる
                tooltip.style.left = `${windowWidth - tooltipWidth - 10 + window.scrollX}px`;
            } else {
                // 通常 -> セルの左端に合わせる
                tooltip.style.left = `${rect.left + window.scrollX}px`;
            }
        }
    });
    calendarContainer.addEventListener('mouseout', () => tooltip.style.display = 'none');
    modalCancelBtn.addEventListener('click', () => teacherSelectModal.classList.add('hidden'));
    lessonEditModalCloseBtn.addEventListener('click', () => lessonEditModal.classList.add('hidden'));
    lessonSwapModalCancelBtn.addEventListener('click', () => lessonSwapModal.classList.add('hidden'));
    teacherOptionsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.teacher-option');
        if (btn) {
            const teacherId = parseInt(btn.dataset.teacherId);
            handleSlotClick(placementInfo.date, placementInfo.timeSlotId, teacherId);
        }
    });


    // --- ヘルパー関数 ---
    function handleSlotClick(date, timeSlotId, teacherId) {
        const assignKey = `${date}-${timeSlotId}`;
        const assignmentsInSlot = plannerData.assignments[assignKey] || [];
        const teacherAssignment = assignmentsInSlot.find(a => a.teacher_id === teacherId);

        if (selection.mode === 'add' || selection.mode === 'move') {
            if (teacherAssignment && teacherAssignment.lessons.length >= 2) {
                placementInfo = { date, timeSlotId, teacherId };
                showSwapLessonModal(teacherAssignment.lessons);
            } else if (selection.mode === 'add') {
                placeLesson(date, timeSlotId, teacherId);
            } else { // 'move'
                moveLesson(date, timeSlotId, teacherId);
            }
        }
    }

    
    // --- ★★★ highlightSlots を全面的に刷新 ★★★ ---
    function highlightSlots() {
        // 既存のハイライトをすべてクリア
        document.querySelectorAll('td[class*="-slot"], td[class*="-highlight"]').forEach(cell => {
            cell.className = cell.className.replace(/possible-slot|empty-and-possible|shift-highlight|dense-\d/g, '').trim();
            delete cell.dataset.availableTeacherIds;
        });

        const allCells = document.querySelectorAll('#calendar-container td[data-date]');

        // レッスン選択中（配置・移動モード）
        if (selection.studentId) {
            allCells.forEach(cell => {
                const { date, timeSlotId } = cell.dataset;
                const teachersWithShift = activeTeacherIds.filter(id => plannerData.shifts[`${date}-${id}-${timeSlotId}`]);
                
                if (teachersWithShift.length > 0) {
                    cell.classList.add('possible-slot');
                    cell.dataset.availableTeacherIds = teachersWithShift.join(',');
                    
                    // 人数に応じて緑色の濃度を変更
                    const densityClass = `possible-slot-dense-${Math.min(teachersWithShift.length, 4)}`;
                    cell.classList.add(densityClass);

                    const key = `${date}-${timeSlotId}`;
                    if (!plannerData.assignments[key]) {
                        cell.classList.add('empty-and-possible');
                    }
                }
            });
        } 
        
        // --- レッスン未選択時（シフト確認モード）---
        else {
            allCells.forEach(cell => {
                const { date, timeSlotId } = cell.dataset;
                // 表示中の講師の中で、このコマにシフトがある人数をカウント
                const teachersWithShiftCount = activeTeacherIds.reduce((count, id) => {
                    return plannerData.shifts[`${date}-${id}-${timeSlotId}`] ? count + 1 : count;
                }, 0);

                if (teachersWithShiftCount > 0) {
                    cell.classList.add('shift-highlight'); // 基本のハイライトクラス
                    
                    // 人数に応じて青色の濃度を変更するクラスを追加
                    const densityClass = `shift-highlight-dense-${Math.min(teachersWithShiftCount, 4)}`;
                    cell.classList.add(densityClass);
                }
            });
        }
    }
    
    // (updateRuleViolationHighlights, show...Modal, findLessonById, place/moveLesson は変更なし)
    function updateRuleViolationHighlights() {
        document.querySelectorAll('td.violation-slot').forEach(cell => cell.classList.remove('violation-slot'));
        const allCells = document.querySelectorAll('#calendar-container td[data-date]');
        allCells.forEach(cell => {
            const { date, timeSlotId } = cell.dataset;
            const key = `${date}-${timeSlotId}`;
            const assignmentsInSlot = plannerData.assignments[key] || [];
            if (assignmentsInSlot.length === 0) return;
            let isViolation = false;
            const studentCounts = {};
            for (const assignment of assignmentsInSlot) {
                for (const lesson of assignment.lessons) {
                    studentCounts[lesson.student_id] = (studentCounts[lesson.student_id] || 0) + 1;
                }
            }
            if (Object.values(studentCounts).some(count => count > 1)) {
                isViolation = true;
            }
            for (const assignment of assignmentsInSlot) {
                if (assignment.lessons.length > 2) {
                    isViolation = true;
                }
            }
            if (isViolation) {
                cell.classList.add('violation-slot');
            }
        });
    }
    function showLessonEditModal(date, timeSlotId) {
        const key = `${date}-${timeSlotId}`;
        const assignmentsInSlot = plannerData.assignments[key] || [];
        const dateObj = new Date(date);
        const titleDate = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
        const timeSlot = timeSlotsMaster.find(ts => ts.id == timeSlotId);
        const titleTime = dateObj.getDay() >= 1 && dateObj.getDay() <= 5 ? timeSlot.weekday : timeSlot.weekend;
        lessonEditModalTitle.textContent = `${titleDate} ${titleTime} のレッスン`;
        lessonEditModalBody.innerHTML = '';
        const activeAssignments = assignmentsInSlot.filter(a => activeTeacherIds.includes(a.teacher_id));
        const assignmentsToShow = activeAssignments.length > 0 ? activeAssignments : assignmentsInSlot;
        assignmentsToShow.forEach(assignment => appendLessonsToModal(assignment));
        lessonEditModal.classList.remove('hidden');
    }
    function appendLessonsToModal(assignment) {
        const teacherGroup = document.createElement('div');
        teacherGroup.className = 'teacher-group';
        const teacherHeader = document.createElement('div');
        teacherHeader.className = 'teacher-name-header';
        teacherHeader.textContent = `▼ ${assignment.teacher_name}`;
        teacherGroup.appendChild(teacherHeader);
        assignment.lessons.forEach(lesson => {
            const lessonItem = document.createElement('div');
            lessonItem.className = 'lesson-item';
            lessonItem.innerHTML = `<span>${lesson.student_name}: ${lesson.subject_name.slice(0, 2)}</span><div class="lesson-actions"><button class="edit-lesson-btn" data-lesson-id="${lesson.id}">移動</button><button class="delete-lesson-btn" data-lesson-id="${lesson.id}">削除</button></div>`;
            teacherGroup.appendChild(lessonItem);
        });
        lessonEditModalBody.appendChild(teacherGroup);
    }
    function showSwapLessonModal(lessons) {
        lessonSwapModalBody.innerHTML = '';
        lessons.forEach(lesson => {
            const button = document.createElement('button');
            button.className = 'swap-option';
            button.dataset.lessonId = lesson.id;
            button.textContent = `${lesson.student_name}: ${lesson.subject_name}`;
            lessonSwapModalBody.appendChild(button);
        });
        lessonSwapModal.classList.remove('hidden');
    }
    function findLessonById(lessonId) {
        for (const key in plannerData.assignments) {
            for (const assignment of plannerData.assignments[key]) {
                const foundLesson = assignment.lessons.find(l => l.id == lessonId);
                if (foundLesson) return foundLesson;
            }
        }
        return null;
    }
    function showTeacherSelectModal(teacherIds) {
        teacherOptionsContainer.innerHTML = '';
        teacherIds.forEach(id => {
            const teacher = plannerData.teachers.find(t => t.id === id);
            if (teacher) {
                const btn = document.createElement('button');
                btn.className = 'teacher-option';
                btn.dataset.teacherId = id;
                btn.textContent = teacher.name;
                teacherOptionsContainer.appendChild(btn);
            }
        });
        teacherSelectModal.classList.remove('hidden');
    }
    async function placeLesson(date, timeSlotId, teacherId,lessonToDeleteId = null) {
        const teacherName = plannerData.teachers.find(t => t.id == teacherId)?.name || '不明な講師';
        let confirmMessage = `${date} の ${teacherName} のコマにレッスンを配置しますか？`;

        if (lessonToDeleteId) {
            const lessonToDelete = findLessonById(lessonToDeleteId);
            if (lessonToDelete) {
                confirmMessage += `\n\n注意：この操作により、「${lessonToDelete.student_name}: ${lessonToDelete.subject_name}」のレッスンは削除されます。`;
            }
        }

        if (!confirm(confirmMessage)) return;
        
        try {
            // ▼▼▼ 修正: 送信するデータに lesson_to_delete_id を含める ▼▼▼
            const body = {
                period_id: periodId,
                student_id: selection.studentId,
                subject_id: selection.subjectId,
                teacher_id: teacherId,
                date: date,
                time_slot_id: timeSlotId
            };
            if (lessonToDeleteId) {
                body.lesson_to_delete_id = lessonToDeleteId;
            }

            const response = await fetch('/api/planner/place-lesson', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body) // 修正したbodyを送信
            });
            // ... (以降の try-catch-finally 句は変更なし)
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || '配置に失敗しました。');
            alert(result.message);
            initializePlanner();
        } catch (error) {
            alert(`エラー: ${error.message}`);
        } finally {
            teacherSelectModal.classList.add('hidden');
            lessonSwapModal.classList.add('hidden'); // 入れ替えモーダルも閉じる
            resetSelection();
        }
    }
    async function moveLesson(date, timeSlotId, teacherId, lessonToDeleteId = null) {
        const lesson = findLessonById(selection.lessonId);
        if(!lesson) return;
        
        const teacherName = plannerData.teachers.find(t => t.id == teacherId)?.name || '不明な講師';
        let confirmMessage = `「${lesson.student_name}: ${lesson.subject_name}」のレッスンを\n${date} の ${teacherName} のコマに移動しますか？`;
        if (lessonToDeleteId) {
            const lessonToDelete = findLessonById(lessonToDeleteId);
            confirmMessage += `\n\n注意：この操作により、「${lessonToDelete.student_name}: ${lessonToDelete.subject_name}」のレッスンは削除されます。`;
        }
        
        if (!confirm(confirmMessage)) {
            resetSelection();
            return;
        }
        
        try {
            const body = {
                date: date,
                time_slot_id: timeSlotId,
                teacher_id: teacherId
            };
            if(lessonToDeleteId) {
                body.lesson_to_delete_id = lessonToDeleteId;
            }

            const response = await fetch(`/api/planner/lessons/${selection.lessonId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || '移動に失敗しました。');
            alert(result.message);
            initializePlanner();
        } catch (error) {
            alert(`エラー: ${error.message}`);
        } finally {
            teacherSelectModal.classList.add('hidden');
            lessonSwapModal.classList.add('hidden');
            resetSelection();
        }
    }

    function resetSelection() {
        if (selection.element) {
            selection.element.classList.remove('selected');
        }
        // ★★★ 選択解除後もハイライトが残るように、highlightSlotsを呼び出す ★★★
        selection = { mode: 'add', studentId: null, subjectId: null, lessonId: null, element: null };
        highlightSlots();
    }

    function toggleLockMode() {
        isLockMode = !isLockMode;
        lockModeToggleBtn.classList.toggle('active', isLockMode);
        lockModeToggleBtn.textContent = isLockMode ? 'ロックモード ON' : 'ロックモード OFF';
        calendarContainer.classList.toggle('lock-mode-active', isLockMode);
        
        if(isLockMode) {
            alert('ロックモードON: レッスンをクリックしてロック状態を切り替えられます。');
            resetSelection(); // レッスン選択状態を解除
        }
    }
    lockModeToggleBtn.addEventListener('click', toggleLockMode);

    studentGradeFilterBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.teacher-filter-btn');
        if (!btn) return;

        // 選択状態を更新
        activeGradeFilter = btn.dataset.grade;

        // ボタンのハイライトを更新
        studentGradeFilterBar.querySelectorAll('.teacher-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // 未配置リストを再描画
        renderUnassignedLessons();
    });
    
    initializePlanner();
});