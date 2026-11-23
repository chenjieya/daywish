import importlib.util
from pathlib import Path
import plistlib
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location('mac_compatibility', Path(__file__).resolve().parents[1] / 'scripts/verify-macos-compatibility.py')
compatibility = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compatibility)

NEW = 'Load command 1\n      cmd LC_BUILD_VERSION\n platform 1\n    minos 12.0\n      sdk 27.0\n'
OLD = 'Load command 2\n      cmd LC_VERSION_MIN_MACOSX\n  version 10.13\n      sdk 14.0\n'


class MacCompatibilityTests(unittest.TestCase):
    def test_old_and_new_macho_headers_and_multiple_slices(self):
        self.assertEqual(compatibility.deployment_versions(NEW + OLD), ['12.0', '10.13'])
        self.assertEqual(compatibility.version('12.0'), compatibility.version('12.0.0'))
        self.assertGreater(compatibility.version('12.10'), compatibility.version('12.3'))

    def test_missing_minimum_is_not_assumed_compatible(self):
        for output in ['Load command 1\n cmd LC_UUID\n', 'Load command 1\n cmd LC_BUILD_VERSION\n sdk 27.0\n']:
            with self.assertRaises(ValueError):
                compatibility.deployment_versions(output)

    def test_a_newer_embedded_framework_blocks_release(self):
        with tempfile.TemporaryDirectory() as directory:
            app = Path(directory) / 'Daywish.app'
            binary = app / 'Contents/MacOS/Daywish'
            framework = app / 'Contents/Frameworks/Sparkle'
            binary.parent.mkdir(parents=True)
            framework.parent.mkdir()
            binary.write_bytes(bytes.fromhex('cffaedfe'))
            framework.write_bytes(bytes.fromhex('cffaedfe'))
            with (app / 'Contents/Info.plist').open('wb') as stream:
                plistlib.dump({'LSMinimumSystemVersion': '12.0'}, stream)
            def output(arguments, **kwargs):
                return NEW.replace('12.0', '26.0') if arguments[-1].endswith('Sparkle') else NEW
            with patch.object(compatibility.subprocess, 'check_output', side_effect=output):
                with self.assertRaisesRegex(ValueError, 'Sparkle'):
                    compatibility.verify_bundle(app)
            with patch.object(compatibility.subprocess, 'check_output', return_value=NEW):
                compatibility.verify_bundle(app)
