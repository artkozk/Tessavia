package ru.tessavie.widgets;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONObject;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Each widget is a separate encrypted capability, including its cached private text. */
final class PrivateStore {
    static final class State {
        String token, widgetId, expiresAt, snapshot = "", status = "", fetchedAt = "";
        State(WidgetApi.Pairing pairing) { token = pairing.token; widgetId = pairing.widgetId; expiresAt = pairing.expiresAt; }
        State(JSONObject data) throws Exception {
            token = WidgetContract.token(data.getString("token")); widgetId = data.getString("widgetId");
            expiresAt = data.getString("expiresAt"); WidgetContract.timestamp(expiresAt);
            snapshot = data.optString("snapshot", ""); status = data.optString("status", ""); fetchedAt = data.optString("fetchedAt", "");
            if (!fetchedAt.isEmpty()) WidgetContract.timestamp(fetchedAt);
        }
        JSONObject json() throws Exception { return new JSONObject().put("token", token).put("widgetId", widgetId).put("expiresAt", expiresAt).put("snapshot", snapshot).put("status", status).put("fetchedAt", fetchedAt); }
    }
    private static String alias(int id) { return "tessavie_widget_" + id; }
    private static SecretKey key(int id, boolean create) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias(alias(id))) return (SecretKey) store.getKey(alias(id), null);
        if (!create) throw new java.security.KeyStoreException("Missing widget key");
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(alias(id), KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    static synchronized State read(Context context, int id) {
        try {
            String encoded = context.getSharedPreferences("widgets", Context.MODE_PRIVATE).getString(alias(id), null);
            if (encoded == null) return null;
            JSONObject data = new JSONObject(encoded);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(id, false), new GCMParameterSpec(128, Base64.decode(data.getString("iv"), Base64.NO_WRAP)));
            cipher.updateAAD(alias(id).getBytes(java.nio.charset.StandardCharsets.UTF_8));
            String clear = new String(cipher.doFinal(Base64.decode(data.getString("data"), Base64.NO_WRAP)), java.nio.charset.StandardCharsets.UTF_8);
            return new State(new JSONObject(clear));
        } catch (Exception ignored) { clear(context, id); return null; }
    }
    static synchronized void save(Context context, int id, State state) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key(id, true));
        cipher.updateAAD(alias(id).getBytes(java.nio.charset.StandardCharsets.UTF_8));
        byte[] encrypted = cipher.doFinal(state.json().toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        JSONObject blob = new JSONObject().put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)).put("data", Base64.encodeToString(encrypted, Base64.NO_WRAP));
        if (!context.getSharedPreferences("widgets", Context.MODE_PRIVATE).edit().putString(alias(id), blob.toString()).commit()) throw new java.io.IOException("Cannot save widget");
    }
    static synchronized boolean saveIfCurrent(Context context, int id, State state) throws Exception {
        State current = read(context, id);
        if (current == null || !current.token.equals(state.token)) return false;
        save(context, id, state); return true;
    }
    static synchronized void clearIfCurrent(Context context, int id, State state) {
        State current = read(context, id);
        if (current != null && current.token.equals(state.token)) clear(context, id);
    }
    @android.annotation.SuppressLint("ApplySharedPref") // Must finish durable deletion before reporting disconnection.
    static synchronized void clear(Context context, int id) {
        context.getSharedPreferences("widgets", Context.MODE_PRIVATE).edit().remove(alias(id)).commit();
        try { KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null); store.deleteEntry(alias(id)); } catch (Exception ignored) { }
    }
}
