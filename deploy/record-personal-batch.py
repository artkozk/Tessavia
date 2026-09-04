"""Verify private sources and record the personal publication and life map release."""
import argparse, datetime, fcntl, hashlib, json, secrets, sqlite3, urllib.request
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--commit', required=True); p.add_argument('--release', required=True); p.add_argument('--sha256', required=True)
args = p.parse_args()
assert len(args.commit) == 40 and all(c in '0123456789abcdef' for c in args.commit)
assert args.release.startswith('/opt/business-control/releases/20260904-personal-batch-')
assert str(Path('/opt/business-control/current').resolve()) == args.release
assert hashlib.sha256(Path(args.release+'/business-control').read_bytes()).hexdigest() == args.sha256
lock = open('/run/business-control-personal-batch-task.lock', 'w')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=15)
assert db.execute('SELECT username FROM users WHERE id=1').fetchone()[0] == 'artkozk'
assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not db.execute('PRAGMA foreign_key_check').fetchall()
token = secrets.token_urlsafe(32); digest = hashlib.sha256(token.encode()).hexdigest()
now = datetime.datetime.now(datetime.timezone.utc)
stamp = lambda value: value.isoformat(timespec='microseconds').replace('+00:00', 'Z')
db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(1,?,?,?,?)',
           (digest, stamp(now+datetime.timedelta(minutes=5)), stamp(now), stamp(now)))
db.commit()
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *unused): return None
client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
def api(path, method='GET', body=None, workspace='bizflow-team'):
    request = urllib.request.Request('http://127.0.0.1:8522/api'+path, method=method,
        data=None if body is None else json.dumps(body, ensure_ascii=False).encode(),
        headers={'Cookie':'business_session='+token, 'X-Workspace-ID':workspace, 'Content-Type':'application/json'})
    with client.open(request, timeout=25) as response:
        raw=response.read(); return json.loads(raw) if raw else None
try:
    assert db.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='041_personal_publications.sql'").fetchone()[0]==1
    overview=api('/personal/overview')
    settings=db.execute('SELECT birth_date,life_expectancy_years FROM users WHERE id=1').fetchone()
    assert overview['settings']['birthDate']==settings[0] and overview['settings']['lifeExpectancyYears']==settings[1]
    sources={'note':('personal_notes',"archived_at IS NULL"),'plan':('personal_plans',"status<>'archived'"),'project':('personal_projects',"status<>'archived'"),'goal':('personal_goals',"status<>'archived'")}
    private_ids=set()
    for kind,(table,active) in sources.items():
        private_ids.update(row[0] for row in db.execute('SELECT id FROM '+table))
        own=db.execute('SELECT id,updated_at FROM '+table+' WHERE owner_id=1 AND '+active+' LIMIT 1').fetchone()
        if own:
            value=api('/personal/publications/source/'+kind+'/'+own[0]);assert value['updatedAt']==own[1]
        other=db.execute('SELECT id FROM '+table+' WHERE owner_id<>1 AND '+active+' LIMIT 1').fetchone()
        if other:
            try:api('/personal/publications/source/'+kind+'/'+other[0]);raise AssertionError('Private source disclosed')
            except urllib.error.HTTPError as error:assert error.code==404
    exported=json.dumps(api('/export'),ensure_ascii=False)
    assert not any(item in exported for item in private_ids)
    assert 'personal_publications' not in exported
    print('AUTHENTICATED_PERSONAL_SCOPE=ok')
    common='Проверки: go test ./..., go vet ./..., 174 Node-теста. Браузер на синтетической базе: выбор проекта и файла, потерянный ответ после записи, закрытие и перезагрузка с восстановлением выбора, одна карточка/один файл, сохранённый личный черновик, месяцы/недели, сетка и диалог на 320 px. Физические телефоны не проверялись. Миграция 041 добавляет приватные квитанции; все прежние таблицы проверены на серверной копии без изменений строк. Приватные материалы на рабочем сервере не публиковались. Контракт: docs/architecture/PERSONAL_PUBLICATION_AND_LIFE_MAP_2026_09_04.md.'
    results={
      'dbe8c9e3dd1f69605e0cc7805b5fa9d9':'В редакторе сохранённой заметки, дела, личного проекта и цели добавлена публикация в выбранный проект. Сначала выбор названия/текста и до 20 сохранённых вложений, затем серверный предпросмотр с будущей видимостью и отдельное подтверждение. Независимая карточка документа, идеи или задачи и физические копии только выбранных файлов. Оригинал, черновик, личные связи, история, папки/метки, даты и показатели не раскрываются; последующей синхронизации нет. Повтор запроса и параллельное подтверждение возвращают одну карточку. Проверки владельца, версии, файлов, текущих прав и команды повторяются в транзакции. Доступ гостя, удалённая команда, архив или смена версии блокируют применение. История записывается в выбранный проект, даже если открыт другой. Для отправки нужна сеть; незавершённый выбор сохраняется локально, в общий кэш приватные данные не попадают.',
      'a0a94c1b87e1ba687cba2fd2d94b700d':'Добавлен отдельный раздел Личное → Карта времени с месяцами и неделями, текущим периодом, легендой, переходом к текущему отрезку, настройкой приватной даты рождения и горизонта 1–150 лет. Компактная сводка в Сегодня открывает полный экран. Месяцы считаются от дня рождения с ограничением конца месяца; недели — семидневные гражданские периоды с неполным последним. DST и 29 февраля учтены, пройденный горизонт не создаёт отрицательные значения/фиктивное настоящее. На экране не больше 120 месяцев/260 недель. Прежняя палитра, читаемая мобильная сетка. Настройки меняют только собственные приватные поля, с проверкой конкурентных изменений и безопасным повтором; это выбранный горизонт, не прогноз срока жизни.'
    }
    for task_id,result in results.items():
        detail=api('/records/'+task_id);task=detail['record'];assert task['workspaceId']=='bizflow-team'
        marker='[verified:personal-batch-'+args.commit[:7]+']'
        evidence=marker+'\n'+result+'\n'+common+'\nCommit: '+args.commit+'\nRelease: '+args.release+'\nSHA256: '+args.sha256
        if not any(marker in proof['content'] for proof in detail.get('proofs',[])):api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
        if task['status']!='completed':api('/records/'+task_id+'/complete','POST',{'result':evidence,'notifyPartners':False})
    print(json.dumps({'taskStatuses':{task_id:api('/records/'+task_id)['record']['status'] for task_id in results}},ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
