import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('cleanup', Path(__file__).with_name('clean-forum-import-descriptions-20260915.py'))
cleanup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cleanup)


class CleanupTests(unittest.TestCase):
    marker = '[import:synthetic_batch:A01]'
    original = 'Готово, когда…\nСогласован эскиз.\n\nИсходный блок: Дизайн\nСлужебное пояснение\n\n' + marker

    def clean(self, value):
        return cleanup.cleaned_description(value, self.original, self.marker)

    def test_only_footer_removed(self):
        self.assertEqual(self.clean(self.original), 'Готово, когда…\nСогласован эскиз.')

    def test_actual_edits_before_and_after_survive(self):
        current = self.original.replace('Согласован эскиз.', 'Подготовлены два новых эскиза.') + '\n\nКомментарий команды: добавить цвет.'
        self.assertEqual(self.clean(current), 'Готово, когда…\nПодготовлены два новых эскиза.\n\nКомментарий команды: добавить цвет.')

    def test_modified_footer_refused(self):
        with self.assertRaises(cleanup.helper.ImportFailure):
            self.clean(self.original.replace('Служебное пояснение', 'Пользователь изменил это'))

    def test_duplicate_and_missing_marker_refused(self):
        for current in (self.original + self.marker, self.original.replace(self.marker, ''), self.original + self.original):
            with self.subTest(current=current):
                with self.assertRaises(cleanup.helper.ImportFailure): self.clean(current)

    def test_protected_properties_and_unrelated_descriptions(self):
        before = {'records': {'a': {'id':'a', 'description':'old', 'updated_at':'1', 'owner_id':5}, 'b': {'id':'b', 'description':'keep', 'updated_at':'1'}}, 'fields':[], 'links':[]}
        after = copy.deepcopy(before)
        after['records']['a'].update(description='new', updated_at='2')
        cleanup.verify_unchanged(before, after, {'a':'new'})
        for target, key, value in [('a','owner_id',9), ('b','description','lost')]:
            mutated = copy.deepcopy(after); mutated['records'][target][key] = value
            with self.assertRaises(cleanup.helper.ImportFailure): cleanup.verify_unchanged(before, mutated, {'a':'new'})

    def test_relations_and_custom_values_must_stay(self):
        before = {'records': {}, 'fields':[{'value':'Вова'}], 'links':[{'id':'dependency'}]}
        for key in ('fields','links'):
            after = copy.deepcopy(before); after[key] = []
            with self.assertRaises(cleanup.helper.ImportFailure): cleanup.verify_unchanged(before, after, {})


if __name__ == '__main__': unittest.main()
