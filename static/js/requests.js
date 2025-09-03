// static/js/requests.js (UI/UX刷新版)

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素の取得 ---
    const gradeFilterBar = document.getElementById('student-grade-filter-bar');
    const studentList = document.getElementById('student-list');
    const selectedStudentNameEl = document.getElementById('selected-student-name');
    const lessonInputList = document.getElementById('lesson-input-list');
    const saveSingleStudentBtn = document.getElementById('save-single-student');
    const overviewGrid = document.getElementById('overview-grid');

    // --- 状態管理 ---
    const periodId = window.location.pathname.split('/')[2];
    let allStudents = [];
    let subjects = [];
    let subjectMap = {};
    let activeGradeFilter = 'all';
    let selectedStudentId = null;

    // --- 初期化処理 ---
    async function initialize() {
        if (!periodId) {
            document.body.innerHTML = '<h1>エラー: 計画期間が指定されていません。</h1>';
            return;
        }
        buildGradeFilter();
        // ▼▼▼ 修正: 取得した科目データも変数に格納し、マップを作成 ▼▼▼
        try {
            const [studentsRes, subjectsRes] = await Promise.all([
                fetch('/api/students'),
                fetch('/api/subjects')
            ]);
            if (!studentsRes.ok || !subjectsRes.ok) throw new Error('基本データの読み込みに失敗');
            
            allStudents = await studentsRes.json();
            subjects = await subjectsRes.json(); // subjects変数に科目データを格納
            
            // 科目マップを作成
            subjects.forEach(sub => { subjectMap[sub.id] = sub.name; });

            renderStudentList();
            await renderOverview();

        } catch (error) {
            console.error(error);
        }
    }

    // --- UI生成関数 ---

    // 学年フィルターボタンを生成
    function buildGradeFilter() {
        const grades = ['all', '小学', '中1', '中2', '中3', '高1', '高2', '高3', '浪人'];
        const gradeLabels = { 'all': '全員', '小学': '小学', '中1': '中１', '中2': '中２', '中3': '中３', '高1': '高１', '高2': '高２', '高3': '高３', '浪人': '浪人' };
        
        gradeFilterBar.innerHTML = grades.map(grade => 
            `<button class="teacher-filter-btn ${grade === 'all' ? 'active' : ''}" data-grade="${grade}">${gradeLabels[grade]}</button>`
        ).join('');
    }

    // 生徒リストをフィルタリングして表示
    function renderStudentList() {
        const filteredStudents = allStudents.filter(student => {
            if (activeGradeFilter === 'all') return true;
            if (activeGradeFilter === '小学') return student.grade.startsWith('小');
            return student.grade === activeGradeFilter;
        });

        studentList.innerHTML = filteredStudents.map(student => 
            `<li class="student-list-item" data-student-id="${student.id}">${student.name} (${student.grade})</li>`
        ).join('');
    }

    // 右カラムのレッスン入力欄を生成
    async function renderLessonInput(studentId) {
        try {
            const response = await fetch(`/api/period/${periodId}/student/${studentId}/request-details`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);

            selectedStudentNameEl.textContent = `${data.student_name} の希望レッスン数`;
            
            lessonInputList.innerHTML = data.subjects.map(subject => `
                <div class="lesson-input-item" data-subject-id="${subject.id}">
                    <label>${subject.name}</label>
                    <div class="lesson-input-bar">
                        ${[...Array(8)].map((_, i) => `<div class="bar-segment" data-value="${i + 1}"></div>`).join('')}
                    </div>
                    <input type="number" min="0" value="${subject.requested_lessons}">
                </div>
            `).join('');
            
            // レンダリング後に初期値をバーに反映
            lessonInputList.querySelectorAll('.lesson-input-item').forEach(item => {
                const initialValue = parseInt(item.querySelector('input').value, 10);
                updateRequestValue(item, initialValue);
            });

            saveSingleStudentBtn.disabled = false;
        } catch (error) {
            console.error('レッスン入力欄の生成に失敗:', error);
            lessonInputList.innerHTML = `<p>データの読み込みに失敗しました。</p>`;
            saveSingleStudentBtn.disabled = true;
        }
    }

    // 下部の一覧表示を生成
    async function renderOverview() {
        try {
            const response = await fetch(`/api/requests?planning_period_id=${periodId}`);
            if (!response.ok) throw new Error('一覧データの取得に失敗');
            const requestsMap = await response.json();
            
            const studentRequests = {};
            for (const key in requestsMap) {
                const [studentId, subjectId] = key.split('-');
                const count = requestsMap[key];
                if (!studentRequests[studentId]) {
                    studentRequests[studentId] = { total: 0, subjects: [] };
                }
                studentRequests[studentId].total += count;
                studentRequests[studentId].subjects.push({ subjectId, count });
            }

            // テーブルのヘッダーを作成
            let tableHTML = `
                <table class="overview-table">
                    <thead>
                        <tr>
                            <th>生徒名 (学年)</th>
                            <th>登録科目 (コマ数)</th>
                            <th>合計</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            // ★★★ ここからが変更箇所 ★★★
            // allStudentsを基準にループし、全生徒を表示
            for (const student of allStudents) {
                const reqData = studentRequests[student.id];

                // リクエストがある場合は科目タグを、ない場合は「未設定」と表示
                const subjectsHtml = reqData ? reqData.subjects.map(req => {
                    const subjectName = subjectMap[req.subjectId] || '不明';
                    return `<span class="subject-tag">${subjectName} (${req.count})</span>`;
                }).join('') : '<span class="no-request-text">未設定</span>';

                // 合計コマ数を取得（ない場合は0）
                const total = reqData ? reqData.total : 0;
                
                // 合計が0の場合に適用するCSSクラスを定義
                const totalCellClass = total === 0 ? 'total-cell-zero' : '';

                tableHTML += `
                    <tr data-student-id="${student.id}" style="cursor: pointer;">
                        <td class="student-name-cell">${student.name} (${student.grade})</td>
                        <td class="subjects-cell">${subjectsHtml}</td>
                        <td class="total-cell ${totalCellClass}">${total}</td>
                    </tr>
                `;
            }
            // ★★★ ここまでが変更箇所 ★★★

            tableHTML += `</tbody></table>`;
            overviewGrid.innerHTML = allStudents.length > 0 ? tableHTML : '<p>登録されている生徒がいません。</p>';

        } catch (error) {
            console.error('一覧の表示に失敗:', error);
            overviewGrid.innerHTML = '<p>一覧の表示に失敗しました。</p>';
        }
    }

    // --- 状態更新の専門関数 ---
    function updateRequestValue(inputItem, newValue) {
        if (!inputItem) return;
        const segments = inputItem.querySelectorAll('.bar-segment');
        const input = inputItem.querySelector('input');
        
        // 1. 右側の数値ボックスの値を更新
        input.value = newValue;

        // 2. バーの見た目を更新
        segments.forEach((seg, i) => {
            const segValue = i + 1;
            // 1周目（通常色）
            seg.classList.toggle('active', newValue >= segValue);
            // 2周目以降（上塗り色）
            seg.classList.toggle('extra', newValue >= segValue + 8);
        });
    }

    // --- イベントリスナー ---

    // 学年フィルター
    gradeFilterBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.teacher-filter-btn');
        if (!btn) return;
        activeGradeFilter = btn.dataset.grade;
        gradeFilterBar.querySelector('.active').classList.remove('active');
        btn.classList.add('active');
        renderStudentList();
    });

    // 生徒選択
    studentList.addEventListener('click', (e) => {
        const item = e.target.closest('.student-list-item');
        if (!item) return;
        
        const currentSelected = studentList.querySelector('.selected');
        if (currentSelected) currentSelected.classList.remove('selected');
        
        item.classList.add('selected');
        selectedStudentId = item.dataset.studentId;
        renderLessonInput(selectedStudentId);
    });

    // レッスン入力バーのクリック操作
    lessonInputList.addEventListener('click', (e) => {
        const target = e.target;
        // クリックされたのがセグメントの場合のみ処理
        if (target.classList.contains('bar-segment')) {
            const inputItem = target.closest('.lesson-input-item');
            const input = inputItem.querySelector('input');
            
            const clickedValue = parseInt(target.dataset.value, 10);
            const currentValue = parseInt(input.value, 10);
            
            // 現在の値と同じ場所をクリックしたら0に、違えばクリックされた値に
            const newValue = (clickedValue === currentValue) ? 0 : clickedValue;
            
            updateRequestValue(inputItem, newValue);
        }
    });

    // 数値ボックスの手入力操作
    lessonInputList.addEventListener('input', (e) => {
        const target = e.target;
        // 対象が入力ボックスの場合のみ処理
        if (target.tagName === 'INPUT') {
            const inputItem = target.closest('.lesson-input-item');
            let value = parseInt(target.value, 10);
            
            if (isNaN(value) || value < 0) value = 0;
            // valueの上限チェックは設けない
            
            updateRequestValue(inputItem, value);
        }
    });

    // 保存ボタン
    saveSingleStudentBtn.addEventListener('click', async () => {
        if (!selectedStudentId) {
            alert('生徒が選択されていません。');
            return;
        }
        const payload = {};
        const inputItems = lessonInputList.querySelectorAll('.lesson-input-item');
        inputItems.forEach(item => {
            const subjectId = item.dataset.subjectId;
            const count = parseInt(item.querySelector('input').value, 10);
            if (count > 0) {
                 payload[`${selectedStudentId}-${subjectId}`] = count;
            }
        });
        
        try {
            const allRequestsRes = await fetch(`/api/requests?planning_period_id=${periodId}`);
            const allRequests = await allRequestsRes.json();
            
            for(const key in allRequests) {
                if(key.startsWith(`${selectedStudentId}-`)){
                    delete allRequests[key];
                }
            }
            Object.assign(allRequests, payload);

            const response = await fetch('/api/requests/batch_update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    planning_period_id: periodId,
                    payload: allRequests
                })
            });
            if (!response.ok) throw new Error((await response.json()).error);

            alert('保存しました。');
            renderOverview();
        } catch (error) {
            alert(`エラー: ${error.message}`);
        }
    });

    overviewGrid.addEventListener('click', (e) => {
        const row = e.target.closest('tr');
        if (!row || !row.dataset.studentId) return;

        const studentIdToSelect = row.dataset.studentId;

        // 上部の生徒リストから、対応する生徒の項目を探す
        const studentListItem = studentList.querySelector(`li[data-student-id="${studentIdToSelect}"]`);
        
        if (studentListItem) {
            // 見つかった生徒項目をクリックして選択状態にする
            studentListItem.click();
            
            // 選択した項目がリストの中央に来るようにスクロール
            studentListItem.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        } else {
            // もしフィルターで非表示になっている場合は、フィルターを解除してから選択
            alert('選択した生徒は現在の学年フィルターでは非表示です。\nフィルターを「全員」に戻して表示します。');
            gradeFilterBar.querySelector('button[data-grade="all"]').click();
            
            // フィルター解除後に再度項目を探してクリック
            setTimeout(() => {
                const item = studentList.querySelector(`li[data-student-id="${studentIdToSelect}"]`);
                if (item) {
                    item.click();
                    item.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        }
    });

    initialize();
});