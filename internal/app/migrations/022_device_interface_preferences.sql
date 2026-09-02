ALTER TABLE user_interface_preferences ADD COLUMN mobile_preferences_json TEXT NOT NULL DEFAULT '';

-- Snapshot existing preferences once; subsequent desktop edits must not change mobile.
UPDATE user_interface_preferences SET mobile_preferences_json = json_object(
    'hiddenNavItems', json(hidden_nav_items_json),
    'navOrder', json(nav_order_json),
    'hiddenNavGroups', json(hidden_nav_groups_json),
    'collapsedNavGroups', json(collapsed_nav_groups_json),
    'dashboardWidgets', json(dashboard_widgets_json),
    'layout', json(layout_json),
    'updatedAt', updated_at
);
