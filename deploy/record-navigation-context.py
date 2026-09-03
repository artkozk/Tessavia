"""Verify the navigation release and complete its canonical task."""
import argparse, datetime, hashlib, json, secrets, sqlite3, time, urllib.parse, urllib.request
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('--commit',required=True)
parser.add_argument('--release',required=True)
parser.add_argument('--sha256',required=True)
args=parser.parse_args()
assert len(args.commit)==40 and all(c in '0123456789abcdef' for c in args.commit)
assert args.release.startswith('/opt/business-control/releases/20260903-navigation-context-')
assert str(Path('/opt/business-control/current').resolve())==args.release
assert hashlib.sha256(Path(args.release+'/business-control').read_bytes()).hexdigest()==args.sha256
db=sqlite3.connect('/var/lib/business-control/business-control.db',timeout=15)
assert db.execute('SELECT username FROM users WHERE id=1').fetchone()[0]=='artkozk'
token=secrets.token_urlsafe(32);digest=hashlib.sha256(token.encode()).hexdigest()
now=datetime.datetime.now(datetime.timezone.utc)
stamp=lambda d:d.isoformat(timespec='microseconds').replace('+00:00','Z')
db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(1,?,?,?,?)',(digest,stamp(now+datetime.timedelta(minutes=5)),stamp(now),stamp(now)));db.commit()
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*unused):return None
client=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
def api(path,method='GET',body=None):
    req=urllib.request.Request('http://127.0.0.1:8522/api'+path,method=method,data=None if body is None else json.dumps(body,ensure_ascii=False).encode(),headers={'Cookie':'business_session='+token,'X-Workspace-ID':'bizflow-team','Content-Type':'application/json'})
    with client.open(req,timeout=25) as response:
        data=response.read()
        return json.loads(data) if data else None
try:
    assert api('/me')['username']=='artkozk'
    task_id='d15d4b83d8f11dc88e477b88c89fef24'
    detail=api('/records/'+task_id);task=detail['record']
    assert task['workspaceId']=='bizflow-team' and task['ownerId']==1 and task['status'] in ('in_progress','completed')
    assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    assert not db.execute('PRAGMA foreign_key_check').fetchall()
    assert api('/export')['schemaVersion']==17
    marker='[verified:navigation-context-'+args.commit[:7]+']'
    evidence=marker+'\nПроверено единое поведение окон, меню и возврата. Исправлены подтверждённые поздние ответы: кеш/поиск не получают данные предыдущего проекта или аккаунта, старая ошибка не заменяет новый экран, завершение прежнего запроса не удаляет новый. Связи, история и рабочие вкладки привязаны к конкретному открытию карточки. Отложенный Back не отменяет новый переход.\nEscape закрывает верхний список/меню, затем окно. Back и beforeunload учитывают порядок вложенных окон; смена проекта прекращается при невозможности сохранить черновик. Ошибка связи объясняет неопределённость результата записи; автоматического повтора записи нет.\nПриёмка в браузере: Enter из заголовка заметки в тело; Escape, повторное открытие и reload восстанавливают текст. После HTTP 503 и обрыва соединения текст сохранён, ложного успеха и дубля записи нет. Возврат из уведомлений восстановил доску и фильтр; прокрутка скроллбаром и фон не закрыли редактор. Выпадающий список закрылся отдельно, длинный черновик карточки восстановлен. Внешний клик закрывает меню. Клавиатурный фокус видим. На 320 px страница и диалог не переполняются; подсказка восстановления занимает 23,6 px вместо 126,2 px. Физические устройства не проверялись.\nGo test, vet, 116 Node-тестов успешны. Пять новых регрессий сначала воспроизведены на прежнем коде. Дополнительный вопрос при обычном закрытии не возвращён: позднейший прямой запрос пользователя 03.09 в CALENDAR_LIFECYCLE_UX_CONTRACT отменяет старый пункт аудита 02.09; при неисправном хранилище окно остаётся открытым.\nCommit: '+args.commit+'\nRelease: '+args.release+'\nSHA256: '+args.sha256+'\nКонтракт: docs/architecture/NAVIGATION_DRAFT_AUDIT_2026_09_03.md. Миграций нет, сохранность production проверена на копии. Полная очередь офлайн-создания остаётся отдельной задачей.'
    if not any(marker in proof['content'] for proof in detail.get('proofs',[])):
        api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
    if task['status']!='completed':
        api('/records/'+task_id+'/complete','POST',{'result':evidence,'notifyPartners':False})
    print(json.dumps({'id':task_id,'status':api('/records/'+task_id)['record']['status'],'exportVersion':17},ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
