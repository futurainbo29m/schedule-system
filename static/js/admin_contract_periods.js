document.addEventListener('DOMContentLoaded', () => {
    const addPeriodForm = document.getElementById('add-period-form');
    const periodTableBody = document.querySelector('#period-table tbody');

    // --- 一覧を読み込んでテーブルに表示 ---
    async function fetchAndDisplayPeriods() {
        try {
            const response = await fetch('/api/contract-periods');
            if (!response.ok) throw new Error('データ取得に失敗');
            const periods = await response.json();
            
            periodTableBody.innerHTML = '';
            if (periods.length === 0) {
                periodTableBody.innerHTML = '<tr><td colspan="7">登録されている契約期間はありません。</td></tr>';
                return;
            }

            periods.forEach(period => {
                const row = `
                    <tr data-period-id="${period.id}">
                        <td>${period.id}</td>
                        <td><input type="text" class="edit-name" value="${period.name}"></td>
                        <td><input type="text" class="edit-display-name" value="${period.display_name || ''}"></td>
                        <td><input type="date" class="edit-start-date" value="${period.start_date.split('T')[0]}"></td>
                        <td><input type="date" class="edit-end-date" value="${period.end_date.split('T')[0]}"></td>
                        <td>
                            <select class="edit-period-type">
                                <option value="regular" ${period.period_type === 'regular' ? 'selected' : ''}>通常</option>
                                <option value="special" ${period.period_type === 'special' ? 'selected' : ''}>特別</option>
                            </select>
                        </td>
                        <td>
                            <button class="save-btn">保存</button>
                            <button class="delete-btn">削除</button>
                        </td>
                    </tr>
                `;
                periodTableBody.insertAdjacentHTML('beforeend', row);
            });
        } catch (error) {
            console.error('契約期間の読み込みに失敗:', error);
            periodTableBody.innerHTML = '<tr><td colspan="7">データの読み込みに失敗しました。</td></tr>';
        }
    }

    // --- 新しい期間を登録 ---
    addPeriodForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('period-name').value;
        const display_name = document.getElementById('period-display-name').value;
        const start_date = document.getElementById('start-date').value;
        const end_date = document.getElementById('end-date').value;
        const period_type = document.getElementById('period-type').value;

        try {
            const response = await fetch('/api/contract-periods', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, display_name, start_date, end_date, period_type })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            
            alert(result.message);
            addPeriodForm.reset();
            fetchAndDisplayPeriods();
        } catch (error) {
            alert(`エラー: ${error.message}`);
        }
    });

    // --- テーブル内のボタンクリックイベントを修正 ---
    periodTableBody.addEventListener('click', async (e) => {
        const target = e.target;
        const row = target.closest('tr');
        if (!row) return;
        const periodId = row.dataset.periodId;

        // 保存ボタン
        if (target.classList.contains('save-btn')) {
            const name = row.querySelector('.edit-name').value;
            const display_name = row.querySelector('.edit-display-name').value;
            const start_date = row.querySelector('.edit-start-date').value;
            const end_date = row.querySelector('.edit-end-date').value;
            const period_type = row.querySelector('.edit-period-type').value;

            try {
                const response = await fetch(`/api/contract-periods/${periodId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, display_name, start_date, end_date, period_type })
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error);
                alert(result.message);
                target.style.backgroundColor = '';
            } catch (error) {
                alert(`エラー: ${error.message}`);
            }
        }

        // 削除ボタン
        if (target.classList.contains('delete-btn')) {
            const periodName = row.querySelector('.edit-name').value;
            if (!confirm(`「${periodName}」を削除しますか？\n\n注意：この期間に紐づく契約レッスン数が存在し、かつそのレッスンが既に時間割に配置されている場合は削除できません。`)) return;

            try {
                const response = await fetch(`/api/contract-periods/${periodId}`, { method: 'DELETE' });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error);
                alert(result.message);
                fetchAndDisplayPeriods();
            } catch (error) {
                alert(`エラー: ${error.message}`);
            }
        }
    });

    periodTableBody.addEventListener('input', (e) => {
        const saveBtn = e.target.closest('tr')?.querySelector('.save-btn');
        if (saveBtn) {
            saveBtn.style.backgroundColor = '#28a745';
        }
    });

    fetchAndDisplayPeriods();
});

