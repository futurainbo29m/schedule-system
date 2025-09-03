# app.py (レッスンロックAPI対応・期間指定ルーティング対応版)

from flask import Flask, render_template, jsonify, request, redirect, url_for
import os
from datetime import datetime, date, timedelta

from extensions import db


def create_app():
    basedir = os.path.abspath(os.path.dirname(__file__))
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(
        basedir, 'schedule.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    db.init_app(app)

    from models import Teacher, Shift, TimeSlot, Assignment, Subject, Student, Lesson, StudentRequest, PlanningPeriod
    from scheduler import ScheduleGenerator

    @app.route('/')
    def index():
        return redirect(url_for('dashboard'))

    @app.route('/dashboard')
    def dashboard():
        periods = PlanningPeriod.query.order_by(
            PlanningPeriod.start_date.desc()).all()
        return render_template('dashboard.html', periods=periods)

    @app.route('/period/<int:period_id>/shifts')
    def shift_input(period_id):
        period = db.session.get(PlanningPeriod, period_id)
        if not period:
            return "指定された計画期間が見つかりません。", 404
        return render_template('shift_input.html', period=period)

    @app.route('/period/<int:period_id>/schedule')
    def schedule_view(period_id):
        period = db.session.get(PlanningPeriod, period_id)
        if not period:
            return "指定された計画期間が見つかりません。", 404
        return render_template('schedule_view.html', period=period)

    @app.route('/period/<int:period_id>/analysis')
    def analysis(period_id):
        try:
            period = db.session.get(PlanningPeriod, period_id)
            if not period:
                return "指定された計画期間が見つかりません。", 404

            start_date = period.start_date
            end_date = period.end_date

            # --- ここから get_analysis_data のロジックを移動 ---
            all_shifts = Shift.query.filter(
                Shift.date.between(start_date, end_date)).all()
            all_assignments = Assignment.query.filter(
                Assignment.date.between(start_date, end_date)).all()

            # StudentRequestも期間で絞り込むように修正
            all_requests = StudentRequest.query.filter_by(
                planning_period_id=period_id).all()

            assigned_lessons = Lesson.query.join(Assignment).filter(
                Assignment.date.between(start_date, end_date)).all()

            total_shifts = len(all_shifts)
            total_requests_count = db.session.query(
                db.func.sum(StudentRequest.requested_lessons)).filter_by(
                    planning_period_id=period_id).scalar() or 0
            total_assigned_lessons = len(assigned_lessons)
            shift_assignment_rate = (len(all_assignments) / total_shifts *
                                     100) if total_shifts > 0 else 0
            lesson_fulfillment_rate = (total_assigned_lessons /
                                       total_requests_count *
                                       100) if total_requests_count > 0 else 0

            summary = {
                'total_shifts': total_shifts,
                'total_requests': total_requests_count,
                'shift_assignment_rate': round(shift_assignment_rate, 1),
                'lesson_fulfillment_rate': round(lesson_fulfillment_rate, 1)
            }

            teacher_report = []
            teachers = Teacher.query.all()
            for teacher in teachers:
                teacher_shifts = [
                    s for s in all_shifts if s.teacher_id == teacher.id
                ]
                teacher_assignments = [
                    a for a in all_assignments if a.teacher_id == teacher.id
                ]
                shift_count = len(teacher_shifts)
                assignment_count = len(teacher_assignments)
                assignment_rate = (assignment_count / shift_count *
                                   100) if shift_count > 0 else 0
                teacher_report.append({
                    'name':
                    teacher.name,
                    'shift_count':
                    shift_count,
                    'assignment_count':
                    assignment_count,
                    'assignment_rate':
                    round(assignment_rate, 1)
                })

            unfulfilled_report = []
            students = get_sorted_students()
            for student in students:
                student_requests = [
                    r for r in all_requests if r.student_id == student.id
                ]
                student_lessons = [
                    l for l in assigned_lessons if l.student_id == student.id
                ]
                for req in student_requests:
                    fulfilled_count = len([
                        l for l in student_lessons
                        if l.subject_id == req.subject_id
                    ])
                    unfulfilled_count = req.requested_lessons - fulfilled_count
                    if unfulfilled_count > 0:
                        subject = db.session.get(Subject, req.subject_id)
                        unfulfilled_report.append({
                            'student_name':
                            student.name,
                            'subject_name':
                            subject.name,
                            'unfulfilled_count':
                            unfulfilled_count
                        })

            time_slot_distribution = {ts.id: 0 for ts in TimeSlot.query.all()}
            weekday_distribution = {i: 0 for i in range(7)}
            subject_fulfillment = {}

            for assignment in all_assignments:
                time_slot_distribution[assignment.time_slot_id] += len(
                    assignment.lessons)
                weekday = assignment.date.weekday()
                weekday_distribution[weekday] += len(assignment.lessons)

            for subject in Subject.query.all():
                requested = sum(r.requested_lessons for r in all_requests
                                if r.subject_id == subject.id)
                fulfilled = len([
                    l for l in assigned_lessons if l.subject_id == subject.id
                ])
                fulfillment_rate = (fulfilled / requested *
                                    100) if requested > 0 else 100
                subject_fulfillment[subject.name] = round(fulfillment_rate, 1)

            student_fulfillment_report = []
            all_subjects = Subject.query.all()  # 科目リストを取得
            for student in students:
                # 生徒ごとの総リクエスト数を集計
                total_requested = sum(r.requested_lessons for r in all_requests
                                      if r.student_id == student.id)
                if total_requested == 0:
                    continue  # リクエストがない生徒はレポートに含めない

                # 生徒ごとの総消化数を集計
                total_fulfilled = len([
                    l for l in assigned_lessons if l.student_id == student.id
                ])

                # 消化率を計算
                fulfillment_rate = (total_fulfilled / total_requested *
                                    100) if total_requested > 0 else 0

                subject_details = []
                student_reqs_list = [
                    r for r in all_requests if r.student_id == student.id
                ]
                student_lessons_list = [
                    l for l in assigned_lessons if l.student_id == student.id
                ]

                for subject in all_subjects:
                    requested_count = sum(r.requested_lessons
                                          for r in student_reqs_list
                                          if r.subject_id == subject.id)
                    fulfilled_count = len([
                        l for l in student_lessons_list
                        if l.subject_id == subject.id
                    ])

                    # リクエストがあった科目のみ詳細に含める
                    if requested_count > 0:
                        subject_details.append({
                            'subject_name':
                            subject.name,
                            'requested':
                            requested_count,
                            'fulfilled':
                            fulfilled_count,
                            'is_unfulfilled':
                            fulfilled_count < requested_count
                        })

                student_fulfillment_report.append({
                    'student_name':
                    student.name,
                    'total_requested':
                    total_requested,
                    'total_fulfilled':
                    total_fulfilled,
                    'fulfillment_rate':
                    round(fulfillment_rate, 1),
                    'subject_details':
                    subject_details
                })

            analysis_data = {
                'summary':
                summary,
                'teacher_report':
                sorted(teacher_report,
                       key=lambda x: x['assignment_rate'],
                       reverse=True),
                'unfulfilled_report':
                sorted(unfulfilled_report, key=lambda x: x['student_name']),
                'student_fulfillment_report':
                student_fulfillment_report,
                'time_slot_distribution':
                time_slot_distribution,
                'weekday_distribution':
                weekday_distribution,
                'subject_fulfillment':
                subject_fulfillment
            }
            # --- ここまでが get_analysis_data のロジック ---

            return render_template('analysis.html',
                                   period=period,
                                   analysis_data=analysis_data)

        except Exception as e:
            app.logger.error(f"Error in analysis: {e}")
            import traceback
            traceback.print_exc()
            return "分析データの生成中にエラーが発生しました。", 500

    @app.route('/planner/<int:period_id>')
    def planner(period_id):
        period = db.session.get(PlanningPeriod, period_id)
        if not period:
            return "指定された計画期間が見つかりません。", 404
        return render_template('planner.html', period=period)

    # --- 管理機能ページ ---
    @app.route('/admin')
    def admin_dashboard():
        return render_template('admin/index.html')

    @app.route('/admin/teachers')
    def admin_teachers():
        high_school_subjects = Subject.query.filter_by(level='高校').all()
        return render_template('admin/teachers.html',
                               subjects=high_school_subjects)

    @app.route('/admin/students')
    def admin_students():
        teachers = Teacher.query.order_by(Teacher.id).all()
        return render_template('admin/students.html', teachers=teachers)

    @app.route('/admin/subjects')
    def admin_subjects():
        return render_template('admin/subjects.html')

    @app.route('/period/<int:period_id>/requests')
    def requests_input(period_id):
        period = db.session.get(PlanningPeriod, period_id)
        if not period:
            return "指定された計画期間が見つかりません。", 404
        return render_template('requests.html', period=period)

    # --- API ---

    @app.route('/api/planning-periods', methods=['GET'])
    def get_planning_periods():
        try:
            periods = PlanningPeriod.query.order_by(
                PlanningPeriod.start_date.desc()).all()
            period_list = [{
                'id': p.id,
                'name': p.name,
                'start_date': p.start_date.strftime('%Y-%m-%d'),
                'end_date': p.end_date.strftime('%Y-%m-%d'),
                'status': p.status
            } for p in periods]
            return jsonify(period_list)
        except Exception as e:
            app.logger.error(f"Error in get_planning_periods: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/planning-periods', methods=['POST'])
    def create_planning_period():
        try:
            data = request.get_json()
            if not data or not data.get('name') or not data.get(
                    'start_date') or not data.get('end_date'):
                return jsonify({'error': 'すべてのフィールドを入力してください。'}), 400

            start_date = datetime.strptime(data['start_date'],
                                           '%Y-%m-%d').date()
            end_date = datetime.strptime(data['end_date'], '%Y-%m-%d').date()

            new_period = PlanningPeriod(name=data['name'],
                                        start_date=start_date,
                                        end_date=end_date,
                                        status='planning')
            db.session.add(new_period)
            db.session.commit()
            return jsonify({
                'message': f"'{new_period.name}' を作成しました。",
                'period_id': new_period.id
            }), 201
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Error in create_planning_period: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/teachers', methods=['GET'])
    def get_teachers():
        try:
            teachers = Teacher.query.options(db.joinedload(
                Teacher.subjects)).all()
            teacher_list = []
            for t in teachers:
                teacher_list.append({
                    'id':
                    t.id,
                    'name':
                    t.name,
                    'name_kana':
                    t.name_kana,
                    'display_name':
                    t.display_name,
                    'is_joker':
                    t.is_joker,
                    'subjects': [{
                        'id': s.id,
                        'name': s.name,
                        'display_name': s.display_name
                    } for s in t.subjects]
                })
            return jsonify(teacher_list)
        except Exception as e:
            app.logger.error(f"Error in get_teachers: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/subjects', methods=['GET'])
    def get_subjects():
        """全科目リストを取得する"""
        try:
            subjects = Subject.query.order_by(Subject.id).all()
            # display_nameとlevelもレスポンスに含める
            return jsonify([{
                'id': s.id,
                'name': s.name,
                'display_name': s.display_name,
                'level': s.level
            } for s in subjects])
        except Exception as e:
            app.logger.error(f"Error in get_subjects: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/subjects', methods=['POST'])
    def add_subject():
        """新しい科目を追加する"""
        try:
            data = request.get_json()
            if not data or not data.get('name') or not data.get('level'):
                return jsonify({'error': '科目名と対象学年は必須です。'}), 400

            display_name = data.get('display_name') or data['name'][:2]

            new_subject = Subject(name=data['name'],
                                  display_name=display_name,
                                  level=data['level'])
            db.session.add(new_subject)
            db.session.commit()
            return jsonify({'message': f'科目「{new_subject.name}」を追加しました。'}), 201
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Error in add_subject: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/subjects/<int:subject_id>', methods=['PUT'])
    def update_subject(subject_id):
        """科目を更新する"""
        try:
            subject = db.session.get(Subject, subject_id)
            if not subject:
                return jsonify({'error': '指定された科目が見つかりません。'}), 404

            data = request.get_json()
            subject.name = data.get('name', subject.name)
            subject.display_name = data.get('display_name',
                                            subject.display_name)
            subject.level = data.get('level', subject.level)

            db.session.commit()
            return jsonify({'message': '科目情報を更新しました。'})
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Error in update_subject: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/subjects/<int:subject_id>', methods=['DELETE'])
    def delete_subject(subject_id):
        """科目を削除する"""
        try:
            subject = db.session.get(Subject, subject_id)
            if not subject:
                return jsonify({'error': '指定された科目が見つかりません。'}), 404

            # TODO: この科目が既に使用されている場合の削除防止ロジックを追加検討

            db.session.delete(subject)
            db.session.commit()
            return jsonify({'message': f'科目「{subject.name}」を削除しました。'})
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Error in delete_subject: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/teachers', methods=['POST'])
    def add_teacher():
        try:
            data = request.get_json()
            if not data or 'name' not in data or 'subject_ids' not in data:
                return jsonify({'error': '名前と科目は必須です。'}), 400

            teacher_name = data['name']
            name_kana = data.get('name_kana', '')
            display_name = data.get('display_name') or teacher_name[:2]

            new_teacher = Teacher(name=teacher_name,
                                  name_kana=name_kana,
                                  display_name=display_name)

            if 'subject_ids' in data and data['subject_ids']:
                subjects = Subject.query.filter(
                    Subject.id.in_(data['subject_ids'])).all()
                new_teacher.subjects.extend(subjects)
            db.session.add(new_teacher)
            db.session.commit()
            return jsonify({
                'message': f'{new_teacher.name} を追加しました。',
                'teacher_id': new_teacher.id
            }), 201
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Error in add_teacher: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/teachers/<int:teacher_id>', methods=['PUT'])
    def update_teacher(teacher_id):
        try:
            teacher = db.session.get(Teacher, teacher_id)
            if not teacher:
                return jsonify({'error': '指定された講師が見つかりません。'}), 404

            data = request.get_json()
            if 'name' in data:
                teacher.name = data['name']
            if 'name_kana' in data:
                teacher.name_kana = data['name_kana']
            if 'display_name' in data:
                teacher.display_name = data['display_name']
            if 'subject_ids' in data:
                # 一旦すべての担当科目をクリア
                teacher.subjects.clear()
                # 送られてきたIDリストをもとに新しい担当科目を設定
                subjects = Subject.query.filter(
                    Subject.id.in_(data['subject_ids'])).all()
                teacher.subjects.extend(subjects)

            db.session.commit()
            return jsonify({'message': '講師情報を更新しました。'})
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Error in update_teacher: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/teachers/<int:teacher_id>', methods=['DELETE'])
    def delete_teacher(teacher_id):
        try:
            teacher = db.session.get(Teacher, teacher_id)
            if not teacher:
                return jsonify({'error': '指定された講師が見つかりません。'}), 404
            assignments_to_delete = Assignment.query.filter_by(
                teacher_id=teacher.id).all()
            assignment_ids = [a.id for a in assignments_to_delete]
            if assignment_ids:
                Lesson.query.filter(
                    Lesson.assignment_id.in_(assignment_ids)).delete(
                        synchronize_session=False)
                Assignment.query.filter(
                    Assignment.id.in_(assignment_ids)).delete(
                        synchronize_session=False)
            Shift.query.filter_by(teacher_id=teacher.id).delete(
                synchronize_session=False)
            db.session.delete(teacher)
            db.session.commit()
            return jsonify({'message': f'{teacher.name} を削除しました。'})
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Error in delete_teacher: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500

    @app.route('/api/students', methods=['GET'])
    def get_students():
        try:
            students = get_sorted_students()
            student_list = []
            for s in students:
                student_list.append({
                    'id':
                    s.id,
                    'name':
                    s.name,
                    'name_kana':
                    s.name_kana,
                    'display_name':
                    s.display_name,
                    'grade':
                    s.grade,
                    'preferred_teachers': [{
                        'id': t.id,
                        'name': t.name,
                        'display_name': t.display_name
                    } for t in s.preferred_teachers]
                })
            return jsonify(student_list)
        except Exception as e:
            app.logger.error(f"Error in get_students: {e}")
            return jsonify({'error': str(e)}), 500

    def get_sorted_students():
        """指定された順序でソートされた生徒のリストを取得する（全角・半角対応版）"""
        # 学年の優先順位を定義（半角で定義）
        grade_order = [
            '中3', '中2', '中1', '浪人', '高3', '高2', '高1', '小6', '小5', '小4', '小3',
            '小2', '小1'
        ]

        # 全角数字を半角に変換するテーブルを作成
        zen_to_han = str.maketrans('１２３４５６７８９０', '1234567890')

        all_students = Student.query.all()

        # データベースから取得した生徒の学年表記を正規化（半角に統一）してソートキーを生成
        def get_sort_key(student):
            # 学年の数字を半角に変換
            normalized_grade = student.grade.translate(zen_to_han)

            # grade_orderリストでのインデックスを第一キー、ふりがなを第二キーとする
            try:
                grade_index = grade_order.index(normalized_grade)
            except ValueError:
                grade_index = len(grade_order)  # grade_orderにない学年は末尾に

            return (grade_index, student.name_kana or '')

        sorted_students = sorted(all_students, key=get_sort_key)
        return sorted_students

    @app.route('/api/students', methods=['POST'])
    def add_student():
        try:
            data = request.get_json()
            if not data or not data.get('name') or not data.get('grade'):
                return jsonify({'error': '名前と学年は必須です。'}), 400

            student_name = data['name']
            name_kana = data.get('name_kana', '')
            display_name = data.get('display_name') or student_name[:2]

            new_student = Student(name=student_name,
                                  name_kana=name_kana,
                                  display_name=display_name,
                                  grade=data['grade'])
            if 'preferred_teacher_ids' in data:
                teachers = Teacher.query.filter(
                    Teacher.id.in_(data['preferred_teacher_ids'])).all()
                new_student.preferred_teachers.extend(teachers)
            db.session.add(new_student)
            db.session.commit()
            return jsonify({
                'message': f'{new_student.name} を追加しました。',
                'student_id': new_student.id
            }), 201
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Error in add_student: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/students/<int:student_id>', methods=['PUT'])
    def update_student(student_id):
        try:
            student = db.session.get(Student, student_id)
            if not student:
                return jsonify({'error': '指定された生徒が見つかりません。'}), 404

            data = request.get_json()
            if 'name' in data:
                student.name = data['name']
            if 'name_kana' in data:
                student.name_kana = data['name_kana']
            if 'display_name' in data:
                student.display_name = data['display_name']
            if 'grade' in data:
                student.grade = data['grade']
            if 'preferred_teacher_ids' in data:
                student.preferred_teachers.clear()
                teachers = Teacher.query.filter(
                    Teacher.id.in_(data['preferred_teacher_ids'])).all()
                student.preferred_teachers.extend(teachers)

            db.session.commit()
            return jsonify({'message': '生徒情報を更新しました。'})
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Error in update_student: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/students/<int:student_id>', methods=['DELETE'])
    def delete_student(student_id):
        try:
            student = db.session.get(Student, student_id)
            if not student:
                return jsonify({'error': '指定された生徒が見つかりません。'}), 404
            db.session.delete(student)
            db.session.commit()
            return jsonify({'message': f'{student.name} を削除しました。'})
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Error in delete_student: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/requests', methods=['GET'])
    def get_requests():
        try:
            period_id = request.args.get('planning_period_id', type=int)
            if not period_id:
                return jsonify({'error': '計画期間IDを指定してください。'}), 400

            requests = StudentRequest.query.filter_by(
                planning_period_id=period_id).all()
            requests_map = {
                f"{req.student_id}-{req.subject_id}": req.requested_lessons
                for req in requests
            }
            return jsonify(requests_map)
        except Exception as e:
            app.logger.error(f"Error in get_all_requests: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/requests/batch_update', methods=['POST'])
    def batch_update_requests():
        try:
            data = request.get_json()
            period_id = data.get('planning_period_id')
            payload = data.get('payload', {})

            if not period_id:
                return jsonify({'error': '計画期間IDを指定してください。'}), 400

            StudentRequest.query.filter_by(
                planning_period_id=period_id).delete()

            for key, count in payload.items():
                if int(count) > 0:
                    student_id, subject_id = key.split('-')
                    new_request = StudentRequest(student_id=int(student_id),
                                                 subject_id=int(subject_id),
                                                 requested_lessons=int(count),
                                                 priority='MEDIUM',
                                                 planning_period_id=period_id)
                    db.session.add(new_request)

            db.session.commit()
            return jsonify({'message': 'レッスン数の設定を保存しました。'})
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Error in batch_update_requests: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/shifts/<int:teacher_id>', methods=['GET'])
    def get_shifts(teacher_id):
        try:
            period_id = request.args.get('period_id', type=int)
            if not period_id:
                return jsonify({'error': '計画期間IDを指定してください。'}), 400

            period = db.session.get(PlanningPeriod, period_id)
            if not period:
                return jsonify({'error': '指定された計画期間が見つかりません。'}), 404

            shifts = Shift.query.filter(
                Shift.teacher_id == teacher_id,
                Shift.date.between(period.start_date, period.end_date)).all()
            shift_map = {
                f"{s.date.strftime('%Y-%m-%d')}-{s.time_slot_id}": {
                    'is_available': s.is_available
                }
                for s in shifts
            }
            return jsonify(shift_map)
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    @app.route('/api/shifts/<int:teacher_id>', methods=['POST'])
    def save_shifts(teacher_id):
        try:
            data = request.get_json()
            period_id = data.get('period_id')
            shift_data = data.get('shift_data', {})

            if not period_id:
                return jsonify({'error': '計画期間IDを指定してください。'}), 400

            period = db.session.get(PlanningPeriod, period_id)
            if not period:
                return jsonify({'error': '指定された計画期間が見つかりません。'}), 404

            # 期間内の既存シフトを削除
            Shift.query.filter(
                Shift.teacher_id == teacher_id,
                Shift.date.between(period.start_date,
                                   period.end_date)).delete()

            # 新しいシフトを追加
            for key, value in shift_data.items():
                date_str, time_slot_id_str = key.rsplit('-', 1)
                date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
                if value.get('is_available'):
                    db.session.add(
                        Shift(teacher_id=teacher_id,
                              date=date_obj,
                              time_slot_id=int(time_slot_id_str),
                              is_available=True))
            db.session.commit()
            return jsonify({'message': 'シフトを保存しました。'})
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500

    @app.route('/api/generate-schedule', methods=['POST'])
    def generate_schedule():
        return jsonify({"error":
                        "このAPIは現在使用できません。プランナー内の自動配置機能を使用してください。"}), 501

    @app.route('/api/schedule', methods=['GET'])
    def get_schedule():
        try:
            period_id = request.args.get('period_id', type=int)
            if not period_id:
                return jsonify({'error': '計画期間IDを指定してください。'}), 400

            period = db.session.get(PlanningPeriod, period_id)
            if not period:
                return jsonify({'error': '指定された計画期間が見つかりません。'}), 404

            start_date = period.start_date
            end_date = period.end_date

            teacher_id = request.args.get('teacher_id', type=int)
            student_id = request.args.get('student_id', type=int)

            query = Assignment.query.options(
                db.joinedload(Assignment.lessons).joinedload(Lesson.student),
                db.joinedload(Assignment.lessons).joinedload(Lesson.subject),
                db.joinedload(Assignment.teacher)).filter(
                    Assignment.date.between(start_date, end_date))

            assignments = []
            empty_shifts = []

            if teacher_id:
                query = query.filter(Assignment.teacher_id == teacher_id)
                assignments = query.all()

                all_shifts = Shift.query.filter(
                    Shift.teacher_id == teacher_id,
                    Shift.date.between(start_date, end_date)).all()
                assigned_slots = {(a.date, a.time_slot_id)
                                  for a in assignments}
                for shift in all_shifts:
                    if (shift.date, shift.time_slot_id) not in assigned_slots:
                        empty_shifts.append({
                            "date":
                            shift.date.strftime('%Y-%m-%d'),
                            "time_slot_id":
                            shift.time_slot_id
                        })

            elif student_id:
                query = query.join(Lesson).filter(
                    Lesson.student_id == student_id)
                assignments = query.all()
            else:
                return jsonify({"error": "講師または生徒を指定してください。"}), 400

            result_data = []
            for assign in assignments:
                lessons_list = []
                for lesson in assign.lessons:
                    if student_id and lesson.student_id != student_id: continue
                    lessons_list.append({
                        "student_id": lesson.student.id,
                        "student_name": lesson.student.display_name,
                        "subject_name": lesson.subject.name
                    })
                if not lessons_list: continue
                result_data.append({
                    "date": assign.date.strftime('%Y-%m-%d'),
                    "time_slot_id": assign.time_slot_id,
                    "teacher_name": assign.teacher.display_name,
                    "lessons": lessons_list
                })

            return jsonify({
                "assignments": result_data,
                "empty_shifts": empty_shifts
            })

        except Exception as e:
            app.logger.error(f"Error in get_schedule: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500

    @app.route(
        '/api/period/<int:period_id>/student/<int:student_id>/request-details',
        methods=['GET'])
    def get_student_request_details(period_id, student_id):
        """指定された生徒の、学年に合った科目リストと現在の希望数を返す"""
        try:
            student = db.session.get(Student, student_id)
            if not student:
                return jsonify({'error': '生徒が見つかりません。'}), 404

            # 生徒の学年に基づいて対象となる科目のレベルを決定
            target_level = '高校'  # デフォルトは高校
            if student.grade.startswith('小'):
                target_level = '小学'
            elif student.grade.startswith('中'):
                target_level = '中学'

            # 対象レベルの全科目を取得
            subjects = Subject.query.filter_by(level=target_level).order_by(
                Subject.id).all()

            # この生徒の現在の希望数を取得
            requests = StudentRequest.query.filter_by(
                planning_period_id=period_id, student_id=student_id).all()
            requests_map = {
                req.subject_id: req.requested_lessons
                for req in requests
            }

            # フロントエンドに返すデータを整形
            subject_details = []
            for sub in subjects:
                subject_details.append({
                    'id':
                    sub.id,
                    'name':
                    sub.name,
                    'requested_lessons':
                    requests_map.get(sub.id, 0)  # 希望数がなければ0
                })

            return jsonify({
                'student_name': student.name,
                'subjects': subject_details
            })

        except Exception as e:
            app.logger.error(f"Error in get_student_request_details: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500

    # --- Planner APIs ---

    @app.route('/api/planner-data/<int:period_id>', methods=['GET'])
    def get_planner_data(period_id):
        try:
            period = db.session.get(PlanningPeriod, period_id)
            if not period:
                return jsonify({'error': '計画期間が見つかりません。'}), 404

            assignments = Assignment.query.options(
                db.joinedload(Assignment.lessons).joinedload(Lesson.student),
                db.joinedload(Assignment.lessons).joinedload(Lesson.subject),
                db.joinedload(Assignment.teacher)).filter(
                    Assignment.date.between(period.start_date,
                                            period.end_date)).all()

            assignments_data = {}
            for assign in assignments:
                key = f"{assign.date.strftime('%Y-%m-%d')}-{assign.time_slot_id}"
                if key not in assignments_data:
                    assignments_data[key] = []

                lessons_list = []
                for lesson in assign.lessons:
                    lessons_list.append({
                        "id": lesson.id,
                        "status": lesson.status,
                        "student_id": lesson.student_id,
                        "student_name": lesson.student.display_name,
                        "subject_id": lesson.subject_id,
                        "subject_name": lesson.subject.name
                    })

                assignments_data[key].append({
                    "teacher_id": assign.teacher_id,
                    "teacher_name": assign.teacher.display_name,
                    "lessons": lessons_list
                })

            shifts = Shift.query.filter(
                Shift.date.between(period.start_date, period.end_date)).all()
            shifts_map = {
                f"{s.date.strftime('%Y-%m-%d')}-{s.teacher_id}-{s.time_slot_id}":
                True
                for s in shifts
            }

            requests = StudentRequest.query.filter_by(
                planning_period_id=period_id).all()
            unassigned_map = {}
            for req in requests:
                key = f"{req.student_id}-{req.subject_id}"
                if key not in unassigned_map:
                    student = db.session.get(Student, req.student_id)
                    subject = db.session.get(Subject, req.subject_id)
                    unassigned_map[key] = {
                        "count": 0,
                        "student_id": req.student_id,
                        "subject_id": req.subject_id,
                        "student_name": student.name if student else "不明",
                        "student_grade": student.grade if student else "不明",
                        "subject_name": subject.name if subject else "不明"
                    }
                unassigned_map[key]["count"] += req.requested_lessons

            for assignments_in_slot in assignments_data.values():
                for assign in assignments_in_slot:
                    for lesson in assign['lessons']:
                        key = f"{lesson['student_id']}-{lesson['subject_id']}"
                        if key in unassigned_map:
                            unassigned_map[key]["count"] -= 1

            unassigned_lessons = [
                v for v in unassigned_map.values() if v['count'] > 0
            ]

            teachers = Teacher.query.options(db.joinedload(
                Teacher.subjects)).all()
            teachers_data = [{
                'id': t.id,
                'name': t.name,
                'display_name': t.display_name,
                'subject_ids': [s.id for s in t.subjects]
            } for t in teachers]

            return jsonify({
                'period': {
                    'id': period.id,
                    'name': period.name,
                    'start_date': period.start_date.isoformat(),
                    'end_date': period.end_date.isoformat()
                },
                'assignments': assignments_data,
                'shifts': shifts_map,
                'unassigned_lessons': unassigned_lessons,
                'teachers': teachers_data
            })

        except Exception as e:
            app.logger.error(f"Error in get_planner_data: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500

    @app.route('/api/planner/place-lesson', methods=['POST'])
    def place_lesson():
        try:
            data = request.get_json()
            required_keys = [
                'period_id', 'student_id', 'subject_id', 'teacher_id', 'date',
                'time_slot_id'
            ]
            if not all(key in data for key in required_keys):
                return jsonify({'error': 'リクエストに必要な情報が不足しています。'}), 400

            lesson_to_delete_id = data.get('lesson_to_delete_id')
            if lesson_to_delete_id:
                lesson_to_delete = db.session.get(Lesson,
                                                  int(lesson_to_delete_id))
                if lesson_to_delete:
                    # 追い出されるレッスンが所属していたコマを取得
                    original_assignment = lesson_to_delete.assignment

                    db.session.delete(lesson_to_delete)

                    # 追い出しによってコマが空になる場合は、そのコマも削除する
                    if original_assignment and not original_assignment.lessons:
                        db.session.delete(original_assignment)

            date_obj = datetime.strptime(data['date'], '%Y-%m-%d').date()
            teacher_id = int(data['teacher_id'])
            time_slot_id = int(data['time_slot_id'])

            student_request = StudentRequest.query.filter_by(
                planning_period_id=data['period_id'],
                student_id=data['student_id'],
                subject_id=data['subject_id']).first()
            if not student_request:
                return jsonify({'error': '対応する授業リクエストが見つかりません。'}), 404

            assignment = Assignment.query.filter_by(
                teacher_id=teacher_id,
                date=date_obj,
                time_slot_id=time_slot_id).first()

            if not assignment:
                assignment = Assignment(teacher_id=teacher_id,
                                        date=date_obj,
                                        time_slot_id=time_slot_id)
                db.session.add(assignment)

            new_lesson = Lesson(student_id=data['student_id'],
                                subject_id=data['subject_id'],
                                request_id=student_request.id,
                                assignment=assignment,
                                status='locked',
                                memo='手動で配置')
            db.session.add(new_lesson)
            db.session.commit()

            return jsonify({'message': 'レッスンを配置しました。'})

        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Error in place_lesson: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500

    @app.route('/api/planner/auto-assign', methods=['POST'])
    def auto_assign_lessons():
        try:
            data = request.get_json()
            period_id = data.get('period_id')
            options = data.get('options', {})  # ▼▼▼ フロントからoptionsを受け取る ▼▼▼
            if not period_id:
                return jsonify({'error': '計画期間IDが指定されていません。'}), 400

            with app.app_context():
                # ▼▼▼ 受け取ったoptionsをスケジューラに渡す ▼▼▼
                generator = ScheduleGenerator(period_id, options)
                result = generator.generate()

            return jsonify(result)

        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Error in auto_assign_lessons: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500

    @app.route('/api/planner/lessons/<int:lesson_id>', methods=['DELETE'])
    def delete_lesson(lesson_id):
        try:
            lesson = db.session.get(Lesson, lesson_id)
            if not lesson:
                return jsonify({'error': '指定されたレッスンが見つかりません。'}), 404

            assignment = lesson.assignment
            db.session.delete(lesson)

            if assignment and not assignment.lessons:
                db.session.delete(assignment)

            db.session.commit()
            return jsonify({'message': 'レッスンを削除しました。'})

        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Error in delete_lesson: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500

    @app.route('/api/planner/lessons/<int:lesson_id>', methods=['PUT'])
    def move_lesson(lesson_id):
        try:
            data = request.get_json()
            required_keys = ['date', 'time_slot_id', 'teacher_id']
            if not all(key in data for key in required_keys):
                return jsonify({'error': '移動先の情報が不足しています。'}), 400

            lesson_to_move = db.session.get(Lesson, lesson_id)
            if not lesson_to_move:
                return jsonify({'error': '指定されたレッスンが見つかりません。'}), 404

            lesson_to_delete_id = data.get('lesson_to_delete_id')
            if lesson_to_delete_id:
                lesson_to_delete = db.session.get(Lesson, lesson_to_delete_id)
                if lesson_to_delete:
                    db.session.delete(lesson_to_delete)

            destination_date = datetime.strptime(data['date'],
                                                 '%Y-%m-%d').date()
            destination_ts_id = int(data['time_slot_id'])
            destination_teacher_id = int(data['teacher_id'])

            original_assignment = lesson_to_move.assignment

            destination_assignment = Assignment.query.filter_by(
                teacher_id=destination_teacher_id,
                date=destination_date,
                time_slot_id=destination_ts_id).first()

            if not destination_assignment:
                destination_assignment = Assignment(
                    teacher_id=destination_teacher_id,
                    date=destination_date,
                    time_slot_id=destination_ts_id)
                db.session.add(destination_assignment)

            lesson_to_move.assignment = destination_assignment
            lesson_to_move.status = 'locked'

            if original_assignment and not original_assignment.lessons:
                db.session.delete(original_assignment)

            db.session.commit()
            return jsonify({'message': 'レッスンを移動しました。'})

        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Error in move_lesson: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500

    @app.route('/api/planner/lessons/<int:lesson_id>/toggle-lock',
               methods=['POST'])
    def toggle_lesson_lock(lesson_id):
        try:
            lesson = db.session.get(Lesson, lesson_id)
            if not lesson:
                return jsonify({'error': '指定されたレッスンが見つかりません。'}), 404

            if lesson.status == 'locked':
                lesson.status = 'auto'
            else:
                lesson.status = 'locked'

            db.session.commit()
            return jsonify({
                'message': f'レッスンの状態を「{lesson.status}」に変更しました。',
                'new_status': lesson.status
            })

        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Error in toggle_lesson_lock: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500

    return app


if __name__ == '__main__':
    app = create_app()
    app.run(debug=True, port=8080)
