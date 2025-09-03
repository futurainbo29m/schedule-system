# scheduler.py (レッスン単位ロック対応版)

from models import Teacher, Student, StudentRequest, Shift, Subject, TimeSlot, Assignment, Lesson, PlanningPeriod
from extensions import db
from datetime import timedelta, datetime
import random
from sqlalchemy import func, and_


class ScheduleGenerator:

    def __init__(self, period_id, options):
        self.options = options
        self.period_id = period_id

        self.period = db.session.get(PlanningPeriod, self.period_id)
        if not self.period:
            raise ValueError(
                f"PlanningPeriod with id {self.period_id} not found.")

        self.start_date = self.period.start_date
        self.end_date = self.period.end_date

        self.subject_interval_rule_active = 'subject_interval_days' in self.options
        if self.subject_interval_rule_active:
            self.subject_interval_days = self.options.get(
                'subject_interval_days', 3)
            self.interval_strength = self.options.get('interval_strength',
                                                      'normal')
            print(
                f"★ 科目間隔ルールON: {self.subject_interval_days}日以上 (強度: {self.interval_strength})"
            )
        else:
            print("★ 科目間隔ルールOFF")

        self.preferred_teacher_rule_active = 'preferred_strength' in self.options
        if self.preferred_teacher_rule_active:
            self.preferred_strength = self.options.get('preferred_strength',
                                                       'normal')
            print(f"★ 優先講師ルールON (強度: {self.preferred_strength})")
        else:
            print("★ 優先講師ルールOFF")

        print("スケジューラを初期化中...")
        self.teachers = Teacher.query.all()
        self.students = Student.query.all()
        self.time_slots = TimeSlot.query.all()

        # 自動配置中のレッスン配置日を記録するための辞書
        self.lesson_placement_dates = {}

        self.shifts_map = self._load_shifts()
        print(f"期間内のシフトを {len(self.shifts_map)} 件読み込みました。")

    def _load_shifts(self):
        shifts = Shift.query.filter(
            Shift.date.between(self.start_date, self.end_date)).all()
        shifts_map = {}
        for shift in shifts:
            key = (shift.teacher_id, shift.date, shift.time_slot_id)
            shifts_map[key] = shift
        return shifts_map

    # ▼▼▼ 修正点1: クリーンアップ処理の変更 ▼▼▼
    def _cleanup_existing_schedule(self):
        print("既存の自動生成レッスンをクリーンアップします (ロックされたレッスンは維持)...")

        # 期間内で 'auto' ステータスのレッスンIDを取得
        auto_lessons_ids = [
            id_tuple[0]
            for id_tuple in db.session.query(Lesson.id).join(Assignment).
            filter(Assignment.date.between(self.start_date, self.end_date),
                   Lesson.status == 'auto').all()
        ]

        if auto_lessons_ids:
            # 'auto' のレッスンを削除
            Lesson.query.filter(Lesson.id.in_(auto_lessons_ids)).delete(
                synchronize_session=False)

            # レッスンが空になったAssignmentを検索して削除
            empty_assignments = Assignment.query.filter(
                Assignment.date.between(
                    self.start_date,
                    self.end_date)).filter(~Assignment.lessons.any()).all()

            if empty_assignments:
                print(f"{len(empty_assignments)}個の空になったコマを削除します。")
                for assign in empty_assignments:
                    db.session.delete(assign)

            db.session.commit()

    def generate(self):
        self._cleanup_existing_schedule()

        print("生徒のリクエストから未配置のレッスンを準備します...")
        lessons_to_create = self._prepare_lessons_to_create()

        lessons_to_create.sort(key=lambda l_data: (
            l_data['request'].priority != 'HIGH', l_data['request'].priority !=
            'MEDIUM', l_data['request'].priority != 'LOW', random.random()))

        print(f"合計 {len(lessons_to_create)} 個のレッスンを割り当てます。")

        newly_created_assignments = {}

        for i, lesson_data in enumerate(lessons_to_create):
            if (i + 1) % 10 == 0:
                print(f"  ... {i + 1}/{len(lessons_to_create)} レッスン処理中")

            # Lessonインスタンスのstatusはデフォルトで 'auto' になる
            lesson = Lesson(student_id=lesson_data['student_id'],
                            subject_id=lesson_data['subject_id'],
                            request_id=lesson_data['request_id'])

            best_slot = self._find_best_slot_for_lesson(lesson)

            if best_slot:
                self._assign_lesson_to_slot(lesson, best_slot,
                                            newly_created_assignments)

        db.session.commit()

        print("\n--- 自動配置完了 ---")
        assigned_count = db.session.query(Lesson).join(Assignment).filter(
            Assignment.date.between(self.start_date, self.end_date),
            Lesson.status == 'auto').count()
        print(f"割り当て完了: {assigned_count}コマ")
        print(f"未配置: {len(lessons_to_create) - assigned_count}コマ")
        return {"status": "completed"}

    # ▼▼▼ 修正点2: 未配置レッスンの計算方法を変更 ▼▼▼
    def _prepare_lessons_to_create(self):
        # 期間内で 'locked' ステータスのレッスンを生徒・科目ごとに集計
        locked_lessons_count = db.session.query(
            Lesson.student_id, Lesson.subject_id,
            func.count(Lesson.id)).join(Assignment).filter(
                Assignment.date.between(self.start_date, self.end_date),
                Lesson.status == 'locked').group_by(Lesson.student_id,
                                                    Lesson.subject_id).all()

        locked_map = {
            (student_id, subject_id): count
            for student_id, subject_id, count in locked_lessons_count
        }

        requests = StudentRequest.query.filter_by(
            planning_period_id=self.period_id).all()

        lessons_to_create_list = []
        for req in requests:
            locked_count = locked_map.get((req.student_id, req.subject_id), 0)
            lessons_to_create_count = req.requested_lessons - locked_count

            if lessons_to_create_count > 0:
                for _ in range(lessons_to_create_count):
                    lessons_to_create_list.append({
                        'student_id': req.student_id,
                        'subject_id': req.subject_id,
                        'request_id': req.id,
                        'request': req
                    })
        return lessons_to_create_list

    def _find_best_slot_for_lesson(self, lesson):
        best_slot = None
        highest_score = -1
        possible_shifts = list(self.shifts_map.keys())
        #random.shuffle(possible_shifts)
        possible_shifts.sort(key=lambda x: (x[1], x[2]))
        for key in possible_shifts:
            teacher_id, date, time_slot_id = key
            if not self._is_slot_assignable(lesson, teacher_id, date,
                                            time_slot_id):
                continue
            score = self._calculate_slot_score(lesson, teacher_id, date)
            if score > highest_score:
                highest_score = score
                best_slot = {
                    "teacher_id": teacher_id,
                    "date": date,
                    "time_slot_id": time_slot_id
                }
        return best_slot

    def _is_slot_assignable(self, lesson, teacher_id, date, time_slot_id):
        teacher = db.session.get(Teacher, teacher_id)
        subject = db.session.get(Subject, lesson.subject_id)

        if subject.level == '高校':
            if subject not in teacher.subjects:
                return False

        student_is_busy = db.session.query(Lesson.id).join(Assignment).filter(
            Assignment.date == date, Assignment.time_slot_id == time_slot_id,
            Lesson.student_id == lesson.student_id).first()
        if student_is_busy:
            return False

        existing_assignment = Assignment.query.filter_by(
            teacher_id=teacher.id, date=date,
            time_slot_id=time_slot_id).first()
        if existing_assignment and len(existing_assignment.lessons) >= 2:
            return False

        return True

    def _calculate_slot_score(self, lesson, teacher_id, candidate_date):
        score = 100
        if self.subject_interval_rule_active:
            # 1. データベースから最後に配置された日を取得
            db_last_lesson_date = db.session.query(db.func.max(
                Assignment.date)).join(Lesson).filter(
                    Lesson.student_id == lesson.student_id,
                    Lesson.subject_id == lesson.subject_id).scalar()

            # 2. 今回の自動配置中に置かれた最後のレッスン日を取得
            student_subject_key = (lesson.student_id, lesson.subject_id)
            runtime_last_lesson_date = self.lesson_placement_dates.get(
                student_subject_key)

            # 3. DBと実行中の履歴の両方を比較して、より新しい日付を最終日とする
            last_lesson_date = None
            if db_last_lesson_date and runtime_last_lesson_date:
                last_lesson_date = max(db_last_lesson_date,
                                       runtime_last_lesson_date)
            else:
                last_lesson_date = db_last_lesson_date or runtime_last_lesson_date

            if last_lesson_date:
                interval = (candidate_date - last_lesson_date).days
                if interval >= self.subject_interval_days:
                    score += 50
                else:
                    penalty_base = 0
                    if self.interval_strength == 'weak': penalty_base = 10
                    elif self.interval_strength == 'normal': penalty_base = 60
                    elif self.interval_strength == 'strong':
                        penalty_base = 1000
                    score -= penalty_base * (self.subject_interval_days -
                                             interval)
        if self.preferred_teacher_rule_active:
            student = db.session.get(Student, lesson.student_id)
            preferred_teacher_ids = [t.id for t in student.preferred_teachers]

            if teacher_id in preferred_teacher_ids:
                bonus = 0
                if self.preferred_strength == 'weak': bonus = 20
                elif self.preferred_strength == 'normal': bonus = 100
                elif self.preferred_strength == 'strong': bonus = 1000
                score += bonus
        return score

    # ▼▼▼ 修正点3: Assignment作成時にstatusを設定しない ▼▼▼
    def _assign_lesson_to_slot(self, lesson, slot_info,
                               newly_created_assignments):
        assignment_key = (slot_info['teacher_id'], slot_info['date'],
                          slot_info['time_slot_id'])

        # 配置履歴を更新
        student_subject_key = (lesson.student_id, lesson.subject_id)
        self.lesson_placement_dates[student_subject_key] = slot_info['date']

        assignment = newly_created_assignments.get(assignment_key)

        if not assignment:
            assignment = Assignment.query.filter_by(
                teacher_id=slot_info['teacher_id'],
                date=slot_info['date'],
                time_slot_id=slot_info['time_slot_id']).first()

        if assignment:
            if len(assignment.lessons) < 2:
                assignment.lessons.append(lesson)
        else:
            # Assignment作成時にstatusは不要になった
            assignment = Assignment(teacher_id=slot_info['teacher_id'],
                                    date=slot_info['date'],
                                    time_slot_id=slot_info['time_slot_id'])
            db.session.add(assignment)
            assignment.lessons.append(lesson)
            newly_created_assignments[assignment_key] = assignment

        db.session.add(lesson)
