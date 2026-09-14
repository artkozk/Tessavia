package ru.tessavie.widgets;

import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.PersistableBundle;
import android.view.View;
import android.widget.RemoteViews;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

public final class TessavieWidget extends AppWidgetProvider {
    private static final String REFRESH = "ru.tessavie.widgets.REFRESH";
    private static int jobId(int id) { return id; }
    static int[] ids(Context context) { return AppWidgetManager.getInstance(context).getAppWidgetIds(new ComponentName(context, TessavieWidget.class)); }
    static boolean exists(Context context, int id) {
        android.appwidget.AppWidgetProviderInfo info = AppWidgetManager.getInstance(context).getAppWidgetInfo(id);
        return info != null && info.provider.equals(new ComponentName(context, TessavieWidget.class));
    }
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) { render(context, id); schedule(context, id); }
    }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) { render(context, id); }
    @Override public void onDeleted(Context context, int[] ids) {
        for (int id : ids) { context.getSystemService(JobScheduler.class).cancel(jobId(id)); PrivateStore.clear(context, id); }
    }
    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (REFRESH.equals(intent.getAction())) {
            int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
            if (exists(context, id)) schedule(context, id);
        }
    }
    static void schedule(Context context, int id) {
        if (!exists(context, id) || PrivateStore.read(context, id) == null) return;
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler.getPendingJob(jobId(id)) != null) return;
        PersistableBundle extras = new PersistableBundle(); extras.putInt("widget", id);
        JobInfo job = new JobInfo.Builder(jobId(id), new ComponentName(context, RefreshJob.class)).setExtras(extras)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setMinimumLatency(0).build();
        render(context, id, "Обновится при подключении к сети");
        scheduler.schedule(job);
    }
    static void render(Context context, int id) { render(context, id, null); }
    static void render(Context context, int id, String pendingStatus) {
        if (!exists(context, id)) return;
        RemoteViews view = new RemoteViews(context.getPackageName(), R.layout.widget);
        Bundle options = AppWidgetManager.getInstance(context).getAppWidgetOptions(id);
        int height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 220);
        int width = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 220);
        if (height < 220) {
            view.setInt(R.id.title, "setMaxLines", 1);
            view.setViewVisibility(R.id.items, View.GONE);
            view.setViewVisibility(R.id.brand, View.GONE);
        }
        PrivateStore.State state = PrivateStore.read(context, id);
        Snapshot snapshot = null;
        if (state != null && !WidgetContract.timestamp(state.expiresAt).isAfter(Instant.now())) { PrivateStore.clearIfCurrent(context, id, state); state = null; }
        if (state != null && !state.snapshot.isEmpty()) {
            try { snapshot = new Snapshot(state.snapshot, state.widgetId); } catch (Exception ignored) { }
        }
        Intent open;
        if (state == null) {
            view.setTextViewText(R.id.title, "Подключите свой блок");
            view.setTextViewText(R.id.progress_label, "Нужен новый код");
            view.setTextViewText(R.id.status, "Настройки Tessavie → На телефоне");
            view.setTextViewText(R.id.open, "Подключить");
            view.setViewVisibility(R.id.progress, View.GONE); view.setViewVisibility(R.id.refresh, View.GONE);
            open = new Intent(context, ConfigureActivity.class).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        } else {
            open = new Intent(Intent.ACTION_VIEW, Uri.parse(snapshot == null ? WidgetContract.ORIGIN + "/" : snapshot.openUrl));
            view.setTextViewText(R.id.open, width < 240 ? "Открыть" : "Открыть Tessavie");
            view.setContentDescription(R.id.open, "Открыть Tessavie");
            if (snapshot == null) {
                view.setTextViewText(R.id.title, "Мой блок"); view.setTextViewText(R.id.progress_label, "Ожидаем данные");
                view.setTextViewText(R.id.status, pendingStatus == null ? "Нажмите «Обновить»" : pendingStatus);
            } else {
                view.setTextViewText(R.id.title, snapshot.title);
                view.setTextViewText(R.id.progress_label, snapshot.completed + " из " + snapshot.total);
                view.setProgressBar(R.id.progress, 100, WidgetContract.progress(snapshot.completed, snapshot.total), false);
                int maxItems = height < 260 ? 2 : 4;
                StringBuilder items = new StringBuilder();
                for (int i = 0; i < Math.min(maxItems, snapshot.labels.length); i++) {
                    if (i > 0) items.append('\n'); items.append(snapshot.checked[i] ? "✓  " : "○  ").append(snapshot.labels[i].replace('\n', ' '));
                }
                view.setTextViewText(R.id.items, items.toString());
                String fetchedAt = state.fetchedAt.isEmpty() ? snapshot.updatedAt : state.fetchedAt;
                String time = DateTimeFormatter.ofPattern("d MMM, HH:mm", java.util.Locale.forLanguageTag("ru"))
                        .withZone(ZoneId.systemDefault()).format(WidgetContract.timestamp(fetchedAt));
                String status = pendingStatus != null ? pendingStatus : state.status;
                if (status.isEmpty() && WidgetContract.timestamp(fetchedAt).isBefore(Instant.now().minusSeconds(3600))) status = "Данные могут устареть";
                view.setTextViewText(R.id.status, (status.isEmpty() ? "" : status + " · ") + "Обновлено: " + time);
            }
        }
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent openPending = PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        view.setOnClickPendingIntent(R.id.open, openPending);
        view.setOnClickPendingIntent(R.id.title, openPending);
        Intent refresh = new Intent(context, TessavieWidget.class).setAction(REFRESH).setData(Uri.parse("tessavie-widget://refresh/" + id))
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        view.setOnClickPendingIntent(R.id.refresh, PendingIntent.getBroadcast(context, id, refresh, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        AppWidgetManager.getInstance(context).updateAppWidget(id, view);
    }
}
