"""Read-only exact 072 verification for the UI-only smart select release."""
from contextlib import closing
import importlib.util
from pathlib import Path
import sys

path = Path(__file__).with_name('verify-android-widget-database.py')
spec = importlib.util.spec_from_file_location('widgets_072', path)
widgets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(widgets)
old = widgets.old


def validate(db):
    old.require(widgets.validate(db) == 72, 'Expected exact schema 072')


def verify(before_path, after_path):
    with closing(old.connect_readonly(before_path)) as before, closing(old.connect_readonly(after_path)) as after:
        validate(before)
        validate(after)
        tables = old.table_names(before, include_internal=True)
        old.require(old.table_names(after, include_internal=True) == tables, 'Table set changed')
        for table in sorted(tables):
            old.require(old.table_rows(before, table) == old.table_rows(after, table), 'Data changed: ' + table)
    print('EXACT_SCHEMA_072=ok\nALL_130_TABLES_UNCHANGED=ok\nMIGRATION_RECEIPTS_UNCHANGED=ok')


if __name__ == '__main__':
    try:
        if len(sys.argv) == 3 and sys.argv[1] in ('--validate-only', '--rollback-safe', '--baseline'):
            with closing(old.connect_readonly(sys.argv[2])) as db:
                validate(db)
            print('VALIDATED_SCHEMA=72')
        elif len(sys.argv) == 3 and not sys.argv[1].startswith('--'):
            verify(*sys.argv[1:])
        else:
            raise ValueError('Usage: verify-smart-select-database.py BEFORE AFTER | --validate-only DB | --baseline DB | --rollback-safe DB')
    except Exception as error:
        print('SMART_SELECT_DATABASE_CHECK_FAILED=' + str(error), file=sys.stderr)
        raise SystemExit(2)
