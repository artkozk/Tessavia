package ru.tessavie.widgets;

import org.junit.Test;
import static org.junit.Assert.*;

public final class WidgetContractTest {
    @Test public void acceptsExactOriginOnly() { assertEquals(WidgetContract.ORIGIN + "/", WidgetContract.openUrl("/")); assertEquals(WidgetContract.ORIGIN + "/", WidgetContract.openUrl(WidgetContract.ORIGIN + "/")); }
    @Test public void rejectsCredentialRedirectAndPayloadUrls() {
        String[] unsafe = {"https://evil.test/", "//evil.test/", "http://control.e-rd.ru/", "https://control.e-rd.ru@evil.test/", "https://attacker@control.e-rd.ru/", "https://control.e-rd.ru:8522/", "/?token=secret", "/#secret", "/api/me", "javascript:alert(1)", "https://control.e-rd.ru.evil.test/"};
        for (String value : unsafe) { try { WidgetContract.openUrl(value); fail(value); } catch (IllegalArgumentException expected) { } }
    }
    @Test public void validCodeAndTokenAreBounded() {
        assertEquals("a".repeat(32), WidgetContract.pairingCode("  " + "a".repeat(32) + " "));
        assertEquals("b".repeat(64), WidgetContract.token("b".repeat(64)));
        for (String value : new String[] {"", "abc", "a".repeat(33), "z".repeat(32), "https://control.e-rd.ru/"}) {
            try { WidgetContract.pairingCode(value); fail(); } catch (IllegalArgumentException expected) { }
        }
    }
    @Test public void progressHandlesEmptyAndRejectsInvalidNumbers() {
        assertEquals(0, WidgetContract.progress(0, 0)); assertEquals(33, WidgetContract.progress(1, 3)); assertEquals(100, WidgetContract.progress(500, 500));
        for (int[] pair : new int[][] {{-1, 5}, {5, 4}, {0, -1}, {0, 501}}) {
            try { WidgetContract.progress(pair[0], pair[1]); fail(); } catch (IllegalArgumentException expected) { }
        }
    }
    @Test public void timestampsSupportFractionalSeconds() { assertEquals(123_000_000, WidgetContract.timestamp("2026-09-14T12:00:00.123Z").getNano()); }
}
