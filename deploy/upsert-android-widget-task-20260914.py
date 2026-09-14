"""Register the bounded Android widget stage through the existing audited API runner.

No production content is modified without --apply. Parent history is appended;
the broader iOS/Android direction is not marked complete by this child stage.
"""
import importlib.util
from pathlib import Path


def main():
    path = Path(__file__).with_name('upsert-mobile-access-tasks-20260914.py')
    spec = importlib.util.spec_from_file_location('mobile_task_runner', path)
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)
    parent = '07f69bdb1c480b6e33ffd94d2fe10a02'
    runner.SPECS = [{
        'key': 'android-builder-widget',
        'marker': '[request:android-builder-widget-20260914]',
        'parent': parent,
        'title': 'P1 · Android: живой виджет выбранного блока конструктора',
        'status': 'in_progress', 'priority': 'high',
        'criteria': 'Единственное подключение из Настройки → Личные настройки → На телефоне. '
        'Пользователь выбирает свой блок tracker/progress и получает одноразовый код на 5 минут. '
        'Android APK устанавливается как отдельное приложение-компаньон, стандартный системный '
        'виджет показывает личные отметки и прогресс выбранного блока, время обновления, '
        'ручное обновление и открытие Tessavie. Не создавать готовый личный набор. '
        'Минимальный отзывной доступ: отдельный токен только для выбранного блока, хеши на сервере, '
        'шифрование токена и снимка на телефоне, повторная проверка доступа/архива/видимости '
        'при каждом чтении. Отзыв и смена пароля прекращают доступ; 401/403 очищает снимок. '
        'При недоступной сети явно показывать сохранённый снимок и его время. '
        'Собрать APK, проверить серверную изоляцию, повторное применение кода, интерфейс '
        '320/1280 px и фоновое обновление в доступном окружении. Отдельно фиксировать '
        'отсутствующую приёмку на физическом устройстве. Этот этап не включает запись '
        'отметок с виджета, все типы блоков, iOS WidgetKit, FCM/APNs или публикацию в магазинах.',
    }]
    runner.PARENT_ADDITIONS = {
        parent: ('[scope:android-widget-started-20260914]',
                 'По повторному запросу пользователя начата реальная Android-реализация: '
                 'снимок выбранного блока tracker/progress, одноразовое подключение и APK '
                 'с системным виджетом. PWA-ярлык не считается виджетом. Настройки остаются '
                 'в едином центре; дублирующий пункт «Добавить в меню» убирается. '
                 'WidgetKit, интерактивные действия и дополнительные типы блоков остаются '
                 'в этом направлении. Наличие тестового APK не закрывает физическую приёмку.'),
    }
    runner.PARENT_TYPES = {parent: 'task'}
    runner.RECEIPT = Path('/tmp/tessavie-android-widget-task-receipt.json')
    runner.SOURCE = ('Основание: повторный запрос пользователя 14.09.2026 о приложении, '
                     'живых виджетах и едином центре настроек. Сроки и трудозатраты не заданы. '
                     'Результат будет записан после сборки, проверок и публикации.')
    runner.main()


if __name__ == '__main__':
    main()
