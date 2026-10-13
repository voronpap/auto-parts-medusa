"""KW's native electrical catalogue, not the unrelated KW Suspensions."""
from ..models import SourceMeta
from .facet import FacetAdapter

BASE_URL = "https://catalogo.kw-automotive.com/EN"


class KwFacetAdapter(FacetAdapter):
    version = "1.0.0"
    base_url = BASE_URL
    catalog_title = "KW Catalog"

    @property
    def source(self):
        return SourceMeta(key="kw-facet", name="KW (Facet) (каталог виробника)", kind="manufacturer_catalog",
                          license_class="OPEN", lineage="FACET", url=BASE_URL)

    @property
    def brands(self):
        return ("KW",)
