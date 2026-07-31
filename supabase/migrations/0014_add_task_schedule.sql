-- タスクの作業予定（scheduled）。締切 due_date とは独立した「いつやるか」を表す。
--
-- 表現:
--   未スケジュール : scheduled_date = NULL
--   終日予定       : scheduled_date のみ（時刻2列は NULL）
--   時間ブロック   : 3列すべて
--
-- TIMESTAMPTZ ではなく DATE + TIME に分けているのは、終日予定を「その日の00:00」として
-- 保存するとタイムゾーン次第で日付がずれるため。分けておけば変換が発生しない。

ALTER TABLE tasks
  ADD COLUMN scheduled_date       DATE,
  ADD COLUMN scheduled_start_time TIME,
  ADD COLUMN scheduled_end_time   TIME;

ALTER TABLE tasks ADD CONSTRAINT task_schedule_valid CHECK (
  -- 時刻は必ずセットで持つ
  (scheduled_start_time IS NULL) = (scheduled_end_time IS NULL)
  -- 日付なしに時刻だけは持てない
  AND (scheduled_start_time IS NULL OR scheduled_date IS NOT NULL)
  -- 終了は開始より後（日をまたぐブロックは作らない）
  AND (scheduled_end_time IS NULL OR scheduled_end_time > scheduled_start_time)
);

CREATE INDEX idx_tasks_scheduled_date
  ON tasks(scheduled_date)
  WHERE scheduled_date IS NOT NULL;
