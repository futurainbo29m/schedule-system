// static/js/analysis.js (サーバー直接描画対応版)

document.addEventListener('DOMContentLoaded', () => {
    const tooltip = document.getElementById('analysis-tooltip'); 
    const studentFulfillmentTbody = document.getElementById('student-fulfillment-report-body');
    // bodyタグからJSON文字列を取得し、JavaScriptオブジェクトに変換
    const analysisDataElement = document.body;
    const analysisData = JSON.parse(analysisDataElement.dataset.analysis || '{}');

    if (Object.keys(analysisData).length === 0) {
        console.error('分析データが見つかりません。');
        document.getElementById('analysis-results').innerHTML = '<p>分析データの読み込みに失敗しました。</p>';
        return;
    }

    let assignmentChart, fulfillmentChart, timeslotChart, weekdayChart, subjectChart;

    // --- メイン処理: ページ読み込み時に分析結果を描画 ---
    function renderAnalysis() {
        renderSummary(analysisData.summary);
        renderTeacherReport(analysisData.teacher_report);
        renderUnfulfilledReport(analysisData.unfulfilled_report);
        renderStudentFulfillmentReport(analysisData.student_fulfillment_report); 
        renderDistributionCharts(analysisData);
    }

    // --- 描画関数 (renderSummary) ---
    function renderSummary(summary) {
        document.getElementById('total-shifts').textContent = summary.total_shifts;
        document.getElementById('total-requests').textContent = summary.total_requests;
        
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

        if (assignmentChart) assignmentChart.destroy();
        assignmentChart = createDoughnutChart('assignment-rate-chart', summary.shift_assignment_rate, ['#3498db', '#e9ecef']);

        if (fulfillmentChart) fulfillmentChart.destroy();
        fulfillmentChart = createDoughnutChart('fulfillment-rate-chart', summary.lesson_fulfillment_rate, ['#2ecc71', '#e9ecef']);
    }

    // --- 描画関数 (renderTeacherReport, renderUnfulfilledReport, renderDistributionCharts) ---
    // (これらの関数の内部ロジックは変更なし)
    function renderTeacherReport(report) {
        const tbody = document.getElementById('teacher-report-body');
        tbody.innerHTML = report.map(teacher => `
            <tr>
                <td>${teacher.name}</td>
                <td>${teacher.shift_count}</td>
                <td>${teacher.assignment_count}</td>
                <td>${teacher.assignment_rate}%</td>
            </tr>
        `).join('');
    }

    function renderUnfulfilledReport(report) {
        const tbody = document.getElementById('unfulfilled-report-body');
        if (report.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3">未消化のレッスンはありません。</td></tr>';
            return;
        }
        tbody.innerHTML = report.map(item => `
            <tr>
                <td>${item.student_name}</td>
                <td>${item.subject_name}</td>
                <td>${item.unfulfilled_count}</td>
            </tr>
        `).join('');
    }

    function renderDistributionCharts(data) {
        const timeSlotCtx = document.getElementById('timeslot-chart').getContext('2d');
        const timeSlotLabels = ['1限', '2限', '3限', '4限', '5限', '6限', '7限', '8限', '9限', '10限', '11限'];
        if (timeslotChart) timeslotChart.destroy();
        timeslotChart = new Chart(timeSlotCtx, {
            type: 'bar',
            data: {
                labels: timeSlotLabels,
                datasets: [{ label: '割当コマ数', data: Object.values(data.time_slot_distribution), backgroundColor: '#3498db' }]
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
                datasets: [{ label: '割当コマ数', data: Object.values(data.weekday_distribution), backgroundColor: '#2ecc71' }]
            },
            options: { 
                responsive: true, 
                plugins: { legend: { display: false } },
                scales: { y: { ticks: { precision: 0 } } }
            }
        });

        const subjectCtx = document.getElementById('subject-chart').getContext('2d');
        if (subjectChart) subjectChart.destroy();
        subjectChart = new Chart(subjectCtx, {
            type: 'bar',
            data: {
                labels: Object.keys(data.subject_fulfillment),
                datasets: [{
                    label: '充足率 (%)',
                    data: Object.values(data.subject_fulfillment),
                    backgroundColor: '#e74c3c',
                    barThickness: 6,
                }]
            },
            options: { 
                responsive: true, 
                indexAxis: 'y',
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        ticks: {
                            font: {
                                size: 8
                            }
                        }
                    }
                }
            }
        });
    }

    function renderStudentFulfillmentReport(report) {
        const tbody = studentFulfillmentTbody; 
        if (!report || report.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4">対象の生徒データはありません。</td></tr>';
            return;
        }
        // ▼▼▼ 修正: 各行に data-student-index を追加 ▼▼▼
        tbody.innerHTML = report.map((student, index) => `
            <tr data-student-index="${index}">
                <td>${student.student_name}</td>
                <td>${student.total_requested}</td>
                <td>${student.total_fulfilled}</td>
                <td>${student.fulfillment_rate}%</td>
            </tr>
        `).join('');
    }

    // --- 初期描画を実行 ---
    renderAnalysis();

    studentFulfillmentTbody.addEventListener('mouseover', (e) => {
        const row = e.target.closest('tr');
        if (!row || !row.dataset.studentIndex) return;

        const studentIndex = parseInt(row.dataset.studentIndex, 10);
        const studentData = analysisData.student_fulfillment_report[studentIndex];
        
        if (!studentData || !studentData.subject_details) return;

        // ツールチップの内容を生成
        let tooltipContent = `<h5>${studentData.student_name} の詳細</h5>`;
        tooltipContent += '<table>';
        tooltipContent += '<tr><th>科目</th><th>リクエスト</th><th>消化</th></tr>';

        studentData.subject_details.forEach(detail => {
            const rowClass = detail.is_unfulfilled ? ' class="unfulfilled-subject"' : '';
            tooltipContent += `<tr${rowClass}>
                                 <td>${detail.subject_name}</td>
                                 <td>${detail.requested}</td>
                                 <td>${detail.fulfilled}</td>
                               </tr>`;
        });

        tooltipContent += '</table>';
        
        tooltip.innerHTML = tooltipContent;
        tooltip.classList.remove('hidden');
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
});