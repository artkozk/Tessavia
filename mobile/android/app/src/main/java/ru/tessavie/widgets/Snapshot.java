package ru.tessavie.widgets;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class Snapshot {
    final String title, kind, updatedAt, openUrl, raw;
    final int completed, total;
    final String[] labels;
    final boolean[] checked;
    Snapshot(String raw, String expectedWidgetId) throws JSONException {
        JSONObject data = new JSONObject(raw);
        if (!expectedWidgetId.equals(data.getString("widgetId"))) throw new JSONException("Unexpected widget");
        title = limit(data.getString("title"), 180);
        kind = data.getString("kind");
        if (!kind.equals("tracker") && !kind.equals("progress")) throw new JSONException("Unsupported kind");
        completed = data.getInt("completed"); total = data.getInt("total");
        WidgetContract.progress(completed, total);
        updatedAt = data.getString("updatedAt"); WidgetContract.timestamp(updatedAt);
        openUrl = WidgetContract.openUrl(data.optString("openUrl", "/"));
        JSONArray items = data.getJSONArray("items");
        if (items.length() > 8) throw new JSONException("Too many items");
        labels = new String[items.length()]; checked = new boolean[items.length()];
        for (int i = 0; i < items.length(); i++) {
            labels[i] = limit(items.getJSONObject(i).getString("label"), 240);
            checked[i] = items.getJSONObject(i).getBoolean("checked");
        }
        this.raw = raw;
    }
    private static String limit(String value, int max) { return value.length() <= max ? value : value.substring(0, max); }
}
