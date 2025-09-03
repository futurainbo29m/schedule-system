// static/js/shift_input.js (計画期間ビュー対応版)

document.addEventListener('DOMContentLoaded', () => {
    // --- UIヘルパー ---
    function showLoader(container) {
        container.innerHTML = '<div class="loader">読み込み中...</div>';
    }

    function showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 500);
        }, 3000);
    }

    // --- 要素の取得 ---
    const teacherSelect = document.getElementById('teacher-select');
    const saveShiftsBtn = document.getElementById('save-shifts');
    const scheduleContainer = document.getElementById('schedule-container');

    const periodId = window.location.pathname.split('/')[2];
    const startDate = new Date(scheduleContainer.dataset.startDate);
    const endDate = new Date(scheduleContainer.dataset.endDate);

    // --- アプリケーションの状態管理 ---
    let selectedTeacherId = null;
    let shiftData = {};
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

    // --- 初期化処理 ---
    async function initialize() {
        await loadTeachers();
        // 初期状態ではカレンダーは表示しない
        scheduleContainer.innerHTML = '<p>講師を選択してください。</p>';
    }

    // --- 講師リストの読み込み ---
    async function loadTeachers() {
        try {
            const response = await fetch('/api/teachers');
            const teachers = await response.json();
            teachers.forEach(teacher => {
                const option = document.createElement('option');
                option.value = teacher.id;
                option.textContent = teacher.name;
                teacherSelect.appendChild(option);
            });
        } catch (error) {
            console.error('講師データの読み込みに失敗しました:', error);
        }
    }

    // --- カレンダーの表示を更新 ---
    async function displayPeriodCalendar() {
        selectedTeacherId = teacherSelect.value;
        if (!selectedTeacherId) {
            scheduleContainer.innerHTML = '<p>講師を選択してください。</p>';
            return;
        }

        showLoader(scheduleContainer);

        try {
            const response = await fetch(`/api/shifts/${selectedTeacherId}?period_id=${periodId}`);
            if (!response.ok) throw new Error('シフトデータの取得に失敗');
            shiftData = await response.json();

            const table = createCalendarTable();
            scheduleContainer.innerHTML = '';
            scheduleContainer.appendChild(table);

        } catch (error) {
            console.error('シフトデータの取得に失敗しました:', error);
            scheduleContainer.innerHTML = '<p>データの読み込み中にエラーが発生しました。</p>';
        }
    }

    // --- カレンダーのHTMLテーブルを生成 ---
    function createCalendarTable() {
        const table = document.createElement('table');
        table.className = 'schedule-table';
        const aWeek = ['日', '月', '火', '水', '木', '金', '土'];

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
                cell.dataset.key = key;

                if (shiftData[key] && shiftData[key].is_available) {
                    cell.classList.add('available');
                    cell.textContent = 'OK';
                }
            }
        });
        return table;
    }

    // --- シフトを保存 ---
    async function saveShifts() {
        if (!selectedTeacherId) {
            showNotification('講師を選択してください。', 'error');
            return;
        }
        try {
            await fetch(`/api/shifts/${selectedTeacherId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    period_id: periodId,
                    shift_data: shiftData
                }),
            });
            showNotification('シフトを保存しました。');
        } catch (error) {
            console.error('保存に失敗しました:', error);
            showNotification('エラーが発生しました。', 'error');
        }
    }

    // --- イベントリスナー ---
    teacherSelect.addEventListener('change', displayPeriodCalendar);
    saveShiftsBtn.addEventListener('click', saveShifts);
    
    scheduleContainer.addEventListener('click', (e) => {
        if (e.target.tagName === 'TD' && e.target.dataset.key) {
            const key = e.target.dataset.key;
            if (shiftData[key] && shiftData[key].is_available) {
                delete shiftData[key];
                e.target.classList.remove('available');
                e.target.textContent = '';
            } else {
                shiftData[key] = { is_available: true };
                e.target.classList.add('available');
                e.target.textContent = 'OK';
            }
        }
    });

    const style = document.createElement('style');
    style.innerHTML = `
        .schedule-table td.available {
            background-color: #d4edda !important;
            font-weight: bold;
            color: #155724;
        }
    `;
    document.head.appendChild(style);

    initialize();
});