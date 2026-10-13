"""Print FACET numbers confirmed for selected makes through the public tree."""
import argparse
import json
import re
from pathlib import Path

from bs4 import BeautifulSoup

from parsers.adapters.base import label_has_brand, normalize_brand
from parsers.adapters.facet import FacetAdapter, parse_applications
from parsers.http import PoliteSession, RateLimiter, ResponseCache, SourceError


def makers(html):
    for link in BeautifulSoup(html, "html.parser").select('[onclick*="OnBeginCallbackImageGallery"]'):
        match = re.fullmatch(r"\s*OnBeginCallbackImageGallery\((.*)\);?\s*", str(link["onclick"]))
        if not match:
            continue
        try:
            args = json.loads("[" + match.group(1) + "]")
        except ValueError as error:
            raise SourceError("FACET maker callback arguments changed") from error
        if len(args) != 4 or not all(isinstance(v, str) for v in args):
            raise SourceError("FACET maker callback arguments are invalid")
        yield args[0], args[2]


def model_names(html):
    soup = BeautifulSoup(html, "html.parser")
    for row in soup.select('tr[id^="GVModelliDaCostruttore_DXDataRow"]'):
        cells = row.find_all("td", recursive=False)
        if len(cells) != 2:
            raise SourceError("FACET model columns changed")
        yield cells[0].get_text("", strip=False).strip()


def harvest(http, makes, models=None, max_models=None, max_engines=None, max_products=None, max_pages=None, adapter_class=FacetAdapter):
    adapter = adapter_class(http)
    controls = adapter._bootstrap()
    seen_makers, seen_numbers, products = set(), set(), 0
    # The full make list spans 13 ordinary pages; duplicates cannot supply
    # a guessed make ID. No captcha/export/history endpoints are involved.
    for html in adapter._view_pages(controls, "GVCostruttori", "GalleryCostruttore", "", None):
        for make, maker_id in makers(html):
            if maker_id in seen_makers or not any(label_has_brand(make, m) for m in makes):
                continue
            seen_makers.add(maker_id)
            model_count, engine_count = 0, 0
            for model_html in adapter._grid_pages(controls, "GVModelliDaCostruttore", "Modello", maker_id, max_pages=max_pages):
                for model in model_names(model_html):
                    if models and not any(m.casefold() in model.casefold() for m in models):
                        continue
                    if max_models is not None and model_count >= max_models:
                        break
                    model_count += 1
                    extra = {"SessionName1": model, "SessionName2": maker_id, "BezNorm": model, "KHerNr": maker_id}
                    for state, _ in adapter._grid_pages(controls, "GVMotorizzazioniEstese", "Motorizzazione", "", max_pages=max_pages, extra=extra, with_state=True):
                        # strID is returned by the same functional callback
                        # used by GetRowValues in the source's own UI.
                        groups = adapter._page_values("GVMotorizzazioniEstese", "Motorizzazione", "", state, "strID", extra)
                        for group in groups:
                            if not isinstance(group, str):
                                raise SourceError("FACET engine group ID is not a string")
                            for engine_state, _ in adapter._grid_pages(controls, "GVMotorizzazioniDaGruppo", "MotorizzazioneDaGruppo", group, max_pages=max_pages, with_state=True):
                                for engine_id in engine_state.get("keys", []):
                                    if max_engines is not None and engine_count >= max_engines:
                                        break
                                    if not isinstance(engine_id, str) or not re.fullmatch(r"\d+", engine_id):
                                        raise SourceError("FACET engine key is not a public numeric type ID")
                                    engine_count += 1
                                    for detail_state, _ in adapter._grid_pages(controls, "GVDettaglio", "Dettaglio", engine_id, max_pages=max_pages, with_state=True):
                                        for code in detail_state.get("keys", []):
                                            if not isinstance(code, str):
                                                raise SourceError("FACET product key is not a string")
                                            if code.strip() in seen_numbers:
                                                continue
                                            if max_products is not None and products >= max_products:
                                                return
                                            products += 1
                                            data = adapter._metadata(code.strip())
                                            if not data:
                                                continue
                                            own = data["Cod"].strip()
                                            applications = []
                                            for app_html in adapter._grid_pages(controls, "GVguidaApplicazioniBig", "DettaglioGuidaApplicazioni?tipo=Big", own, expand=True):
                                                applications.extend(parse_applications(app_html, ""))
                                            if not any(label_has_brand(a.make, make) or normalize_brand(a.make) == normalize_brand(make) for a in applications):
                                                continue
                                            seen_numbers.add(own)
                                            yield own


def positive(value):
    value = int(value)
    if value < 1:
        raise argparse.ArgumentTypeError("must be positive")
    return value


def main(adapter_class=FacetAdapter):
    parser = argparse.ArgumentParser(description=f"Print native {adapter_class.catalog_title} numbers confirmed for selected makes.")
    parser.add_argument("--brands", nargs="+", required=True)
    parser.add_argument("--models", nargs="+")
    parser.add_argument("--max-models", type=positive, help="trial limit per catalogue make")
    parser.add_argument("--max-engines", type=positive, help="trial limit per catalogue make")
    parser.add_argument("--max-products", type=positive, help="trial limit on checked products")
    parser.add_argument("--max-pages", type=positive, help="trial limit per model/engine/detail list")
    parser.add_argument("--cache", type=Path, required=True)
    args = parser.parse_args()
    http = PoliteSession(cache=ResponseCache(args.cache), limiter=RateLimiter(5))
    for number in harvest(http, args.brands, args.models, args.max_models, args.max_engines, args.max_products, args.max_pages, adapter_class):
        print(number, flush=True)


if __name__ == "__main__":
    main()
