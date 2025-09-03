# seed.py (科目レベル分離・表示名対応版)

from app import create_app
from extensions import db
from models import Teacher, Student, Subject, TimeSlot, StudentRequest, Shift, Lesson, Assignment, PlanningPeriod
from datetime import date, timedelta
import random

# --- 設定項目 ---
START_DATE = date(2025, 7, 1)
END_DATE = date(2025, 8, 31)
TOTAL_REQUESTED_LESSONS = 150


# --- ここからスクリプト本体 ---
def seed_data():
    """データベースに初期データを投入する"""
    app = create_app()
    with app.app_context():
        print("データベースを初期化します...")
        db.drop_all()
        db.create_all()
        print("新しいテーブル構造でデータベースを作成しました。")

        # --- 1. 時間スロットデータの作成 (変更なし) ---
        print("時間スロットを作成します...")
        time_slots_data = [{
            'id': 1,
            'weekdayTime': '9:00-10:00',
            'weekendTime': '9:00-10:00'
        }, {
            'id': 2,
            'weekdayTime': '10:10-11:10',
            'weekendTime': '10:10-11:10'
        }, {
            'id': 3,
            'weekdayTime': '11:20-12:20',
            'weekendTime': '11:20-12:20'
        }, {
            'id': 4,
            'weekdayTime': '12:30-13:30',
            'weekendTime': '12:30-13:30'
        }, {
            'id': 5,
            'weekdayTime': '14:10-15:10',
            'weekendTime': '13:40-14:40'
        }, {
            'id': 6,
            'weekdayTime': '15:15-16:15',
            'weekendTime': '14:50-15:50'
        }, {
            'id': 7,
            'weekdayTime': '16:20-17:20',
            'weekendTime': '16:00-17:00'
        }, {
            'id': 8,
            'weekdayTime': '17:25-18:25',
            'weekendTime': '17:10-18:10'
        }, {
            'id': 9,
            'weekdayTime': '18:30-19:30',
            'weekendTime': '18:20-19:20'
        }, {
            'id': 10,
            'weekdayTime': '19:35-20:35',
            'weekendTime': '19:30-20:30'
        }, {
            'id': 11,
            'weekdayTime': '20:40-21:40',
            'weekendTime': '20:40-21:40'
        }]
        for ts_data in time_slots_data:
            ts = TimeSlot(id=ts_data['id'],
                          weekday_time=ts_data['weekdayTime'],
                          weekendTime=ts_data['weekendTime'])
            db.session.add(ts)
        db.session.commit()

        # --- 2. 科目・講師・生徒の基本データ作成 ---
        print("科目、講師、生徒の基本データを作成します...")

        # ▼▼▼ 科目データを全面的に修正 ▼▼▼
        subjects_data = [
            # 小学生
            {
                'name': '国語(小学)',
                'display_name': '国語',
                'level': '小学'
            },
            {
                'name': '算数(小学)',
                'display_name': '算数',
                'level': '小学'
            },
            {
                'name': '理科(小学)',
                'display_name': '理科',
                'level': '小学'
            },
            {
                'name': '社会(小学)',
                'display_name': '社会',
                'level': '小学'
            },
            # 中学生
            {
                'name': '国語(中学)',
                'display_name': '国語',
                'level': '中学'
            },
            {
                'name': '数学(中学)',
                'display_name': '数学',
                'level': '中学'
            },
            {
                'name': '理科(中学)',
                'display_name': '理科',
                'level': '中学'
            },
            {
                'name': '社会(中学)',
                'display_name': '社会',
                'level': '中学'
            },
            {
                'name': '英語(中学)',
                'display_name': '英語',
                'level': '中学'
            },
            # 高校生
            {
                'name': '現代文',
                'display_name': '現文',
                'level': '高校'
            },
            {
                'name': '古文',
                'display_name': '古文',
                'level': '高校'
            },
            {
                'name': '数学I/A',
                'display_name': '数IA',
                'level': '高校'
            },
            {
                'name': '数学II/B',
                'display_name': '数IIB',
                'level': '高校'
            },
            {
                'name': '数学III',
                'display_name': '数III',
                'level': '高校'
            },
            {
                'name': '英語(高校)',
                'display_name': '英語',
                'level': '高校'
            },
            {
                'name': '物理',
                'display_name': '物理',
                'level': '高校'
            },
            {
                'name': '化学',
                'display_name': '化学',
                'level': '高校'
            },
            {
                'name': '生物',
                'display_name': '生物',
                'level': '高校'
            },
        ]
        subjects = {}
        for sub_data in subjects_data:
            sub = Subject(name=sub_data['name'],
                          display_name=sub_data['display_name'],
                          level=sub_data['level'])
            db.session.add(sub)
            subjects[sub_data['name']] = sub
        db.session.commit()

        # ▼▼▼ 担当科目を新しい定義に合わせる ▼▼▼
        t1 = Teacher(name='田中先生',
                     name_kana='たなかせんせい',
                     display_name='田中',
                     is_joker=True)  #
        t2 = Teacher(name='佐藤先生',
                     name_kana='さとうせんせい',
                     display_name='佐藤',
                     is_joker=False)  #
        t2.subjects.extend(
            [subjects['英語(高校)'], subjects['現代文'], subjects['古文']])
        t3 = Teacher(name='山田先生',
                     name_kana='やまだせんせい',
                     display_name='山田',
                     is_joker=False)  #
        t3.subjects.extend([
            subjects['数学I/A'], subjects['数学II/B'], subjects['数学III'],
            subjects['物理']
        ])
        t4 = Teacher(name='鈴木先生',
                     name_kana='すずきせんせい',
                     display_name='鈴木',
                     is_joker=False)  #
        t4.subjects.extend(
            [subjects['英語(高校)'], subjects['化学'], subjects['生物']])

        # (生徒データは変更なし) -> ふりがなを追加
        s1 = Student(name='佐藤(小4)',
                     name_kana='さとう',
                     display_name='佐藤',
                     grade='小4')  #
        s2 = Student(name='鈴木(小6)',
                     name_kana='すずき',
                     display_name='鈴木',
                     grade='小6')  #
        s3 = Student(name='高橋(中1)',
                     name_kana='たかはし',
                     display_name='高橋',
                     grade='中1')  #
        s4 = Student(name='田中(中3)',
                     name_kana='たなか',
                     display_name='田中',
                     grade='中3')  #
        s5 = Student(name='伊藤(高2)',
                     name_kana='いとう',
                     display_name='伊藤',
                     grade='高2')  #
        s6 = Student(name='渡辺(高3)',
                     name_kana='わたなべ',
                     display_name='渡辺',
                     grade='高3')  #
        s7 = Student(name='山本(浪人)',
                     name_kana='やまもと',
                     display_name='山本',
                     grade='浪人')  #
        db.session.add_all([t1, t2, t3, t4, s1, s2, s3, s4, s5, s6, s7])
        db.session.commit()

        # (優先講師の関連付けは変更なし)
        print("生徒と優先講師の関連付けを作成します...")
        s5.preferred_teachers.append(t3)
        s5.preferred_teachers.append(t4)
        s6.preferred_teachers.append(t2)
        db.session.commit()

        # (以降の計画期間、授業リクエスト、シフト、テストケースの生成は変更なし)
        # --- 3. テスト用の計画期間を作成 ---
        print("テスト用の計画期間を作成します...")
        period_name = f"{START_DATE.strftime('%Y年%m月')}度 テスト期間"
        test_period = PlanningPeriod(name=period_name,
                                     start_date=START_DATE,
                                     end_date=END_DATE,
                                     status='active')
        db.session.add(test_period)
        db.session.commit()

        # --- 4. 授業リクエストのランダム生成 ---
        print(f"{TOTAL_REQUESTED_LESSONS}コマ分の授業リクエストをランダムに生成します...")
        all_students = Student.query.all()
        all_subjects = Subject.query.all()
        for _ in range(TOTAL_REQUESTED_LESSONS):
            student = random.choice(all_students)
            subject = random.choice(all_subjects)
            existing_request = StudentRequest.query.filter_by(
                student_id=student.id,
                subject_id=subject.id,
                planning_period_id=test_period.id).first()
            if existing_request:
                existing_request.requested_lessons += 1
            else:
                db.session.add(
                    StudentRequest(student_id=student.id,
                                   subject_id=subject.id,
                                   priority=random.choice(
                                       ['HIGH', 'MEDIUM', 'LOW']),
                                   requested_lessons=1,
                                   planning_period_id=test_period.id))
        db.session.commit()

        # --- 5. 講師シフトのダミーデータ生成 ---
        print("講師のダミーシフトデータを生成します...")
        all_teachers = Teacher.query.all()
        all_time_slots = TimeSlot.query.all()
        total_days = (END_DATE - START_DATE).days + 1
        date_range = [
            START_DATE + timedelta(days=i) for i in range(total_days)
        ]
        for teacher in all_teachers:
            num_shifts = random.randint(20, 50)
            for _ in range(num_shifts):
                day = random.choice(date_range)
                ts = random.choice(all_time_slots)
                existing_shift = Shift.query.filter_by(
                    teacher_id=teacher.id, date=day,
                    time_slot_id=ts.id).first()
                if not existing_shift:
                    db.session.add(
                        Shift(teacher_id=teacher.id,
                              date=day,
                              time_slot_id=ts.id,
                              is_available=True))
        db.session.commit()

        # --- 6. 特定のテストケースを追加 ---
        print("複数講師が同居する特定のテストケースを追加します...")
        test_date = date(2025, 7, 9)
        test_timeslot_id = 1
        teacher_tanaka = Teacher.query.filter_by(name='田中先生').first()
        teacher_yamada = Teacher.query.filter_by(name='山田先生').first()
        student_sato = Student.query.filter_by(name='佐藤(小4)').first()
        student_ito = Student.query.filter_by(name='伊藤(高2)').first()
        subject_sansu = subjects['算数(小学)']  # 新しい科目名に合わせる
        subject_suugaku_hs = subjects['数学III']  # 新しい科目名に合わせる
        if teacher_tanaka and student_sato and subject_sansu:
            if not Shift.query.filter_by(
                    teacher_id=teacher_tanaka.id,
                    date=test_date,
                    time_slot_id=test_timeslot_id).first():
                db.session.add(
                    Shift(teacher_id=teacher_tanaka.id,
                          date=test_date,
                          time_slot_id=test_timeslot_id,
                          is_available=True))
            assignment1 = Assignment(teacher_id=teacher_tanaka.id,
                                     date=test_date,
                                     time_slot_id=test_timeslot_id)
            lesson1 = Lesson(student_id=student_sato.id,
                             subject_id=subject_sansu.id,
                             request_id=1,
                             status='locked',
                             memo='テストデータ')
            assignment1.lessons.append(lesson1)
            db.session.add(assignment1)
        if teacher_yamada and student_ito and subject_suugaku_hs:
            if not Shift.query.filter_by(
                    teacher_id=teacher_yamada.id,
                    date=test_date,
                    time_slot_id=test_timeslot_id).first():
                db.session.add(
                    Shift(teacher_id=teacher_yamada.id,
                          date=test_date,
                          time_slot_id=test_timeslot_id,
                          is_available=True))
            assignment2 = Assignment(teacher_id=teacher_yamada.id,
                                     date=test_date,
                                     time_slot_id=test_timeslot_id)
            lesson2 = Lesson(student_id=student_ito.id,
                             subject_id=subject_suugaku_hs.id,
                             request_id=2,
                             status='locked',
                             memo='テストデータ')
            assignment2.lessons.append(lesson2)
            db.session.add(assignment2)
        db.session.commit()

        print("\n✅ データベースに初期データを投入しました。")
        print(f"作成された計画期間: {test_period.name}")
        total_requests = db.session.query(
            db.func.sum(StudentRequest.requested_lessons)).filter_by(
                planning_period_id=test_period.id).scalar()
        print(f"総リクエストコマ数: {total_requests}")


if __name__ == '__main__':
    seed_data()
