// static/js/admin_subjects.js

document.addEventListener('DOMContentLoaded', () => {
    const addSubjectForm = document.getElementById('add-subject-form');
    const subjectTableBody = document.querySelector('#subject-table tbody');
    const subjectNameInput = document.getElementById('subject-name');
    const subjectDisplayNameInput = document.getElementById('subject-display-name');

    // --- 科目名入力時に表示名を自動生成 ---
    subjectNameInput.addEventListener('input', () => {
        if (subjectNameInput.value.length <= 2) {
            subjectDisplayNameInput.value = subjectNameInput.value;
        }
    });

    // --- 科目一覧を読み込んでテーブルに表示 ---
    async function fetchAndDisplaySubjects() {
        try {
            const response = await fetch('/api/subjects');
            if (!response.ok) throw new Error('科目データの取得に失敗');
            const subjects = await response.json();
            
            subjectTableBody.innerHTML = '';
            if (subjects.length === 0) {
                subjectTableBody.innerHTML = '<tr><td colspan="5">登録されている科目はありません。</td></tr>';
                return;
            }

            subjects.forEach(subject => {
                const row = `
                    <tr data-subject-id="${subject.id}">
                        <td>${subject.id}</td>
                        <td><input type="text" class="edit-name" value="${subject.name}"></td>
                        <td><input type="text" class="edit-display-name" value="${subject.display_name}"></td>
                        <td>
                            <select class="edit-level">
                                <option value="小学" ${subject.level === '小学' ? 'selected' : ''}>小学</option>
                                <option value="中学" ${subject.level === '中学' ? 'selected' : ''}>中学</option>
                                <option value="高校" ${subject.level === '高校' ? 'selected' : ''}>高校</option>
                            </select>
                        </td>
                        <td>
                            <button class="save-btn">保存</button>
                            <button class="delete-btn">削除</button>
                        </td>
                    </tr>
                `;
                subjectTableBody.insertAdjacentHTML('beforeend', row);
            });
        } catch (error) {
            console.error('科目の読み込みに失敗しました:', error);
            subjectTableBody.innerHTML = '<tr><td colspan="5">データの読み込みに失敗しました。</td></tr>';
        }
    }

    // --- 新しい科目を登録 ---
    addSubjectForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = subjectNameInput.value;
        const display_name = subjectDisplayNameInput.value;
        const level = document.getElementById('subject-level').value;

        try {
            const response = await fetch('/api/subjects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, display_name, level })
            });
            if (!response.ok) throw new Error((await response.json()).error);
            
            alert((await response.json()).message);
            addSubjectForm.reset();
            fetchAndDisplaySubjects();
        } catch (error) {
            alert(`エラー: ${error.message}`);
        }
    });

    // --- テーブル内のボタンクリックイベント（保存・削除） ---
    subjectTableBody.addEventListener('click', async (e) => {
        const target = e.target;
        const row = target.closest('tr');
        if (!row) return;
        const subjectId = row.dataset.subjectId;

        // 保存ボタン
        if (target.classList.contains('save-btn')) {
            const name = row.querySelector('.edit-name').value;
            const display_name = row.querySelector('.edit-display-name').value;
            const level = row.querySelector('.edit-level').value;

            try {
                const response = await fetch(`/api/subjects/${subjectId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, display_name, level })
                });
                if (!response.ok) throw new Error((await response.json()).error);
                alert('更新しました。');
                target.style.backgroundColor = ''; // 色を元に戻す
            } catch (error) {
                alert(`エラー: ${error.message}`);
            }
        }

        // 削除ボタン
        if (target.classList.contains('delete-btn')) {
            const subjectName = row.querySelector('.edit-name').value;
            if (!confirm(`「${subjectName}」を削除しますか？\nこの科目を担当している講師や、希望している生徒がいる場合、予期せぬエラーが発生する可能性があります。`)) return;

            try {
                const response = await fetch(`/api/subjects/${subjectId}`, { method: 'DELETE' });
                if (!response.ok) throw new Error((await response.json()).error);
                alert((await response.json()).message);
                fetchAndDisplaySubjects();
            } catch (error) {
                alert(`エラー: ${error.message}`);
            }
        }
    });

    // 変更があったら保存ボタンの色を変える
    subjectTableBody.addEventListener('input', (e) => {
        const saveBtn = e.target.closest('tr')?.querySelector('.save-btn');
        if (saveBtn) {
            saveBtn.style.backgroundColor = '#28a745';
        }
    });

    fetchAndDisplaySubjects();
});