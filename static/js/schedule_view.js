// static/js/schedule_view.js (計画期間ビュー対応版)

document.addEventListener('DOMContentLoaded', () => {
    function showLoader(container) {
        container.innerHTML = '<div class="loader">読み込み中...</div>';
    }

    const viewTypeSelect = document.getElementById('view-type-select');
    const personSelect = document.getElementById('person-select');
    const scheduleContainer = document.getElementById('schedule-container');

    const periodId = window.location.pathname.split('/')[2];
    const startDate = new Date(scheduleContainer.dataset.startDate);
    const endDate = new Date(scheduleContainer.dataset.endDate);

    let teachersData = [];
    let studentsData = [];
    const timeSlotsMaster = [
        { id: 1, weekday: '9:00-10:00', weekend: '9:00-10:00' },
        { id: 2, weekday: '10:10-11:10', weekend: '10:10-11:10' },
        { id: 3, weekday: '11:20-12:20', weekend: '11:20-12:20' },
        { id: 4, weekday: '12:30-13:30', weekend: '12:30-13:30' },
        { id: 5, weekday: '14:10-15:10', weekend: '13:40-14:40' },
        { id: 6, weekday: '15:15-16:15', weekend: '14:50-15:50' },
        { id: 7, weekday: '16:20-17:20', weekend: '16:00-17:00' },
        { id: 8, weekday: '17:25-18:25', weekend: '17:10-18:10' },
        { id: 9, weekday: '18:30-19:30', weekend: '18:20-19:20' },
        { id: 10, weekday: '19:35-20:35', weekend: '19:30-20:30' },
        { id: 11, weekday: '20:40-21:40', weekend: '20:40-21:40' }
    ];

    async function initialize() {
        try {
            [teachersData, studentsData] = await Promise.all([
                fetch('/api/teachers').then(res => res.json()),
                fetch('/api/students').then(res => res.json())
            ]);
            updatePersonSelect();
            scheduleContainer.innerHTML = '<p>表示対象を選択してください。</p>';
        } catch (error) {
            console.error('初期データの読み込みに失敗しました:', error);
            scheduleContainer.innerHTML = '<p>データの読み込みに失敗しました。</p>';
        }
    }

    function updatePersonSelect() {
        const viewType = viewTypeSelect.value;
        const data = viewType === 'teacher' ? teachersData : studentsData;
        
        personSelect.innerHTML = '<option value="">選択してください</option>';
        data.forEach(person => {
            const option = document.createElement('option');
            option.value = person.id;
            option.textContent = person.name;
            personSelect.appendChild(option);
        });
        personSelect.disabled = false;
    }

    async function displayPeriodCalendar() {
        const viewType = viewTypeSelect.value;
        const personId = personSelect.value;

        if (!personId) {
            scheduleContainer.innerHTML = '<p>表示対象を選択してください。</p>';
            return;
        }

        showLoader(scheduleContainer);

        try {
            const url = `/api/schedule?period_id=${periodId}&${viewType}_id=${personId}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('スケジュールデータの取得に失敗しました。');
            const result = await response.json();
            
            const scheduleMap = {}; 
            result.assignments.forEach(assign => {
                const key = `${assign.date}-${assign.time_slot_id}`;
                scheduleMap[key] = assign;
            });

            const emptyShiftMap = {};
            if (result.empty_shifts) {
                result.empty_shifts.forEach(shift => {
                    const key = `${shift.date}-${shift.time_slot_id}`;
                    emptyShiftMap[key] = true;
                });
            }

            const table = createCalendarTable(scheduleMap, emptyShiftMap);
            scheduleContainer.innerHTML = '';
            scheduleContainer.appendChild(table);

        } catch (error) {
            console.error(error);
            scheduleContainer.innerHTML = '<p>エラーが発生しました。</p>';
        }
    }

    function createCalendarTable(scheduleMap, emptyShiftMap) {
        const table = document.createElement('table');
        table.className = 'schedule-table';
        const aWeek = ['日', '月', '火', '水', '木', '金', '土'];
        
        const viewType = viewTypeSelect.value;
        const selectedPersonId = personSelect.value;

        const thead = table.createTHead();
        const headerRow = thead.insertRow();
        headerRow.innerHTML = '<th class="time-header">時間</th>';
        
        // 計画期間の開始日から終了日までループ
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dayOfWeek = d.getDay();
            let dayClass = dayOfWeek === 0 ? 'sunday' : dayOfWeek === 6 ? 'saturday' : 'weekday';
            headerRow.innerHTML += `<th class="${dayClass}">${d.getMonth() + 1}/${d.getDate()}<br>${aWeek[dayOfWeek]}</th>`;
        }

        const tbody = table.createTBody();
        timeSlotsMaster.forEach(ts => {
            const row = tbody.insertRow();
            row.innerHTML = `<td class="time-slot"><div class="weekday-time">${ts.weekday}</div><div class="weekend-time">${ts.weekend}</div></td>`;

            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const key = `${dateStr}-${ts.id}`;
                const cell = row.insertCell();

                if (scheduleMap[key]) {
                    const assign = scheduleMap[key];
                    let cellContent = '';
                    if (viewType === 'teacher') {
                        cellContent = assign.lessons.map(lesson => `${lesson.student_name}: ${lesson.subject_name.slice(0, 2)}`).join('<br>');
                    } else {
                        const myLesson = assign.lessons.find(lesson => lesson.student_id == selectedPersonId);
                        if (myLesson) cellContent = `${assign.teacher_name}: ${myLesson.subject_name.slice(0, 2)}`;
                    }
                    if (cellContent) {
                        cell.innerHTML = cellContent;
                        cell.classList.add('assigned-slot');
                    }
                } else if (viewType === 'teacher' && emptyShiftMap[key]) {
                    cell.innerHTML = '◯';
                    cell.classList.add('empty-shift-slot');
                }
            }
        });
        return table;
    }

    viewTypeSelect.addEventListener('change', () => {
        updatePersonSelect();
        scheduleContainer.innerHTML = '<p>表示対象を選択してください。</p>';
    });
    personSelect.addEventListener('change', displayPeriodCalendar);

    const style = document.createElement('style');
    style.innerHTML = `
        .schedule-table td.assigned-slot {
            background-color: #fff3cd;
            font-size: 12px;
            line-height: 1.4;
            vertical-align: middle;
        }
        .schedule-table td.empty-shift-slot {
            color: #adb5bd;
            font-size: 1.5em;
            font-weight: bold;
            vertical-align: middle;
        }
    `;
    document.head.appendChild(style);

    initialize();
});