// static/js/main.js (月間カレンダー対応 最終版)

document.addEventListener('DOMContentLoaded', () => {
    // --- 要素の取得 ---
    const calendarTitle = document.getElementById('calendar-title');
    const prevMonthBtn = document.getElementById('prev-month');
    const nextMonthBtn = document.getElementById('next-month');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const generateBtn = document.getElementById('generate-schedule');
    const scheduleContainer = document.getElementById('schedule-container');

    // --- アプリケーションの状態管理 ---
    let currentDate = new Date(); // 現在表示している月
    const timeSlotsData = [ // 時間割の表示順を定義
        { weekday: '9:00-10:00', weekend: '9:00-10:00' },
        { weekday: '10:10-11:10', weekend: '10:10-11:10' },
        { weekday: '11:20-12:20', weekend: '11:20-12:20' },
        { weekday: '12:30-13:30', weekend: '12:30-13:30' },
        { weekday: '14:10-15:10', weekend: '13:40-14:40' },
        { weekday: '15:15-16:15', weekend: '14:50-15:50' },
        { weekday: '16:20-17:20', weekend: '16:00-17:00' },
        { weekday: '17:25-18:25', weekend: '17:10-18:10' },
        { weekday: '18:30-19:30', weekend: '18:20-19:20' },
        { weekday: '19:35-20:35', weekend: '19:30-20:30' },
        { weekday: '20:40-21:40', weekend: '20:40-21:40' }
    ];

    // --- メイン関数: 月間カレンダーの描画 ---
    async function displayCalendar(year, month) {
        currentDate = new Date(year, month - 1, 1);
        calendarTitle.textContent = `${year}年${month}月の時間割`;
        scheduleContainer.innerHTML = '読み込み中...';

        try {
            // 1. APIからスケジュールデータを取得
            const response = await fetch(`/api/schedule-result?year=${year}&month=${month}`);
            if (!response.ok) throw new Error('スケジュールデータの取得に失敗しました。');
            const result = await response.json();
            
            // 2. データを整形
            const scheduleMap = {}; // { 'YYYY-MM-DD-timeSlotId': assignment }
            result.assignments.forEach(assign => {
                const key = `${assign.date}-${assign.time_slot_id}`;
                scheduleMap[key] = assign;
            });

            // 3. HTMLテーブルを生成
            const table = createCalendarTable(year, month, scheduleMap);
            scheduleContainer.innerHTML = '';
            scheduleContainer.appendChild(table);

        } catch (error) {
            console.error(error);
            scheduleContainer.innerHTML = 'エラーが発生しました。';
        }
    }

    // --- ヘルパー関数: カレンダーのHTMLテーブルを生成 ---
    function createCalendarTable(year, month, scheduleMap) {
        const table = document.createElement('table');
        table.className = 'schedule-table';

        const daysInMonth = new Date(year, month, 0).getDate();
        const aWeek = ['日', '月', '火', '水', '木', '金', '土'];

        // ヘッダー行 (日付と曜日)
        const thead = table.createTHead();
        const headerRow = thead.insertRow();
        headerRow.innerHTML = '<th class="time-header">時間</th>';
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const dayOfWeek = date.getDay(); // 0:日, 6:土
            let dayClass = 'weekday';
            if (dayOfWeek === 0) dayClass = 'sunday';
            if (dayOfWeek === 6) dayClass = 'saturday';
            headerRow.innerHTML += `<th class="${dayClass}">${month}/${day}<br>${aWeek[dayOfWeek]}</th>`;
        }

        // ボディ行 (時間とコマ)
        const tbody = table.createTBody();
        timeSlotsData.forEach((ts, index) => {
            const timeSlotId = index + 1;
            const row = tbody.insertRow();
            // 時間セル
            row.innerHTML = `
                <td class="time-slot">
                    <div class="weekday-time">${ts.weekday}</div>
                    <div class="weekend-time">${ts.weekend}</div>
                </td>
            `;
            // 日付ごとのセル
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const key = `${dateStr}-${timeSlotId}`;
                const cell = row.insertCell();
                if (scheduleMap[key]) {
                    const assign = scheduleMap[key];
                    cell.innerHTML = `
                        ${assign.teacher_name.replace('先生', '')}：${assign.subject_name.slice(0, 1)}<br>
                        ${assign.student_names.join(', ')}
                    `;
                }
            }
        });

        return table;
    }

    // --- ヘルパー関数: 日付をYYYY-MM-DD形式に変換 ---
    function formatDate(date) {
        return date.toISOString().split('T')[0];
    }

    // --- イベントリスナーの設定 ---

    // 月移動ボタン
    prevMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        displayCalendar(currentDate.getFullYear(), currentDate.getMonth() + 1);
    });

    nextMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        displayCalendar(currentDate.getFullYear(), currentDate.getMonth() + 1);
    });

    // 時間割生成ボタン
    generateBtn.addEventListener('click', async () => {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        if (!startDate || !endDate) {
            alert('開始日と終了日を選択してください。');
            return;
        }

        alert('時間割の生成を開始します...');
        try {
            const response = await fetch('/api/generate-schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    start_date: startDate,
                    end_date: endDate,
                    options: {} // オプションは今のところ空
                }),
            });
            if (!response.ok) throw new Error('生成に失敗しました。');

            alert('生成が完了しました！カレンダーを更新します。');
            // 表示中の月のカレンダーを再描画
            displayCalendar(currentDate.getFullYear(), currentDate.getMonth() + 1);

        } catch (error) {
            console.error(error);
            alert('エラーが発生しました。');
        }
    });

    // --- 初期化処理 ---
    const today = new Date();
    // デフォルトの期間を今月1日から末日に設定
    startDateInput.value = formatDate(new Date(today.getFullYear(), today.getMonth(), 1));
    endDateInput.value = formatDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));
    // 最初のカレンダー表示
    displayCalendar(today.getFullYear(), today.getMonth() + 1);
});