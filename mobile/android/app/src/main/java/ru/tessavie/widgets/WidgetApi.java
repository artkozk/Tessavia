package ru.tessavie.widgets;

import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;

final class WidgetApi {
    static final class Rejected extends IOException { final int status; Rejected(int status) { super("Request rejected"); this.status = status; } }
    static final class Pairing {
        final String token, expiresAt, widgetId;
        Pairing(String data) throws Exception {
            JSONObject object = new JSONObject(data);
            token = WidgetContract.token(object.getString("token")); expiresAt = object.getString("expiresAt");
            if (!WidgetContract.timestamp(expiresAt).isAfter(java.time.Instant.now())) throw new IOException("Expired");
            widgetId = object.getString("widgetId");
            if (!widgetId.matches("[a-zA-Z0-9_-]{1,100}")) throw new IOException("Invalid widget ID");
        }
    }
    static Pairing redeem(String code) throws Exception {
        return new Pairing(request("/api/mobile/widgets/redeem", null,
                new JSONObject().put("code", WidgetContract.pairingCode(code)).toString()));
    }
    static Snapshot fetch(String token, String widgetId) throws Exception {
        return new Snapshot(request("/api/mobile/widget", WidgetContract.token(token), null), widgetId);
    }
    private static String request(String path, String token, String payload) throws IOException {
        HttpsURLConnection connection = (HttpsURLConnection) new URL(WidgetContract.ORIGIN + path).openConnection();
        connection.setConnectTimeout(12_000); connection.setReadTimeout(12_000);
        connection.setInstanceFollowRedirects(false); connection.setUseCaches(false);
        connection.setRequestProperty("Accept", "application/json");
        if (token != null) connection.setRequestProperty("Authorization", "Bearer " + token);
        try {
            if (payload != null) {
                connection.setRequestMethod("POST"); connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(bytes.length);
                try (java.io.OutputStream out = connection.getOutputStream()) { out.write(bytes); }
            }
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new Rejected(status);
            String contentType = connection.getContentType();
            if (contentType == null || !contentType.toLowerCase(java.util.Locale.ROOT).startsWith("application/json")) throw new IOException("Unexpected response");
            try (InputStream in = connection.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096]; int read;
                while ((read = in.read(buffer)) != -1) {
                    if (out.size() + read > 65_536) throw new IOException("Response too large");
                    out.write(buffer, 0, read);
                }
                return out.toString(StandardCharsets.UTF_8.name());
            }
        } finally { connection.disconnect(); }
    }
}
