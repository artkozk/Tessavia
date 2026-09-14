package ru.tessavie.widgets;

import android.app.job.JobParameters;
import android.app.job.JobService;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.FutureTask;

public final class RefreshJob extends JobService {
    private final ExecutorService workers = Executors.newFixedThreadPool(2);
    private final ConcurrentHashMap<Integer, FutureTask<Void>> jobs = new ConcurrentHashMap<>();
    @Override public boolean onStartJob(JobParameters params) {
        int id = params.getExtras().getInt("widget", -1);
        FutureTask<Void> job = new FutureTask<>(() -> { update(id); if (jobs.remove(params.getJobId()) != null) jobFinished(params, false); return null; });
        jobs.put(params.getJobId(), job); workers.execute(job); return true;
    }
    private void update(int id) {
        PrivateStore.State state = PrivateStore.read(this, id);
        if (state == null || !TessavieWidget.exists(this, id)) return;
        if (!WidgetContract.timestamp(state.expiresAt).isAfter(Instant.now())) {
            PrivateStore.clearIfCurrent(this, id, state); TessavieWidget.render(this, id); return;
        }
        try {
            Snapshot snapshot = WidgetApi.fetch(state.token, state.widgetId);
            if (Thread.currentThread().isInterrupted()) return;
            state.snapshot = snapshot.raw; state.status = ""; state.fetchedAt = Instant.now().toString(); PrivateStore.saveIfCurrent(this, id, state);
        } catch (WidgetApi.Rejected rejected) {
            if (!RefreshPolicy.clearDenied(this, id, state, rejected.status)) {
                state.status = rejected.status == 429 ? "Слишком часто · повторите позже" : "Сервер недоступен · сохранённая копия"; saveStatus(id, state);
            }
        } catch (Exception ignored) { state.status = "Нет обновления · сохранённая копия"; saveStatus(id, state); }
        TessavieWidget.render(this, id);
    }
    private void saveStatus(int id, PrivateStore.State state) { try { PrivateStore.saveIfCurrent(this, id, state); } catch (Exception ignored) { } }
    @Override public boolean onStopJob(JobParameters params) {
        FutureTask<Void> job = jobs.remove(params.getJobId()); if (job != null) job.cancel(true); return true;
    }
    @Override public void onDestroy() { workers.shutdownNow(); super.onDestroy(); }
}
