import json
from pathlib import Path

from tools.zf_model_numbers import collect_numbers

FIXTURES = Path(__file__).parent / "fixtures"


class FakeHttp:
    def __init__(self):
        self.calls = []

    def fetch_json(self, url, params=None, **kwargs):
        self.calls.append((url, params, kwargs))
        return json.loads((FIXTURES / f"zf_harvest_{url.rsplit('/', 1)[-1]}.json").read_text(encoding="utf-8"))


def test_harvest_uses_actual_make_model_and_vehicle_ids():
    http = FakeHttp()
    found = list(collect_numbers(http, ["MG"], "TRW", models=["MG 6"], max_models=1, max_pages=1))
    assert found == ["GDB1344DTE", "GDB1344", "STA1498", "GDB1374", "DF4202", "BHX222E", "BHX223E", "DF4527"]
    assert http.calls[1][1]["manufacturerID"] == 75
    assert http.calls[2][1]["modelID"] == 9580
    assert http.calls[3][1]["page"] == 0
    assert http.calls[3][1]["vehicleIDs"]
    assert all(c[1]["brandIDs"] == "161" and c[2]["headers"]["X-Requested-With"] == "XMLHttpRequest" for c in http.calls)


def test_harvest_does_not_mix_other_part_brands_or_duplicate_numbers():
    class Mixed(FakeHttp):
        def fetch_json(self, url, **kwargs):
            data = super().fetch_json(url, **kwargs)
            if url.endswith("getArticlesForFilter"):
                data["content"].extend([data["content"][0], {"articleID":"000 123-4", "brandName":"SACHS"}])
            return data
    result = list(collect_numbers(Mixed(), ["MG"], "TRW", models=["MG 6"], max_models=1))
    assert len(result) == len(set(result)) == 8
    assert "000 123-4" not in result


def test_harvest_follows_zero_based_pagination_and_reports_trial_limit(capsys):
    class Pages(FakeHttp):
        def fetch_json(self, url, **kwargs):
            data = super().fetch_json(url, **kwargs)
            if url.endswith("getArticlesForFilter"):
                data["totalPages"] = 2
                if kwargs["params"]["page"] == 1:
                    data["content"] = [{"articleID":"000 123-4", "brandName":"TRW"}]
            return data
    http = Pages()
    result = list(collect_numbers(http, ["MG"], "TRW", models=["MG 6"], max_models=1))
    assert result[-1] == "000 123-4"
    assert [c[1]["page"] for c in http.calls if c[0].endswith("getArticlesForFilter")] == [0, 1]
    list(collect_numbers(Pages(), ["MG"], "TRW", models=["MG 6"], max_models=1, max_pages=1))
    assert "stopped after 1/2 pages" in capsys.readouterr().err


def test_unknown_vehicle_make_never_requests_other_makers(capsys):
    http = FakeHttp()
    assert list(collect_numbers(http, ["ZZZNOMAKE"], "TRW")) == []
    assert len(http.calls) == 1
    assert "not listed by ZF" in capsys.readouterr().err
