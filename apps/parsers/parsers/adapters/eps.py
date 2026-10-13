"""EPS native catalogue; shared callback protocol, not FACET number guessing."""
from ..models import SourceMeta
from .facet import FacetAdapter

BASE_URL = "https://catalogo.eps-autoparts.com/EN"


class EpsAdapter(FacetAdapter):
    version = "1.1.0"
    base_url = BASE_URL
    catalog_title = "EPS Catalog"

    @property
    def source(self):
        # EPS is manufactured by FACET. The two catalogues must not count
        # as independent evidence merely because their brand names differ.
        return SourceMeta(key="eps", name="EPS (каталог виробника)", kind="manufacturer_catalog",
                          license_class="OPEN", lineage="FACET", url=BASE_URL)

    @property
    def brands(self):
        return ("EPS",)
