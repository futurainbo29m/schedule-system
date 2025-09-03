# seed.py
# データベースを一度リセットし、テストデータを再投入するためのスクリプトです。

from app import create_app
from extensions import db
from models import (Teacher, Student, Subject, TimeSlot, Shift, PlanningPeriod,
                    ContractPeriod, ContractedLesson)
from datetime import date, timedelta
import random

# --- 設定項目 ---
# テストデータを作成する計画期間の範囲
START_DATE = date(2025, 7, 1)
END_DATE = date(2025, 8, 31)


def seed_data():
    """データベースに初期データを投入するメイン関数"""
    app = create_app()
    with app.app_context():
        # --- 1. データベースの初期化 ---
        print("--- データベースの初期化を開始します ---")
        # 既存のすべてのテーブルを削除
        db.drop_all()
        print("既存のテーブルを削除しました。")
        # models.py の定義に基づいて新しいテーブルを作成
        db.create_all()
        print("新しいテーブル構造でデータベースを作成しました。")

        # --- 2. マスターデータの作成 ---
        print("\n--- マスターデータの作成を開始します ---")

        # 時間スロット
        time_slots_data = [
            {
                'id': 1,
                'weekday_time': '9:00-10:00',
                'weekendTime': '9:00-10:00'
            },
            {
                'id': 2,
                'weekday_time': '10:10-11:10',
                'weekendTime': '10:10-11:10'
            },
            {
                'id': 3,
                'weekday_time': '11:20-12:20',
                'weekendTime': '11:20-12:20'
            },
            {
                'id': 4,
                'weekday_time': '12:30-13:30',
                'weekendTime': '12:30-13:30'
            },
            {
                'id': 5,
                'weekday_time': '14:10-15:10',
                'weekendTime': '13:40-14:40'
            },
            {
                'id': 6,
                'weekday_time': '15:15-16:15',
                'weekendTime': '14:50-15:50'
            },
            {
                'id': 7,
                'weekday_time': '16:20-17:20',
                'weekendTime': '16:00-17:00'
            },
            {
                'id': 8,
                'weekday_time': '17:25-18:25',
                'weekendTime': '17:10-18:10'
            },
            {
                'id': 9,
                'weekday_time': '18:30-19:30',
                'weekendTime': '18:20-19:20'
            },
            {
                'id': 10,
                'weekday_time': '19:35-20:35',
                'weekendTime': '19:30-20:30'
            },
            {
                'id': 11,
                'weekday_time': '20:40-21:40',
                'weekendTime': '20:40-21:40'
            },
        ]
        for ts_data in time_slots_data:
            db.session.add(TimeSlot(**ts_data))
        print("時間スロットを作成しました。")

        # 科目
        subjects_data = [
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
            sub = Subject(**sub_data)
            db.session.add(sub)
            subjects[sub_data['name']] = sub
        print("科目を作成しました。")

        db.session.commit()

        # --- 3. 講師と生徒の作成 ---
        print("\n--- 講師と生徒の作成を開始します ---")
        t1 = Teacher(name='田中先生',
                     name_kana='たなかせんせい',
                     display_name='田中',
                     is_joker=True)
        t2 = Teacher(
            name='佐藤先生',
            name_kana='さとうせんせい',
            display_name='佐藤',
            subjects=[subjects['英語(高校)'], subjects['現代文'], subjects['古文']])
        t3 = Teacher(name='山田先生',
                     name_kana='やまだせんせい',
                     display_name='山田',
                     subjects=[
                         subjects['数学I/A'], subjects['数学II/B'],
                         subjects['数学III'], subjects['物理']
                     ])
        t4 = Teacher(
            name='鈴木先生',
            name_kana='すずきせんせい',
            display_name='鈴木',
            subjects=[subjects['英語(高校)'], subjects['化学'], subjects['生物']])

        s1 = Student(name='佐藤(小4)',
                     name_kana='さとう',
                     display_name='佐藤',
                     grade='小4')
        s2 = Student(name='鈴木(小6)',
                     name_kana='すずき',
                     display_name='鈴木',
                     grade='小6')
        s3 = Student(name='高橋(中1)',
                     name_kana='たかはし',
                     display_name='高橋',
                     grade='中1')
        s4 = Student(name='田中(中3)',
                     name_kana='たなか',
                     display_name='田中',
                     grade='中3')
        s5 = Student(name='伊藤(高2)',
                     name_kana='いとう',
                     display_name='伊藤',
                     grade='高2',
                     preferred_teachers=[t3])
        s6 = Student(name='渡辺(高3)',
                     name_kana='わたなべ',
                     display_name='渡辺',
                     grade='高3',
                     preferred_teachers=[t2])
        s7 = Student(name='山本(浪人)',
                     name_kana='やまもと',
                     display_name='山本',
                     grade='浪人')

        db.session.add_all([t1, t2, t3, t4, s1, s2, s3, s4, s5, s6, s7])
        print("講師と生徒を作成しました。")
        db.session.commit()

        # --- 4. 期間と契約の作成 ---
        print("\n--- 期間と契約の作成を開始します ---")
        period_name = f"{START_DATE.strftime('%Y年%m月')}度 テスト期間"
        test_period = PlanningPeriod(name=period_name,
                                     start_date=START_DATE,
                                     end_date=END_DATE,
                                     status='active')
        db.session.add(test_period)
        print("計画期間を作成しました。")

        cp1 = ContractPeriod(name="2025年7月分",
                             display_name="7月",
                             start_date=date(2025, 7, 1),
                             end_date=date(2025, 7, 31),
                             period_type="regular")
        cp2 = ContractPeriod(name="2025年8月分",
                             display_name="8月",
                             start_date=date(2025, 8, 1),
                             end_date=date(2025, 8, 31),
                             period_type="regular")
        cp3 = ContractPeriod(name="夏期集中講座",
                             display_name="夏期集中",
                             start_date=date(2025, 8, 1),
                             end_date=date(2025, 8, 10),
                             period_type="special")
        db.session.add_all([cp1, cp2, cp3])
        print("契約期間（表示名含む）を作成しました。")
        db.session.commit()

        # --- 5. テストデータの紐付け ---
        print("\n--- 契約レッスンとシフトの作成を開始します ---")
        all_students = Student.query.all()
        all_subjects = Subject.query.all()
        for student in all_students:
            # 各生徒にランダムな契約レッスンを割り当て
            for subject in random.sample(all_subjects, 2):
                db.session.add(
                    ContractedLesson(student_id=student.id,
                                     subject_id=subject.id,
                                     contract_period_id=cp1.id,
                                     contracted_count=2))
            for subject in random.sample(all_subjects, 2):
                db.session.add(
                    ContractedLesson(student_id=student.id,
                                     subject_id=subject.id,
                                     contract_period_id=cp2.id,
                                     contracted_count=3))
            if "高" in student.grade or "浪人" in student.grade:
                db.session.add(
                    ContractedLesson(student_id=student.id,
                                     subject_id=subjects['英語(高校)'].id,
                                     contract_period_id=cp3.id,
                                     contracted_count=4))
        print("契約レッスンを作成しました。")

        # 各講師にランダムなシフトを割り当て
        all_teachers = Teacher.query.all()
        all_time_slots = TimeSlot.query.all()
        total_days = (END_DATE - START_DATE).days + 1
        date_range = [
            START_DATE + timedelta(days=i) for i in range(total_days)
        ]

        for teacher in all_teachers:
            for _ in range(random.randint(30, 60)):  # 30-60個のシフトをランダムに作成
                day = random.choice(date_range)
                ts = random.choice(all_time_slots)
                # 重複を避ける
                if not Shift.query.filter_by(teacher_id=teacher.id,
                                             date=day,
                                             time_slot_id=ts.id).first():
                    db.session.add(
                        Shift(teacher_id=teacher.id,
                              date=day,
                              time_slot_id=ts.id,
                              is_available=True))
        print("シフトを作成しました。")

        db.session.commit()
        print("\n✅ データベースに初期データを投入しました。")


if __name__ == '__main__':
    seed_data()
