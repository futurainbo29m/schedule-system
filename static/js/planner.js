// static/js/planner.js (ツールチップ位置調整機能を追加)

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
    const autoAssign = {
        openModalBtn: document.getElementById('open-auto-assign-modal-btn'),
        modal: document.getElementById('auto-assign-modal'),
        executeBtn: document.getElementById('execute-auto-assign-btn'),
        cancelBtn: document.getElementById('cancel-auto-assign-btn'),
        loadingOverlay: document.getElementById('loading-overlay'),
        loadingProgress: document.getElementById('loading-progress'),
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
    let selection = { mode: 'add', studentId: null, subjectId: null, lessonId: null, contractedLessonId: null, element: null };
    let placementInfo = {};
    let isLockMode = false
    let activeGradeFilter = 'all';
    let focusedStudentId = null;
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
            activeGradeFilter = 'all';

            updateTeacherFilterUI();
            updateStudentGradeFilterUI();

            renderAll();
        } catch (error) {
            console.error(error);
            calendarContainer.innerHTML = `<p>エラーが発生しました: ${error.message}</p>`;
        }
    }
    
    async function refreshAndRender() {
        const currentSelection = { ...selection };
        const currentFocus = focusedStudentId;

        try {
            const response = await fetch(`/api/planner-data/${periodId}`);
            if (!response.ok) throw new Error('プランナーデータの取得に失敗しました。');
            plannerData = await response.json();

            renderAll();

            focusedStudentId = currentFocus;
            updateStudentFocusUI();
            
            if (currentSelection.element) {
                let newElement = null;
                if (currentSelection.contractedLessonId) {
                    newElement = unassignedList.querySelector(`.unassigned-subject[data-contracted-lesson-id="${currentSelection.contractedLessonId}"]`);
                } else if (currentSelection.studentId && currentSelection.subjectId) {
                    const studentGroup = unassignedList.querySelector(`.unassigned-student-group[data-student-id="${currentSelection.studentId}"]`);
                    if(studentGroup) {
                        newElement = studentGroup.querySelector(`.unassigned-subject[data-subject-id="${currentSelection.subjectId}"]`);
                    }
                }
                
                if (newElement) {
                    selection = { ...currentSelection, element: newElement };
                    newElement.classList.add('selected');
                    highlightSlots();
                } else {
                    resetSelection();
                }
            }

        } catch (error) {
            console.error(error);
            calendarContainer.innerHTML = `<p>エラーが発生しました: ${error.message}</p>`;
        }
    }

    function renderAll() {
        renderCalendar();
        renderUnassignedLessons();
        renderAnalysisSummary();
        highlightSlots();
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

        if (activeTeacherIds.length === 1) {
            lockModeToggleBtn.disabled = false;
        } else {
            lockModeToggleBtn.disabled = true;
            if (isLockMode) {
                toggleLockMode(); 
            }
        }
    }

    function updateStudentGradeFilterUI() {
        studentGradeFilterBar.querySelectorAll('.teacher-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.grade === activeGradeFilter);
        });
    }
    
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
        const isStudentFocused = focusedStudentId !== null;

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
    
                let focusedLessonData = null;
                if (isStudentFocused) {
                    for (const assign of activeAssignments) {
                        const lesson = assign.lessons.find(l => l.student_id == focusedStudentId);
                        if (lesson) {
                            focusedLessonData = { teacher_name: assign.teacher_name, subject_name: lesson.subject_name, label: lesson.label };
                            break;
                        }
                    }
                }

                if (focusedLessonData) {
                    let labelHTML = '';
                    if (focusedLessonData.label) {
                        const labelParts = focusedLessonData.label.split(' ');
                        if (labelParts.length === 2) {
                            labelHTML = `
                                <span class="lesson-label-small">
                                    <span class="label-period">${labelParts[0]}</span>
                                    <span class="label-number">${labelParts[1]}</span>
                                </span>
                            `;
                        }
                    }
                    cell.innerHTML = `<div>${focusedLessonData.teacher_name}: ${focusedLessonData.subject_name.slice(0, 2)}</div>${labelHTML}`;
                    cell.classList.add('assigned-slot', 'focused-student-lesson');
                } else if (activeAssignments.length > 0) {
                    if (isStudentFocused) {
                        cell.classList.add('other-student-lesson');
                    }
                    
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
                            if (l.status === 'locked') lessonEl.classList.add('locked');
                            
                            lessonEl.innerHTML = `<span>${l.student_name}: ${l.subject_name.slice(0, 2)}</span>`;
                            lessonContainer.appendChild(lessonEl);
                        });
                        cell.appendChild(lessonContainer);
                    } else {
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
        const { unassigned_lessons, sorted_students } = plannerData;
        let contentHTML = '';

        const createStudentGroupHTML = (lessons, isSpecial) => {
            const studentsMap = {};
            lessons.forEach(lesson => {
                if (!studentsMap[lesson.student_id]) {
                    studentsMap[lesson.student_id] = {
                        student_name: lesson.student_name,
                        subjects: {}
                    };
                }
                if (!studentsMap[lesson.student_id].subjects[lesson.subject_id]) {
                    studentsMap[lesson.student_id].subjects[lesson.subject_id] = {
                        subject_name: lesson.subject_name,
                        items: []
                    };
                }
                studentsMap[lesson.student_id].subjects[lesson.subject_id].items.push(lesson);
            });

            let listHTML = '<ul>';
            sorted_students.forEach(sortedStudent => {
                const studentId = sortedStudent.id;
                if (studentsMap[studentId]) {
                    const student = studentsMap[studentId];
                    let totalLessons = 0;
                    
                    const subjectsHTML = Object.values(student.subjects).map(subject => {
                        totalLessons += subject.items.length;
                        const contractedLessonIdAttr = isSpecial ? `data-contracted-lesson-id="${subject.items[0].contracted_lesson_id}"` : '';
                        return `
                            <span class="unassigned-subject" 
                                  data-student-id="${subject.items[0].student_id}" 
                                  data-subject-id="${subject.items[0].subject_id}"
                                  ${contractedLessonIdAttr}>
                                ${subject.subject_name.slice(0, 2)}(${subject.items.length})
                            </span>`;
                    }).join(' ');

                    listHTML += `
                        <li class="unassigned-student-group" data-student-id="${studentId}">
                            <div class="student-name-header">
                                <span class="student-name">${student.student_name}</span>
                                <span class="lesson-count">[残り${totalLessons}コマ]</span>
                            </div>
                            <div class="subjects-container">${subjectsHTML}</div>
                        </li>`;
                }
            });
            listHTML += '</ul>';
            return listHTML;
        };

        const specialPeriods = unassigned_lessons.special || [];
        specialPeriods.forEach(period => {
            const filteredLessons = period.lessons.filter(lesson => {
                if (activeGradeFilter === 'all') return true;
                if (activeGradeFilter === '小学') return lesson.student_grade.startsWith('小');
                return lesson.student_grade === activeGradeFilter;
            });
            
            contentHTML += `<h3>特別期間: ${period.period_name}</h3>`;
            if (filteredLessons.length > 0) {
                contentHTML += createStudentGroupHTML(filteredLessons, true);
            } else {
                contentHTML += `<p>この期間の未配置レッスンはありません。</p>`;
            }
        });

        const regularLessons = unassigned_lessons.regular || [];
        const filteredRegular = regularLessons.filter(lesson => {
            if (activeGradeFilter === 'all') return true;
            if (activeGradeFilter === '小学') return lesson.student_grade.startsWith('小');
            return lesson.student_grade === activeGradeFilter;
        });

        const expandedRegularLessons = [];
        filteredRegular.forEach(lesson => {
            for (let i = 0; i < lesson.count; i++) {
                expandedRegularLessons.push({ ...lesson });
            }
        });
        
        contentHTML += '<h3 style="margin-top: 20px;">通常未配置レッスン</h3>';
        if (expandedRegularLessons.length > 0) {
            contentHTML += createStudentGroupHTML(expandedRegularLessons, false);
        } else {
            contentHTML += '<p>通常期間の未配置レッスンはありません。</p>';
        }

        unassignedList.innerHTML = contentHTML;
        updateStudentFocusUI();
    }

    function renderAnalysisSummary() {
        const { unassigned_lessons, assignments } = plannerData;
        const totalAssigned = Object.values(assignments).flat().reduce((sum, a) => sum + a.lessons.length, 0);
        
        const regularUnassignedCount = (unassigned_lessons.regular || []).reduce((sum, l) => sum + l.count, 0);
        const specialUnassignedCount = (unassigned_lessons.special || []).reduce((sum, p) => sum + p.lessons.length, 0);
        const totalRequested = totalAssigned + regularUnassignedCount + specialUnassignedCount;

        const fulfillmentRate = totalRequested > 0 ? ((totalAssigned / totalRequested) * 100).toFixed(1) : '---';
        analysisSummary.innerHTML = `<p>授業消化率: ${fulfillmentRate}%</p><p>配置済レッスン数: ${totalAssigned}</p><p>総契約レッスン数: ${totalRequested}</p>`;
    }

    unassignedList.addEventListener('click', (e) => {
        const subjectSpan = e.target.closest('.unassigned-subject');
        const studentGroup = e.target.closest('.unassigned-student-group');
    
        if (subjectSpan) {
            if (subjectSpan.classList.contains('selected')) {
                resetSelection();
                return;
            }
            resetSelection();
            selection.mode = 'add';
            selection.studentId = subjectSpan.dataset.studentId;
            selection.subjectId = subjectSpan.dataset.subjectId;
            selection.contractedLessonId = subjectSpan.dataset.contractedLessonId;
            selection.element = subjectSpan;
            subjectSpan.classList.add('selected');
            highlightSlots();

        } else if (studentGroup) {
            const studentIdToFocus = studentGroup.dataset.studentId;
            resetSelection();
    
            focusedStudentId = (focusedStudentId === studentIdToFocus) ? null : studentIdToFocus;
            
            updateStudentFocusUI();
            renderCalendar();
            highlightSlots();
        }
    });

    autoAssign.openModalBtn.addEventListener('click', () => {
        autoAssign.modal.classList.remove('hidden');
    });

    autoAssign.cancelBtn.addEventListener('click', () => {
        autoAssign.modal.classList.add('hidden');
    });

    autoAssign.executeBtn.addEventListener('click', async () => {
        autoAssign.modal.classList.add('hidden');
        autoAssign.loadingOverlay.classList.remove('hidden');

        try {
            const options = {};
            if (autoAssign.enableIntervalRule.checked) {
                options.subject_interval_days = parseInt(autoAssign.intervalDays.value, 10);
                options.interval_strength = autoAssign.intervalStrength.value;
            }
            if (autoAssign.enablePreferredRule.checked) {
                options.preferred_strength = autoAssign.preferredStrength.value;
            }

            const response = await fetch('/api/planner/auto-assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ period_id: periodId, options: options })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || '自動配置に失敗しました。');
            
            alert('自動配置が完了しました！');
            await refreshAndRender();

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
        if (isLockMode && lessonEl && activeTeacherIds.length === 1) {
            const lessonId = lessonEl.dataset.lessonId;
            try {
                const response = await fetch(`/api/planner/lessons/${lessonId}/toggle-lock`, { method: 'POST' });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'ロック状態の変更に失敗');
                
                lessonEl.classList.toggle('locked', result.new_status === 'locked');

                const { date, timeSlotId } = lessonEl.closest('td').dataset;
                const key = `${date}-${timeSlotId}`;
                const assignment = plannerData.assignments[key]?.find(a => a.teacher_id === activeTeacherIds[0]);
                if (assignment) {
                    const lessonData = assignment.lessons.find(l => l.id == lessonId);
                    if (lessonData) {
                        lessonData.status = result.new_status;
                        const globalLesson = findLessonById(lessonId);
                        if(globalLesson) globalLesson.status = result.new_status;
                    }
                }
                
            } catch (error) {
                alert(`エラー: ${error.message}`);
            }
            return;
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
            try {
                const response = await fetch(`/api/planner/lessons/${lessonId}`, { method: 'DELETE' });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || '削除に失敗しました。');
                
                lessonEditModal.classList.add('hidden');
                await refreshAndRender();
            } catch (error) {
                alert(`エラー: ${error.message}`);
                console.error(error);
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
                selection.contractedLessonId = lesson.contracted_lesson_id;
                lessonEditModal.classList.add('hidden');
                highlightSlots();
            }
        }
    });

    lessonSwapModalBody.addEventListener('click', (e) => {
        const target = e.target.closest('.swap-option');
        if (target) {
            const lessonToDeleteId = target.dataset.lessonId;
            if (selection.mode === 'move') {
                moveLesson(placementInfo.date, placementInfo.timeSlotId, placementInfo.teacherId, lessonToDeleteId);
            } else {
                placeLesson(placementInfo.date, placementInfo.timeSlotId, placementInfo.teacherId, lessonToDeleteId);
            }
        }
    });
    
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
        highlightSlots();
        updateRuleViolationHighlights();
    });

    teacherFilterBar.addEventListener('dblclick', (e) => {
        const btn = e.target.closest('.teacher-filter-btn');
        if (!btn) return;

        const teacherIdStr = btn.dataset.teacherId;
        if (teacherIdStr === 'all') {
            return;
        }
        const teacherId = parseInt(teacherIdStr, 10);
        activeTeacherIds = [teacherId];
        updateTeacherFilterUI();
        renderAll();
    });

    calendarContainer.addEventListener('mouseover', (e) => {
        const cell = e.target.closest('td.summary-slot');
        if (cell && cell.dataset.tooltipContent) {
            tooltip.textContent = cell.dataset.tooltipContent;
            tooltip.style.display = 'block';
        }
    });
    
    calendarContainer.addEventListener('mousemove', (e) => {
        if (tooltip.style.display === 'block') {
            tooltip.style.left = `${e.pageX + 15}px`;
    
            const tooltipHeight = tooltip.offsetHeight;
            const mouseY = e.clientY;
            const windowHeight = window.innerHeight;
    
            if (mouseY + tooltipHeight + 15 > windowHeight) {
                tooltip.style.top = `${e.pageY - tooltipHeight - 15}px`;
            } else {
                tooltip.style.top = `${e.pageY + 15}px`;
            }
        }
    });

    calendarContainer.addEventListener('mouseout', (e) => {
        const cell = e.target.closest('td.summary-slot');
        if (cell) {
            tooltip.style.display = 'none';
        }
    });

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

    // --- ヘルパー関数群 ---
    
    function updateStudentFocusUI() {
        document.querySelectorAll('.unassigned-student-group').forEach(group => {
            group.classList.toggle('focused', focusedStudentId && group.dataset.studentId === focusedStudentId);
        });
    }

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
            } else {
                moveLesson(date, timeSlotId, teacherId);
            }
        }
    }
    
    function highlightSlots() {
        document.querySelectorAll('td[class*="-slot"], td[class*="-highlight"]').forEach(cell => {
            cell.className = cell.className.replace(/possible-slot|empty-and-possible|shift-highlight|dense-\d/g, '').trim();
            delete cell.dataset.availableTeacherIds;
        });

        const allCells = document.querySelectorAll('#calendar-container td[data-date]');

        if (selection.studentId) {
            allCells.forEach(cell => {
                const { date, timeSlotId } = cell.dataset;
                const teachersWithShift = activeTeacherIds.filter(id => plannerData.shifts[`${date}-${id}-${timeSlotId}`]);
                
                if (teachersWithShift.length > 0) {
                    cell.classList.add('possible-slot');
                    cell.dataset.availableTeacherIds = teachersWithShift.join(',');
                    
                    const densityClass = `possible-slot-dense-${Math.min(teachersWithShift.length, 4)}`;
                    cell.classList.add(densityClass);

                    const key = `${date}-${timeSlotId}`;
                    if (!plannerData.assignments[key]) {
                        cell.classList.add('empty-and-possible');
                    }
                }
            });
        } 
        
        else {
            allCells.forEach(cell => {
                const { date, timeSlotId } = cell.dataset;
                const teachersWithShiftCount = activeTeacherIds.reduce((count, id) => {
                    return plannerData.shifts[`${date}-${id}-${timeSlotId}`] ? count + 1 : count;
                }, 0);

                if (teachersWithShiftCount > 0) {
                    cell.classList.add('shift-highlight');
                    
                    const densityClass = `shift-highlight-dense-${Math.min(teachersWithShiftCount, 4)}`;
                    cell.classList.add(densityClass);
                }
            });
        }
    }
    
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
                if (foundLesson) {
                    return { ...foundLesson };
                }
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
        if (!selection.studentId || !selection.subjectId) {
            alert('未配置レッスンリストから配置する科目を選択してください。');
            return;
        }
        
        try {
            const body = {
                student_id: selection.studentId,
                subject_id: selection.subjectId,
                teacher_id: teacherId,
                date: date,
                time_slot_id: timeSlotId,
                contracted_lesson_id: selection.contractedLessonId
            };
            if (lessonToDeleteId) {
                body.lesson_to_delete_id = lessonToDeleteId;
            }

            const response = await fetch('/api/planner/place-lesson', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || '配置に失敗しました。');
            
            await refreshAndRender();
            resetSelection();
        } catch (error) {
            alert(`エラー: ${error.message}`);
        } finally {
            teacherSelectModal.classList.add('hidden');
            lessonSwapModal.classList.add('hidden');
        }
    }

    async function moveLesson(date, timeSlotId, teacherId, lessonToDeleteId = null) {
        const lesson = findLessonById(selection.lessonId);
        if(!lesson) return;
        
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
            await refreshAndRender();
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
        selection = { mode: 'add', studentId: null, subjectId: null, lessonId: null, contractedLessonId: null, element: null };
        highlightSlots();
    }

    function toggleLockMode() {
        isLockMode = !isLockMode;
        lockModeToggleBtn.classList.toggle('active', isLockMode);
        lockModeToggleBtn.textContent = isLockMode ? 'ロックモード ON' : 'ロックモード OFF';
        calendarContainer.classList.toggle('lock-mode-active', isLockMode);
        
        if(isLockMode) {
            alert('ロックモードON: レッスンをクリックしてロック状態を切り替えられます。');
            resetSelection();
        }
    }
    lockModeToggleBtn.addEventListener('click', toggleLockMode);

    studentGradeFilterBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.teacher-filter-btn');
        if (!btn) return;
        activeGradeFilter = btn.dataset.grade;
        updateStudentGradeFilterUI();
        renderUnassignedLessons();
    });
    
    initializePlanner();
});