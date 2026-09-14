package ru.tessavie.widgets;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

final class Screen {
    final Activity activity;
    final LinearLayout column;
    Screen(Activity activity, String title) {
        this.activity = activity;
        ScrollView scroll = new ScrollView(activity); scroll.setFillViewport(true);
        column = new LinearLayout(activity); column.setOrientation(LinearLayout.VERTICAL);
        int padding = dp(24); column.setPadding(padding, padding, padding, padding);
        scroll.addView(column); activity.setContentView(scroll);
        text("TESSAVIE", 12, false); text(title, 28, true);
    }
    int dp(int n) { return Math.round(n * activity.getResources().getDisplayMetrics().density); }
    TextView text(String text, int size, boolean bold) {
        TextView view = new TextView(activity); view.setText(text); view.setTextSize(size); view.setTextColor(Color.rgb(35, 49, 40));
        if (bold) view.setTypeface(null, Typeface.BOLD);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2); params.bottomMargin = dp(16);
        column.addView(view, params); return view;
    }
    Button button(String label, View.OnClickListener listener) {
        Button button = new Button(activity); button.setText(label); button.setAllCaps(false); button.setMinHeight(dp(52));
        button.setTextColor(Color.rgb(18, 107, 88)); button.setOnClickListener(listener);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2); params.bottomMargin = dp(8); column.addView(button, params); return button;
    }
}
