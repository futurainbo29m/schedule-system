// static/js/analysis.js (サーバー直接描画対応版)

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素の取得 ---
    const periodId = window.location.pathname.split('/')[2];
    const analysisResultsContainer = document.getElementById('analysis-results');
    const contractPeriodSelect = document.getElementById('contract-period-select');
    const studentFulfillmentTbody = document.getElementById('student-fulfillment-report-body');
    const tooltip = document.getElementById('analysis-tooltip');

    let analysisData = {};
    let activeContractPeriodId = null;
    let capacityChart, fulfillmentChart, timeslotChart, weekdayChart;

    // --- 初期化処理 ---
    async function initialize() {
        if (!periodId) {
            analysisResultsContainer.innerHTML = '<p>エラー: 計画期間IDが見つかりません。</p>';
            return;
        }
        try {
            const response = await fetch(`/api/period/${periodId}/analysis-data`);
            if (!response.ok) throw new Error('分析データの取得に失敗しました。');
            analysisData = await response.json();
            
            renderAll();

        } catch (error) {
            console.error(error);
            analysisResultsContainer.innerHTML = `<p>エラーが発生しました: ${error.message}</p>`;
        }
    }

    // --- 全描画の統括 ---
    function renderAll() {
        renderSummary(analysisData.summary);
        renderDistributionCharts(analysisData.distribution);
        renderTeacherReport(analysisData.teacher_report);
        
        // 生徒別レポートは、まずドロップダウンを生成し、その後テーブルを描画
        setupContractPeriodSelect(analysisData.related_contract_periods);
        renderStudentFulfillmentReport();
    }

    // --- 各セクションの描画関数 ---
    function renderSummary(summary) {
        document.getElementById('total-lesson-capacity').textContent = summary.total_lesson_capacity;
        document.getElementById('total-contracted-lessons').textContent = summary.total_contracted_lessons;
        
        const doughnutLabelPlugin = {
            id: 'doughnutlabel',
            beforeDraw: (chart) => {
                if (!chart.options.plugins.doughnutlabel || !chart.options.plugins.doughnutlabel.display) return;
                const { ctx, width, height } = chart;
                ctx.restore();
                const text = chart.data.datasets[0].data[0] + '%';
                ctx.font = 'bold 24px sans-serif';
                ctx.fillStyle = '#2c3e50';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(text, width / 2, height / 2);
                ctx.save();
            }
        };
        if (Chart.registry.plugins.get('doughnutlabel')) {
            Chart.unregister(doughnutLabelPlugin);
        }
        Chart.register(doughnutLabelPlugin);

        const createDoughnutChart = (canvasId, rate, colors) => {
            const ctx = document.getElementById(canvasId).getContext('2d');
            return new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['達成', '未達成'],
                    datasets: [{ data: [rate, 100 - rate], backgroundColor: colors, borderWidth: 0 }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    cutout: '70%',
                    plugins: { legend: { display: false }, tooltip: { enabled: true }, doughnutlabel: { display: true } }
                }
            });
        };
        
        if (capacityChart) capacityChart.destroy();
        capacityChart = createDoughnutChart('capacity-utilization-chart', summary.capacity_utilization_rate, ['#3498db', '#e9ecef']);

        if (fulfillmentChart) fulfillmentChart.destroy();
        fulfillmentChart = createDoughnutChart('fulfillment-rate-chart', summary.lesson_fulfillment_rate, ['#2ecc71', '#e9ecef']);
    }

    function renderTeacherReport(report) {
        const tbody = document.getElementById('teacher-report-body');
        tbody.innerHTML = report.map(teacher => `
            <tr>
                <td>${teacher.name}</td>
                <td>${teacher.shift_count}</td>
                <td>${teacher.lesson_count}</td>
                <td>${teacher.utilization_rate}%</td>
            </tr>
        `).join('');
    }

    function setupContractPeriodSelect(periods) {
        if (!periods || periods.length === 0) {
            contractPeriodSelect.innerHTML = '<option>対象期間なし</option>';
            contractPeriodSelect.disabled = true;
            return;
        }
        contractPeriodSelect.innerHTML = periods.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        activeContractPeriodId = periods[0].id; // 最初の期間をデフォルトで選択
        contractPeriodSelect.disabled = false;
    }


    function renderDistributionCharts(data) {
        const timeSlotCtx = document.getElementById('timeslot-chart').getContext('2d');
        const timeSlotLabels = ['1限', '2限', '3限', '4限', '5限', '6限', '7限', '8限', '9限', '10限', '11限'];
        if (timeslotChart) timeslotChart.destroy();
        timeslotChart = new Chart(timeSlotCtx, {
            type: 'bar',
            data: {
                labels: timeSlotLabels,
                datasets: [{ label: '割当コマ数', data: data.timeslot, backgroundColor: '#3498db' }]
            },
            options: { 
                responsive: true, 
                plugins: { legend: { display: false } },
                scales: { y: { ticks: { precision: 0 } } }
            }
        });

        const weekdayCtx = document.getElementById('weekday-chart').getContext('2d');
        const weekdayLabels = ['月', '火', '水', '木', '金', '土', '日'];
        if (weekdayChart) weekdayChart.destroy();
        weekdayChart = new Chart(weekdayCtx, {
            type: 'bar',
            data: {
                labels: weekdayLabels,
                datasets: [{ label: '割当コマ数', data: data.weekday, backgroundColor: '#2ecc71' }]
            },
            options: { 
                responsive: true, 
                plugins: { legend: { display: false } },
                scales: { y: { ticks: { precision: 0 } } }
            }
        });
    }

    function renderStudentFulfillmentReport() {
        if (!activeContractPeriodId) {
            studentFulfillmentTbody.innerHTML = '<tr><td colspan="4">契約期間を選択してください。</td></tr>';
            return;
        }
        const report = analysisData.student_fulfillment_report[activeContractPeriodId];
        if (!report || report.length === 0) {
            studentFulfillmentTbody.innerHTML = '<tr><td colspan="4">この契約期間の対象生徒データはありません。</td></tr>';
            return;
        }
        studentFulfillmentTbody.innerHTML = report.map((student, index) => `
            <tr data-student-index="${index}">
                <td>${student.student_name}</td>
                <td>${student.total_contracted}</td>
                <td>${student.total_fulfilled}</td>
                <td>${student.fulfillment_rate}%</td>
            </tr>
        `).join('');
    }

    // --- イベントリスナー ---
    contractPeriodSelect.addEventListener('change', (e) => {
        activeContractPeriodId = e.target.value;
        renderStudentFulfillmentReport();
    });

    studentFulfillmentTbody.addEventListener('mouseover', (e) => {
        const row = e.target.closest('tr');
        if (!row || !row.dataset.studentIndex) return;

        const studentIndex = parseInt(row.dataset.studentIndex, 10);
        const studentData = analysisData.student_fulfillment_report[activeContractPeriodId][studentIndex];
        
        if (!studentData || !studentData.subject_details) return;

        let tooltipContent = `<h5>${studentData.student_name} (${analysisData.related_contract_periods.find(p=>p.id==activeContractPeriodId).name})</h5>`;
        tooltipContent += '<table><tr><th>科目</th><th>契約</th><th>消化</th></tr>';
        studentData.subject_details.forEach(detail => {
            const rowClass = (detail.contracted > detail.fulfilled) ? ' class="unfulfilled-subject"' : '';
            tooltipContent += `<tr${rowClass}><td>${detail.subject_name}</td><td>${detail.contracted}</td><td>${detail.fulfilled}</td></tr>`;
        });
        tooltipContent += '</table>';
        
        tooltip.innerHTML = tooltipContent;
        tooltip.classList.add('show');
    });

    studentFulfillmentTbody.addEventListener('mousemove', (e) => {
        // ツールチップの水平位置は常にカーソルの右側に設定
        tooltip.style.left = `${e.pageX + 15}px`;

        const tooltipHeight = tooltip.offsetHeight; // ツールチップ自体の高さを取得
        const mouseY = e.clientY; // ウィンドウ内でのマウスのY座標
        const windowHeight = window.innerHeight; // ウィンドウの高さ

        // マウス位置より下にツールチップを出すと画面からはみ出すか判定
        if (mouseY + tooltipHeight + 15 > windowHeight) {
            // はみ出す場合：カーソルの「上」に表示
            tooltip.style.top = `${e.pageY - tooltipHeight - 15}px`;
        } else {
            // はみ出さない場合：通常通りカーソルの「下」に表示
            tooltip.style.top = `${e.pageY + 15}px`;
        }
    });

    studentFulfillmentTbody.addEventListener('mouseout', () => {
        // カーソルが外れたらツールチップを非表示に
        tooltip.classList.remove('show');
    });

    initialize();
});