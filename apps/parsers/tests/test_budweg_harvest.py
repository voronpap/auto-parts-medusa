from urllib.parse import urlencode

import pytest

from parsers.adapters.budweg import CATALOG_URL, BudwegAdapter
from parsers.http import SourceError
from tools.budweg_make_numbers import catalogue_numbers, harvest


FILTERS = {"search": "", "brand": "MG", "model": "", "fromYear": "", "engine": "", "fuel": "", "model_code": ""}
NEXT_URL = "https://budweg-catalog.com/catalogue/page/2/?" + urlencode(FILTERS)


def page(codes, make="MG", number=1, next_url=None):
    links = ''.join(f'<a class="hint" href="https://budweg-catalog.com/product/?article={code}">{code}</a>' for code in codes)
    more = f'<a class="next page-numbers" href="{next_url}">Next</a>' if next_url else ''
    return '<title>Catalogue – Budweg</title><div class="catalog-right">' + f'<h2 class="catalog-title">{make} ZS Hatchback</h2>' + '<div class="table-responsive"><table class="catalog-table"><tr class="table-head"><td class="title-td">Brake Caliper</td></tr><tr><td>' + links + '</td></tr></table></div></div>' + f'<div class="pagination"><span class="page-numbers current">{number}</span>{more}</div>'


class Http:
    def __init__(self, next_url=NEXT_URL, make="MG", error=None):
        self.calls, self.next_url, self.make, self.error = [], next_url, make, error

    def fetch(self, url, **kwargs):
        self.calls.append((url, kwargs))
        if url == CATALOG_URL and not kwargs.get("params"):
            return '<select name="brand"><option value="MG">MG</option></select>'
        if kwargs.get("params"):
            assert kwargs["params"] == FILTERS
            if self.error:
                raise self.error
            return page(["343640", "203427", "0"], self.make, next_url=self.next_url)
        assert url == NEXT_URL
        return page(["203427", "233411"], number=2)


def test_full_native_vehicle_paging_preserves_and_deduplicates_literal_codes():
    http = Http()
    assert harvest(BudwegAdapter(http), ["MG"]) == ["343640", "203427", "233411"]
    assert len(http.calls) == 3


def test_explicit_trial_limit_does_not_fetch_next_page():
    http = Http()
    assert harvest(BudwegAdapter(http), ["MG"], max_pages=1) == ["343640", "203427"]
    assert len(http.calls) == 2


def test_unpublished_chinese_make_is_not_substituted_or_guessed():
    http = Http()
    with pytest.raises(SourceError, match="not a published option"):
        harvest(BudwegAdapter(http), ["Haval"])
    assert len(http.calls) == 1


def test_unfiltered_or_different_make_is_not_a_successful_harvest():
    with pytest.raises(SourceError, match="unrequested"):
        harvest(BudwegAdapter(Http(make="ABARTH")), ["MG"])


@pytest.mark.parametrize("next_url", ["https://other.example/catalogue/page/2/", "https://budweg-catalog.com/catalogue/page/2/", "https://budweg-catalog.com/catalogue/page/3/?" + urlencode(FILTERS)])
def test_pagination_cannot_change_host_page_or_drop_filter(next_url):
    http = Http(next_url=next_url)
    with pytest.raises(SourceError, match="lost or changed"):
        harvest(BudwegAdapter(http), ["MG"])
    assert len(http.calls) == 2


def test_native_server_failure_is_not_an_empty_harvest():
    with pytest.raises(SourceError, match="HTTP 500"):
        harvest(BudwegAdapter(Http(error=SourceError("HTTP 500"))), ["MG"])


def test_visible_article_and_url_must_have_the_same_owned_number():
    html = page(["343640"]).replace("article=343640", "article=999999")
    with pytest.raises(SourceError, match="differs"):
        catalogue_numbers(html, "MG")


def test_missing_next_link_is_not_an_unverified_complete_collection():
    class MissingNext(Http):
        def fetch(self, url, **kwargs):
            body = super().fetch(url, **kwargs)
            if kwargs.get("params"):
                body = body.replace('class="next page-numbers"', 'class="page-numbers"').replace('>Next</a>', '>2</a>')
            return body
    with pytest.raises(SourceError, match="advertises later"):
        harvest(BudwegAdapter(MissingNext()), ["MG"])
