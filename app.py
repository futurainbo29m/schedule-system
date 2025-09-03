# app.py (旧requests機能を完全に削除した最終版)

from flask import Flask, render_template, jsonify, request, redirect, url_for
import os
from datetime import datetime, date, timedelta
from collections import defaultdict

from extensions import db
from models import (Teacher, Shift, TimeSlot, Assignment, Subject, Student,
                    Lesson, PlanningPeriod, ContractPeriod, ContractedLesson)
from scheduler import ScheduleGenerator
from sqlalchemy import func, tuple_


def to_circled_number(n):
    """1から20までの数字を丸数字のUnicode文字に変換する"""
    if not 1 <= n <= 20:
        return f"({n})"
    return chr(0x245F + n)


def _calculate_and_apply_lesson_labels():
    """
    レッスンの消化状況を計算し、表示用ラベルと所属契約期間IDのマップを返す。
    """
    lesson_labels = {}

    # 契約済みの各レッスン権利(ContractedLesson)ごとに処理
    all_contracted_lessons = ContractedLesson.query.options(
        db.joinedload(
            ContractedLesson.fulfilled_lessons).joinedload(Lesson.assignment),
        db.joinedload(ContractedLesson.contract_period)).all()

    for cl in all_contracted_lessons:
        # この契約レッスンに紐づく、配置済みのレッスンを日付順にソート
        sorted_fulfilled = sorted(
            [l for l in cl.fulfilled_lessons if l.assignment],
            key=lambda l: (l.assignment.date, l.assignment.time_slot_id))

        # ソートされた順に番号を振る
        for i, lesson in enumerate(sorted_fulfilled):
            period = cl.contract_period
            label_period = period.display_name or period.name
            lesson_labels[
                lesson.id] = f"{label_period} {to_circled_number(i + 1)}"

    return lesson_labels


