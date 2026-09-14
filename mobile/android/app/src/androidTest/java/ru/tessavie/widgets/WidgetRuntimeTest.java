package ru.tessavie.widgets;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Before;
import org.junit.After;
import org.junit.Test;
import static org.junit.Assert.*;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.RemoteViews;
import org.json.JSONObject;
import java.time.Instant;

/** Runs on Android itself, including its real Keystore provider and RemoteViews inflater. */
public final class WidgetRuntimeTest {
    private static final int FIRST = 9134001, SECOND = 9134002;
    private Context context;
    @Before public void setUp() { context = InstrumentationRegistry.getInstrumentation().getTargetContext(); PrivateStore.clear(context, FIRST); PrivateStore.clear(context, SECOND); }
    @After public void tearDown() { PrivateStore.clear(context, FIRST); PrivateStore.clear(context, SECOND); }
    private PrivateStore.State state(char character) throws Exception {
        StringBuilder tokenBuilder = new StringBuilder(); for (int i = 0; i < 64; i++) tokenBuilder.append(character);
        String token = tokenBuilder.toString();
        WidgetApi.Pairing pairing = new WidgetApi.Pairing(new JSONObject().put("token", token).put("widgetId", "test-widget")
                .put("expiresAt", Instant.now().plusSeconds(3600).toString()).toString());
        PrivateStore.State value = new PrivateStore.State(pairing); value.snapshot = "Private reading progress"; value.fetchedAt = Instant.now().toString(); return value;
    }
    @Test public void testKeystoreRoundtripAndDurableDeletion() throws Exception {
        PrivateStore.State value = state('a'); PrivateStore.save(context, FIRST, value);
        PrivateStore.State restored = PrivateStore.read(context, FIRST);
        assertEquals(value.token, restored.token); assertEquals(value.snapshot, restored.snapshot); assertEquals(value.fetchedAt, restored.fetchedAt);
        String encrypted = context.getSharedPreferences("widgets", Context.MODE_PRIVATE).getString("tessavie_widget_" + FIRST, "");
        assertFalse(encrypted.contains(value.token)); assertFalse(encrypted.contains(value.snapshot));
        PrivateStore.clear(context, FIRST); assertNull(PrivateStore.read(context, FIRST));
    }
    @Test public void testMultipleWidgetsAndCiphertextCannotBeMoved() throws Exception {
        PrivateStore.save(context, FIRST, state('a')); PrivateStore.save(context, SECOND, state('b'));
        assertFalse(PrivateStore.read(context, FIRST).token.equals(PrivateStore.read(context, SECOND).token));
        String encrypted = context.getSharedPreferences("widgets", Context.MODE_PRIVATE).getString("tessavie_widget_" + FIRST, "");
        context.getSharedPreferences("widgets", Context.MODE_PRIVATE).edit().putString("tessavie_widget_" + SECOND, encrypted).commit();
        assertNull(PrivateStore.read(context, SECOND)); assertNotNull(PrivateStore.read(context, FIRST));
    }
    @Test public void testDeniedClearsPrivateCacheAndStaleDenialKeepsNewPairing() throws Exception {
        for (int status : new int[] {401, 403}) {
            PrivateStore.State value = state('a'); PrivateStore.save(context, FIRST, value);
            assertTrue(RefreshPolicy.clearDenied(context, FIRST, value, status)); assertNull(PrivateStore.read(context, FIRST));
        }
        PrivateStore.State old = state('a'); PrivateStore.State current = state('b'); PrivateStore.save(context, FIRST, current);
        RefreshPolicy.clearDenied(context, FIRST, old, 401); assertEquals(current.token, PrivateStore.read(context, FIRST).token);
        assertFalse(RefreshPolicy.clearDenied(context, FIRST, current, 500)); assertNotNull(PrivateStore.read(context, FIRST));
        PrivateStore.clear(context, FIRST); assertFalse(PrivateStore.saveIfCurrent(context, FIRST, old)); assertNull(PrivateStore.read(context, FIRST));
    }
    @Test public void testRemoteViewsInflateAndFitCompactAndLargeSizes() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            for (int width : new int[] {180, 320}) for (int height : new int[] {180, 300}) {
                RemoteViews remote = new RemoteViews(context.getPackageName(), R.layout.widget);
                remote.setTextViewText(R.id.title, "Очень длинное название моего блока для чтения и привычек");
                remote.setTextViewText(R.id.progress_label, "2 из 5");
                remote.setProgressBar(R.id.progress, 100, 40, false);
                remote.setTextViewText(R.id.items, "✓  Прочитать главу\n○  Прогуляться после работы");
                remote.setTextViewText(R.id.status, "Сохранённая копия · обновлено 14 сен, 12:00");
                remote.setTextViewText(R.id.open, width < 240 ? "Открыть" : "Открыть Tessavie");
                if (height < 220) { remote.setInt(R.id.title, "setMaxLines", 1); remote.setViewVisibility(R.id.items, View.GONE); remote.setViewVisibility(R.id.brand, View.GONE); }
                FrameLayout host = new FrameLayout(context); View widget = remote.apply(context, host); host.addView(widget);
                int widthPx = Math.round(width * context.getResources().getDisplayMetrics().density);
                int heightPx = Math.round(height * context.getResources().getDisplayMetrics().density);
                host.measure(View.MeasureSpec.makeMeasureSpec(widthPx, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(heightPx, View.MeasureSpec.EXACTLY)); host.layout(0, 0, widthPx, heightPx);
                View refresh = widget.findViewById(R.id.refresh);
                View actions = (View) refresh.getParent();
                assertTrue("actions fit width", refresh.getRight() <= actions.getWidth());
                assertTrue("actions fit height " + height, actions.getBottom() <= widget.getHeight() - widget.getPaddingBottom());
                assertTrue("48dp touch area", refresh.getHeight() >= Math.round(48 * context.getResources().getDisplayMetrics().density));
                android.graphics.Bitmap bitmap = android.graphics.Bitmap.createBitmap(widthPx, heightPx, android.graphics.Bitmap.Config.ARGB_8888);
                host.draw(new android.graphics.Canvas(bitmap));
                try (java.io.FileOutputStream output = new java.io.FileOutputStream(new java.io.File(context.getExternalFilesDir(null), "widget-" + width + "x" + height + ".png"))) {
                    assertTrue(bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, output));
                } catch (java.io.IOException error) { throw new AssertionError(error); } finally { bitmap.recycle(); }
            }
        });
    }
}
