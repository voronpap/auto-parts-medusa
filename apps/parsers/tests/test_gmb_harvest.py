import pytest

from parsers.adapters.gmb import AJAX_URL, CATALOG_URL, GmbAdapter
from parsers.http import SourceError
from tools.gmb_vehicle_numbers import _choices, harvest


def page(numbers, next_page=None, vehicle="Showing Results For 2016 Audi S6"):
    cards = ''.join(f'<a class="woocommerce-LoopProduct-link" href="https://gmb.net/product/{n}/">Engine Water Pump {n}</a>' for n in numbers)
    next_link = f'<a class="next page-numbers" href="{next_page}">Next</a>' if next_page else ''
    return f'<div id="filter-verification">{vehicle}</div>{cards}{next_link}'


class Http:
    def __init__(self, accepted=True, verification=None):
        self.accepted, self.verification = accepted, verification
        self.calls = []

    def fetch(self, url, **kwargs):
        self.calls.append((url, kwargs))
        assert kwargs["use_cache"] is False
        if url == CATALOG_URL and not kwargs.get("params"):
            return '<select id="selected_year"><option value="2016">2016</option></select>'
        if url == CATALOG_URL:
            return page(["180-2620", "170-4240"], "https://gmb.net/catalog/page/2/", self.verification or "Showing Results For 2016 Audi S6")
        assert url == "https://gmb.net/catalog/page/2/"
        return page(["180-2620", "150-0001"])

    def fetch_json(self, url, **kwargs):
        self.calls.append((url, kwargs))
        assert url == AJAX_URL
        if kwargs.get("method") == "POST":
            body = kwargs["form_body"]
            assert body["action"] == "ymm_string" and kwargs["use_cache"] is False
            assert body["fitment_params[make]"] == "73"
            assert body["fitment_params[model]"] == "134770"
            assert body["fitment_params[engine]"] == "5522"
            return self.accepted
        lookup = kwargs["params"]["lookup"]
        if lookup == "make":
            return [{"count": 62, "makeId": 73, "makeName": "Audi"}]
        if lookup == "model":
            return [{"baseVehicleId": 134770, "modelName": "S6"}, {"baseVehicleId": 134770, "modelName": "S6"}]
        assert lookup == "engine"
        return [{"count": 60, "attributeValueId": 5522, "attributeValueName": "V8 4.0L 3993cc"}]


def test_full_native_filter_reads_all_pages_and_preserves_unique_codes():
    http = Http()
    assert harvest(GmbAdapter(http), 2016, ["Audi"], ["S6"]) == ["180-2620", "170-4240", "150-0001"]
    assert any(url.endswith('/page/2/') for url, _ in http.calls)


def test_trial_limits_do_not_read_unrequested_next_page():
    http = Http()
    assert harvest(GmbAdapter(http), 2016, ["Audi"], ["S6"], max_products=1) == ["180-2620"]
    assert not any(url.endswith('/page/2/') for url, _ in http.calls)


def test_unknown_make_is_not_guessed_or_substituted():
    http = Http()
    assert harvest(GmbAdapter(http), 2016, ["Haval"]) == []
    assert not any(kwargs.get("method") == "POST" for _, kwargs in http.calls)


def test_unknown_year_is_not_current_year_fallback():
    with pytest.raises(SourceError, match="published source option"):
        harvest(GmbAdapter(Http()), 2026, ["Audi"])


@pytest.mark.parametrize("accepted", [False, {"success": True}])
def test_rejected_filter_does_not_fall_through_to_all_products(accepted):
    with pytest.raises(SourceError, match="not accepted"):
        harvest(GmbAdapter(Http(accepted=accepted)), 2016, ["Audi"], ["S6"])


def test_unapplied_or_different_vehicle_filter_fails_closed():
    with pytest.raises(SourceError, match="confirm"):
        harvest(GmbAdapter(Http(verification="Showing Results For 2017 Toyota Camry")), 2016, ["Audi"], ["S6"])


def test_source_choice_id_conflicts_are_not_silently_deduplicated():
    with pytest.raises(SourceError, match="conflict"):
        _choices([{"makeId": 73, "makeName": "Audi"}, {"makeId": 73, "makeName": "Toyota"}], "makeId", "makeName")