def create_app():
    basedir = os.path.abspath(os.path.dirname(__file__))
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(
        basedir, 'schedule.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    db.init_app(app)

    @app.route('/')
    def index():
        return redirect(url_for('dashboard'))

    @app.route('/dashboard')
    def dashboard():
        periods = PlanningPeriod.query.order_by(
            PlanningPeriod.start_date.desc()).all()
        return render_template('dashboard.html', periods=periods)

    @app.route('/period/<int:period_id>/contracts')
    def contracts_input(period_id):
        period = db.session.get(PlanningPeriod, period_id)
        if not period:
            return "指定された計画期間が見つかりません。", 404
        return render_template('contracts.html', period=period)

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
        period = db.session.get(PlanningPeriod, period_id)
        if not period:
            return "指定された計画期間が見つかりません。", 404
        return render_template('analysis.html', period=period)

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

    @app.route('/admin/contract-periods')
    def admin_contract_periods():
        return render_template('admin/contract_periods.html')

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

    # --- API ---

    @app.route('/api/contracted-lessons', methods=['GET'])
    def get_all_contracted_lessons():
        try:
            lessons = ContractedLesson.query.all()
            lesson_map = {
                f"{l.student_id}-{l.subject_id}-{l.contract_period_id}":
                l.contracted_count
                for l in lessons
            }
            return jsonify(lesson_map)
        except Exception as e:
            app.logger.error(f"Error getting all contracted lessons: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/contracted-lessons/batch_update', methods=['POST'])
    def batch_update_contracted_lessons():
        try:
            data = request.get_json()
            payload = data.get('payload', {})

            for key, count in payload.items():
                student_id, subject_id, contract_period_id = map(
                    int, key.split('-'))
                lesson = ContractedLesson.query.filter_by(
                    student_id=student_id,
                    subject_id=subject_id,
                    contract_period_id=contract_period_id).first()

                if count > 0:
                    if lesson:
                        lesson.contracted_count = count
                    else:
                        new_lesson = ContractedLesson(
                            student_id=student_id,
                            subject_id=subject_id,
                            contract_period_id=contract_period_id,
                            contracted_count=count)
                        db.session.add(new_lesson)
                elif lesson:
                    db.session.delete(lesson)

            db.session.commit()
            return jsonify({'message': '契約レッスン数を保存しました。'})
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Error in batch_update_contracted_lessons: {e}")
            return jsonify({'error': str(e)}), 500

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
            lesson_labels = _calculate_and_apply_lesson_labels()
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
                        "student_id":
                        lesson.student.id,
                        "student_name":
                        lesson.student.display_name,
                        "subject_name":
                        lesson.subject.name,
                        "label":
                        lesson_labels.get(lesson.id, None)
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

    # --- Planner APIs ---

    @app.route('/api/planner-data/<int:period_id>', methods=['GET'])
    def get_planner_data(period_id):
        try:
            period = db.session.get(PlanningPeriod, period_id)
            if not period:
                return jsonify({'error': '計画期間が見つかりません。'}), 404

            lesson_labels = _calculate_and_apply_lesson_labels()

            # --- 1. 配置済みレッスンの取得 (計画期間内のみ) ---
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
                        "subject_name": lesson.subject.name,
                        "label": lesson_labels.get(lesson.id)
                    })
                assignments_data[key].append({
                    "teacher_id": assign.teacher_id,
                    "teacher_name": assign.teacher.display_name,
                    "lessons": lessons_list
                })

            # --- 2. 未配置レッスンの計算 (新ロジック) ---
            unassigned_lessons = {"regular": [], "special": []}

            # 全ての契約レッスンを取得
            all_contracted = ContractedLesson.query.options(
                db.joinedload(ContractedLesson.student),
                db.joinedload(ContractedLesson.subject),
                db.joinedload(ContractedLesson.contract_period),
                db.joinedload(ContractedLesson.fulfilled_lessons)).all()

            regular_unassigned_map = defaultdict(int)

            for cl in all_contracted:
                unfulfilled_count = cl.contracted_count - len(
                    cl.fulfilled_lessons)
                if unfulfilled_count <= 0:
                    continue

                student = cl.student
                subject = cl.subject

                lesson_info_base = {
                    "student_id": student.id,
                    "subject_id": subject.id,
                    "student_name": student.name,
                    "student_grade": student.grade,
                    "subject_name": subject.name
                }

                if cl.contract_period.period_type == 'special':
                    # 特別期間の場合：未消化分を個別のレッスン権として生成
                    sp_group = next(
                        (g for g in unassigned_lessons["special"]
                         if g["period_id"] == cl.contract_period_id), None)
                    if not sp_group:
                        sp_group = {
                            "period_id":
                            cl.contract_period_id,
                            "period_name":
                            cl.contract_period.display_name
                            or cl.contract_period.name,
                            "lessons": []
                        }
                        unassigned_lessons["special"].append(sp_group)

                    for _ in range(unfulfilled_count):
                        sp_group["lessons"].append({
                            **lesson_info_base, "contracted_lesson_id":
                            cl.id
                        })
                else:  # regular
                    # 通常期間の場合：生徒と科目の組み合わせで合算
                    key = f"{student.id}-{subject.id}"
                    regular_unassigned_map[key] += unfulfilled_count

            # 合算した通常未配置レッスンを整形
            for key, count in regular_unassigned_map.items():
                student_id, subject_id = map(int, key.split('-'))
                student = db.session.get(Student, student_id)
                subject = db.session.get(Subject, subject_id)
                unassigned_lessons["regular"].append({
                    "count":
                    count,
                    "student_id":
                    student.id,
                    "subject_id":
                    subject.id,
                    "student_name":
                    student.name,
                    "student_grade":
                    student.grade,
                    "subject_name":
                    subject.name
                })

            # --- 3. シフトと講師情報の取得 (変更なし) ---
            shifts = Shift.query.filter(
                Shift.date.between(period.start_date, period.end_date)).all()
            shifts_map = {
                f"{s.date.strftime('%Y-%m-%d')}-{s.teacher_id}-{s.time_slot_id}":
                True
                for s in shifts
            }

            teachers = Teacher.query.options(db.joinedload(
                Teacher.subjects)).all()
            teachers_data = [{
                'id': t.id,
                'name': t.name,
                'display_name': t.display_name,
                'subject_ids': [s.id for s in t.subjects]
            } for t in teachers]

            sorted_students = get_sorted_students()

            return jsonify({
                'period': {
                    'id': period.id,
                    'name': period.name,
                    'start_date': period.start_date.isoformat(),
                    'end_date': period.end_date.isoformat()
                },
                'assignments':
                assignments_data,
                'shifts':
                shifts_map,
                'unassigned_lessons':
                unassigned_lessons,
                'teachers':
                teachers_data,
                'sorted_students': [{
                    'id': s.id
                } for s in sorted_students]
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
                'student_id', 'subject_id', 'teacher_id', 'date',
                'time_slot_id'
            ]
            if not all(key in data for key in required_keys):
                return jsonify({'error': 'リクエストに必要な情報が不足しています。'}), 400

            student_id = data['student_id']
            subject_id = data['subject_id']
            contracted_lesson_id = data.get('contracted_lesson_id')

            # contracted_lesson_idがフロントから送られてこない（＝通常レッスンの）場合
            if not contracted_lesson_id:
                # 消化可能な通常契約レッスンを探す
                available_regular_contract = ContractedLesson.query.join(
                    ContractPeriod).filter(
                        ContractedLesson.student_id == student_id,
                        ContractedLesson.subject_id == subject_id,
                        ContractPeriod.period_type == 'regular').all()

                target_cl = None
                for cl in available_regular_contract:
                    if cl.contracted_count > len(cl.fulfilled_lessons):
                        target_cl = cl
                        break

                if not target_cl:
                    return jsonify({'error': '配置可能な通常契約レッスンが見つかりません。'}), 400

                contracted_lesson_id = target_cl.id

            date_obj = datetime.strptime(data['date'], '%Y-%m-%d').date()
            teacher_id = int(data['teacher_id'])
            time_slot_id = int(data['time_slot_id'])

            assignment = Assignment.query.filter_by(
                teacher_id=teacher_id,
                date=date_obj,
                time_slot_id=time_slot_id).first()

            if not assignment:
                assignment = Assignment(teacher_id=teacher_id,
                                        date=date_obj,
                                        time_slot_id=time_slot_id)
                db.session.add(assignment)

            new_lesson = Lesson(student_id=student_id,
                                subject_id=subject_id,
                                assignment=assignment,
                                status='locked',
                                memo='手動で配置',
                                contracted_lesson_id=contracted_lesson_id)
            db.session.add(new_lesson)

            lesson_to_delete_id = data.get('lesson_to_delete_id')
            if lesson_to_delete_id:
                lesson_to_delete = db.session.get(Lesson,
                                                  int(lesson_to_delete_id))
                if lesson_to_delete:
                    original_assignment = lesson_to_delete.assignment
                    db.session.delete(lesson_to_delete)
                    if original_assignment and not original_assignment.lessons:
                        db.session.delete(original_assignment)

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
            options = data.get('options', {})
            if not period_id:
                return jsonify({'error': '計画期間IDが指定されていません。'}), 400

            with app.app_context():
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

    @app.route('/api/contract-periods', methods=['GET', 'POST'])
    def handle_contract_periods():
        if request.method == 'POST':
            try:
                data = request.get_json()
                if not data or not data.get('name') or not data.get(
                        'start_date') or not data.get('end_date'):
                    return jsonify({'error': 'すべてのフィールドを入力してください。'}), 400

                start_date = datetime.strptime(data['start_date'],
                                               '%Y-%m-%d').date()
                end_date = datetime.strptime(data['end_date'],
                                             '%Y-%m-%d').date()

                new_period = ContractPeriod(
                    name=data['name'],
                    display_name=data.get('display_name'),
                    start_date=start_date,
                    end_date=end_date,
                    period_type=data.get('period_type', 'regular'))
                db.session.add(new_period)
                db.session.commit()
                return jsonify({'message':
                                f"'{new_period.name}' を作成しました。"}), 201
            except Exception as e:
                db.session.rollback()
                if 'UNIQUE constraint failed' in str(e):
                    return jsonify({'error': '同じ名前の契約期間が既に存在します。'}), 409
                return jsonify({'error': str(e)}), 500

        try:
            periods = ContractPeriod.query.order_by(
                ContractPeriod.start_date.desc()).all()
            return jsonify([{
                'id': p.id,
                'name': p.name,
                'display_name': p.display_name,
                'start_date': p.start_date.isoformat(),
                'end_date': p.end_date.isoformat(),
                'period_type': p.period_type
            } for p in periods])
        except Exception as e:
            app.logger.error(f"Error getting contract periods: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/contract-periods/<int:period_id>',
               methods=['PUT', 'DELETE'])
    def handle_single_contract_period(period_id):
        period = db.session.get(ContractPeriod, period_id)
        if not period:
            return jsonify({'error': '指定された契約期間が見つかりません。'}), 404

        if request.method == 'PUT':
            try:
                data = request.get_json()
                period.name = data.get('name', period.name)
                period.display_name = data.get('display_name',
                                               period.display_name)
                if data.get('start_date'):
                    period.start_date = datetime.strptime(
                        data['start_date'], '%Y-%m-%d').date()
                if data.get('end_date'):
                    period.end_date = datetime.strptime(
                        data['end_date'], '%Y-%m-%d').date()
                if 'period_type' in data:
                    period.period_type = data['period_type']
                db.session.commit()
                return jsonify({'message': '契約期間を更新しました。'})
            except Exception as e:
                db.session.rollback()
                if 'UNIQUE constraint failed' in str(e):
                    return jsonify({'error': '同じ名前の契約期間が既に存在します。'}), 409
                return jsonify({'error': str(e)}), 500

        if request.method == 'DELETE':
            try:
                contracted_lessons = ContractedLesson.query.filter_by(
                    contract_period_id=period.id).all()
                if contracted_lessons:
                    student_subject_pairs = [(cl.student_id, cl.subject_id)
                                             for cl in contracted_lessons]

                    existing_lessons_count = db.session.query(
                        Lesson.id).join(Assignment).filter(
                            Assignment.date.between(period.start_date,
                                                    period.end_date),
                            tuple_(Lesson.student_id, Lesson.subject_id).in_(
                                student_subject_pairs)).count()

                    if existing_lessons_count > 0:
                        return jsonify({
                            'error':
                            f'この契約期間（{period.name}）には、既に{existing_lessons_count}件のレッスンが配置されているため削除できません。'
                        }), 400

                db.session.delete(period)
                db.session.commit()
                return jsonify({'message': f"'{period.name}' を削除しました。"})
            except Exception as e:
                db.session.rollback()
                return jsonify({'error': str(e)}), 500

    @app.route('/api/period/<int:planning_period_id>/contract-periods',
               methods=['GET'])
    def get_related_contract_periods(planning_period_id):
        """指定された計画期間に関連する契約期間のみを取得する"""
        try:
            planning_period = db.session.get(PlanningPeriod,
                                             planning_period_id)
            if not planning_period:
                return jsonify({'error': '計画期間が見つかりません。'}), 404

            periods = ContractPeriod.query.filter(
                ContractPeriod.start_date <= planning_period.end_date,
                ContractPeriod.end_date
                >= planning_period.start_date).order_by(
                    ContractPeriod.start_date).all()

            return jsonify([{
                'id': p.id,
                'name': p.name,
                'start_date': p.start_date.isoformat(),
                'end_date': p.end_date.isoformat()
            } for p in periods])
        except Exception as e:
            app.logger.error(f"Error getting related contract periods: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/period/<int:planning_period_id>/contracted-lessons',
               methods=['GET'])
    def get_contracted_lessons_for_period(planning_period_id):
        """指定された計画期間に関連する契約レッスン数を取得する"""
        try:
            planning_period = db.session.get(PlanningPeriod,
                                             planning_period_id)
            if not planning_period:
                return jsonify({'error': '計画期間が見つかりません。'}), 404

            contract_periods = ContractPeriod.query.filter(
                ContractPeriod.start_date <= planning_period.end_date,
                ContractPeriod.end_date >= planning_period.start_date).all()

            contract_period_ids = [p.id for p in contract_periods]
            if not contract_period_ids:
                return jsonify({})

            lessons = ContractedLesson.query.filter(
                ContractedLesson.contract_period_id.in_(
                    contract_period_ids)).all()

            lesson_map = {
                f"{l.student_id}-{l.subject_id}-{l.contract_period_id}":
                l.contracted_count
                for l in lessons
            }
            return jsonify(lesson_map)

        except Exception as e:
            app.logger.error(
                f"Error getting contracted lessons for period: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/period/<int:period_id>/analysis-data', methods=['GET'])
    def get_analysis_data(period_id):
        try:
            period = db.session.get(PlanningPeriod, period_id)
            if not period:
                return jsonify({'error': '計画期間が見つかりません。'}), 404

            start_date, end_date = period.start_date, period.end_date

            # --- 1. サマリーデータの計算 ---
            total_shifts = Shift.query.filter(
                Shift.date.between(start_date, end_date)).count()
            total_lesson_capacity = total_shifts * 2

            related_contract_periods = ContractPeriod.query.filter(
                ContractPeriod.start_date <= end_date, ContractPeriod.end_date
                >= start_date).all()
            related_contract_period_ids = [
                p.id for p in related_contract_periods
            ]

            total_contracted = db.session.query(
                func.sum(ContractedLesson.contracted_count)).filter(
                    ContractedLesson.contract_period_id.in_(
                        related_contract_period_ids)).scalar() or 0

            all_placed_lessons_in_period = Lesson.query.join(
                Assignment).filter(
                    Assignment.date.between(start_date, end_date)).all()
            total_placed_all = len(all_placed_lessons_in_period)

            lesson_labels = _calculate_and_apply_lesson_labels()

            # 配置済みレッスンのうち、関連契約期間に紐づくものだけをカウント
            total_placed_by_related_contracts = 0
            for lesson in all_placed_lessons_in_period:
                label = lesson_labels.get(lesson.id)
                if not label: continue

                # ラベルから契約期間の表示名を取得
                period_display_name_from_label = label.split(' ')[0]

                # 表示名が関連契約期間のいずれかに一致するかチェック
                is_related = any((cp.display_name or cp.name
                                  ) == period_display_name_from_label
                                 for cp in related_contract_periods)
                if is_related:
                    total_placed_by_related_contracts += 1

            lesson_fulfillment_rate = (total_placed_by_related_contracts /
                                       total_contracted *
                                       100) if total_contracted > 0 else 0
            capacity_utilization_rate = (
                total_placed_all / total_lesson_capacity *
                100) if total_lesson_capacity > 0 else 0

            summary_data = {
                "total_lesson_capacity": total_lesson_capacity,
                "total_contracted_lessons": total_contracted,
                "total_placed_lessons": total_contracted,  # ★こちらの値に修正
                "lesson_fulfillment_rate": round(lesson_fulfillment_rate, 1),
                "capacity_utilization_rate": round(capacity_utilization_rate,
                                                   1)
            }

            # --- 2. 分布データの計算 ---
            placed_lessons_for_dist = Lesson.query.join(Assignment).filter(
                Assignment.date.between(start_date, end_date)).all()
            timeslot_dist, weekday_dist = defaultdict(int), defaultdict(int)
            for lesson in placed_lessons_for_dist:
                timeslot_dist[lesson.assignment.time_slot_id] += 1
                weekday_dist[lesson.assignment.date.weekday()] += 1
            distribution_data = {
                "timeslot": [timeslot_dist[i] for i in range(1, 12)],
                "weekday": [weekday_dist[i] for i in range(7)]
            }

            # --- 3. 講師別レポート ---
            teacher_report = []
            for teacher in Teacher.query.all():
                shift_count = Shift.query.filter(
                    Shift.teacher_id == teacher.id,
                    Shift.date.between(start_date, end_date)).count()
                lesson_count = Lesson.query.join(Assignment).filter(
                    Assignment.teacher_id == teacher.id,
                    Assignment.date.between(start_date, end_date)).count()
                teacher_capacity = shift_count * 2
                utilization_rate = (lesson_count / teacher_capacity *
                                    100) if teacher_capacity > 0 else 0
                teacher_report.append({
                    "name":
                    teacher.name,
                    "shift_count":
                    shift_count,
                    "lesson_count":
                    lesson_count,
                    "utilization_rate":
                    round(utilization_rate, 1)
                })

            # --- 4. 生徒別消化レポート ---
            all_students = get_sorted_students()
            subject_map = {s.id: s.name for s in Subject.query.all()}

            # 配置済みレッスンの消化状況を契約期間IDごとに集計
            fulfilled_map_by_period = defaultdict(lambda: defaultdict(int))
            for lesson in all_placed_lessons_in_period:
                label = lesson_labels.get(lesson.id)
                if not label: continue

                period_display_name_from_label = label.split(' ')[0]
                matched_period = next(
                    (cp for cp in related_contract_periods
                     if (cp.display_name or cp.name
                         ) == period_display_name_from_label), None)

                if matched_period:
                    key = (lesson.student_id, lesson.subject_id)
                    fulfilled_map_by_period[matched_period.id][key] += 1

            student_fulfillment_report = {}
            for cp in related_contract_periods:
                period_report = []
                contracts_in_period = ContractedLesson.query.filter_by(
                    contract_period_id=cp.id).all()

                for student in all_students:
                    student_contracts = [
                        c for c in contracts_in_period
                        if c.student_id == student.id
                    ]
                    if not student_contracts: continue

                    total_contracted_student = sum(c.contracted_count
                                                   for c in student_contracts)

                    total_fulfilled_student = sum(
                        count
                        for (s_id, _), count in fulfilled_map_by_period.get(
                            cp.id, {}).items() if s_id == student.id)

                    rate = (total_fulfilled_student /
                            total_contracted_student *
                            100) if total_contracted_student > 0 else 0

                    subject_details = []
                    for contract in student_contracts:
                        fulfilled_count = fulfilled_map_by_period.get(
                            cp.id, {}).get((student.id, contract.subject_id),
                                           0)
                        subject_details.append({
                            "subject_name":
                            subject_map.get(contract.subject_id, "不明"),
                            "contracted":
                            contract.contracted_count,
                            "fulfilled":
                            fulfilled_count
                        })

                    period_report.append({
                        "student_id": student.id,
                        "student_name": student.name,
                        "total_contracted": total_contracted_student,
                        "total_fulfilled": total_fulfilled_student,
                        "fulfillment_rate": round(rate, 1),
                        "subject_details": subject_details
                    })
                student_fulfillment_report[cp.id] = period_report

            return jsonify({
                "summary":
                summary_data,
                "distribution":
                distribution_data,
                "teacher_report":
                teacher_report,
                "student_fulfillment_report":
                student_fulfillment_report,
                "related_contract_periods": [{
                    'id': p.id,
                    'name': p.name
                } for p in related_contract_periods]
            })
        except Exception as e:
            app.logger.error(f"Error in get_analysis_data: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500

    return app


if __name__ == '__main__':
    app = create_app()
    app.run(debug=True, port=8080)
