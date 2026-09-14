package ru.tessavie.widgets;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public final class SnapshotTest {
    private JSONObject sample() throws Exception {
        return new JSONObject().put("widgetId", "abc123").put("kind", "tracker").put("title", "Мои привычки")
                .put("completed", 1).put("total", 2).put("updatedAt", "2026-09-14T20:00:00.123Z").put("openUrl", "/")
                .put("items", new JSONArray().put(new JSONObject().put("label", "Прочитать главу").put("checked", true)));
    }
    @Test public void parsesServerContract() throws Exception {
        Snapshot snapshot = new Snapshot(sample().toString(), "abc123");
        assertEquals("Мои привычки", snapshot.title); assertEquals(1, snapshot.completed);
        assertEquals(2, snapshot.total); assertEquals("Прочитать главу", snapshot.labels[0]); assertTrue(snapshot.checked[0]);
        assertEquals("https://control.e-rd.ru/", snapshot.openUrl);
    }
    @Test public void rejectsDifferentWidget() throws Exception {
        try { new Snapshot(sample().toString(), "another"); fail(); } catch (org.json.JSONException expected) { }
    }
    @Test public void rejectsWrongKindAndOversizedList() throws Exception {
        try { new Snapshot(sample().put("kind", "html").toString(), "abc123"); fail(); } catch (org.json.JSONException expected) { }
        JSONArray items = new JSONArray(); for (int i = 0; i < 9; i++) items.put(new JSONObject().put("label", "a").put("checked", false));
        try { new Snapshot(sample().put("items", items).toString(), "abc123"); fail(); } catch (org.json.JSONException expected) { }
    }
    @Test public void ignoresOptionalAppearanceWithoutTrustingHtml() throws Exception {
        Snapshot snapshot = new Snapshot(sample().put("color", "<script>").put("background", "url(https://evil.test)").toString(), "abc123");
        assertEquals("Мои привычки", snapshot.title);
    }
    @Test public void emptyProgressIsValid() throws Exception {
        Snapshot snapshot = new Snapshot(sample().put("kind", "progress").put("completed", 0).put("total", 0).put("items", new JSONArray()).toString(), "abc123");
        assertEquals(0, snapshot.labels.length); assertEquals(0, snapshot.completed);
    }
}
