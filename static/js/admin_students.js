// static/js/admin_students.js (学年・優先講師 編集機能追加版)

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素の取得 ---
    const addStudentForm = document.getElementById('add-student-form');
    const studentTableBody = document.querySelector('#student-table tbody');
    const studentNameInput = document.getElementById('student-name');
    const studentDisplayNameInput = document.getElementById('student-display-name');
    
    // モーダル関連の要素
    const modal = document.getElementById('teacher-edit-modal');
    const modalStudentName = document.getElementById('modal-student-name');
    const modalTeachersContainer = document.getElementById('modal-teachers-container');
    const modalApplyBtn = document.getElementById('modal-apply-btn');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');

    // --- 状態管理 ---
    let allTeachers = []; // 全ての講師情報を保持する配列
    let currentEditingStudentId = null; // 現在編集中の生徒ID
    const grades = ['小1', '小2', '小3', '小4', '小5', '小6', '中1', '中2', '中3', '高1', '高2', '高3', '浪人'];

    // --- 初期化処理 ---
    async function initialize() {
        try {
            const teachersResponse = await fetch('/api/teachers');
            if (!teachersResponse.ok) throw new Error('講師データの取得に失敗');
            allTeachers = await teachersResponse.json();
        } catch (error) {
            console.error(error);
        }
        
        fetchAndDisplayStudents();
        // 新規登録フォーム用の講師ボタンを生成
        renderTeacherButtons(document.querySelector('.form-card .choice-buttons'), allTeachers);
        // 新規登録フォーム用の学年プルダウンを生成
        const gradeSelect = document.createElement('select');
        gradeSelect.id = 'student-grade';
        gradeSelect.required = true;
        gradeSelect.innerHTML = grades.map(g => `<option value="${g}">${g}</option>`).join('');
        const formGroup = studentDisplayNameInput.closest('.form-group');
        formGroup.insertAdjacentHTML('afterend', `
            <div class="form-group">
                <label for="student-grade">学年</label>
            </div>
        `);
        document.querySelector('label[for="student-grade"]').after(gradeSelect);
    }

    // --- UI生成・更新関数 ---

    // 生徒一覧をテーブルに描画する
    async function fetchAndDisplayStudents() {
        try {
            const response = await fetch('/api/students');
            const students = await response.json();
            studentTableBody.innerHTML = '';

            if (students.length === 0) {
                studentTableBody.innerHTML = '<tr><td colspan="6">登録されている生徒はいません。</td></tr>';
                return;
            }

            students.forEach(student => {
                const preferredTeacherIds = student.preferred_teachers.map(t => t.id);
                const teacherTagsHTML = student.preferred_teachers.map(teacher => 
                    `<span class="teacher-tag">${teacher.display_name}</span>`
                ).join('');

                // 学年選択のドロップダウンHTMLを生成
                const gradeOptionsHTML = grades.map(g => 
                    `<option value="${g}" ${student.grade === g ? 'selected' : ''}>${g}</option>`
                ).join('');

                const row = document.createElement('tr');
                row.dataset.studentId = student.id;
                row.dataset.studentName = student.name;
                row.dataset.preferredTeacherIds = JSON.stringify(preferredTeacherIds);

                row.innerHTML = `
                    <td>${student.id}</td>
                    <td>
                        <input type="text" class="name-input name-cell-input" value="${student.name}">
                        <input type="text" class="name-kana-input name-cell-input" value="${student.name_kana || ''}" placeholder="ふりがな">
                    </td>
                    <td>
                        <input type="text" class="display-name-input" value="${student.display_name}" style="width: 80px; padding: 4px;">
                    </td>
                    <td>
                        <select class="grade-select">${gradeOptionsHTML}</select>
                    </td>
                    <td class="preferred-cell">
                        <div class="teacher-tags-container">${teacherTagsHTML || 'クリックして設定'}</div>
                    </td>
                    <td class="operations-cell">
                        <button class="save-btn" style="margin-right: 5px;">保存</button>
                        <button class="delete-btn">削除</button>
                    </td>
                `;
                studentTableBody.appendChild(row);
            });
        } catch (error) {
            console.error('生徒の読み込みに失敗しました:', error);
            studentTableBody.innerHTML = '<tr><td colspan="6">データの読み込みに失敗しました。</td></tr>';
        }
    }
    
    // 講師選択ボタンを描画するヘルパー関数
    function renderTeacherButtons(container, teachersData, selectedIds = []) {
        container.innerHTML = teachersData.map(teacher => {
            const isActive = selectedIds.includes(teacher.id) ? 'active' : '';
            return `<button type="button" class="choice-btn ${isActive}" data-teacher-id="${teacher.id}">
                        ${teacher.display_name}
                    </button>`;
        }).join('');
    }

    // --- モーダル関連の関数 ---

    function openTeacherModal(studentId, studentName, currentTeacherIds) {
        currentEditingStudentId = studentId;
        modalStudentName.textContent = `${studentName} の優先講師を編集`;
        renderTeacherButtons(modalTeachersContainer, allTeachers, currentTeacherIds);
        modal.classList.add('visible');
    }

    function closeTeacherModal() {
        modal.classList.remove('visible');
        currentEditingStudentId = null;
    }

    // --- イベントリスナー ---

    // 新規生徒登録フォーム
    addStudentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = studentNameInput.value;
        const name_kana = document.getElementById('student-name-kana').value;
        const display_name = studentDisplayNameInput.value;
        const grade = document.getElementById('student-grade').value;
        const selectedButtons = document.querySelectorAll('.form-card .choice-btn.active');
        const preferred_teacher_ids = Array.from(selectedButtons).map(btn => parseInt(btn.dataset.teacherId));

        if (!name || !display_name || !grade) {
            alert('生徒名、表示名、学年をすべて入力してください。'); return;
        }
        try {
            const response = await fetch('/api/students', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, name_kana, display_name, grade, preferred_teacher_ids })
            });
            if (!response.ok) throw new Error((await response.json()).error || '登録失敗');
            alert((await response.json()).message);
            addStudentForm.reset();
            document.querySelectorAll('.form-card .choice-btn.active').forEach(btn => btn.classList.remove('active'));
            fetchAndDisplayStudents();
        } catch (error) {
            alert(`エラー: ${error.message}`);
        }
    });

    // テーブル内のクリックイベント
    studentTableBody.addEventListener('click', async (e) => {
        const target = e.target;
        const row = target.closest('tr');
        if (!row) return;
        const studentId = parseInt(row.dataset.studentId, 10);

        // 優先講師セルがクリックされたらモーダルを開く
        if (target.closest('.preferred-cell')) {
            const studentName = row.dataset.studentName;
            const currentTeacherIds = JSON.parse(row.dataset.preferredTeacherIds);
            openTeacherModal(studentId, studentName, currentTeacherIds);
        }

        // 保存ボタン
        if (target.classList.contains('save-btn')) {
            const name = row.querySelector('.name-input').value;
            const name_kana = row.querySelector('.name-kana-input').value;
            const display_name = row.querySelector('.display-name-input').value;
            const grade = row.querySelector('.grade-select').value;
            const preferred_teacher_ids = JSON.parse(row.dataset.preferredTeacherIds);

            if (!name || !display_name) {
                alert('生徒名と表示名は必須です。'); return;
            }
            try {
                const response = await fetch(`/api/students/${studentId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, name_kana, display_name, grade, preferred_teacher_ids })
                });
                if (!response.ok) throw new Error((await response.json()).error || '更新失敗');
                alert('更新しました。');
                target.style.backgroundColor = '';
                // fetchAndDisplayStudents();
            } catch (error) {
                alert(`エラー: ${error.message}`);
            }
        }

        // 削除ボタン
        if (target.classList.contains('delete-btn')) {
            const studentName = row.dataset.studentName;
            if (!confirm(`${studentName}を削除しますか？`)) return;
            try {
                const response = await fetch(`/api/students/${studentId}`, { method: 'DELETE' });
                if (!response.ok) throw new Error((await response.json()).error || '削除失敗');
                alert((await response.json()).message);
                fetchAndDisplayStudents();
            } catch (error) {
                alert(`エラー: ${error.message}`);
            }
        }
    });

    // テーブル内の入力で保存ボタンの色を変更
    studentTableBody.addEventListener('input', (e) => {
        const target = e.target;
        if (target.matches('.name-input, .name-kana-input, .display-name-input, .grade-select')) {
            const saveBtn = target.closest('tr')?.querySelector('.save-btn');
            if(saveBtn) saveBtn.style.backgroundColor = '#28a745';
        }
    });

    // --- モーダル関連のイベントリスナー ---
    
    modalTeachersContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('choice-btn')) {
            e.target.classList.toggle('active');
        }
    });
    
    modalApplyBtn.addEventListener('click', () => {
        if (!currentEditingStudentId) return;
        const row = studentTableBody.querySelector(`tr[data-student-id="${currentEditingStudentId}"]`);
        if (!row) return;

        const selectedBtns = modalTeachersContainer.querySelectorAll('.choice-btn.active');
        const selectedIds = Array.from(selectedBtns).map(btn => parseInt(btn.dataset.teacherId));
        const selectedNames = Array.from(selectedBtns).map(btn => btn.textContent.trim());

        row.dataset.preferredTeacherIds = JSON.stringify(selectedIds);
        const tagsContainer = row.querySelector('.teacher-tags-container');
        tagsContainer.innerHTML = selectedNames.map(name => `<span class="teacher-tag">${name}</span>`).join('') || 'クリックして設定';
        row.querySelector('.save-btn').style.backgroundColor = '#28a745';
        closeTeacherModal();
    });

    modalCancelBtn.addEventListener('click', closeTeacherModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeTeacherModal();
        }
    });
    
    // 新規登録フォームの講師ボタンクリック
    document.querySelector('.form-card .choice-buttons').addEventListener('click', (e) => {
        if (e.target.classList.contains('choice-btn')) {
            e.target.classList.toggle('active');
        }
    });

    // --- 初期化処理を実行 ---
    initialize();
});