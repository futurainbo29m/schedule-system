# models.py (計画期間対応版)

from extensions import db
from datetime import date

# (teacher_subjects, student_preferred_teachers 中間テーブルは変更なし)
teacher_subjects = db.Table(
    'teacher_subjects',
    db.Column('teacher_id',
              db.Integer,
              db.ForeignKey('teacher.id'),
              primary_key=True),
    db.Column('subject_id',
              db.Integer,
              db.ForeignKey('subject.id'),
              primary_key=True))

student_preferred_teachers = db.Table(
    'student_preferred_teachers',
    db.Column('student_id',
              db.Integer,
              db.ForeignKey('student.id'),
              primary_key=True),
    db.Column('teacher_id',
              db.Integer,
              db.ForeignKey('teacher.id'),
              primary_key=True))

# --- ▼▼▼ ここからが今回の変更箇所 ▼▼▼ ---


# --- 1. PlanningPeriod モデルを新設 ---
class PlanningPeriod(db.Model):
    __tablename__ = 'planning_period'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(20), default='planning',
                       nullable=False)  #例: 'planning', 'active', 'archived'

    requests = db.relationship('StudentRequest',
                               backref='planning_period',
                               lazy=True,
                               cascade="all, delete-orphan")

    def __repr__(self):
        return f'<PlanningPeriod {self.name}>'


class Teacher(db.Model):
    __tablename__ = 'teacher'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    name_kana = db.Column(db.String(100), nullable=True)
    display_name = db.Column(db.String(50), nullable=True)
    is_joker = db.Column(db.Boolean, default=False, nullable=False)
    subjects = db.relationship('Subject',
                               secondary=teacher_subjects,
                               lazy='subquery',
                               backref=db.backref('teachers', lazy=True))
    shifts = db.relationship('Shift', backref='teacher', lazy=True)
    assignments = db.relationship('Assignment',
                                  backref='teacher',
                                  lazy=True,
                                  cascade="all, delete-orphan")


class Student(db.Model):
    __tablename__ = 'student'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    name_kana = db.Column(db.String(100), nullable=True)
    display_name = db.Column(db.String(50), nullable=True)
    grade = db.Column(db.String(10), nullable=False)
    preferred_teachers = db.relationship('Teacher',
                                         secondary=student_preferred_teachers,
                                         lazy='subquery',
                                         backref=db.backref(
                                             'preferred_by_students',
                                             lazy=True))


class Subject(db.Model):
    __tablename__ = 'subject'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)
    display_name = db.Column(db.String(10), nullable=True)
    level = db.Column(db.String(20), default='中学', nullable=False)


class TimeSlot(db.Model):
    __tablename__ = 'time_slot'
    id = db.Column(db.Integer, primary_key=True)
    weekday_time = db.Column(db.String(50), nullable=False)
    weekendTime = db.Column(db.String(50), nullable=False)


class Shift(db.Model):
    __tablename__ = 'shift'
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False)
    is_available = db.Column(db.Boolean, nullable=False)
    teacher_id = db.Column(db.Integer,
                           db.ForeignKey('teacher.id'),
                           nullable=False)
    time_slot_id = db.Column(db.Integer,
                             db.ForeignKey('time_slot.id'),
                             nullable=False)


# --- 2. StudentRequest モデルを修正 ---
class StudentRequest(db.Model):
    __tablename__ = 'student_request'
    id = db.Column(db.Integer, primary_key=True)
    priority = db.Column(db.String(10), nullable=False)
    requested_lessons = db.Column(db.Integer, default=1, nullable=False)
    student_id = db.Column(db.Integer,
                           db.ForeignKey('student.id'),
                           nullable=False)
    subject_id = db.Column(db.Integer,
                           db.ForeignKey('subject.id'),
                           nullable=False)
    lessons = db.relationship('Lesson', backref='request', lazy=True)

    # この行を追加
    planning_period_id = db.Column(db.Integer,
                                   db.ForeignKey('planning_period.id'),
                                   nullable=False)


# --- 3. Assignment モデルを修正 ---
class Assignment(db.Model):
    __tablename__ = 'assignment'
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False)
    time_slot_id = db.Column(db.Integer,
                             db.ForeignKey('time_slot.id'),
                             nullable=False)
    teacher_id = db.Column(db.Integer,
                           db.ForeignKey('teacher.id'),
                           nullable=False)
    lessons = db.relationship('Lesson',
                              backref='assignment',
                              lazy=True,
                              cascade="all, delete-orphan")


class Lesson(db.Model):
    __tablename__ = 'lesson'
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer,
                           db.ForeignKey('student.id'),
                           nullable=False)
    subject_id = db.Column(db.Integer,
                           db.ForeignKey('subject.id'),
                           nullable=False)
    assignment_id = db.Column(db.Integer,
                              db.ForeignKey('assignment.id'),
                              nullable=True)
    request_id = db.Column(db.Integer,
                           db.ForeignKey('student_request.id'),
                           nullable=False)

    student = db.relationship('Student', backref='lessons', lazy=True)
    subject = db.relationship('Subject', backref='lessons', lazy=True)

    # ▼▼▼ 以下の2行を追加 ▼▼▼
    status = db.Column(db.String(20), default='auto',
                       nullable=False)  # 'auto' vs 'locked'
    memo = db.Column(db.Text, nullable=True)
