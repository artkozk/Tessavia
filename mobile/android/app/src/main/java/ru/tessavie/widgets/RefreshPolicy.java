package ru.tessavie.widgets;

import android.content.Context;

/** Revocation removes both credentials and cached text; a stale request cannot remove a new pairing. */
final class RefreshPolicy {
    static boolean clearDenied(Context context, int id, PrivateStore.State state, int status) {
        if (status != 401 && status != 403) return false;
        PrivateStore.clearIfCurrent(context, id, state); return true;
    }
}
