// static/js/admin_teachers.js (モーダル編集フロー改良版)

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素の取得 ---
    const addTeacherForm = document.getElementById('add-teacher-form');
    const teacherTableBody = document.querySelector('#teacher-table tbody');
    const teacherNameInput = document.getElementById('teacher-name');
    const teacherDisplayNameInput = document.getElementById('teacher-display-name');
    
    // モーダル関連の要素
    const modal = document.getElementById('subject-edit-modal');
    const modalTeacherName = document.getElementById('modal-teacher-name');
    const modalSubjectsContainer = document.getElementById('modal-subjects-container');
    const modalApplyBtn = document.getElementById('modal-save-btn'); // IDはそのまま流用
    const modalCancelBtn = document.getElementById('modal-cancel-btn');

    // --- 状態管理 ---
    let allSubjects = [];
    let highSchoolSubjects = [];
    let currentEditingTeacherId = null;

    // --- 初期化処理 ---
    async function initialize() {
        try {
            const subjectsResponse = await fetch('/api/subjects');
            if (!subjectsResponse.ok) throw new Error('科目データの取得に失敗');
            allSubjects = await subjectsResponse.json();
            // ▼▼▼【変更点1】高校の科目のみをフィルタリングして保持 ▼▼▼
            highSchoolSubjects = allSubjects.filter(s => s.level === '高校');

        } catch (error) {
            console.error(error);
        }
        
        fetchAndDisplayTeachers();
        renderSubjectButtons(document.querySelector('.form-card .choice-buttons'), highSchoolSubjects);
    }

    // --- UI生成・更新関数 ---

    // 講師一覧をテーブルに描画する
    async function fetchAndDisplayTeachers() {
        try {
            const response = await fetch('/api/teachers');
            const teachers = await response.json();
            teacherTableBody.innerHTML = '';

            if (teachers.length === 0) {
                teacherTableBody.innerHTML = '<tr><td colspan="5">登録されている講師はいません。</td></tr>';
                return;
            }

            teachers.forEach(teacher => {
                const subjectIds = teacher.subjects.map(s => s.id);
                const subjectTagsHTML = teacher.subjects.map(subject => 
                    `<span class="subject-tag">${subject.display_name}</span>`
                ).join('');

                const row = document.createElement('tr');
                row.dataset.teacherId = teacher.id;
                row.dataset.teacherName = teacher.name;
                
                row.dataset.subjectIds = JSON.stringify(subjectIds);

                row.innerHTML = `
                    <td>${teacher.id}</td>
                    <td>
                        <input type="text" class="name-input name-cell-input" value="${teacher.name}">
                        <input type="text" class="name-kana-input name-cell-input" value="${teacher.name_kana || ''}" placeholder="ふりがな">
                    </td>
                    <td>
                        <input type="text" class="display-name-input" value="${teacher.display_name}" style="width: 80px; padding: 4px;">
                    </td>
                    <td class="subject-cell">
                        <div class="subject-tags-container">${subjectTagsHTML || 'クリックして設定'}</div>
                    </td>
                    <td class="operations-cell">
                        <button class="save-btn" style="margin-right: 5px;">保存</button>
                        <button class="delete-btn">削除</button>
                    </td>
                `;
                teacherTableBody.appendChild(row);
            });
        } catch (error) {
            console.error('講師の読み込みに失敗しました:', error);
            teacherTableBody.innerHTML = '<tr><td colspan="5">データの読み込みに失敗しました。</td></tr>';
        }
    }
    
    // 科目選択ボタンを描画するヘルパー関数
    function renderSubjectButtons(container, subjectsData, selectedIds = []) {
        container.innerHTML = subjectsData.map(subject => {
            const isActive = selectedIds.includes(subject.id) ? 'active' : '';
            return `<button type="button" class="choice-btn ${isActive}" data-subject-id="${subject.id}">
                        ${subject.display_name}
                    </button>`;
        }).join('');
    }

    // --- モーダル関連の関数 ---

    function openSubjectModal(teacherId, teacherName, currentSubjectIds) {
        currentEditingTeacherId = teacherId;
        modalTeacherName.textContent = `${teacherName} の担当科目を編集`;
        
        renderSubjectButtons(modalSubjectsContainer, highSchoolSubjects, currentSubjectIds);
        
        modal.classList.add('visible');
    }

    function closeSubjectModal() {
        modal.classList.remove('visible');
        currentEditingTeacherId = null;
    }

    // --- イベントリスナー ---

    // 新規講師登録フォーム (変更なし)
    addTeacherForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = teacherNameInput.value;
        const name_kana = document.getElementById('teacher-name-kana').value;
        const display_name = teacherDisplayNameInput.value;
        const selectedButtons = document.querySelectorAll('.form-card .choice-btn.active');
        const subject_ids = Array.from(selectedButtons).map(btn => parseInt(btn.dataset.subjectId));

        if (!name || !display_name) {
            alert('講師名と表示名を入力してください。');
            return;
        }
        try {
            const response = await fetch('/api/teachers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, name_kana, display_name, subject_ids })
            });
            if (!response.ok) throw new Error((await response.json()).error || '登録失敗');
            alert('講師を登録しました。');
            addTeacherForm.reset();
            document.querySelectorAll('.form-card .choice-btn.active').forEach(btn => btn.classList.remove('active'));
            fetchAndDisplayTeachers();
        } catch (error) {
            alert(`エラー: ${error.message}`);
        }
    });

    // テーブル内のクリックイベント
    teacherTableBody.addEventListener('click', async (e) => {
        const target = e.target;
        const row = target.closest('tr');
        if (!row) return;
        const teacherId = parseInt(row.dataset.teacherId, 10);

        // 担当科目セルがクリックされたらモーダルを開く
        if (target.closest('.subject-cell')) {
            const teacherName = row.dataset.teacherName;
            const currentSubjectIds = JSON.parse(row.dataset.subjectIds);
            openSubjectModal(teacherId, teacherName, currentSubjectIds);
        }

        // 保存ボタン
        if (target.classList.contains('save-btn')) {
            const name = row.querySelector('.name-input').value;
            const name_kana = row.querySelector('.name-kana-input').value;
            const display_name = row.querySelector('.display-name-input').value;
            const subject_ids = JSON.parse(row.dataset.subjectIds); // 保存しておいたIDを取得

            if (!name || !display_name) {
                alert('講師名と表示名は必須です。'); return;
            }
            try {
                const response = await fetch(`/api/teachers/${teacherId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, name_kana, display_name, subject_ids })
                });
                if (!response.ok) throw new Error((await response.json()).error || '更新失敗');
                alert('更新しました。');
                target.style.backgroundColor = '';
                // fetchAndDisplayTeachers(); // 保存成功時に再描画
            } catch (error) {
                alert(`エラー: ${error.message}`);
            }
        }

        // 削除ボタン (変更なし)
        if (target.classList.contains('delete-btn')) {
            const teacherName = row.dataset.teacherName;
            if (!confirm(`${teacherName}を削除しますか？`)) return;
            try {
                const response = await fetch(`/api/teachers/${teacherId}`, { method: 'DELETE' });
                if (!response.ok) throw new Error((await response.json()).error || '削除失敗');
                alert((await response.json()).message);
                fetchAndDisplayTeachers();
            } catch (error) {
                alert(`エラー: ${error.message}`);
            }
        }
    });

    // テーブル内の入力で保存ボタンの色を変更
    teacherTableBody.addEventListener('input', (e) => {
        const target = e.target;
        if (target.classList.contains('name-input') || target.classList.contains('name-kana-input') || target.classList.contains('display-name-input')) {
            const saveBtn = target.closest('tr')?.querySelector('.save-btn');
            if(saveBtn) saveBtn.style.backgroundColor = '#28a745';
        }
    });

    // --- モーダル関連のイベントリスナー ---
    
    // モーダル内の科目ボタンクリック
    modalSubjectsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('choice-btn')) {
            e.target.classList.toggle('active');
        }
    });
    
    modalApplyBtn.addEventListener('click', () => {
        if (!currentEditingTeacherId) return;

        const row = teacherTableBody.querySelector(`tr[data-teacher-id="${currentEditingTeacherId}"]`);
        if (!row) return;

        // 選択された科目情報を取得
        const selectedBtns = modalSubjectsContainer.querySelectorAll('.choice-btn.active');
        const selectedIds = Array.from(selectedBtns).map(btn => parseInt(btn.dataset.subjectId));
        const selectedNames = Array.from(selectedBtns).map(btn => btn.textContent.trim());

        // 1. 行のdata属性に選択されたIDリストを保存
        row.dataset.subjectIds = JSON.stringify(selectedIds);

        // 2. セルの表示を更新
        const tagsContainer = row.querySelector('.subject-tags-container');
        tagsContainer.innerHTML = selectedNames.map(name => `<span class="subject-tag">${name}</span>`).join('') || 'クリックして設定';
        
        // 3. テーブルの保存ボタンを緑色に変更
        row.querySelector('.save-btn').style.backgroundColor = '#28a745';

        // 4. モーダルを閉じる
        closeSubjectModal();
    });

    // モーダルのキャンセル・背景クリック
    modalCancelBtn.addEventListener('click', closeSubjectModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeSubjectModal();
        }
    });
    
    // 新規登録フォームの科目ボタンクリック
    document.querySelector('.form-card .choice-buttons').addEventListener('click', (e) => {
        if (e.target.classList.contains('choice-btn')) {
            e.target.classList.toggle('active');
        }
    });

    // --- 初期化処理を実行 ---
    initialize();
});