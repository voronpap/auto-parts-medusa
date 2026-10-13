from pathlib import Path

from tools.nissens_make_numbers import harvest

FIXTURES = Path(__file__).parent / "fixtures"


class FakeHttp:
    def __init__(self):
        self.calls = []

    def fetch(self, url, form_body=None, **kwargs):
        self.calls.append((url, form_body))
        if form_body:
            return (FIXTURES / "nissens_search_607401.html").read_text(encoding="utf-8")
        return (FIXTURES / "nissens_form.html").read_text(encoding="utf-8") + (
            '<select name="SearchParameters.ManufacturerID">'
            '<option value="MG">MG</option><option value="CHERY">CHERY</option></select>'
        )


def test_harvest_only_requests_selected_make_and_keeps_all_stated_products():
    http = FakeHttp()
    assert set(harvest(http, ["MG"], max_pages=1)) == {
        "607401", "941518", "91202", "890591", "935327", "966579"
    }
    requests = [body for _, body in http.calls if body]
    assert len(requests) == 1
    assert requests[0]["SearchParameters.ManufacturerID"] == "MG"
