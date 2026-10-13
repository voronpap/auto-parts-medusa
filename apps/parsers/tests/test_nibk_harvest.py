import json
from pathlib import Path

from tools.nibk_model_numbers import harvest

FIXTURES = Path(__file__).parent / "fixtures"


class FakeHttp:
    def __init__(self):
        self.calls = []

    def fetch(self, url, params=None, headers=None):
        self.calls.append((url, params, headers))
        if "/get_applications/" in url:
            return (FIXTURES / "nibk_PN6049.html").read_text(encoding="utf-8")
        return '<select id="selBrand"><option value="479">HAVAL</option><option value="431">GEELY</option></select>'

    def fetch_json(self, url, headers=None):
        self.calls.append((url, None, headers))
        if "/get_application_class/" in url:
            return ""
        return '<option value="22792">Big Dog DaGou</option><option value="22449">Dargo</option>'


def test_harvest_uses_selected_make_and_model_limit():
    http = FakeHttp()
    numbers = harvest(http, ["Haval"], max_models=1)
    assert "PN6049" in numbers
    applications = [call for call in http.calls if "/get_applications/" in call[0]]
    assert len(applications) == 1
    assert applications[0] == (
        "https://www.nibk.jp/application/get_applications/22792/1/0/0/0",
        {"body_value": "0", "eng_no": "0"},
        {"X-Requested-With": "XMLHttpRequest"},
    )
    assert all("/431/" not in url for url, _, _ in http.calls)
