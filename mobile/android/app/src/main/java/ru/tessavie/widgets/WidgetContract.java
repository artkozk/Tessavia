package ru.tessavie.widgets;

import java.net.URI;
import java.time.Instant;

/** Pure contract validation: never allows a bearer credential to choose a host. */
public final class WidgetContract {
    public static final String ORIGIN = "https://control.e-rd.ru";
    private WidgetContract() {}
    public static String pairingCode(String value) {
        String code = value == null ? "" : value.trim();
        if (!code.matches("[a-f0-9]{32}")) throw new IllegalArgumentException("Введите код из настроек Tessavie целиком.");
        return code;
    }
    public static String token(String value) {
        if (value == null || !value.matches("[a-f0-9]{64}")) throw new IllegalArgumentException("Некорректный ответ сервера.");
        return value;
    }
    public static String openUrl(String value) {
        if (value == null || value.trim().isEmpty()) return ORIGIN + "/";
        URI parsed = URI.create(value);
        URI uri = parsed.isAbsolute() ? parsed : URI.create(ORIGIN + "/").resolve(parsed);
        if (!"https".equals(uri.getScheme()) || !"control.e-rd.ru".equals(uri.getHost())
                || uri.getRawUserInfo() != null || (uri.getPort() != -1 && uri.getPort() != 443)
                || uri.getRawFragment() != null || uri.getRawQuery() != null
                || !"/".equals(uri.getRawPath())) throw new IllegalArgumentException("Адрес блока не поддерживается.");
        // The initial contract opens Tessavie itself. Widen only with a documented safe deep-link contract.
        return ORIGIN + "/";
    }
    public static Instant timestamp(String value) { return Instant.parse(value); }
    public static int progress(int completed, int total) {
        if (total < 0 || completed < 0 || total > 500 || completed > total) throw new IllegalArgumentException("Некорректный прогресс.");
        return total == 0 ? 0 : (int) ((long) completed * 100 / total);
    }
}
