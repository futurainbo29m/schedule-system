// static/js/contracts.js

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素の取得 ---
    const studentList = document.getElementById('student-list');
    const selectedStudentNameEl = document.getElementById('selected-student-name');
    const lessonInputList = document.getElementById('lesson-input-list');
    const contractPeriodTabs = document.getElementById('contract-period-tabs');
    const saveAllBtn = document.getElementById('save-all-contracts');
    const gradeFilterBar = document.getElementById('student-grade-filter-bar');
    const overviewTitle = document.getElementById('overview-title');
    const overviewGrid = document.getElementById('overview-grid');

    // --- 状態管理 ---
    const planningPeriodId = window.location.pathname.split('/')[2]; 
    let allStudents = [];
    let allSubjects = [];
    let subjectMap = {};
    let allContractPeriods = [];
    let contractedLessons = {};
    let selectedStudentId = null;
    let activeContractPeriodId = null;
    let activeGradeFilter = 'all';

    // --- 初期化処理 ---
    async function initialize() {
        if (!planningPeriodId) {
            document.body.innerHTML = '<h1>エラー: 計画期間が指定されていません。</h1>';
            return;
        }
        try {
            // APIの呼び出し先を計画期間IDに紐づくものに変更
            const [studentsRes, subjectsRes, periodsRes, contractsRes] = await Promise.all([
                fetch('/api/students'),
                fetch('/api/subjects'),
                fetch(`/api/period/${planningPeriodId}/contract-periods`),
                fetch(`/api/period/${planningPeriodId}/contracted-lessons`)
            ]);
            
            allStudents = await studentsRes.json();
            allSubjects = await subjectsRes.json();
            allContractPeriods = await periodsRes.json();
            contractedLessons = await contractsRes.json();
            
            allSubjects.forEach(sub => { subjectMap[sub.id] = sub.name; });

            buildGradeFilter();
            renderStudentList();
            renderContractPeriodTabs();
            renderOverviewTable();

        } catch (error) {
            console.error("初期データの読み込みに失敗しました:", error);
        }
    }

    // --- UI生成関数 ---
    function buildGradeFilter() {
        const grades = ['all', '小学', '中1', '中2', '中3', '高1', '高2', '高3', '浪人'];
        const gradeLabels = { 'all': '全員', '小学': '小学', '中1': '中１', '中2': '中２', '中3': '中３', '高1': '高１', '高2': '高２', '高3': '高３', '浪人': '浪人' };
        
        gradeFilterBar.innerHTML = grades.map(grade => 
            `<button class="teacher-filter-btn ${grade === activeGradeFilter ? 'active' : ''}" data-grade="${grade}">${gradeLabels[grade]}</button>`
        ).join('');
    }

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

    function renderContractPeriodTabs() {
        if (allContractPeriods.length === 0) {
            contractPeriodTabs.innerHTML = "<p>登録されている契約期間がありません。</p>";
            return;
        }
        contractPeriodTabs.innerHTML = allContractPeriods.map(period =>
            `<button class="tab-btn" data-period-id="${period.id}">${period.name}</button>`
        ).join('');
        const firstTab = contractPeriodTabs.querySelector('.tab-btn');
        if (firstTab) {
            firstTab.classList.add('active');
            activeContractPeriodId = firstTab.dataset.periodId;
        }
    }

    function renderLessonInput() {
        if (!selectedStudentId || !activeContractPeriodId) {
            lessonInputList.innerHTML = '<p>左のリストから生徒を選択してください。</p>';
            return;
        }
        const student = allStudents.find(s => s.id == selectedStudentId);
        selectedStudentNameEl.textContent = `${student.name} の契約数を入力`;

        let target_level = '高校';
        if (student.grade.startsWith('小')) target_level = '小学';
        else if (student.grade.startsWith('中')) target_level = '中学';
        
        const filteredSubjects = allSubjects.filter(s => s.level === target_level);

        lessonInputList.innerHTML = filteredSubjects.map(subject => {
            const key = `${selectedStudentId}-${subject.id}-${activeContractPeriodId}`;
            const count = contractedLessons[key] || 0;
            return `
                <div class="lesson-input-item" data-subject-id="${subject.id}">
                    <label>${subject.name}</label>
                    <div class="lesson-input-bar">
                        ${[...Array(8)].map((_, i) => `<div class="bar-segment" data-value="${i + 1}"></div>`).join('')}
                    </div>
                    <input type="number" min="0" value="${count}">
                </div>
            `;
        }).join('');
            
        lessonInputList.querySelectorAll('.lesson-input-item').forEach(item => {
            const initialValue = parseInt(item.querySelector('input').value, 10);
            updateRequestValue(item, initialValue);
        });
    }

    function updateRequestValue(inputItem, newValue) {
        if (!inputItem) return;
        const segments = inputItem.querySelectorAll('.bar-segment');
        const input = inputItem.querySelector('input');
        input.value = newValue;
        segments.forEach((seg, i) => {
            const segValue = i + 1;
            seg.classList.toggle('active', newValue >= segValue);
            seg.classList.toggle('extra', newValue >= segValue + 8);
        });
    }

    function renderOverviewTable() {
        if (!activeContractPeriodId) {
            overviewGrid.innerHTML = '<p>契約期間を選択してください。</p>';
            return;
        }

        const activePeriod = allContractPeriods.find(p => p.id == activeContractPeriodId);
        overviewTitle.textContent = `${activePeriod.name} の設定済みレッスン数一覧`;
        
        const studentContracts = {};

        // 選択中の契約期間のデータのみを抽出・集計
        for (const key in contractedLessons) {
            const [studentId, subjectId, periodId] = key.split('-');
            if (periodId == activeContractPeriodId) {
                const count = contractedLessons[key];
                if (count > 0) {
                    if (!studentContracts[studentId]) {
                        studentContracts[studentId] = { total: 0, subjects: [] };
                    }
                    studentContracts[studentId].total += count;
                    studentContracts[studentId].subjects.push({ subjectId, count });
                }
            }
        }
        
        if (allStudents.length === 0) {
            overviewGrid.innerHTML = '<p>登録されている生徒がいません。</p>';
            return;
        }

        // テーブルHTMLを生成
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
        
        // 全生徒をループして行を生成
        for (const student of allStudents) {
            const contractData = studentContracts[student.id];
            const subjectsHtml = contractData ? contractData.subjects.map(req => {
                const subjectName = subjectMap[req.subjectId] || '不明';
                return `<span class="subject-tag">${subjectName} (${req.count})</span>`;
            }).join('') : '<span class="no-request-text">未設定</span>';

            const total = contractData ? contractData.total : 0;
            const totalCellClass = total === 0 ? 'total-cell-zero' : '';

            tableHTML += `
                <tr data-student-id="${student.id}" style="cursor: pointer;">
                    <td class="student-name-cell">${student.name} (${student.grade})</td>
                    <td class="subjects-cell">${subjectsHtml}</td>
                    <td class="total-cell ${totalCellClass}">${total}</td>
                </tr>
            `;
        }
        tableHTML += `</tbody></table>`;
        overviewGrid.innerHTML = tableHTML;
    }

    // --- イベントリスナー ---
    gradeFilterBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.teacher-filter-btn');
        if (!btn) return;
        activeGradeFilter = btn.dataset.grade;
        gradeFilterBar.querySelector('.active').classList.remove('active');
        btn.classList.add('active');
        renderStudentList();
    });
    
    studentList.addEventListener('click', (e) => {
        const item = e.target.closest('.student-list-item');
        if (!item) return;
        const currentSelected = studentList.querySelector('.selected');
        if (currentSelected) currentSelected.classList.remove('selected');
        item.classList.add('selected');
        selectedStudentId = item.dataset.studentId;
        renderLessonInput();
    });

    contractPeriodTabs.addEventListener('click', (e) => {
        const tab = e.target.closest('.tab-btn');
        if (!tab) return;
        contractPeriodTabs.querySelector('.active').classList.remove('active');
        tab.classList.add('active');
        activeContractPeriodId = tab.dataset.periodId;
        if (selectedStudentId) renderLessonInput();
        renderOverviewTable(); // タブ切り替え時に一覧を更新
    });

    lessonInputList.addEventListener('click', (e) => {
        if (e.target.classList.contains('bar-segment')) {
            const inputItem = e.target.closest('.lesson-input-item');
            const input = inputItem.querySelector('input');
            const clickedValue = parseInt(e.target.dataset.value, 10);
            const currentValue = parseInt(input.value, 10);
            const newValue = (clickedValue === currentValue) ? 0 : clickedValue;
            updateRequestValue(inputItem, newValue);
            updateStateObject(inputItem.dataset.subjectId, newValue);
        }
    });

    lessonInputList.addEventListener('input', (e) => {
        if (e.target.tagName === 'INPUT') {
            const inputItem = e.target.closest('.lesson-input-item');
            let value = parseInt(e.target.value, 10);
            if (isNaN(value) || value < 0) value = 0;
            updateRequestValue(inputItem, value);
            updateStateObject(inputItem.dataset.subjectId, value);
        }
    });

    function updateStateObject(subjectId, count) {
        const key = `${selectedStudentId}-${subjectId}-${activeContractPeriodId}`;
        if (count > 0) {
            contractedLessons[key] = count;
        } else {
            // 既存のデータがある場合のみ、0を送信する対象とする
            if (contractedLessons[key] !== undefined) {
                 contractedLessons[key] = 0;
            }
        }
    }

    saveAllBtn.addEventListener('click', async () => {
        saveAllBtn.disabled = true;
        saveAllBtn.textContent = '保存中...';
        try {
            const response = await fetch('/api/contracted-lessons/batch_update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ payload: contractedLessons })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            
            alert('保存しました。');
            
            // 保存成功後、最新のデータをサーバーから再取得して状態を更新
            const contractsRes = await fetch('/api/contracted-lessons');
            contractedLessons = await contractsRes.json();
            
            // 表示を最新の状態に更新
            if(selectedStudentId) renderLessonInput();
            renderOverviewTable(); // 保存後に一覧を更新

        } catch (error) {
            alert(`エラー: ${error.message}`);
        } finally {
            saveAllBtn.disabled = false;
            saveAllBtn.textContent = '全ての設定を保存';
        }
    });

    overviewGrid.addEventListener('click', (e) => {
        const row = e.target.closest('tr');
        if (!row || !row.dataset.studentId) return;

        const studentIdToSelect = row.dataset.studentId;
        const studentListItem = studentList.querySelector(`li[data-student-id="${studentIdToSelect}"]`);
        
        if (studentListItem) {
            studentListItem.click();
            studentListItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            const studentData = allStudents.find(s => s.id == studentIdToSelect);
            if (!studentData) return;

            // 適切な学年フィルターに切り替える
            let targetGradeFilter = studentData.grade;
            if (studentData.grade.startsWith('小')) {
                targetGradeFilter = '小学';
            }
            gradeFilterBar.querySelector(`button[data-grade="${targetGradeFilter}"]`).click();
            
            // フィルター変更後に少し待ってから生徒を選択
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