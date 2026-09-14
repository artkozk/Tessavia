package ru.tessavie.widgets;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;
import android.text.InputType;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class ConfigureActivity extends Activity {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private int widgetId;
    private EditText code;
    private TextView status;
    private Button connect;
    private volatile boolean cancelled;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state); setResult(RESULT_CANCELED);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        widgetId = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (!TessavieWidget.exists(this, widgetId)) { finish(); return; }
        Screen screen = new Screen(this, "Подключить блок");
        screen.text("В Tessavie: Настройки → Личные настройки → На телефоне. Выберите свой блок и скопируйте одноразовый код. Пароль от сайта здесь не нужен.", 16, false);
        code = new EditText(this); code.setHint("Код подключения"); code.setSingleLine(true);
        code.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        code.setImportantForAutofill(android.view.View.IMPORTANT_FOR_AUTOFILL_NO); code.setSaveEnabled(false);
        code.setContentDescription("Одноразовый код подключения блока"); screen.column.addView(code);
        status = screen.text("", 14, false);
        connect = screen.button("Подключить", view -> connect());
        screen.button("Отмена", view -> finish());
        screen.text("На домашнем экране будут видны название, прогресс и несколько пунктов этого блока. Выбирайте данные, которые готовы показывать рядом с иконками приложений.", 14, false);
    }
    private void connect() {
        final String pairingCode;
        try { pairingCode = WidgetContract.pairingCode(code.getText().toString()); }
        catch (IllegalArgumentException invalid) { status.setText(invalid.getMessage()); return; }
        connect.setEnabled(false); code.setEnabled(false); status.setText("Подключаем блок…");
        worker.execute(() -> {
            try {
                WidgetApi.Pairing pairing = WidgetApi.redeem(pairingCode);
                Snapshot snapshot = WidgetApi.fetch(pairing.token, pairing.widgetId);
                PrivateStore.State paired = new PrivateStore.State(pairing); paired.snapshot = snapshot.raw; paired.fetchedAt = java.time.Instant.now().toString();
                runOnUiThread(() -> {
                    if (cancelled || isFinishing() || !TessavieWidget.exists(this, widgetId)) return;
                    try {
                        PrivateStore.save(this, widgetId, paired); code.setText(""); TessavieWidget.render(this, widgetId);
                        setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)); finish();
                    } catch (Exception ignored) { status.setText("Не удалось безопасно сохранить доступ. Получите новый код и повторите."); connect.setEnabled(true); code.setEnabled(true); }
                });
            } catch (Exception error) {
                String message = "Нет подключения. Если код уже был принят, получите новый в настройках и повторите.";
                if (error instanceof WidgetApi.Rejected rejected) {
                    if (rejected.status == 400) message = "Код истёк или уже использован. Получите новый в настройках Tessavie.";
                    else if (rejected.status == 401 || rejected.status == 403) message = "Доступ к блоку изменился. Проверьте его в Tessavie и получите новый код.";
                    else if (rejected.status == 429) message = "Слишком много попыток. Подождите минуту и повторите.";
                    else message = "Сервер пока не отвечает. Повторите позже.";
                }
                String feedback = message; runOnUiThread(() -> { if (!cancelled && !isFinishing()) { status.setText(feedback); connect.setEnabled(true); code.setEnabled(true); } });
            }
        });
    }
    @Override protected void onDestroy() { cancelled = true; worker.shutdownNow(); super.onDestroy(); }
}
