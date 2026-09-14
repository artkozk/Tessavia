package ru.tessavie.widgets;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.job.JobScheduler;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

public final class MainActivity extends Activity {
    @Override public void onCreate(Bundle bundle) { super.onCreate(bundle); show(); }
    private void show() {
        Screen screen = new Screen(this, "Ваши блоки на экране телефона");
        screen.text("Виджет показывает прогресс выбранного блока конструктора. Полная страница, отметки и редактирование открываются в Tessavie.", 17, false);
        screen.button("Открыть Tessavie", view -> openSite());
        screen.text("1. В Tessavie откройте Настройки → Личные настройки → На телефоне. Выберите блок и получите код.\n\n2. На домашнем экране удерживайте свободное место → Виджеты → Tessavie. Перетащите виджет и вставьте код.", 16, false);
        screen.text("Для каждого виджета нужен отдельный код. Изменения появляются при обновлении; фоновые обновления зависят от Android и подключения к сети.", 14, false);
        for (int id : TessavieWidget.ids(this)) {
            PrivateStore.State state = PrivateStore.read(this, id);
            if (state == null) continue;
            String title = "Подключённый блок";
            try { title = new Snapshot(state.snapshot, state.widgetId).title; } catch (Exception ignored) { }
            screen.button("Отключить: " + title, view -> new AlertDialog.Builder(this).setTitle("Отключить этот виджет?")
                    .setMessage("Код и сохранённые данные будут удалены с телефона. Серверный доступ можно также отозвать в настройках Tessavie.")
                    .setNegativeButton("Отмена", null).setPositiveButton("Отключить", (dialog, which) -> {
                        getSystemService(JobScheduler.class).cancel(id); PrivateStore.clear(this, id); TessavieWidget.render(this, id); show();
                    }).show());
        }
        screen.text("Предварительная версия 0.1.0. Уведомления настраиваются в веб-приложении; этот помощник не регистрирует отдельную push-подписку.", 13, false);
    }
    private void openSite() { try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(WidgetContract.ORIGIN + "/"))); } catch (android.content.ActivityNotFoundException ignored) { Toast.makeText(this, "Установите браузер для открытия Tessavie", Toast.LENGTH_LONG).show(); } }
}
